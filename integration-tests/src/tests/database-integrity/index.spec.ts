import { expect } from 'chai';

import { SCHEMA } from '@shared';
import { dbClient } from '@utils';

describe('Database tests', () => {
    describe(`'${SCHEMA.NAME}' schema`, () => {
        it('exists', async () => {
            const result = await dbClient.query({
                text: `
                    SELECT EXISTS (
                        SELECT schema_name
                        FROM information_schema.schemata
                        WHERE schema_name = $1
                    )
                `,
                values: [SCHEMA.NAME],
            });

            expect(result.rows[0].exists).to.eq(true);
        });

        const tableNames = Object.values(SCHEMA.TABLE_NAMES);
        for (const tableName of tableNames) {
            it(`'${tableName}' table exists`, async () => {
                const result = await dbClient.query({
                    text: `
                    SELECT EXISTS (
                        SELECT table_name
                        FROM information_schema.tables
                        WHERE table_schema = $1 AND table_name = $2
                    )
                `,
                    values: [SCHEMA.NAME, tableName],
                });

                expect(result.rows[0].exists).to.eq(true);
            });
        }
    });
});
