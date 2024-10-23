#!/bin/bash

STACK_OPERATION=$1
echo "$STACK_OPERATION"
if [[ "$STACK_OPERATION" == "create" || "$STACK_OPERATION" == "update" ]]; then
    echo "Building Frond-end ENTRA"
    cd frontend-entra_id
    npm install
    npm run build

    echo "Building Front-end OKTA"
    cd ../frontend-entra
    npm install
    npm run build

    echo "Done."
    exit  0
elif [ "$STACK_OPERATION" == "delete" ]; then
    echo "Deleting resources"
    exit  0
else
    echo "Invalid stack operation!"
    exit 1
fi
