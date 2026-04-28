-- In-app notifications feed (Session 36)
CREATE TABLE IF NOT EXISTS "notifications" (
    "id"          TEXT          NOT NULL,
    "customer_id" TEXT          NOT NULL,
    "type"        TEXT          NOT NULL,
    "title"       TEXT          NOT NULL,
    "body"        TEXT          NOT NULL,
    "payload"     JSONB,
    "read_at"     TIMESTAMP(3),
    "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_customer_id_created_at_idx"
    ON "notifications"("customer_id", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_customer_id_read_at_idx"
    ON "notifications"("customer_id", "read_at");

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
