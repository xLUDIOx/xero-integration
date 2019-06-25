import { PayhawkEvent } from './PayhawkEvent';

export interface IPayhawkPayload {
    accountId: string;
    apiKey: string;
    event: PayhawkEvent;
}
