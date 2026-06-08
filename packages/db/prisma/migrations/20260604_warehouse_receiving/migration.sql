-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 20260604_warehouse_receiving                                             ║
-- ║                                                                          ║
-- ║ Блок «Поступлення товарів» (Тиждень 2). Заміна 1С Document.              ║
-- ║ ПоступленняТоварівУслуг. Складський працівник (роль `warehouse`)         ║
-- ║ сам приймає товар: створює документ → вводить рядки (товар + вага +      ║
-- ║ штрихкод) → при проведенні автоматично створюються лоти у `Lot` таблиці. ║
-- ║                                                                          ║
-- ║ Включено:                                                                ║
-- ║   1. `suppliers` — окрема модель постачальника (як у 1С Контрагенти      ║
-- ║      з прапором ЯвляетсяПоставщиком; виокремлено у нас для звітів        ║
-- ║      по продажах і закупках).                                            ║
-- ║   2. `warehouses` — склади (зараз 1, але архітектура під багато).        ║
-- ║   3. `receivings` — документ поступлення (шапка).                        ║
-- ║   4. `receiving_items` — рядки документа.                                ║
-- ║   5. `lots.supplier_id` (FK) — постачальник записаний у КОЖНОМУ лоті     ║
-- ║      (для звіту "продажі за постачальниками" — узгоджено з user).        ║
-- ║   6. `lots.receiving_id` (FK) — який документ створив цей лот.           ║
-- ║   7. `lots.purchase_price_eur` — собівартість (закупкова ціна).          ║
-- ║                                                                          ║
-- ║ Усі зміни — additive idempotent (повторно безпечне застосування).        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Suppliers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "suppliers" (
  "id"           TEXT          NOT NULL,
  "code_1c"      TEXT,
  "name"         TEXT          NOT NULL,
  "full_name"    TEXT,
  "edrpou"       TEXT,
  "phone"        TEXT,
  "email"        TEXT,
  "address"      TEXT,
  "country"      TEXT,
  "bank_account" TEXT,
  "currency"     TEXT          NOT NULL DEFAULT 'EUR',
  "is_active"    BOOLEAN       NOT NULL DEFAULT TRUE,
  "comment"      TEXT,
  "created_at"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_code_1c_key"
  ON "suppliers" ("code_1c") WHERE "code_1c" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "suppliers_name_idx" ON "suppliers" ("name");
CREATE INDEX IF NOT EXISTS "suppliers_is_active_idx" ON "suppliers" ("is_active");

-- ── 2. Warehouses ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "warehouses" (
  "id"          TEXT          NOT NULL,
  "code_1c"     TEXT,
  "name"        TEXT          NOT NULL,
  "address"     TEXT,
  "is_active"   BOOLEAN       NOT NULL DEFAULT TRUE,
  "is_default"  BOOLEAN       NOT NULL DEFAULT FALSE,
  "comment"     TEXT,
  "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_code_1c_key"
  ON "warehouses" ("code_1c") WHERE "code_1c" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "warehouses_name_idx" ON "warehouses" ("name");

-- ── 3. Receivings (документ-шапка) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "receivings" (
  "id"                   TEXT          NOT NULL,
  "code_1c"              TEXT,
  -- Номер документа у нашій системі (LT-YYYY-NNNNNN, auto-генерується)
  "doc_number"           TEXT          NOT NULL,
  "doc_date"             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Постачальник + склад (FK без cascade — захист від помилкового delete)
  "supplier_id"          TEXT          NOT NULL,
  "warehouse_id"         TEXT          NOT NULL,
  -- Валюта документа й курс на дату (для конвертації цін постачальника)
  "currency"             TEXT          NOT NULL DEFAULT 'EUR',
  "exchange_rate"        DECIMAL(15,4) NOT NULL DEFAULT 1,
  -- Вхідний № і дата документа від постачальника (PDF/email)
  "inbound_doc_number"   TEXT,
  "inbound_doc_date"     DATE,
  -- Сумарні значення (заповнюються при збереженні)
  "total_weight"         DECIMAL(15,3) NOT NULL DEFAULT 0,
  "total_quantity"       INTEGER       NOT NULL DEFAULT 0,
  "total_amount"         DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Статус: draft → posted → cancelled
  "status"               TEXT          NOT NULL DEFAULT 'draft',
  "notes"                TEXT,
  -- Хто створив / провів / скасував
  "created_by_user_id"   TEXT,
  "posted_at"            TIMESTAMPTZ,
  "posted_by_user_id"    TEXT,
  "cancelled_at"         TIMESTAMPTZ,
  "cancelled_by_user_id" TEXT,
  "cancel_reason"        TEXT,
  "created_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "receivings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "receivings_doc_number_key" ON "receivings" ("doc_number");
CREATE UNIQUE INDEX IF NOT EXISTS "receivings_code_1c_key"
  ON "receivings" ("code_1c") WHERE "code_1c" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "receivings_status_idx" ON "receivings" ("status");
CREATE INDEX IF NOT EXISTS "receivings_supplier_id_idx" ON "receivings" ("supplier_id");
CREATE INDEX IF NOT EXISTS "receivings_warehouse_id_idx" ON "receivings" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "receivings_doc_date_idx" ON "receivings" ("doc_date" DESC);

DO $$ BEGIN
  ALTER TABLE "receivings" ADD CONSTRAINT "receivings_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "receivings" ADD CONSTRAINT "receivings_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "receivings" ADD CONSTRAINT "receivings_created_by_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "receivings" ADD CONSTRAINT "receivings_posted_by_fkey"
    FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "receivings" ADD CONSTRAINT "receivings_cancelled_by_fkey"
    FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. ReceivingItems (рядки документа) ────────────────────────────────────
-- Кожен рядок ПЕРЕД проведенням може представляти або (a) існуючий мішок,
-- штрихкод якого вже відомий (наклеєна бірка), або (b) новий мішок —
-- штрихкод буде згенеровано при проведенні. Після проведення створюється
-- запис у `lots` і `created_lot_id` заповнюється.
CREATE TABLE IF NOT EXISTS "receiving_items" (
  "id"               TEXT          NOT NULL,
  "receiving_id"     TEXT          NOT NULL,
  "product_id"       TEXT          NOT NULL,
  -- Вага мішка / партії (кг)
  "weight"           DECIMAL(15,3) NOT NULL,
  -- Кількість одиниць у мішку (зазвичай 1 = один мішок як партія;
  -- якщо рядок репрезентує 10 однакових мішків, ставиться 10 і при
  -- проведенні буде створено 10 окремих лотів)
  "quantity"         INTEGER       NOT NULL DEFAULT 1,
  -- Ціна закупки за кг (у валюті документа `receivings.currency`)
  "purchase_price"   DECIMAL(15,4) NOT NULL DEFAULT 0,
  -- Сума рядка (= weight * quantity * purchase_price)
  "line_amount"      DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Штрихкод (опц.) — заповнено коли:
  --   * сканер прочитав готову бірку
  --   * введено вручну (3-й сценарій user 2026-06-03)
  -- Коли null — згенеруємо при проведенні (3-й сценарій: "генерує система").
  "barcode"          TEXT,
  -- Метод поступлення штрихкоду — для аудиту і UI-показу
  --   'scanned'  — зчитано сканером (зашита інфо у штрихкоді)
  --   'manual'   — введено вручну (наклеєна бірка)
  --   'generated' — згенеровано системою (для нових мішків)
  "barcode_source"   TEXT          NOT NULL DEFAULT 'generated',
  -- Зв'язок зі створеним лотом (після проведення)
  "created_lot_id"   TEXT,
  "notes"            TEXT,
  "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "receiving_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "receiving_items_receiving_id_idx" ON "receiving_items" ("receiving_id");
CREATE INDEX IF NOT EXISTS "receiving_items_product_id_idx" ON "receiving_items" ("product_id");
CREATE INDEX IF NOT EXISTS "receiving_items_created_lot_id_idx" ON "receiving_items" ("created_lot_id");

DO $$ BEGIN
  ALTER TABLE "receiving_items" ADD CONSTRAINT "receiving_items_receiving_id_fkey"
    FOREIGN KEY ("receiving_id") REFERENCES "receivings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "receiving_items" ADD CONSTRAINT "receiving_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. Розширення Lot — supplier_id, receiving_id, purchase_price_eur ─────
ALTER TABLE "lots"
  ADD COLUMN IF NOT EXISTS "supplier_id" TEXT,
  ADD COLUMN IF NOT EXISTS "receiving_id" TEXT,
  ADD COLUMN IF NOT EXISTS "purchase_price_eur" DECIMAL(15,4);

CREATE INDEX IF NOT EXISTS "lots_supplier_id_idx" ON "lots" ("supplier_id");
CREATE INDEX IF NOT EXISTS "lots_receiving_id_idx" ON "lots" ("receiving_id");

DO $$ BEGIN
  ALTER TABLE "lots" ADD CONSTRAINT "lots_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "lots" ADD CONSTRAINT "lots_receiving_id_fkey"
    FOREIGN KEY ("receiving_id") REFERENCES "receivings"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. FK для receiving_items.created_lot_id (після створення lots-розширень)
DO $$ BEGIN
  ALTER TABLE "receiving_items" ADD CONSTRAINT "receiving_items_created_lot_id_fkey"
    FOREIGN KEY ("created_lot_id") REFERENCES "lots"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7. Початковий "склад за замовчуванням" + "невідомий постачальник"
-- Створюємо мінімально-потрібні записи, щоб існуючі лоти могли пов'язатися.
INSERT INTO "warehouses" ("id", "name", "is_active", "is_default", "comment")
VALUES (
  'wh_default_ltex',
  'Основний склад L-TEX',
  TRUE,
  TRUE,
  'Auto-створено міграцією 20260604. Можна перейменувати у /manager/admin.'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "suppliers" ("id", "name", "currency", "is_active", "comment")
VALUES (
  'sup_unknown_ltex',
  'Невідомий постачальник',
  'EUR',
  TRUE,
  'Auto-створено міграцією 20260604 для лотів без відомого постачальника. Створіть реальних і перепризначте.'
)
ON CONFLICT ("id") DO NOTHING;
