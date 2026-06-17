-- Фаза 8 (5.6+) — дрібні / службові регістри. Усі таблиці адитивні + idempotent.

-- СтатусДня → agent_day_logs (тайм-трекінг дня агента)
CREATE TABLE IF NOT EXISTS "agent_day_logs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "code_1c" TEXT,
  "date" DATE NOT NULL,
  "kind" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_day_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "agent_day_logs_user_id_date_idx" ON "agent_day_logs" ("user_id", "date");
CREATE INDEX IF NOT EXISTS "agent_day_logs_date_idx" ON "agent_day_logs" ("date");

-- НормыЗапасов → stock_norms
CREATE TABLE IF NOT EXISTS "stock_norms" (
  "id" TEXT NOT NULL,
  "product_code_1c" TEXT NOT NULL,
  "warehouse_code_1c" TEXT,
  "char_code_1c" TEXT,
  "unit_code_1c" TEXT,
  "norm" DECIMAL(14,3) NOT NULL,
  "set_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_norms_pkey" PRIMARY KEY ("id")
);
-- Унікальний ключ норми (відповідає Prisma @@unique stock_norm_key для upsert).
-- ⚠️ PostgreSQL трактує NULL як унікальні; імпортер тому підставляє '' замість
-- NULL у nullable-вимірах перед upsert, щоб норми без складу/ОВ не дублювались.
CREATE UNIQUE INDEX IF NOT EXISTS "stock_norm_key" ON "stock_norms" (
  "product_code_1c",
  "warehouse_code_1c",
  "char_code_1c",
  "unit_code_1c"
);
CREATE INDEX IF NOT EXISTS "stock_norms_product_code_1c_idx" ON "stock_norms" ("product_code_1c");

-- НадежностьПоставщиков → supplier_reliabilities
CREATE TABLE IF NOT EXISTS "supplier_reliabilities" (
  "id" TEXT NOT NULL,
  "supplier_code_1c" TEXT NOT NULL,
  "reliability" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_reliabilities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_reliability_key" ON "supplier_reliabilities" ("supplier_code_1c", "occurred_at");
CREATE INDEX IF NOT EXISTS "supplier_reliabilities_supplier_code_1c_idx" ON "supplier_reliabilities" ("supplier_code_1c");

-- ИсторияСтатусовКонтрагентов → client_status_history
CREATE TABLE IF NOT EXISTS "client_status_history" (
  "id" TEXT NOT NULL,
  "client_code_1c" TEXT NOT NULL,
  "status_code_1c" TEXT,
  "operational_status" TEXT,
  "changed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_status_history_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "client_status_history_key" ON "client_status_history" ("client_code_1c", "changed_at");
CREATE INDEX IF NOT EXISTS "client_status_history_client_code_1c_idx" ON "client_status_history" ("client_code_1c");
