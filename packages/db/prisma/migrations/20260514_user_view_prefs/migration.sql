-- Manager view preferences (Session M1.3e)
-- Per-user JSON config для customizable таблиці клієнтів і панелі фільтрів.
-- Idempotent — additive only, safe для multiple runs.

CREATE TABLE IF NOT EXISTS "mgr_user_view_prefs" (
  "id"         TEXT         NOT NULL,
  "user_id"    TEXT         NOT NULL,
  "view_key"   TEXT         NOT NULL,
  "config"     JSONB        NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mgr_user_view_prefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_user_view_prefs_user_view_key"
  ON "mgr_user_view_prefs"("user_id", "view_key");

DO $$ BEGIN
  ALTER TABLE "mgr_user_view_prefs"
    ADD CONSTRAINT "mgr_user_view_prefs_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
