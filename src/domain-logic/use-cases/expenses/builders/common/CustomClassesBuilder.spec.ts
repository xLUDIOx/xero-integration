import { Payhawk } from '@payhawk/external-integration-service-contracts';

import { CustomClassesBuilder } from './CustomClassesBuilder';

describe(`${CustomClassesBuilder.name} tests`, () => {
    it('should map nested value on top level', () => {
        const customFieldsData: Payhawk.ICustomFields = {
            teams: {
                label: 'Teams',
                selectedValues: {
                    leads_2396e5: {
                        label: 'Organization',
                        externalId: '100',
                    },
                },
                externalSource: 'integration',
            },
        };

        const result = CustomClassesBuilder.fromCustomFields(customFieldsData);
        expect(result).toStrictEqual([{
            id: 'teams',
            label: 'Teams',
            source: 'integration',
            valueId: '100',
            valueLabel: 'Organization',
        }]);
    });

    it('should map nested value in more than 1 level', () => {
        const customFieldsData: Payhawk.ICustomFields = {
            teams: {
                label: 'Teams',
                selectedValues: {
                    leads_2396e5: {
                        label: 'Organization',
                        childId: 'marketing_8ef497',
                    },
                    marketing_8ef497: {
                        label: 'Marketing & Growth',
                        childId: 'performance_marketing_dc3035',
                        parentId: 'leads_2396e5',
                        externalId: '16',
                    },
                    performance_marketing_dc3035: {
                        label: 'Performance Marketing',
                        childId: 'performance_marketing_dart_4af100',
                        parentId: 'marketing_8ef497',
                        externalId: '21',
                    },
                    performance_marketing_dart_4af100: {
                        label: 'Performance Marketing DART',
                        parentId: 'performance_marketing_dc3035',
                        externalId: '103',
                    },
                },
            },
        };

        const result = CustomClassesBuilder.fromCustomFields(customFieldsData);
        expect(result).toStrictEqual([{
            id: 'teams',
            label: 'Teams',
            source: undefined,
            valueId: '103',
            valueLabel: 'Performance Marketing DART',
        }]);
    });
});
