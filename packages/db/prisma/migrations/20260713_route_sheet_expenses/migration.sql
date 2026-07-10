-- Блок Б: витрати маршруту (пробіг → рух грошей зі статтею витрат).
-- Additive & idempotent.

-- 1. RouteSheet.price_per_km — ціна за км для авто-розрахунку витрат на пробіг
--    (← 1С ЦенаЗаКМ). Пробіг = mileage_end_km − mileage_start_km.
ALTER TABLE "mgr_route_sheets"
  ADD COLUMN IF NOT EXISTS "price_per_km" DOUBLE PRECISION;

-- 2. RouteSheetExpense — стаття витрат (FK на довідник), валюта, ознака авто-рядка.
ALTER TABLE "mgr_route_sheet_expenses"
  ADD COLUMN IF NOT EXISTS "cash_flow_article_id" TEXT;
ALTER TABLE "mgr_route_sheet_expenses"
  ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'UAH';
ALTER TABLE "mgr_route_sheet_expenses"
  ADD COLUMN IF NOT EXISTS "is_mileage" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mgr_route_sheet_expenses_cash_flow_article_id_fkey'
  ) THEN
    ALTER TABLE "mgr_route_sheet_expenses"
      ADD CONSTRAINT "mgr_route_sheet_expenses_cash_flow_article_id_fkey"
      FOREIGN KEY ("cash_flow_article_id")
      REFERENCES "mgr_cash_flow_articles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "mgr_route_sheet_expenses_cash_flow_article_id_idx"
  ON "mgr_route_sheet_expenses" ("cash_flow_article_id");
