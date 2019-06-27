#!/bin/bash

PWD=$(pwd)

npm run compile || exit 1
docker build . -f ./Dev.Dockerfile -t adapters-xero-dev || exit 1
telepresence  --mount=/tmp/xero \
    --namespace adapters \
    --swap-deployment xero-integration --expose 8080 \
    --docker-run --rm -v "${PWD}/build:/app/build" -p=9230:9230 \
    -e TELEPRESENCE_MOUNT_PATH="/tmp/xero" \
    -it adapters-xero-dev
