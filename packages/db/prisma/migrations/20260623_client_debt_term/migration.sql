-- Per-client debt deferral term (OUR OWN field, NOT imported from 1C).
-- null = use the global report default ("Відстрочка за замовчуванням, днів").
ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "debt_term_days" INTEGER;
