-- Картка клієнта — Фаза 3: «Ключові слова» (теги) на контрагенті.
-- Вільний текст (теги через кому) для пошуку/фільтра у списку клієнтів.
-- Additive + idempotent.

ALTER TABLE "mgr_clients" ADD COLUMN IF NOT EXISTS "keywords" TEXT;
