-- Manager sync queue (Session M1.5)
-- Outbound write-back черга для двостороннього sync з 1С.
-- Идемпотент: усе обернуто IF NOT EXISTS / DO BEGIN EXCEPTION WHEN duplicate_object.

DO $$ BEGIN
  CREATE TYPE "SyncJobStatus" AS ENUM ('pending', 'retrying', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SyncEntityType" AS ENUM ('client', 'order', 'payment');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "mgr_sync_jobs" (
  "id"               TEXT             NOT NULL,
  "entity_type"      "SyncEntityType" NOT NULL,
  "entity_id"        TEXT             NOT NULL,
  "action"           TEXT             NOT NULL,
  "payload"          JSONB            NOT NULL,
  "status"           "SyncJobStatus"  NOT NULL DEFAULT 'pending',
  "attempts"         INTEGER          NOT NULL DEFAULT 0,
  "max_attempts"     INTEGER          NOT NULL DEFAULT 5,
  "next_attempt_at"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error"       TEXT,
  "idempotency_key"  TEXT             NOT NULL,
  "sent_at"          TIMESTAMP(3),
  "created_at"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "mgr_sync_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_sync_jobs_idempotency_key_key"
  ON "mgr_sync_jobs"("idempotency_key");

CREATE INDEX IF NOT EXISTS "mgr_sync_jobs_status_next_attempt_at_idx"
  ON "mgr_sync_jobs"("status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "mgr_sync_jobs_entity_type_entity_id_idx"
  ON "mgr_sync_jobs"("entity_type", "entity_id");
