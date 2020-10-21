CREATE SCHEMA IF NOT EXISTS "xero_integration";

CREATE TABLE IF NOT EXISTS "oauth2_access_tokens" (
    "account_id" text PRIMARY KEY NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "user_id" text NOT NULL,
    "tenant_id" text NOT NULL,
    "token_set" jsonb NOT NULL,
    "created_at" timestamp without time zone DEFAULT NOW() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payhawk_api_keys" (
    "account_id" text PRIMARY KEY NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "key" text,
    "created_at" timestamp without time zone DEFAULT NOW() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "expense_transactions" (
    "account_id" text NOT NULL,
    "expense_id" text NOT NULL,
    "transaction_id" text NOT NULL,

    UNIQUE("account_id", "expense_id", "transaction_id")
);
