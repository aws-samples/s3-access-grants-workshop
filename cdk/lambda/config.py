AUDIENCE = '<AUDIENCE>'
IDENTITY_STORE_ID = 'd-1234567890'
JWT_BEARER_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer'
TOKEN_EXCHANGE_APP_ARN = 'arn:aws:sso::111111111111:application/ssoins-abc123def456ghi/apl-1234567890abcde'
TRANSIENT_ROLE_ARN = 'arn:aws:iam::111111111111:role/S3AccessGrantsWebApp-UserTransientRoleABC123DE-123abc456def'
# For Microsoft Entra ID is: https://login.microsoftonline.com/common/discovery/keys
# For Okta is: https://<YOUR DOMAIN>.okta.com/oauth2/v1/keys or https://<YOUR DOMAIN>.okta.com/oauth2/<HASH>/v1/keys
JWKS_URL = 'https://dev-12345678.okta.com/oauth2/v1/keys'
# For Okta is sub, for Azure Entra ID is preferred_username
USERNAME_ATTRIBUTE = 'sub'
