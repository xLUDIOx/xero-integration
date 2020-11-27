import { HttpServerBase } from '../../http-server';

export class XeroClientMock extends HttpServerBase {
    open() {
        super.open(8081);
    }
}

export const xeroClientMock = new XeroClientMock();
