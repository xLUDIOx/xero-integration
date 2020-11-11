FROM node:12 AS build-env

WORKDIR /app
RUN chmod -R 777 /app

USER node

COPY ["./package.json", "./package-lock.json", "./"]

RUN npm ci

ADD . ./

RUN npm run lint && npm run compile && npm prune --production

FROM node:12-alpine

WORKDIR /app

ENV PGHOST=sql-proxy \
    PGPORT=5432 \
    PGDATABASE=adapters


COPY --from=build-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
