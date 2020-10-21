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
    "xero_entity_id" text NOT NULL,
    "payhawk_entity_id" text NOT NULL,
    "payhawk_entity_type" text NOT NULL
);
