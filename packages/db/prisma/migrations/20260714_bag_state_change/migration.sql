-- Зміна стану мішка (як у 1С Документ.ИзменениеСостоянияМешка). Additive + idempotent.
-- Пакетний редактор мішків: шапка + рядки (кожен = Lot за barcode). Проведення
-- записує поля стану в лоти + журнал `lot_state_history`. Реімпорт історії з 1С —
-- окремим entity пізніше (моделі готові прийняти number_1c / code_1c).

-- 1. Сектор мішка як FK на довідник (паралельно до текстового lots.sector).
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "sector_id" TEXT;
DO $$
BEGIN
  ALTER TABLE "lots"
    ADD CONSTRAINT "lots_sector_id_fkey"
    FOREIGN KEY ("sector_id") REFERENCES "warehouse_sectors" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "lots_sector_id_idx" ON "lots" ("sector_id");

-- 2. Документ «Зміна стану мішка» (шапка).
CREATE TABLE IF NOT EXISTS "mgr_bag_state_changes" (
  "id" TEXT NOT NULL,
  "doc_number" TEXT NOT NULL,
  "number_1c" TEXT,
  "code_1c" TEXT,
  "doc_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "warehouse_id" TEXT,
  "created_by_user_id" TEXT,
  "posted_at" TIMESTAMP(3),
  "posted_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mgr_bag_state_changes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_bag_state_changes_doc_number_key" ON "mgr_bag_state_changes" ("doc_number");
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_bag_state_changes_code_1c_key" ON "mgr_bag_state_changes" ("code_1c");
CREATE INDEX IF NOT EXISTS "mgr_bag_state_changes_status_idx" ON "mgr_bag_state_changes" ("status");
CREATE INDEX IF NOT EXISTS "mgr_bag_state_changes_doc_date_idx" ON "mgr_bag_state_changes" ("doc_date" DESC);

-- 3. Рядки документа (кожен = один мішок).
CREATE TABLE IF NOT EXISTS "mgr_bag_state_change_items" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "line_no" INTEGER NOT NULL,
  "lot_id" TEXT,
  "barcode" TEXT NOT NULL,
  "product_id" TEXT,
  "is_open" BOOLEAN NOT NULL DEFAULT false,
  "has_video" BOOLEAN NOT NULL DEFAULT false,
  "is_target" BOOLEAN NOT NULL DEFAULT false,
  "youtube_url" TEXT,
  "description" TEXT,
  "comment" TEXT,
  "on_air" BOOLEAN NOT NULL DEFAULT false,
  "on_air_delivery" BOOLEAN NOT NULL DEFAULT false,
  "reserved_agent_user_id" TEXT,
  "reserved_client_id" TEXT,
  "reserved_until" TIMESTAMP(3),
  "sector" TEXT,
  "sector_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mgr_bag_state_change_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_bag_state_change_items_document_id_idx" ON "mgr_bag_state_change_items" ("document_id");
CREATE INDEX IF NOT EXISTS "mgr_bag_state_change_items_barcode_idx" ON "mgr_bag_state_change_items" ("barcode");
DO $$
BEGIN
  ALTER TABLE "mgr_bag_state_change_items"
    ADD CONSTRAINT "mgr_bag_state_change_items_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "mgr_bag_state_changes" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Журнал історії зміни стану мішка (= 1С РегістрСведений.ІсторіяЗміниСтануМішка).
CREATE TABLE IF NOT EXISTS "lot_state_history" (
  "id" TEXT NOT NULL,
  "lot_id" TEXT,
  "barcode" TEXT NOT NULL,
  "product_id" TEXT,
  "recorder_doc_id" TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "changed_by_user_id" TEXT,
  "is_open" BOOLEAN NOT NULL DEFAULT false,
  "has_video" BOOLEAN NOT NULL DEFAULT false,
  "is_target" BOOLEAN NOT NULL DEFAULT false,
  "youtube_url" TEXT,
  "description" TEXT,
  "comment" TEXT,
  "on_air" BOOLEAN NOT NULL DEFAULT false,
  "on_air_delivery" BOOLEAN NOT NULL DEFAULT false,
  "reserved_agent_user_id" TEXT,
  "reserved_client_id" TEXT,
  "reserved_until" TIMESTAMP(3),
  "sector" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lot_state_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "lot_state_history_lot_id_idx" ON "lot_state_history" ("lot_id");
CREATE INDEX IF NOT EXISTS "lot_state_history_barcode_idx" ON "lot_state_history" ("barcode");
CREATE INDEX IF NOT EXISTS "lot_state_history_recorder_doc_id_idx" ON "lot_state_history" ("recorder_doc_id");
CREATE INDEX IF NOT EXISTS "lot_state_history_occurred_at_idx" ON "lot_state_history" ("occurred_at" DESC);
