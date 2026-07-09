-- ТЗ 8.0 — «Позначка на вилучення» (soft-delete у стилі 1С). Additive, idempotent.
-- Черга завдань на видалення для адміністратора + прапорці на обʼєктах.

-- Клієнти: позначка на вилучення + архів (у MgrClient раніше не було жодного).
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;

-- Документи: позначка на вилучення (archived уже існує).
ALTER TABLE "orders"           ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_sales"        ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_cash_orders"  ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_route_sheets" ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;

-- Довідники: позначка на вилучення + архів.
ALTER TABLE "mgr_client_statuses"  ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_client_statuses"  ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_search_channels"  ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_search_channels"  ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_categories_tt"    ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_categories_tt"    ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_delivery_methods" ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_delivery_methods" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_routes"           ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_routes"           ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_producers"        ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mgr_producers"        ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;

-- Черга запитів на видалення (полиморфна, без FK).
CREATE TABLE IF NOT EXISTS "deletion_requests" (
  "id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "entity_label" TEXT NOT NULL,
  "dict_type" TEXT,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "outcome" TEXT,
  "requested_by_user_id" TEXT NOT NULL,
  "requested_by_name" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_by_user_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "resolution_note" TEXT,
  CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "deletion_requests_status_requested_at_idx" ON "deletion_requests" ("status", "requested_at");
CREATE INDEX IF NOT EXISTS "deletion_requests_entity_type_entity_id_idx" ON "deletion_requests" ("entity_type", "entity_id");

-- Каталог (Товари/Категорії): позначка + архів. Вітрина ці поля не читає.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products"   ADD COLUMN IF NOT EXISTS "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products"   ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
