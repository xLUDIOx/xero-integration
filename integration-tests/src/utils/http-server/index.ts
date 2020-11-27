import * as http from 'http';

export interface IRequestData<T> {
    url: string;
    body: T;
    headers: http.IncomingHttpHeaders;
}

export abstract class HttpServerBase {
    requests: IRequestData<any>[] = [];

    private server: http.Server | null = null;

    protected requestListener: IRequestListener | null;

    constructor() {
        this.requestListener = null;
    }

    protected open(port: number) {
        this.server = http
            .createServer((req, res) => this.requestListenerBase(req, res))
            .listen(port);
    }

    addRequestListener(listener: IRequestListener | null) {
        this.requestListener = listener;
    }

    reset() {
        this.requestListener = null;
        this.requests = [];
    }

    async close() {
        await new Promise<void>(resolve => {
            if (this.server && this.server.listening) {
                this.server.close(() => {
                    this.server = null;
                    resolve();
                });
            } else {
                this.server = null;
                resolve();
            }
        });
    }

    private async requestListenerBase(request: http.IncomingMessage, response: http.ServerResponse) {
        const body = await getRequestBody(request);
        if (this.requestListener !== null) {
            try {
                await this.requestListener(request, response);
            } catch (err) {
                response.statusCode = 200;
                response.end();
                throw err;
            }
        } else {
            response.statusCode = 404;
            response.end();
        }

        this.requests.push({
            url: request.url!,
            headers: request.headers,
            body,
        });
    }
}

async function getRequestBody(req: http.IncomingMessage): Promise<any> {
    return await new Promise((resolve, reject) => {
        let resolved = false;

        const chunks: any[] = [];

        req.on('data', (chunk: any) => {
            chunks.push(chunk);
        }).on('end', () => {
            resolved = true;

            const contentType = req.headers['content-type'];
            const data = Buffer.concat(chunks).toString();
            if (data.length === 0) {
                resolve({});
                return;
            }

            if (contentType !== undefined && contentType !== 'application/json') {
                resolve(data);
                return;
            }

            resolve(JSON.parse(data));
        });

        setTimeout(() => {
            if (!resolved) {
                reject(Error('Request body timeout'));
            }
        }, 1000);
    });
}

export function sendResponse(res: http.ServerResponse, body: any, code: number = 200) {
    const data = JSON.stringify(body);

    res.writeHead(
        code,
        {
            'Content-Length': Buffer.byteLength(data),
            'Content-Type': 'application/json',
        });

    res.end(data);
}

export type IRequestListener = (request: http.IncomingMessage, response: http.ServerResponse) => Promise<void>;
