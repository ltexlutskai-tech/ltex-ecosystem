-- Manager «Прайс» block — Stage 5b (message templates dictionary)
-- Простий довідник готових фраз {назва, текст} — відтворює 1С
-- Catalog.ШаблоныСообщений. Спільний для всіх менеджерів. Additive only.

CREATE TABLE IF NOT EXISTS "mgr_message_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mgr_message_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mgr_message_templates_created_at_idx"
    ON "mgr_message_templates"("created_at");
