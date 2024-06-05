from aws_cdk import BundlingOptions
from aws_cdk import (
    Duration,
    Stack,
    aws_s3,
    aws_s3_deployment,
    aws_lambda as _lambda,
    aws_apigateway as apigateway,
    aws_iam as iam,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    CfnOutput,
)
from aws_solutions_constructs.aws_cloudfront_s3 import CloudFrontToS3
from constructs import Construct

IDP_LIST = ['entra_id', 'okta']


class CdkStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        # Default IdP is Entra ID. To set a different configuration, invoke:
        # >IDP_VENDOR=okta cdk deploy
        idp = kwargs.pop('idp', 'entra_id')
        if not idp in IDP_LIST:
            print(f'Invalid IDP setting. You must choose ${IDP_LIST}')
            return
        super().__init__(scope, construct_id, **kwargs)

        webapp_bucket = aws_s3.Bucket(
            self,
            "WebAppBucket",
            bucket_name=f"s3ag-app-{self.account}",
            block_public_access=aws_s3.BlockPublicAccess.BLOCK_ALL,
            object_ownership=aws_s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
        )
        aws_s3_deployment.BucketDeployment(
            self,
            "S3AGWebApp",
            sources=[aws_s3_deployment.Source.asset(f"../frontend-{idp}/build")],
            destination_bucket=webapp_bucket,
        )
        if idp == 'okta':
            cf_function = cloudfront.Function(self, "Function",
                                              code=cloudfront.FunctionCode.from_file(file_path='./functions/index.js'),
                                              runtime=cloudfront.FunctionRuntime.JS_2_0
                                              )
            cdn = cloudfront.Distribution(self, "s3ag-webapp-cdn",
                                         default_behavior=cloudfront.BehaviorOptions(
                                             origin=origins.S3Origin(webapp_bucket),
                                             function_associations=[cloudfront.FunctionAssociation(
                                                 function=cf_function,
                                                 event_type=cloudfront.FunctionEventType.VIEWER_REQUEST
                                             )]
                                         ),
                                         default_root_object='index.html'
                                         )
        else:
            cdn = CloudFrontToS3(
                self,
                's3ag-webapp-cdn',
                existing_bucket_obj=webapp_bucket,
                insert_http_security_headers=False,
            ).cloud_front_web_distribution

        user_transient_role = iam.Role(self, 'UserTransientRole',
                                       assumed_by=iam.AccountPrincipal(self.account))
        assume_role_policy = user_transient_role.assume_role_policy
        assume_role_policy.add_statements(iam.PolicyStatement(
            actions=["sts:AssumeRole", "sts:SetContext"],
            principals=[iam.AccountPrincipal(self.account)]
        )
        )
        user_transient_role.add_to_policy(iam.PolicyStatement(
            effect=iam.Effect.ALLOW,
            actions=['s3:GetDataAccess'],
            resources=['*'],
        ))
        identity_bearer_role = iam.Role(self, 'IdentityBearerRole',
                                        assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"))
        identity_bearer_role.add_managed_policy(iam.ManagedPolicy.from_aws_managed_policy_name(
            "service-role/AWSLambdaBasicExecutionRole"))
        identity_bearer_role.add_to_policy(iam.PolicyStatement(
            effect=iam.Effect.ALLOW,
            actions=[
                's3:ListAccessGrants',
                'identitystore:GetUserId',
                'sso-oauth:CreateTokenWithIAM',
                'sts:AssumeRole',
                'sts:SetContext'
            ],
            resources=['*'],
        ))
        identity_bearer_lambda = _lambda.Function(
            self,
            "IdentityBearerLambda",
            runtime=_lambda.Runtime.PYTHON_3_11,
            code=_lambda.Code.from_asset("./lambda",
                                         bundling=BundlingOptions(
                                             image=_lambda.Runtime.PYTHON_3_11.bundling_image,
                                             command=[
                                                 'bash', '-c',
                                                 'pip install --platform manylinux2014_x86_64 --only-binary=:all: -r requirements.txt -t /asset-output && cp -au . /asset-output'
                                             ],
                                         ),
                                         ),
            handler="identity_bearer.handler",
            role=identity_bearer_role,
            timeout=Duration.minutes(1),
            environment={
                'LOG_LEVEL': 'DEBUG'
            }
        )
        api = apigateway.LambdaRestApi(
            self,
            "S3AGApi",
            handler=identity_bearer_lambda,
            proxy=False,
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=apigateway.Cors.ALL_METHODS
            )
        )

        list_grants_resource = api.root.add_resource("ListGrants")
        fetch_credentials_resource = api.root.add_resource("FetchCredentials")
        list_grants_resource.add_method('GET')
        fetch_credentials_resource.add_method('GET')

        CfnOutput(self, "WebAppUrl",
                  value=f'https://{cdn.distribution_domain_name}/')
        CfnOutput(self, "api",
                  value=api.url)
        CfnOutput(self, "LambdaRole",
                  value=identity_bearer_role.role_arn)
        CfnOutput(self, "TransientRole",
                  value=user_transient_role.role_arn)
