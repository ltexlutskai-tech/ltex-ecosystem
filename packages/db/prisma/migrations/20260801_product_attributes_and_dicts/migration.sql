-- Блок «Прайс» (2026-07-17): нове поле Product.filling (Наповнення) +
-- редаговані довідники характеристик товару (Якість/Країна/Стать/Сезон).
-- Значення довідників сідяться зі спільних констант, щоб наявні товари
-- лишались відфільтровуваними (Product.quality/country/gender/season = code).

-- ── Product.filling (Наповнення) ────────────────────────────────────────────
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "filling" TEXT;

-- ── Довідники характеристик ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mgr_qualities" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "mgr_qualities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_qualities_code_key" ON "mgr_qualities" ("code");

CREATE TABLE IF NOT EXISTS "mgr_countries" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "mgr_countries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_countries_code_key" ON "mgr_countries" ("code");

CREATE TABLE IF NOT EXISTS "mgr_genders" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "mgr_genders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_genders_code_key" ON "mgr_genders" ("code");

CREATE TABLE IF NOT EXISTS "mgr_seasons" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "marked_for_deletion" BOOLEAN NOT NULL DEFAULT false,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "mgr_seasons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_seasons_code_key" ON "mgr_seasons" ("code");

-- ── Сід зі спільних констант (idempotent) ───────────────────────────────────
INSERT INTO "mgr_qualities" ("id", "code", "label", "sort_order") VALUES
  (gen_random_uuid()::text, 'extra', 'Екстра', 0),
  (gen_random_uuid()::text, 'cream', 'Крем', 1),
  (gen_random_uuid()::text, 'first', '1й сорт', 2),
  (gen_random_uuid()::text, 'second', '2й сорт', 3),
  (gen_random_uuid()::text, 'stock', 'Сток', 4),
  (gen_random_uuid()::text, 'mix', 'Мікс', 5),
  (gen_random_uuid()::text, 'extra_first', 'Екстра + 1й сорт', 6),
  (gen_random_uuid()::text, 'extra_cream', 'Екстра + Крем', 7),
  (gen_random_uuid()::text, 'first_second', '1й + 2й сорт', 8)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "mgr_countries" ("id", "code", "label", "sort_order") VALUES
  (gen_random_uuid()::text, 'england', 'Англія', 0),
  (gen_random_uuid()::text, 'germany', 'Німеччина', 1),
  (gen_random_uuid()::text, 'canada', 'Канада', 2),
  (gen_random_uuid()::text, 'poland', 'Польща', 3),
  (gen_random_uuid()::text, 'scotland', 'Шотландія', 4),
  (gen_random_uuid()::text, 'usa', 'США', 5)
ON CONFLICT ("code") DO NOTHING;

-- Стать зберігається у Product.gender як українське слово (= code = label).
INSERT INTO "mgr_genders" ("id", "code", "label", "sort_order") VALUES
  (gen_random_uuid()::text, 'Чоловіча', 'Чоловіча', 0),
  (gen_random_uuid()::text, 'Жіноча', 'Жіноча', 1),
  (gen_random_uuid()::text, 'Дитяча', 'Дитяча', 2),
  (gen_random_uuid()::text, 'Унісекс', 'Унісекс', 3),
  (gen_random_uuid()::text, 'Мікс', 'Мікс', 4),
  (gen_random_uuid()::text, 'Дорослий', 'Дорослий', 5)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "mgr_seasons" ("id", "code", "label", "sort_order") VALUES
  (gen_random_uuid()::text, 'winter', 'Зима', 0),
  (gen_random_uuid()::text, 'summer', 'Літо', 1),
  (gen_random_uuid()::text, 'demiseason', 'Демісезон', 2),
  (gen_random_uuid()::text, 'all_season', 'Всесезонне', 3)
ON CONFLICT ("code") DO NOTHING;
