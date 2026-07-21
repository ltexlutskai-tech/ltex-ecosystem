-- Nova Poshta + Checkbox, Фаза 3: проєкт фіскального чека Checkbox (ETTN) для
-- NovaPay-накладок. Створюється на «Готово». Ідемпотентно за sale_id.

CREATE TABLE IF NOT EXISTS "checkbox_receipts" (
  "id"               TEXT NOT NULL,
  "sale_id"          TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "receipt_id"       TEXT,
  "ettn"             TEXT,
  "fiscal_code"      TEXT,
  "error"            TEXT,
  "payload_snapshot" JSONB,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkbox_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "checkbox_receipts_sale_id_key"
  ON "checkbox_receipts" ("sale_id");

DO $$ BEGIN
  ALTER TABLE "checkbox_receipts"
    ADD CONSTRAINT "checkbox_receipts_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "mgr_sales"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
