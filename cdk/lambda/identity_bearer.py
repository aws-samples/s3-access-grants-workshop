# Process API requests to S3 Access Grants based on directory user credentials.
# /ListGrants = Process OIDC token and discover the IdC user. Retrieve all S3 grants available and return to the user
# /FetchCredentials = Exchange OIDC accessToken with AWS IAM credentials with access to the requested S3 bucket/prefix
__author__ = "Rafael Koike"
__copyright__ = "Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved."
__credits__ = ["Rafael Koike", "Vaibhav Sabharwal", "Becky Weiss",
               "Roberto Migli"]
__license__ = "MIT-0"
__version__ = "0.1.0"
__maintainer__ = "Rafael Koike"
__email__ = "koiker@amazon.com"

import config
import json
import jwt
import boto3
import logging
import os
import re
from urllib import request
from urllib.parse import urlencode

idc_client = boto3.client('identitystore')
s3_control = boto3.client('s3control')
oidc_client = boto3.client('sso-oidc')
sts_client = boto3.client('sts')
LOG_FORMAT = '{"time_stamp": "%(asctime)s", "log_level": "%(levelname)s", "log_message": %(message)s}'
logging.basicConfig(format=LOG_FORMAT, datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger(__name__)
logger.setLevel(getattr(logging, os.getenv('LOG_LEVEL', 'INFO')))
region = os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
access_denied_response: dict = {
    "statusCode": 403,
    "headers": {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    },
    "body": json.dumps({"response": 'Missing Authorization'})
}
IDENTITY_STORE_ID = os.getenv('IDENTITY_STORE_ID', config.IDENTITY_STORE_ID)
USERNAME_ATTRIBUTE = os.getenv('USERNAME_ATTRIBUTE', config.USERNAME_ATTRIBUTE)
ID_CUSTOMER_APP_ARN = os.getenv('CUSTOMER_APP_ARN', config.IDC_CUSTOMER_APP_ARN)
JWT_BEARER_GRANT_TYPE = os.getenv('JWT_BEARER_GRANT_TYPE', config.JWT_BEARER_GRANT_TYPE)
TRANSIENT_ROLE_ARN = os.getenv('TRANSIENT_ROLE_ARN', config.TRANSIENT_ROLE_ARN)
AUDIENCE = os.getenv('AUDIENCE', config.AUDIENCE)
JWKS_URL = os.getenv('JWKS_URL', config.JWKS_URL)


def fetch_console_url(credentials, bucket, prefix):
    # TODO: Make the session duration configurable. In the future we can have a settings UI.
    session_duration = 43200
    params = {
        'Action': 'getSigninToken',
        'SessionDuration': session_duration,
        'Session': json.dumps({
            'sessionId': credentials['AccessKeyId'],
            'sessionKey': credentials['SecretAccessKey'],
            'sessionToken': credentials['SessionToken']
        })
    }
    url = 'https://signin.aws.amazon.com/federation?' + urlencode(params)
    logger.debug(url)
    with request.urlopen(url) as response:
        html = response.read().decode('utf-8')
        logger.debug(html)
    signin_token = json.loads(html)['SigninToken']
    if prefix:
        prefix_param = f'&prefix={prefix}'
    else:
        prefix_param = ''
    params = {
        'Action': 'login',
        'Issuer': 'https://s3ag-workshop.local',
        'Destination': f'https://{region}.console.aws.amazon.com/s3/buckets/{bucket}?region={region}&bucketType=general{prefix_param}/&showversions=false',
        'SigninToken': signin_token,
    }
    url = 'https://signin.aws.amazon.com/federation?' + urlencode(params)
    logger.debug(url)
    return url


def list_grants(event: dict, token: list):
    username = token[USERNAME_ATTRIBUTE]
    try:
        resp = idc_client.get_user_id(
            IdentityStoreId=IDENTITY_STORE_ID,
            AlternateIdentifier={
                'UniqueAttribute': {
                    "AttributePath": "userName",
                    "AttributeValue": username
                }
            }
        )
        logger.debug(resp)
        user_id = resp['UserId']
        # AWS Account ID extracted from API Gateway context.
        account_id = event['requestContext']['accountId']
        response = s3_control.list_access_grants(
            AccountId=account_id,
            MaxResults=100,
            GranteeType='DIRECTORY_USER',
            GranteeIdentifier=user_id,
        )
        logger.debug(response)
        grants_list = []
        for grant in response['AccessGrantsList']:
            grants_list.append({
                'GranteeIdentifier': grant['Grantee']['GranteeIdentifier'],
                'Permission': grant['Permission'],
                'AccessGrantsLocationId': grant['AccessGrantsLocationId'],
                'GrantScope': grant['GrantScope'],
            })
    except Exception as e:
        logger.exception(e)
        return []
    return grants_list


def fetch_credentials(event, token, account_id, target, permission):
    logger.debug(event)

    try:
        logger.debug('Getting IdC token with CreateTokenWithIAM')
        url = oidc_client.create_token_with_iam(
            clientId=ID_CUSTOMER_APP_ARN,
            grantType=JWT_BEARER_GRANT_TYPE,
            assertion=token
        )
        logger.debug(f'SSO-OIDC response: {url}')
        # This token is a response from our call to Identity Center. I assume it is safe to not validate the signature
        sts_identity_context = jwt.decode(url['idToken'], options={"verify_signature": False})['sts:identity_context']
        sts_credentials = sts_client.assume_role(
            RoleArn=TRANSIENT_ROLE_ARN,
            RoleSessionName=f'transient-s3ag-{IDENTITY_STORE_ID}',
            ProvidedContexts=[
                {
                    'ProviderArn': 'arn:aws:iam:aws::contextProvider/IdentityCenter',
                    'ContextAssertion': sts_identity_context
                }
            ]
        )
        logger.info('Getting transient role with STS:AssumeRole')
        logger.debug(json.dumps(sts_credentials, default=str))
        transient_credentials = sts_credentials['Credentials']
        transient_client = boto3.client('s3control',
                                        aws_access_key_id=transient_credentials['AccessKeyId'],
                                        aws_secret_access_key=transient_credentials['SecretAccessKey'],
                                        aws_session_token=transient_credentials['SessionToken']
                                        )
        user_creds = transient_client.get_data_access(
            AccountId=account_id,
            Target=target,
            Permission=permission
        )
        logger.debug(json.dumps(user_creds, default=str))
        end_user_credentials = user_creds['Credentials']
        end_user_credentials['MatchedGrantTarget'] = user_creds['MatchedGrantTarget']
        end_user_credentials['Permission'] = permission
        # Generating the Web console URL
        bucket_name = re.search(r"s3://([^/]+)/.*", end_user_credentials['MatchedGrantTarget']).group(1)
        key = re.search(r"s3://[^/]+/(.*)", end_user_credentials['MatchedGrantTarget']).group(1)
        logger.debug(key)
        if key == '*':
            # There is no prefix and the star is part of the Grant string. We should remove from the prefix
            key = None
        elif key and key[-2:] == '/*':
            # There is a prefix and a wildcard in the end. Let's remove wildcard
            key = key[:-2]
        url = fetch_console_url(user_creds['Credentials'], bucket_name, key)
        logger.debug(url)
    except Exception as e:
        logger.exception(e)
        raise
    return {
        'Credentials': {
            'AccessKeyId': end_user_credentials['AccessKeyId'],
            'SecretAccessKey': end_user_credentials['SecretAccessKey'],
            'SessionToken': end_user_credentials['SessionToken'],
            'Expiration': end_user_credentials['Expiration']
        },
        'MatchedGrantTarget': end_user_credentials['MatchedGrantTarget'],
        'Permission': end_user_credentials['Permission'],
        'ConsoleUrl': url
    }


def handler(event, _context):
    logger.debug(boto3.__version__)
    logger.debug(json.dumps(event, indent=2))
    if not event.get('headers', {}).get('Authorization'):
        logger.info('Missing Authorization')
        return access_denied_response
    try:
        # Validating JWT token before proceeding (https://pyjwt.readthedocs.io/en/stable/usage.html)
        # URL with the public keys
        jwks_url = JWKS_URL
        jwks_client = jwt.PyJWKClient(jwks_url)
        token = event.get('headers', {}).get('Authorization', '')
        # Entra ID - Application (Client) ID if we receive an idToken
        # or the standard hash id if we receive an accessToken
        aud = AUDIENCE
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(token,
                             signing_key.key,
                             algorithms=['RS256'],
                             options={"require": ["exp", "iss", "sub", "aud"]},
                             audience=aud, )

        logger.debug(payload)
        if event['resource'] == '/ListGrants':
            logger.info('Invoking list_grants function')
            response = list_grants(event, payload)
        elif event['resource'] == '/FetchCredentials':
            # Check for required parameters: Permission and Scope
            # TODO: Add support to set expiration time when generating the credentials
            if not event.get('queryStringParameters', {}).get('Permission') or not event.get('queryStringParameters',
                                                                                             {}).get('Scope'):
                logger.info('Missing required parameters: Permission and Scope')
                return access_denied_response
            logger.info('Invoking fetch_credentials function')
            # TODO: Add support for customer provided accountId
            account_id = event['requestContext']['accountId']
            target = event['queryStringParameters']['Scope']
            permission = event['queryStringParameters']['Permission']
            response = fetch_credentials(event, token, account_id, target, permission)
        else:
            logger.info('Invalid API resource!')
            return access_denied_response

    except jwt.ExpiredSignatureError:
        logger.exception('Invalid JWT')
        return access_denied_response
    except Exception as err:
        logger.exception(err, exc_info=True)
        return access_denied_response

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({'response': response}, default=str)
    }
