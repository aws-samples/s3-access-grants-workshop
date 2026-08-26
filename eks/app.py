# Flask wrapper that adapts HTTP requests into the API Gateway event format
# expected by the workshop's identity_bearer.handler. This lets the exact same
# Lambda code run unmodified as a containerized service on EKS.
import json
import os

from flask import Flask, request, Response, send_from_directory

import identity_bearer

# static_folder=None disables Flask's built-in /static route, which would
# otherwise shadow the React build's /static/* assets served by our catch-all.
app = Flask(__name__, static_folder=None)

ACCOUNT_ID = os.environ['ACCOUNT_ID']

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
}


def to_apigw_event(resource):
    return {
        'resource': resource,
        'path': resource,
        'httpMethod': request.method,
        'headers': {'Authorization': request.headers.get('Authorization', '')},
        'queryStringParameters': dict(request.args) or None,
        'requestContext': {'accountId': ACCOUNT_ID},
        'body': None,
        'isBase64Encoded': False,
    }


def dispatch(resource):
    if request.method == 'OPTIONS':
        return Response(status=204, headers=CORS_HEADERS)
    result = identity_bearer.handler(to_apigw_event(resource), None)
    headers = {**result.get('headers', {}), **CORS_HEADERS}
    return Response(result['body'], status=result['statusCode'], headers=headers)


@app.route('/ListGrants', methods=['GET', 'OPTIONS'])
def list_grants():
    return dispatch('/ListGrants')


@app.route('/FetchCredentials', methods=['GET', 'OPTIONS'])
def fetch_credentials():
    return dispatch('/FetchCredentials')


@app.route('/healthz')
def healthz():
    return {'status': 'ok', 'platform': 'eks'}


# --- Static frontend (React build) served from the same origin ---
BUILD_DIR = os.environ.get('BUILD_DIR', '/app/build')


@app.route('/')
def index():
    return send_from_directory(BUILD_DIR, 'index.html')


@app.route('/<path:asset>')
def static_assets(asset):
    full = os.path.join(BUILD_DIR, asset)
    if os.path.isfile(full):
        return send_from_directory(BUILD_DIR, asset)
    # SPA fallback
    return send_from_directory(BUILD_DIR, 'index.html')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
