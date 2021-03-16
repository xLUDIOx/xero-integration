export interface ICustomField {
    externalId: string;
    label: string;
    values: ICustomFieldValue[];
}

export interface ICustomFieldValue {
    externalId: string;
    label: string;
}
