import { HttpServerBase } from '../../http-server';

export class PayhawkClientMock extends HttpServerBase {
    open() {
        super.open(8082);
    }
}

export const payhawkClientMock = new PayhawkClientMock();
