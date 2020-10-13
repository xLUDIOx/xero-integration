CREATE TABLE IF NOT EXISTS "expense_transactions" (
    "account_id" text PRIMARY KEY NOT NULL,
    "expense_id" text NOT NULL,
    "transaction_id" text NOT NULL,

    UNIQUE("account_id", "expense_id", "transaction_id")
);
