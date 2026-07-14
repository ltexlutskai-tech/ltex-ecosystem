-- Спосіб доставки «Укрпошта» (2026-07-14) — рідкісний, але потрібен.
-- Additive, idempotent: додаємо у довідник способів доставки, якщо ще немає.
INSERT INTO "mgr_delivery_methods" ("id", "code", "label", "sort_order", "archived", "marked_for_deletion")
VALUES ('dm_ukrposhta', 'ukrposhta', 'Укрпошта', 30, false, false)
ON CONFLICT ("code") DO NOTHING;
