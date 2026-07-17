-- Реєстрація кабінету покупця (2026-07-17):
--   1) область стає обовʼязковою на сайті → пишемо її в `customers.region`;
--   2) лід одразу маршрутизується на менеджера за областю → `mgr_leads.agent_user_id`;
--   3) звірка телефону НЕЗАЛЕЖНО від формату — авто-обчислюване поле `phone_key`
--      (останні 9 цифр номера) з індексом на всіх таблицях з телефонами.
--
-- `phone_key` = GENERATED ALWAYS ... STORED: БД сама тримає його в синхроні з
-- телефоном при будь-якому записі (у т.ч. імпорт із 1С), тому код його НІКОЛИ
-- не пише. Значення = останні 9 цифр, або NULL коли цифр менше 9.

-- ── 1. Нові поля ────────────────────────────────────────────────────────────
ALTER TABLE "customers"  ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "mgr_leads"  ADD COLUMN IF NOT EXISTS "agent_user_id" TEXT;

-- FK лід → менеджер (SetNull, щоб видалення користувача не валило лід).
DO $$
BEGIN
  ALTER TABLE "mgr_leads"
    ADD CONSTRAINT "mgr_leads_agent_user_id_fkey"
    FOREIGN KEY ("agent_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Авто-обчислюване `phone_key` (останні 9 цифр) ────────────────────────
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phone_key" TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN length(regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g')) >= 9
      THEN right(regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g'), 9)
      ELSE NULL
    END
  ) STORED;

ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "phone_key" TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN length(regexp_replace(COALESCE("phone_primary", ''), '[^0-9]', '', 'g')) >= 9
      THEN right(regexp_replace(COALESCE("phone_primary", ''), '[^0-9]', '', 'g'), 9)
      ELSE NULL
    END
  ) STORED;

ALTER TABLE "mgr_client_phones" ADD COLUMN IF NOT EXISTS "phone_key" TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN length(regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g')) >= 9
      THEN right(regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g'), 9)
      ELSE NULL
    END
  ) STORED;

ALTER TABLE "mgr_leads" ADD COLUMN IF NOT EXISTS "phone_key" TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN length(regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g')) >= 9
      THEN right(regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g'), 9)
      ELSE NULL
    END
  ) STORED;

-- ── 3. Індекси ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "customers_phone_key_idx"         ON "customers"("phone_key");
CREATE INDEX IF NOT EXISTS "mgr_clients_phone_key_idx"       ON "mgr_clients"("phone_key");
CREATE INDEX IF NOT EXISTS "mgr_client_phones_phone_key_idx" ON "mgr_client_phones"("phone_key");
CREATE INDEX IF NOT EXISTS "mgr_leads_phone_key_idx"         ON "mgr_leads"("phone_key");
CREATE INDEX IF NOT EXISTS "mgr_leads_agent_user_id_idx"     ON "mgr_leads"("agent_user_id");
