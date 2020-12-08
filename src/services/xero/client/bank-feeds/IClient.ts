import { IBankFeedConnection, IBankStatement, INewBankFeedConnection, INewBankStatement } from '@shared';

export interface IClient {
    getOrCreateBankFeedConnection(conn: INewBankFeedConnection): Promise<IBankFeedConnection>;
    closeBankFeedConnection(connectionId: string): Promise<void>;

    createBankStatement(statement: INewBankStatement): Promise<IBankStatement>;
}
