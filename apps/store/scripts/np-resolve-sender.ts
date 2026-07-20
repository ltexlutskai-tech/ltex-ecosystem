/**
 * Резолвер референсів відправника Нової Пошти.
 *
 * Мета: за наявним `NOVA_POSHTA_API_KEY` знайти й надрукувати Ref-и, які треба
 * вставити у `apps/store/.env` (`NP_SENDER_CITY_REF` / `NP_SENDER_WAREHOUSE_REF`),
 * а також показати контрагента-відправника і його контакт.
 *
 * L-TEX базується у Піддубцях (Луцький район, Волинська область).
 *
 * ─── ЗАПУСК ───────────────────────────────────────────────────────────────────
 *   # NOVA_POSHTA_API_KEY береться з apps/store/.env
 *   pnpm --filter @ltex/store exec tsx scripts/np-resolve-sender.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  searchCities,
  getWarehouses,
  getSenderCounterparty,
  getSenderContact,
} from "../lib/delivery/nova-poshta";

const SENDER_CITY_QUERY = "Піддубці";

/**
 * Мінімальний зчитувач `.env` (без залежності dotenv, якої нема у @ltex/store):
 * якщо змінна ще не в оточенні — пробуємо взяти її з `.env` у поточній теці або
 * в `apps/store/.env`. Заповнює лише відсутні ключі (inline-env має пріоритет).
 */
function loadEnvFile(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "apps/store/.env"),
  ];
  for (const path of candidates) {
    let content: string;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1];
      if (!key || process.env[key] !== undefined) continue;
      let value = (m[2] ?? "").trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  if (!process.env.NOVA_POSHTA_API_KEY) {
    console.error(
      "NOVA_POSHTA_API_KEY не заданий. Додайте його в apps/store/.env " +
        'або запустіть з ключем: $env:NOVA_POSHTA_API_KEY="..."; pnpm ...',
    );
    process.exit(1);
  }

  console.log(`\n=== Пошук міста «${SENDER_CITY_QUERY}» ===`);
  const cities = await searchCities(SENDER_CITY_QUERY);
  if (cities.length === 0) {
    console.error(
      "Місто не знайдено. Спробуйте інший запит у SENDER_CITY_QUERY.",
    );
    process.exit(1);
  }
  cities.forEach((c, i) => {
    console.log(`  [${i}] ${c.name} (${c.area})  ref=${c.ref}`);
  });

  const city = cities[0];
  if (!city) {
    console.error("Місто не знайдено.");
    process.exit(1);
  }
  console.log(`\nОбрано перше місто: ${city.name} (${city.area})`);
  console.log(`NP_SENDER_CITY_REF="${city.ref}"`);

  console.log(`\n=== Відділення у ${city.name} ===`);
  const warehouses = await getWarehouses(city.ref, "1");
  if (warehouses.length === 0) {
    console.log("  (відділень не знайдено за запитом «1» — прибрати фільтр?)");
  }
  warehouses.slice(0, 10).forEach((w) => {
    console.log(`  №${w.number}: ${w.name}  ref=${w.ref}`);
  });
  const warehouse = warehouses[0];
  if (warehouse) {
    console.log(`\nПерше відділення: №${warehouse.number} — ${warehouse.name}`);
    console.log(`NP_SENDER_WAREHOUSE_REF="${warehouse.ref}"`);
  }

  console.log(`\n=== Контрагент-відправник ===`);
  const counterparty = await getSenderCounterparty();
  if (!counterparty) {
    console.log("  Відправника не знайдено (перевірте права ключа).");
  } else {
    console.log(`  ${counterparty.description}  ref=${counterparty.ref}`);
    const contact = await getSenderContact(counterparty.ref);
    if (contact) {
      console.log(
        `  Контакт: ref=${contact.ref}  phone=${contact.phone ?? "(немає)"}`,
      );
      if (contact.phone) {
        console.log(`NP_SENDER_PHONE="${contact.phone}"`);
      }
    }
  }

  console.log(`\nСкопіюйте позначені NP_SENDER_* рядки у apps/store/.env.\n`);
}

main().catch((err) => {
  console.error("Помилка:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
