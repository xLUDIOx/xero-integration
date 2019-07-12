CREATE SCHEMA IF NOT EXISTS "xero_integration";

CREATE TABLE IF NOT EXISTS "access_tokens" (
    "account_id" text PRIMARY KEY,
    "created_at" timestamp without time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
    "access_token" jsonb
);

CREATE TABLE IF NOT EXISTS "request_tokens" (
    "account_id" text PRIMARY KEY,
    "created_at" timestamp without time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
    "request_token" jsonb
);
