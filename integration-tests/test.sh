#!/bin/bash

SERVICE_NAME="xero-integration-service"
COMPOSE_PROJ="xero_integration_service"
RELATIVE_PATH=$(dirname "$0")

cd "$RELATIVE_PATH" || exit 1

rm -rf ./src/shared && cp -R ../src/shared ./src && find ./src/shared/. -type f -exec chmod 0444 -- {} +

# If there is another integration tests build running for this service then we should wait for it to finish
docker wait "${COMPOSE_PROJ}_${SERVICE_NAME}-integration-tests" >/dev/null 2>&1

{
    docker-compose -p "$COMPOSE_PROJ" up --remove-orphans -d --force-recreate --build

    # shellcheck disable=SC2181
    if [ $? -ne 0 ]; then
        printf "Docker Compose Failed\n"
        exit 1
    fi

    START_TIME=$(date +%s)
    TEST_EXIT_CODE=$(docker wait "${COMPOSE_PROJ}_${SERVICE_NAME}-tests")
    END_TIME=$(date +%s)

    docker logs "${COMPOSE_PROJ}_${SERVICE_NAME}-tests"

    if [ "$TEST_EXIT_CODE" -ne 0 ]; then
        docker logs "${COMPOSE_PROJ}_${SERVICE_NAME}"
    fi

    RUNTIME=$((END_TIME - START_TIME))
    printf "Finished in %s:%s\n\n" $(((RUNTIME / 60) % 60)) $((RUNTIME % 60))

    docker-compose -p "$COMPOSE_PROJ" down
} || {
    docker-compose -p "$COMPOSE_PROJ" down
}

exit "$TEST_EXIT_CODE"
