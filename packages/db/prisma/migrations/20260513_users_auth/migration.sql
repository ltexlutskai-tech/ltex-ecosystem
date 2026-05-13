-- Manager Workstation auth (Session M1.1)
-- Adds User + UserRefreshToken + PasswordResetToken + ClientAssignment tables.

DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('manager', 'senior_manager', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id"                  TEXT          NOT NULL,
  "email"               TEXT          NOT NULL,
  "password_hash"       TEXT          NOT NULL,
  "full_name"           TEXT          NOT NULL,
  "role"                "UserRole"    NOT NULL DEFAULT 'manager',
  "is_active"           BOOLEAN       NOT NULL DEFAULT true,
  "code_1c"             TEXT,
  "warehouse_id_1c"     TEXT,
  "telegram_chat_id"    TEXT,
  "telegram_link_token" TEXT,
  "notify_channels"     TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3)  NOT NULL,
  "last_seen_at"        TIMESTAMP(3),
  "last_login_ip"       TEXT,
  "failed_login_count"  INTEGER       NOT NULL DEFAULT 0,
  "locked_until"        TIMESTAMP(3),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key"
  ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_code_1c_key"
  ON "users"("code_1c");
CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_chat_id_key"
  ON "users"("telegram_chat_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_link_token_key"
  ON "users"("telegram_link_token");

CREATE TABLE IF NOT EXISTS "user_refresh_tokens" (
  "id"          TEXT          NOT NULL,
  "user_id"     TEXT          NOT NULL,
  "token_hash"  TEXT          NOT NULL,
  "expires_at"  TIMESTAMP(3)  NOT NULL,
  "revoked_at"  TIMESTAMP(3),
  "user_agent"  TEXT,
  "ip_address"  TEXT,
  "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_refresh_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_refresh_tokens_token_hash_key"
  ON "user_refresh_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "user_refresh_tokens_user_id_revoked_at_idx"
  ON "user_refresh_tokens"("user_id", "revoked_at");

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id"            TEXT          NOT NULL,
  "user_id"       TEXT          NOT NULL,
  "token_hash"    TEXT          NOT NULL,
  "expires_at"    TIMESTAMP(3)  NOT NULL,
  "used_at"       TIMESTAMP(3),
  "is_invite"     BOOLEAN       NOT NULL DEFAULT false,
  "requested_ip"  TEXT,
  "created_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key"
  ON "password_reset_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_used_at_idx"
  ON "password_reset_tokens"("user_id", "used_at");

CREATE TABLE IF NOT EXISTS "client_assignments" (
  "id"            TEXT          NOT NULL,
  "user_id"       TEXT          NOT NULL,
  "customer_id"   TEXT          NOT NULL,
  "assigned_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_assignments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_assignments_user_id_customer_id_key"
  ON "client_assignments"("user_id", "customer_id");
