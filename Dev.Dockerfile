FROM node:12

WORKDIR /app
RUN chmod -R 777 /app

USER node

EXPOSE 8080 9230
ENTRYPOINT [ "npm", "start" ]

COPY ["./package.json", "./package-lock.json", "./tsconfig.json", "./"]
RUN npm install

ADD . ./
RUN npm run compile
