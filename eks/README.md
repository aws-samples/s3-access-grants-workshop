# S3 Access Grants Web App on Amazon EKS (Entra ID / Trusted Identity Propagation)

Runs the [aws-samples/s3-access-grants-workshop](https://github.com/aws-samples/s3-access-grants-workshop)
web application on **Amazon EKS** instead of Lambda + API Gateway — demonstrating that the
S3 Access Grants "token dance" (Entra ID JWT → IAM Identity Center → transient role →
`GetDataAccess`) is application-level and compute-agnostic. The identity-side configuration
(Entra app, TTI, customer managed application, grants, transient role) is **identical** for
both deployments and is built exactly once.

```
Browser ── HTTPS ──> CloudFront ──> NLB ──> EKS pod
                                            ├── Flask (serves React build + API)
                                            └── identity_bearer.py  (UNMODIFIED workshop code)
                                                 │ CreateTokenWithIAM (IdC)
                                                 │ AssumeRole + identity context (transient role)
                                                 └ GetDataAccess (S3 Access Grants)
```

No container image build is required: the pod runs a public Python base image and receives
the application code via a ConfigMap, and the frontend build from S3, at startup.

---

## Prerequisites (identity side — same as the Lambda workshop)

Complete these first, following the workshop README / AWS docs:

1. **Entra ID**: App Registration (SPA) with an exposed scope (e.g. `api://<CLIENT_ID>/S3AG`);
   Enterprise App with SCIM provisioning into IAM Identity Center.
2. **IAM Identity Center**: instance + at least one SCIM-provisioned user.
3. **Trusted Token Issuer**: type OIDC JWT, issuer URL
   `https://login.microsoftonline.com/<TENANT_ID>/v2.0` — must match the token `iss` claim
   EXACTLY (not the `/saml2` URL), claim mapping `preferred_username` → `userName`.
4. **Customer managed application** in IdC with a jwt-bearer grant: authorized issuer = your
   TTI, authorized audience = your Entra client ID.
5. **S3 Access Grants**: instance (associated with IdC), a location + location role, and at
   least one DIRECTORY_USER/GROUP grant for your test user.
6. **Transient role**: trust = your account (or the pod role specifically) with
   `sts:AssumeRole` + `sts:SetContext`; permissions = `s3:GetDataAccess` only.

Placeholders used below — replace everywhere:

| Placeholder | Meaning |
|---|---|
| `<ACCOUNT_ID>` | Your AWS account ID |
| `<REGION>` | e.g. us-east-1 |
| `<CLIENT_ID>` | Entra Application (client) ID |
| `<TENANT_ID>` | Entra Directory (tenant) ID |
| `<IDC_APP_ARN>` | Customer managed application ARN (apl-...) |
| `<TRANSIENT_ROLE_ARN>` | Transient role ARN |
| `<IDENTITY_STORE_ID>` | d-xxxxxxxxxx |
| `<ASSETS_BUCKET>` | Any S3 bucket for the frontend build tarball |

## Step 1 — Backend config

Edit the workshop's `cdk/lambda/config.py`:

```python
AUDIENCE = ['<CLIENT_ID>', 'api://<CLIENT_ID>']   # id + access token audience forms
IDENTITY_STORE_ID = '<IDENTITY_STORE_ID>'
IDC_CUSTOMER_APP_ARN = '<IDC_APP_ARN>'
TRANSIENT_ROLE_ARN = '<TRANSIENT_ROLE_ARN>'
JWKS_URL = 'https://login.microsoftonline.com/common/discovery/keys'
USERNAME_ATTRIBUTE = 'preferred_username'
```

## Step 2 — Frontend build

Edit `frontend-entra_id/src/config.js`:

```javascript
export default {
    api_endpoint: '/',          // relative: UI and API share one origin on EKS
    clientId: '<CLIENT_ID>',
    tenantId: '<TENANT_ID>',
    scope: "openid api://<CLIENT_ID>/S3AG profile"
};
```

> Known bug in App.js: the ListGrants fetch is `config.api_endpoint + '/ListGrants'` — with a
> relative endpoint this becomes `//ListGrants` (protocol-relative URL) and fails. Change it to
> `config.api_endpoint + 'ListGrants'` (matching the FetchCredentials call).

Build and upload:

```bash
cd frontend-entra_id
npm install
DISABLE_ESLINT_PLUGIN=true CI=true npm run build
tar -czf frontend-build.tar.gz -C build .
aws s3 cp frontend-build.tar.gz s3://<ASSETS_BUCKET>/eks/frontend-build.tar.gz
```

## Step 3 — EKS cluster + IRSA

```bash
eksctl create cluster --name s3ag-demo --region <REGION> --nodes 1 --node-type t3.medium --with-oidc --managed
kubectl create namespace s3ag

# Pod policy (see pod-policy.json; replace <ASSETS_BUCKET>)
aws iam create-policy --policy-name S3AGIdentityBearerPodPolicy --policy-document file://pod-policy.json

eksctl create iamserviceaccount \
  --cluster s3ag-demo --region <REGION> \
  --namespace s3ag --name s3ag-identity-bearer \
  --attach-policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/S3AGIdentityBearerPodPolicy \
  --role-name S3AGIdentityBearerPodRole --approve
```

Why these pod permissions (and no others): `sso-oauth:CreateTokenWithIAM` (token exchange),
`identitystore:GetUserId` + `s3:ListAccessGrants` (grant listing), `sts:AssumeRole` +
`sts:SetContext` (enter the transient role WITH the identity context). Deliberately no S3 data
access and no `s3:GetDataAccess` — the pod can orchestrate but never vend or read.

If your transient role's trust policy is narrowed to specific principals, add
`arn:aws:iam::<ACCOUNT_ID>:role/S3AGIdentityBearerPodRole` to it.

## Step 4 — Deploy the app

```bash
kubectl create configmap s3ag-code -n s3ag \
  --from-file=identity_bearer.py=../cdk/lambda/identity_bearer.py \
  --from-file=config.py=../cdk/lambda/config.py \
  --from-file=app.py=app.py

# Edit deployment.yaml first: set ACCOUNT_ID, REGION, <ASSETS_BUCKET>
kubectl apply -f deployment.yaml
kubectl -n s3ag rollout status deployment/s3ag-identity-bearer
kubectl -n s3ag get svc s3ag-identity-bearer   # note the NLB hostname
```

Sanity check: `curl http://<NLB_HOSTNAME>/healthz` → `{"platform":"eks","status":"ok"}`

## Step 5 — HTTPS via CloudFront (required: Entra SPA redirects must be HTTPS)

Create a CloudFront distribution with:
- Origin: the NLB hostname, protocol **http-only**
- Allowed methods: ALL; Viewer protocol policy: redirect-to-https
- **Cache policy: create a CUSTOM one** — TTL 0/0/1, `Authorization` header in the cache key,
  all query strings. ⚠️ This is mandatory: CloudFront strips the Authorization header on GET
  requests unless it is part of the cache key; a managed origin-request policy alone is NOT enough.
- Origin request policy: `AllViewerExceptHostHeader`

## Step 6 — Entra redirect URI

App registrations → your app → Authentication → **Single-page application** → Add URI:
`https://<CLOUDFRONT_DOMAIN>/` — exact string, trailing slash included. (Multiple URIs can
coexist; matching is character-for-character.)

## Step 7 — Test

1. Open `https://<CLOUDFRONT_DOMAIN>/`, sign in with a SCIM-provisioned user
2. Fetch Grants → your grants render
3. Get Credentials → scoped temporary credentials + a federated console link
4. Watch the dance live: `kubectl -n s3ag logs deploy/s3ag-identity-bearer -f`
5. Verify the fence: use the vended credentials with the CLI — allowed prefix works,
   ungranted prefix returns AccessDenied

## Gotchas (each cost us real debugging time)

1. **TTI issuer must equal the token `iss` exactly** (`/v2.0`, never `/saml2`); it's immutable —
   recreate + repoint the app grant to change it.
2. **One exchange per token**: Identity Center rejects a replayed JWT assertion
   (`InvalidGrantException`). Exchange once per session; cache credentials. Don't hammer
   "Get Credentials" with the same cached MSAL token.
3. **CloudFront Authorization stripping** — see Step 5.
4. **Redirect URI matching is exact** (scheme, host, trailing slash) and HTTPS-only except localhost.
5. **Flask default `/static` route** shadows the React build's assets — `app.py` already sets
   `static_folder=None`; keep it.
6. Directory grants require the identity-context session (the transient role hop). Granting
   `s3:GetDataAccess` to the pod role only ever matches `GranteeType=IAM` grants.

## Production notes (this is a demo)

- Narrow the transient role trust to the app role ARN (demo uses account-root trust)
- Exchange once per user session and cache vended credentials server-side
- Build a proper container image (demo uses ConfigMap injection to avoid a local Docker dependency)
- Multiple replicas, TLS at the NLB or an ALB+ACM instead of CloudFront-to-HTTP-origin
- Enable CloudTrail data events on lake buckets for per-user object-level audit
- Consider Storage Browser for S3 (AWS-supported UI with native Access Grants integration)
  instead of a hand-built portal

## Files in this package

| File | Purpose |
|---|---|
| `app.py` | Flask adapter: serves the React build + translates HTTP→API Gateway events for the unmodified workshop Lambda handler |
| `deployment.yaml` | Deployment + LoadBalancer Service (ConfigMap code mount, public Python image, startup bootstrap) |
| `pod-policy.json` | IAM policy for the pod's IRSA role |

License: follows the upstream workshop (MIT-0).
