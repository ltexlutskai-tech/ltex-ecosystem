-- Реквізити для оплати переносяться у довідник «Банківські рахунки» (2026-07-14).
-- Additive: додаємо поля реквізитів у mgr_bank_accounts; прибираємо окремий
-- довідник mgr_payment_requisites (набори тепер = банківські рахунки).

ALTER TABLE "mgr_bank_accounts"
  ADD COLUMN IF NOT EXISTS "recipient_name"  TEXT,
  ADD COLUMN IF NOT EXISTS "edrpou"          TEXT,
  ADD COLUMN IF NOT EXISTS "iban"            TEXT,
  ADD COLUMN IF NOT EXISTS "bank_name"       TEXT,
  ADD COLUMN IF NOT EXISTS "payment_purpose" TEXT;

-- Бекфіл: наявному рахунку ФОП Кузенко проставляємо повні реквізити (якщо ще
-- порожні), щоб «Скинути реквізити» одразу працювало.
UPDATE "mgr_bank_accounts"
SET
  "recipient_name"  = COALESCE("recipient_name", 'ФОП КУЗЕНКО ТАРАС СТЕПАНОВИЧ'),
  "edrpou"          = COALESCE("edrpou", '3351808816'),
  "iban"            = COALESCE("iban", 'UA603052990000026003010807538'),
  "bank_name"       = COALESCE("bank_name", 'АТ КБ "ПРИВАТБАНК"'),
  "payment_purpose" = COALESCE("payment_purpose", 'Оплата товару')
WHERE "name" ILIKE '%кузенко%' AND "iban" IS NULL;

-- Прибираємо окремий довідник реквізитів (замінено полями банк-рахунків).
DROP TABLE IF EXISTS "mgr_payment_requisites";
