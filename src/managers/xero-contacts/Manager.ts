import { Contact } from 'xero-node/lib/AccountingAPI-models';

import { Payhawk, Xero } from '../../services';
import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(private readonly xeroClient: Xero.IClient, private readonly defaultContactName: string) { }

    async getContactForSupplier(supplier: Payhawk.ISupplier): Promise<Contact> {
        const contactName = supplier.name || this.defaultContactName;
        const contact = await this.xeroClient.findContact(contactName, supplier.vat) ||
            await this.xeroClient.createContact(contactName, supplier.name ? supplier.vat : undefined);

        return contact;
    }
}
