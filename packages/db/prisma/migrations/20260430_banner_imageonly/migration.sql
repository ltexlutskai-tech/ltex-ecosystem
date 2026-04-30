-- Cleanup old banners (user request — нові будуть image-only)
DELETE FROM "banners";

-- title тепер опційний (legacy)
ALTER TABLE "banners" ALTER COLUMN "title" DROP NOT NULL;

-- ctaHref тепер обов'язковий (банер без посилання не має сенсу)
ALTER TABLE "banners" ALTER COLUMN "ctaHref" SET NOT NULL;
