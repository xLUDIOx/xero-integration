FROM node:12 AS build-env

WORKDIR /app
RUN chmod -R 777 /app

USER node

COPY [ "./package.json", "./package-lock.json", "./tsconfig.json", "./"]

RUN npm install

ADD . ./

RUN npm run lint && npm test && npm prune --production

RUN find ./build -name '*.spec.js' -delete -o -name '*.spec.js.map' -delete -o -name '*.spec.d.ts' -delete

FROM node:12-alpine

WORKDIR /app

EXPOSE 8080

ENTRYPOINT [ "node", "build/index" ]

ADD ./assets ./assets
COPY --from=build-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
