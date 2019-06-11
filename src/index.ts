import * as restify from 'restify';

const SERVICE_NAME = 'Xero Integration';

(async () => {
    const server = restify.createServer({ name: SERVICE_NAME });
    const stop = async () => await server.close();
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    process.on('warning', warning => console.error(warning));

    // Endpoint used to check whether the service is up and running
    server.get('/status', (req, res) => res.send(200, 'OK'));

    server.listen(8080, () => console.log('%s listening at %s', server.name, server.url));
})().catch(err => console.error(err));
