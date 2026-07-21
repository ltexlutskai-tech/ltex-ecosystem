-- Nova Poshta адресна доставка «до дверей» (WarehouseDoors) — вулиця/будинок/
-- квартира отримувача. Зберігаються на реалізації для авто-створення ТТН
-- (Address.save → RecipientAddress). Ідемпотентно (IF NOT EXISTS).

ALTER TABLE "mgr_sales"
  ADD COLUMN IF NOT EXISTS "np_street_ref"       TEXT,
  ADD COLUMN IF NOT EXISTS "np_street_name"      TEXT,
  ADD COLUMN IF NOT EXISTS "np_building_number"  TEXT,
  ADD COLUMN IF NOT EXISTS "np_flat"             TEXT;
