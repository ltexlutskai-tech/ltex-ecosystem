-- Фаза 1 (5.6) — закрити прогалини довідників: Одиниці виміру, Області, Міста,
-- Торгові агенти, Контакти Viber. Усе additive + idempotent (CREATE … IF NOT
-- EXISTS / DO $$ … EXCEPTION WHEN duplicate_object). Дані переносяться окремо
-- через `--entity dictionaries-full` (idempotent upsert по code1C = hex).

-- ─── Одиниці виміру (← Catalog.ЕдиницыИзмерения / _Reference52) ──────────────
CREATE TABLE IF NOT EXISTS "units" (
  "id" TEXT NOT NULL,
  "code_1c" TEXT,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "full_name" TEXT,
  "coefficient" DECIMAL(15,3),
  "classifier_code" TEXT,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "units_code_1c_key" ON "units" ("code_1c");

-- ─── Області (← Catalog.Области / _Reference6811) ───────────────────────────
CREATE TABLE IF NOT EXISTS "regions" (
  "id" TEXT NOT NULL,
  "code_1c" TEXT,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "regions_code_1c_key" ON "regions" ("code_1c");

-- ─── Міста (← Catalog.Города / _Reference6810, OWNED областю) ───────────────
CREATE TABLE IF NOT EXISTS "cities" (
  "id" TEXT NOT NULL,
  "code_1c" TEXT,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "region_code_1c" TEXT,
  "region_id" TEXT,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cities_code_1c_key" ON "cities" ("code_1c");
CREATE INDEX IF NOT EXISTS "cities_region_id_idx" ON "cities" ("region_id");

DO $$ BEGIN
  ALTER TABLE "cities" ADD CONSTRAINT "cities_region_id_fkey"
    FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Торгові агенти (← Catalog.ТорговыеАгенты / _Reference6628) ──────────────
CREATE TABLE IF NOT EXISTS "mgr_trade_agents" (
  "id" TEXT NOT NULL,
  "code_1c" TEXT,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "user_id" TEXT,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mgr_trade_agents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_trade_agents_code_1c_key" ON "mgr_trade_agents" ("code_1c");
CREATE INDEX IF NOT EXISTS "mgr_trade_agents_user_id_idx" ON "mgr_trade_agents" ("user_id");

DO $$ BEGIN
  ALTER TABLE "mgr_trade_agents" ADD CONSTRAINT "mgr_trade_agents_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Контакти Viber (← Catalog.КонтактыViber) ───────────────────────────────
CREATE TABLE IF NOT EXISTS "viber_contacts" (
  "id" TEXT NOT NULL,
  "code_1c" TEXT,
  "phone" TEXT NOT NULL,
  "subscribed_at" TIMESTAMP(3),
  "client_code_1c" TEXT,
  "dialog_status" TEXT,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "viber_contacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "viber_contacts_code_1c_key" ON "viber_contacts" ("code_1c");
