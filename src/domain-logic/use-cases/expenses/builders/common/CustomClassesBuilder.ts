import { Payhawk } from '@payhawk/external-integration-service-contracts';
import { RequiredBy } from '@payhawk/typescript-common-types';

import { ICustomClass } from '../contracts';

export class CustomClassesBuilder {
    static fromCustomFields(customFields: Payhawk.ICustomFields = {}): ICustomClass[] {
        const customClasses: ICustomClass[] = [];
        const customFieldKeys = Object.keys(customFields);
        for (const cfKey of customFieldKeys) {
            const customField = customFields[cfKey];
            const externalSourceValue = Object.values(customField.selectedValues ?? {})
                .filter(x => x.externalId !== undefined)
                .find(x => !x.childId) as RequiredBy<Payhawk.ICustomFieldValue, 'externalId'>;
            if (!externalSourceValue) {
                continue;
            }

            customClasses.push({
                id: customField.externalId || cfKey,
                label: customField.label,
                source: customField.externalSource,
                valueId: externalSourceValue.externalId,
                valueLabel: externalSourceValue.label,
            });
        }

        return customClasses;
    }
}
