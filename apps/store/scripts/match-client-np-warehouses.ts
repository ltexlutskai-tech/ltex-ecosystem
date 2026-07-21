/**
 * Звірка адрес клієнтів з довідником Нової Пошти.
 *
 * Проходить по `MgrClient` з заповненими `city` / `novaPoshtaBranch` і намагається
 * знайти відповідні реф-и НП (місто + відділення), щоб реалізація підставляла їх
 * автоматично. Заповнює `npCityRef/npCityName/npWarehouseRef/npWarehouseName` і
 * ставить `npAddressMatchedAt` (позначка «звірено»). Клієнтів, де звірка не
 * вдалась, лишає без позначки — їх видно у списку/картці як «не звірено», менеджер
 * доставляє відділення вручну.
 *
 * DRY-RUN за замовчуванням. Запис — з прапорцем `--apply`.
 *   NOVA_POSHTA_API_KEY + DATABASE_URL беруться з apps/store/.env (або оточення).
 *
 * ─── ЗАПУСК ───────────────────────────────────────────────────────────────────
 *   pnpm --filter @ltex/store exec tsx scripts/match-client-np-warehouses.ts
 *   pnpm --filter @ltex/store exec tsx scripts/match-client-np-warehouses.ts --apply
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

loadEnvFile();

// Динамічний імпорт ПІСЛЯ завантаження .env (щоб Prisma побачив DATABASE_URL).
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (!process.env.NOVA_POSHTA_API_KEY) {
    console.error("NOVA_POSHTA_API_KEY не заданий (apps/store/.env).");
    process.exit(1);
  }
  const { prisma } = await import("@ltex/db");
  const { searchCities, getWarehouses } =
    await import("../lib/delivery/nova-poshta");

  // Витягуємо № відділення з тексту (напр. «Житомир, №12» → "12").
  const branchNumber = (raw: string | null): string | null => {
    if (!raw) return null;
    const m = /№?\s*(\d{1,5})/.exec(raw);
    return m?.[1] ?? null;
  };

  try {
    const clients = await prisma.mgrClient.findMany({
      where: {
        OR: [{ city: { not: null } }, { novaPoshtaBranch: { not: null } }],
      },
      select: {
        id: true,
        name: true,
        city: true,
        novaPoshtaBranch: true,
        npAddressMatchedAt: true,
      },
    });

    console.log(
      `\nКлієнтів для звірки: ${clients.length}${apply ? "" : "  (dry-run)"}\n`,
    );

    const cityCache = new Map<
      string,
      Awaited<ReturnType<typeof searchCities>>
    >();
    let matched = 0;
    let unmatched = 0;

    for (const c of clients) {
      const cityQuery = (c.city ?? "").trim();
      const num = branchNumber(c.novaPoshtaBranch);
      if (!cityQuery || !num) {
        unmatched += 1;
        continue;
      }

      let cities = cityCache.get(cityQuery.toLowerCase());
      if (!cities) {
        cities = await searchCities(cityQuery, 5);
        cityCache.set(cityQuery.toLowerCase(), cities);
      }
      const city = cities[0];
      if (!city) {
        unmatched += 1;
        continue;
      }

      const warehouses = await getWarehouses(city.ref, num, 50);
      const wh = warehouses.find((w) => w.number === num);
      if (!wh) {
        unmatched += 1;
        continue;
      }

      matched += 1;
      console.log(
        `  ✓ ${c.name}: ${city.name} — №${wh.number}${
          c.npAddressMatchedAt ? " (оновлення)" : ""
        }`,
      );
      if (apply) {
        await prisma.mgrClient.update({
          where: { id: c.id },
          data: {
            npCityRef: city.ref,
            npCityName: city.name,
            npWarehouseRef: wh.ref,
            npWarehouseName: `№${wh.number}: ${wh.name}`,
            npAddressMatchedAt: new Date(),
          },
        });
      }
    }

    console.log(
      `\nЗвірено: ${matched}   Не звірено: ${unmatched}` +
        (apply ? "" : "\n(це dry-run — додайте --apply, щоб записати)") +
        "\n",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Помилка:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
