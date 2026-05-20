-- Manager «Прайс» block — Stage 1 (additive lot fields)
-- `is_target`  — цільовий лот (галочка менеджера)
-- `arrival_date` — дата приходу мішка (fallback на created_at коли NULL)

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "is_target" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "lots"
    ADD COLUMN IF NOT EXISTS "arrival_date" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "lots_is_target_idx" ON "lots"("is_target");
