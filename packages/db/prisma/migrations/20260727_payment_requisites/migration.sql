-- Довідник реквізитів для оплати (2026-07-14): набори реквізитів одержувача,
-- які менеджер обирає перед відправкою повідомлення «Скинути реквізити».
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS "mgr_payment_requisites" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "recipient"  TEXT NOT NULL,
  "edrpou"     TEXT,
  "bank_name"  TEXT,
  "iban"       TEXT,
  "purpose"    TEXT DEFAULT 'Оплата товару',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "archived"   BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mgr_payment_requisites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mgr_payment_requisites_archived_sort_order_idx"
  ON "mgr_payment_requisites" ("archived", "sort_order");

-- Дефолтний набір реквізитів (ФОП Кузенко) — щоб форма одразу мала що показати.
INSERT INTO "mgr_payment_requisites"
  ("id", "name", "recipient", "edrpou", "bank_name", "iban", "purpose", "is_default", "sort_order")
VALUES
  (
    'req_fop_kuzenko',
    'ФОП Кузенко (ПриватБанк)',
    'ФОП КУЗЕНКО ТАРАС СТЕПАНОВИЧ',
    '3351808816',
    'АТ КБ "ПРИВАТБАНК"',
    'UA603052990000026003010807538',
    'Оплата товару',
    true,
    0
  )
ON CONFLICT ("id") DO NOTHING;
