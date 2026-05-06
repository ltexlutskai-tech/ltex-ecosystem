-- Email persistent DLQ (Session 70)
CREATE TABLE IF NOT EXISTS "email_jobs" (
    "id"               TEXT          NOT NULL,
    "to_address"       TEXT          NOT NULL,
    "subject"          TEXT          NOT NULL,
    "html_body"        TEXT          NOT NULL,
    "text_body"        TEXT,
    "source"           TEXT          NOT NULL,
    "reference_id"     TEXT,
    "status"           TEXT          NOT NULL DEFAULT 'pending',
    "attempts"         INTEGER       NOT NULL DEFAULT 0,
    "max_attempts"     INTEGER       NOT NULL DEFAULT 5,
    "next_attempt_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error"       TEXT,
    "created_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3)  NOT NULL,
    "sent_at"          TIMESTAMP(3),

    CONSTRAINT "email_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_jobs_status_next_attempt_at_idx"
    ON "email_jobs"("status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "email_jobs_source_created_at_idx"
    ON "email_jobs"("source", "created_at");
