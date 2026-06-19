/**
 * CLI-перерахунок статусів клієнтів (порт 1С ScheduledJob
 * `ИзменениеСтатусовКонтрагентов`). Викликає той самий хелпер, що й cron-роут
 * `/api/cron/recompute-client-statuses`, але БЕЗ HTTP/секрету — напряму по
 * `DATABASE_URL` (через спільний `prisma` з `@ltex/db`).
 *
 * Зручно для ручного запуску та Windows Scheduled Task (раз на місяць).
 *
 * ─── ЗАПУСК ───────────────────────────────────────────────────────────────────
 *   # через обгортку (сама вантажить .env):
 *   .\scripts\recompute-statuses.ps1
 *   # або напряму (DATABASE_URL має бути у process.env):
 *   pnpm --filter @ltex/store exec tsx scripts/recompute-client-statuses.ts
 *
 * Перед першим запуском потрібен seed довідника:
 *   scripts/seed-client-statuses.ts (інакше перерахунок — no-op).
 */

import { recomputeClientStatuses } from "../lib/manager/recompute-client-statuses";

const TAG = "[recompute-client-statuses]";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      `${TAG} FATAL: DATABASE_URL не задано (підвантаж .env або скористайся scripts\\recompute-statuses.ps1).`,
    );
    process.exit(1);
  }

  console.log(`${TAG} старт перерахунку…`);
  const result = await recomputeClientStatuses();
  console.log(
    `${TAG} готово: оброблено=${result.processed} ` +
      `статус-змін=${result.generalChanged} опер-змін=${result.operationalChanged} ` +
      `нові→потенційний=${result.newToPotential} історія=${result.historyWritten}`,
  );

  if (result.processed === 0) {
    console.warn(
      `${TAG} 0 оброблено — переконайся, що засіяно довідник статусів ` +
        `(scripts/seed-client-statuses.ts) і є клієнти.`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`${TAG} ПОМИЛКА:`, err);
    process.exit(1);
  });
