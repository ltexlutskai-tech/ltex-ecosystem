-- Nova Poshta + Checkbox, Фаза 2.1:
--  • структуровані реф-и НП на картці клієнта (авто-підстановка у реалізацію) +
--    позначка «звірено» (np_address_matched_at);
--  • «Ручна обробка» на місці відправлення (зберігаємо для складу).

ALTER TABLE "mgr_clients"
  ADD COLUMN IF NOT EXISTS "np_city_ref"           TEXT,
  ADD COLUMN IF NOT EXISTS "np_city_name"          TEXT,
  ADD COLUMN IF NOT EXISTS "np_warehouse_ref"      TEXT,
  ADD COLUMN IF NOT EXISTS "np_warehouse_name"     TEXT,
  ADD COLUMN IF NOT EXISTS "np_address_matched_at" TIMESTAMP(3);

ALTER TABLE "warehouse_task_seats"
  ADD COLUMN IF NOT EXISTS "manual_handling" BOOLEAN NOT NULL DEFAULT false;
