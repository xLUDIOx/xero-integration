import { PayhawkEvent } from './PayhawkEvent';

export interface IPayhawkPayload {
    accountId: string;
    event: PayhawkEvent;
    data?: any;
}
