/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 * config.js
 * This had better be a single object written in JavaScript, if you like your job.
 * Polluting the global space with objects is not good citizenship.
 * Have a nice day.
 * -- Management
 *
 *
 * @version 0.1
 * @author  Rafael Koike, https://github.com/koiker
 * @updated 2024-05-29
 * @link    https://github.com/aws-samples/s3-access-grants-workshop
 *
 *
 */
// eslint-disable-next-line import/no-anonymous-default-export
export default {
    api_endpoint: 'https://abc123def456.execute-api.us-east-1.amazonaws.com/prod/',
    clientId: '11111111-1111-1111-1111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    scope: "openid api://2b7c4fc8-2222-2222-2222-06de31fd03c5/S3AG profile"
};
