-- Шаблони повідомлень: видимість «Мої» / «Спільні» (2026-07-17).
-- Additive + idempotent. Дозвіл бачити шаблон надає автор:
--   is_shared = false → приватний (лише автор),
--   is_shared = true  → спільний (усі менеджери).
-- Наявні шаблони раніше бачили ВСІ (спільний довідник) — щоб нічого не зникло,
-- бекфілимо всі поточні рядки у is_shared = true.

ALTER TABLE "mgr_message_templates"
  ADD COLUMN IF NOT EXISTS "is_shared" BOOLEAN NOT NULL DEFAULT false;

-- Бекфіл: усе, що існувало до цієї міграції, лишається видимим для всіх.
UPDATE "mgr_message_templates" SET "is_shared" = true WHERE "is_shared" = false;

CREATE INDEX IF NOT EXISTS "mgr_message_templates_created_by_user_id_idx"
  ON "mgr_message_templates" ("created_by_user_id");

CREATE INDEX IF NOT EXISTS "mgr_message_templates_is_shared_idx"
  ON "mgr_message_templates" ("is_shared");
