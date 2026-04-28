-- Product view log (Session 43)
CREATE TABLE IF NOT EXISTS "view_log" (
    "id"          TEXT          NOT NULL,
    "customer_id" TEXT,
    "product_id"  TEXT          NOT NULL,
    "source"      TEXT          NOT NULL DEFAULT 'unknown',
    "viewed_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "view_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "view_log_customer_id_viewed_at_idx"
    ON "view_log"("customer_id", "viewed_at");

CREATE INDEX IF NOT EXISTS "view_log_product_id_viewed_at_idx"
    ON "view_log"("product_id", "viewed_at");

ALTER TABLE "view_log"
    ADD CONSTRAINT "view_log_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "view_log"
    ADD CONSTRAINT "view_log_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
