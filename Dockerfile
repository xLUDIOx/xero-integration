FROM node:14 AS build-env

WORKDIR /app
RUN chmod -R 777 /app

USER node

COPY [ "./package.json", "./package-lock.json", "./"]

ENV CI=true

RUN npm ci

COPY . ./

RUN npm run lint && npm run compile && npm test && npm prune --production

RUN find ./build -name '*.spec.js' -delete -o -name '*.spec.js.map' -delete -o -name '*.spec.d.ts' -delete

FROM node:14-alpine

WORKDIR /app

EXPOSE 8080

ENTRYPOINT [ "node", "build/index" ]

RUN apk add ghostscript

COPY --from=build-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY --from=build-env /app/wait-for.sh /app/wait-for.sh

COPY --from=build-env /app/assets ./assets
COPY --from=build-env /app/public ./public
