-- Пакування товару (коробка/мішок → підказка РО) + архів завдань.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "packaging" TEXT;

ALTER TABLE "mgr_tasks"
  ADD COLUMN IF NOT EXISTS "archived_at"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archived_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "archived_by_name"    TEXT;
