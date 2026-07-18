-- Звіт менеджера у ЄВРО (основна валюта L-TEX). Перейменування колонки плану
-- виручки з ₴ на €. Idempotent-safe: перейменовуємо лише якщо стара колонка
-- ще існує (на випадок повторного застосування / чистих інсталяцій, де
-- 20260804 уже могла створити стару назву).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mgr_sales_plans' AND column_name = 'plan_revenue_uah'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mgr_sales_plans' AND column_name = 'plan_revenue_eur'
  ) THEN
    ALTER TABLE "mgr_sales_plans" RENAME COLUMN "plan_revenue_uah" TO "plan_revenue_eur";
  END IF;
END $$;
