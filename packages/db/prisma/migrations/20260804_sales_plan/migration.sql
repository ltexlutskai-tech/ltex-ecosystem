-- План продажів по областях (2026-07-17) — для звіту менеджера. Additive +
-- idempotent. Задають адмін + аналітик; місяць × область (regionSlug =
-- slug області АБО службовий "__total__" для загального плану). Порівнюється
-- з фактом: виручка (₴), к-сть ТТ що скупились, к-сть нових ТТ.
CREATE TABLE IF NOT EXISTS "mgr_sales_plans" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "region_slug" TEXT NOT NULL,
    "plan_revenue_uah" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plan_tt_count" INTEGER NOT NULL DEFAULT 0,
    "plan_new_tt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_sales_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_sales_plans_month_region_slug_key" ON "mgr_sales_plans"("month", "region_slug");
CREATE INDEX IF NOT EXISTS "mgr_sales_plans_month_idx" ON "mgr_sales_plans"("month");
