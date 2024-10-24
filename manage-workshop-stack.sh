#!/bin/bash

STACK_OPERATION=$1
echo "$STACK_OPERATION"
if [[ "$STACK_OPERATION" == "Create" || "$STACK_OPERATION" == "Update" ]]; then
    echo "Building Frond-end ENTRA"
    cd frontend-entra_id
    npm install
    npm run build

    echo "Building Front-end OKTA"
    cd ../frontend-okta
    npm install
    npm run build

    echo "Building Backend"
    cd ../cdk
    npm install -g aws-cdk

    python -m ensurepip --upgrade
    python -m pip install --upgrade pip
    python -m pip install --upgrade virtualenv
    pip install -r requirements.txt

    cdk bootstrap
    cdk deploy
    echo "Done."
    exit  0
elif [ "$STACK_OPERATION" == "Delete" ]; then
    echo "Deleting resources"
    exit  0
else
    echo "Invalid stack operation!"
    exit 1
fi
