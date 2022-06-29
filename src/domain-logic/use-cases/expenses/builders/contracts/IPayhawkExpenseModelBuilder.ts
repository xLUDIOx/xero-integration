import { IValidatedExpense } from '../../validation';
import { IPayhawkExpenseModel } from './IPayhawkExpenseModel';

export interface IPayhawkExpenseModelBuilder {
    build(payhawkExpense: IValidatedExpense): Promise<IPayhawkExpenseModel>;
}
