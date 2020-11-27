import { HttpServerBase } from '../../http-server';

export class FxRatesClientMock extends HttpServerBase {
    open() {
        super.open(8083);
    }
}

export const fxRatesClientMock = new FxRatesClientMock();
