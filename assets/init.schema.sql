CREATE SCHEMA IF NOT EXISTS "xero_integration";

CREATE TABLE IF NOT EXISTS "accounts" (
    "account_id" text PRIMARY KEY NOT NULL,
    "tenant_id" text NOT NULL,
    "initial_sync_completed" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "oauth2_access_tokens" (
    "account_id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "tenant_id" text NOT NULL,
    "token_set" jsonb NOT NULL,
    "created_at" timestamp DEFAULT NOW() NOT NULL,
    "updated_at" timestamp DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payhawk_api_keys" (
    "account_id" text PRIMARY KEY NOT NULL,
    "key" text,
    "created_at" timestamp DEFAULT NOW() NOT NULL,
    "updated_at" timestamp DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "expense_transactions" (
    "account_id" text NOT NULL,
    "expense_id" text NOT NULL,
    "transaction_id" text NOT NULL,

    UNIQUE("account_id", "expense_id", "transaction_id")
);

CREATE TABLE IF NOT EXISTS "bank_feed_connections" (
    "id" bigserial PRIMARY KEY,
    "created_at" timestamp DEFAULT NOW() NOT NULL,
    "bank_connection_id" text UNIQUE NOT NULL,
    "account_id" text NOT NULL,
    "currency" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "bank_feed_statements" (
    "id" bigserial PRIMARY KEY,
    "created_at" timestamp DEFAULT NOW() NOT NULL,
    "bank_statement_id" text UNIQUE NOT NULL,
    "account_id" text NOT NULL,
    "xero_entity_id" text,
    "payhawk_entity_id" text NOT NULL,
    "payhawk_entity_type" text NOT NULL
);
