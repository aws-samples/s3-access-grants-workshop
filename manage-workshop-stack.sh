#!/bin/bash

STACK_OPERATION=$1

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
elif [ "$STACK_OPERATION" == "delete" ]; then
    # delete workshop resources
else
    echo "Invalid stack operation!"
    exit 1
fi
