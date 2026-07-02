-- Валюта рахунку/каси для руху коштів (ДДС): "UAH" | "EUR" | "USD".
-- Дозволяє розкласти Сумму (у валюті рахунку) по колонках грн/євро/долар у звіті,
-- лишаючи СуммаУпр (amount_upr) як управлінський облік у €.
-- Additive + idempotent. Заповнюється реімпортом `--entity cashflow-reg`.

ALTER TABLE "cash_flow_movements"
  ADD COLUMN IF NOT EXISTS "currency_code" TEXT;
