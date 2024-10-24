from aws_cdk import BundlingOptions, RemovalPolicy
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


class CdkStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        webapp_okta_bucket = aws_s3.Bucket(
            self,
            "WebAppOktaBucket",
            bucket_name=f"s3ag-app-okta-{self.account}",
            block_public_access=aws_s3.BlockPublicAccess.BLOCK_ALL,
            object_ownership=aws_s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
            auto_delete_objects=True,
            removal_policy=RemovalPolicy.DESTROY
        )

        aws_s3_deployment.BucketDeployment(
            self,
            "S3AGWebAppOkta",
            sources=[aws_s3_deployment.Source.asset(f"../frontend-okta/build")],
            destination_bucket=webapp_okta_bucket,
        )

        webapp_entra_bucket = aws_s3.Bucket(
            self,
            "WebAppEntraBucket",
            bucket_name=f"s3ag-app-entra-{self.account}",
            block_public_access=aws_s3.BlockPublicAccess.BLOCK_ALL,
            object_ownership=aws_s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
            auto_delete_objects=True,
            removal_policy=RemovalPolicy.DESTROY
        )

        aws_s3_deployment.BucketDeployment(
            self,
            "S3AGWebAppEntra",
            sources=[aws_s3_deployment.Source.asset(f"../frontend-entra_id/build")],
            destination_bucket=webapp_entra_bucket,
        )
        cf_function = cloudfront.Function(self, "Function",
                                          code=cloudfront.FunctionCode.from_file(file_path='./functions/index.js'),
                                          runtime=cloudfront.FunctionRuntime.JS_2_0
                                          )
        cdn_okta = cloudfront.Distribution(self, "s3ag-webapp-okta-cdn",
                                     default_behavior=cloudfront.BehaviorOptions(
                                         origin=origins.S3Origin(webapp_okta_bucket),
                                         function_associations=[cloudfront.FunctionAssociation(
                                             function=cf_function,
                                             event_type=cloudfront.FunctionEventType.VIEWER_REQUEST
                                         )]
                                     ),
                                     default_root_object='index.html'
                                     )

        cdn_entra = CloudFrontToS3(
            self,
            's3ag-webapp-cdn',
            existing_bucket_obj=webapp_entra_bucket,
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
                'LOG_LEVEL': 'DEBUG',
                'IDENTITY_STORE_ID': "d-9067e2ab1d",
                'USERNAME_ATTRIBUTE': "sub",  # For Entra ID is preferred_username, for Okta is sub
                'GROUP_ATTRIBUTE': "groups",
                'CUSTOMER_APP_ARN': "arn:aws:sso::471112571081:application/ssoins-722398f03fa967c5/apl-f19870eacd3f937f",
                'JWT_BEARER_GRANT_TYPE': "urn:ietf:params:oauth:grant-type:jwt-bearer",
                'TRANSIENT_ROLE_ARN': user_transient_role.role_arn,
                'AUDIENCE': "0oahhxn8rtl3mHqQ65d7",
                'JWKS_URL': "https://dev-42827919.okta.com/oauth2/default/v1/keys",
            }
        )
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

        CfnOutput(self, "WebApp_Okta_Url",
                  value=f'https://{cdn_okta.distribution_domain_name}/')
        CfnOutput(self, "WebApp_Entra_Url",
                  value=f'https://{cdn_entra.distribution_domain_name}/')
        CfnOutput(self, "LambdaRole",
                  value=identity_bearer_role.role_arn)
        CfnOutput(self, "TransientRole",
                  value=user_transient_role.role_arn)
