import { decode } from 'jsonwebtoken';

import { ITokenSet } from '../../store';

export const parseToken = (tokenSet: ITokenSet): ITokenSetPayload | undefined => {
    if (!tokenSet.access_token) {
        return undefined;
    }

    const payload = decode(tokenSet.access_token, { json: true });
    if (!payload) {
        return undefined;
    }

    return payload as ITokenSetPayload;
};

export interface ITokenSetPayload {
    xero_userid: string;
}
