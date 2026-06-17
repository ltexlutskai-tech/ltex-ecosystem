-- 20260617_exchange_rate_series — Фаза 4 (історичні курси валют).
--
-- `exchange_rates` уже тримає ряд по датах (унікальність
-- (currency_from, currency_to, date) + created раніше в baseline). Ця міграція
-- ЛИШЕ додає індекс по (currency_from, currency_to, date DESC) для швидкої
-- вибірки «найближчий курс ≤ дати» (eurRateForDate) та для переглядача
-- `/manager/registry/rates` (фільтр період/валюта). Additive + idempotent.

CREATE INDEX IF NOT EXISTS "exchange_rates_currency_from_currency_to_date_idx"
  ON "exchange_rates" ("currency_from", "currency_to", "date" DESC);
