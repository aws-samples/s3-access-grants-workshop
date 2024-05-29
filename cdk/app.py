#!/usr/bin/env python3
import os

import aws_cdk as cdk

from cdk.cdk_stack import CdkStack

app = cdk.App()
CdkStack(app, "S3AccessGrantsWebApp", idp=os.getenv('IDP_VENDOR', 'entra_id'))

app.synth()
