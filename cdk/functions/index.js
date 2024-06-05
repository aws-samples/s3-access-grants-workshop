/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 * index.js
 *
 * @version 0.1
 * @author  Rafael Koike, https://github.com/koiker
 * @updated 2024-06-03
 * @link    https://github.com/aws-samples/s3-access-grants-workshop
 *
 *
 */
function handler(event) {
    const request = event.request;
    const uri = request.uri;

    if (uri.startsWith('/login/callback')) {
        request.uri = '/index.html' + uri.replace('/login/callback', '');
    }

    return request;
}