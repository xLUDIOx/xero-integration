FROM node:14

RUN apt-get update -y && apt-get install -y ghostscript-x

WORKDIR /app
RUN chmod -R 777 /app

USER node

EXPOSE 8080 9230
ENTRYPOINT [ "npm", "start" ]

COPY ["./package.json", "./package-lock.json", "./"]

ENV TESTING=true \
    LOG_LEVEL="error" \
    CI=true

RUN npm ci

COPY . ./
RUN npm run compile
