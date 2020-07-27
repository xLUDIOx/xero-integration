CREATE TABLE IF NOT EXISTS "oauth2_access_tokens" (
    "account_id" text NOT NULL,
    "user_id" text NOT NULL,
    "tenant_id" text NOT NULL,
    "token_set" jsonb NOT NULL,
    "created_at" timestamp without time zone DEFAULT NOW() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT NOW() NOT NULL,

    PRIMARY KEY ("account_id", "user_id")
);
