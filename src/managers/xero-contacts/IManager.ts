import { Contact } from 'xero-node/lib/AccountingAPI-models';

import { Payhawk } from '../../services';

export interface IManager {
    getContactForSupplier(supplier: Payhawk.ISupplier): Promise<Contact>;
}
