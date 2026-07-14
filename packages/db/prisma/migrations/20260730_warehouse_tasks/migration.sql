-- Блок «Завдання» для складу (2026-07-14): при проведенні реалізації склад
-- отримує завдання підготувати лоти + перевірити/створити ТТН.

CREATE TABLE IF NOT EXISTS "warehouse_tasks" (
  "id"                  TEXT NOT NULL,
  "sale_id"             TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'new',
  "customer_name"       TEXT NOT NULL,
  "delivery_method"     TEXT,
  "delivery_label"      TEXT,
  "nova_poshta_branch"  TEXT,
  "express_waybill"     TEXT,
  "delivery_address"    TEXT,
  "manager_user_id"     TEXT,
  "manager_name"        TEXT,
  "received_by_user_id" TEXT,
  "received_by_name"    TEXT,
  "received_at"         TIMESTAMP(3),
  "sent_by_user_id"     TEXT,
  "sent_by_name"        TEXT,
  "sent_at"             TIMESTAMP(3),
  "ttn_confirmed"       BOOLEAN NOT NULL DEFAULT false,
  "comment"             TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "warehouse_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_tasks_sale_id_key" ON "warehouse_tasks" ("sale_id");
CREATE INDEX IF NOT EXISTS "warehouse_tasks_status_idx" ON "warehouse_tasks" ("status");

CREATE TABLE IF NOT EXISTS "warehouse_task_items" (
  "id"           TEXT NOT NULL,
  "task_id"      TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "article_code" TEXT,
  "barcode"      TEXT,
  "lot_id"       TEXT,
  "quantity"     INTEGER NOT NULL DEFAULT 1,
  "weight"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sector"       TEXT,
  "packed"       BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "warehouse_task_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "warehouse_task_items_task_id_idx" ON "warehouse_task_items" ("task_id");

DO $$ BEGIN
  ALTER TABLE "warehouse_tasks"
    ADD CONSTRAINT "warehouse_tasks_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "mgr_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "warehouse_task_items"
    ADD CONSTRAINT "warehouse_task_items_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "warehouse_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
