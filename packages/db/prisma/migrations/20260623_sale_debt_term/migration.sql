-- Per-document debt deferral term («днів до закриття») on the realization document.
-- null = use the global report default ("Відстрочка за замовчуванням, днів").
-- COD documents (cash_on_delivery=true) ignore this field (no deferral).
ALTER TABLE "mgr_sales" ADD COLUMN IF NOT EXISTS "debt_term_days" INTEGER;
