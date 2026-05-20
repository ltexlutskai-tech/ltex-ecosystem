-- Manager «Прайс» block — Stage 3a (lot card manager fields)
-- Усі поля additive + nullable/default — магазин їх не використовує.
-- `sector`      — сектор складу (де лежить мішок)
-- `is_open`     — мішок розпакований (так/ні)
-- `comment`     — менеджерський коментар до лоту
-- `description` — опис лоту (Сезон/Сорт/Кількість одиниць/Вага одиниці — у кожного свій)
-- `video_date`  — дата відеоогляду лоту

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "sector" TEXT;

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "is_open" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "comment" TEXT;

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "video_date" TIMESTAMP(3);
