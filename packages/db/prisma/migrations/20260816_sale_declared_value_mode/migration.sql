-- Режим оголошеної цінності ТТН НП: full | cod | none (вибір менеджера).
ALTER TABLE "mgr_sales"
  ADD COLUMN IF NOT EXISTS "declared_value_mode" TEXT;
