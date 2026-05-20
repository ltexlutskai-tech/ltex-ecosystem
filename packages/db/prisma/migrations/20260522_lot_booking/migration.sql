-- Manager «Прайс» block — Stage 4 (lot booking / бронювання лотів)
-- Усі поля additive + nullable — магазин їх не використовує.
-- Бронь денормалізована (зберігаємо імена рядком, як у 1С) — БЕЗ жорстких FK,
-- щоб уникнути cross-concern relations між магазином (Lot) і менеджеркою
-- (MgrClient/User).
-- `reserved_for_client_id` — id MgrClient, на якого заброньовано
-- `reserved_for_name`      — ім'я клієнта (для показу без JOIN)
-- `reserved_by_user_id`    — id менеджера, який забронював
-- `reserved_by_name`       — ім'я менеджера (для показу без JOIN)
-- `reserved_until`         — дата «до якого числа» діє бронь

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "reserved_for_client_id" TEXT;

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "reserved_for_name" TEXT;

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "reserved_by_user_id" TEXT;

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "reserved_by_name" TEXT;

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "reserved_until" TIMESTAMP(3);
