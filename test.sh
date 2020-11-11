#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

if [ -z "$CI" ]; then
    npm run lint && npm run compile

    TEST_EXIT=$?

    if [ $TEST_EXIT -ne 0 ]; then
        exit 1
    fi
fi

cd ./integration-tests/ || exit 1
sh ./test.sh
TEST_EXIT=$?
cd ..

if [ $TEST_EXIT -ne 0 ]; then
    printf "${RED}Tests Failed${NC}\n"
    exit 1
fi

printf "${GREEN}Tests Passed${NC}\n"
