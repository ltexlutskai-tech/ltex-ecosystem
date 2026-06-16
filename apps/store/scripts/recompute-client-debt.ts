/**
 * Перебудова кешу `MgrClient.debt` з регістра рухів `MgrDebtMovement`.
 *
 * Запускати після будь-якого імпорту/масової зміни рухів боргу (наприклад після
 * `import-1c-historical.ts --entity debt`). Ідемпотентний: повний прогін
 * обнуляє всіх клієнтів і застосовує Σ рухів.
 *
 * Дзеркалить патерни безпеки цілі запису з `import-1c-historical.ts` /
 * `seed-managers-from-1c.ts`:
 *   - Ціль запису: ТІЛЬКИ `IMPORT_TARGET_DB_URL`. Якщо не задано → падаємо.
 *     НІКОЛИ не фолбечимо мовчки на `DATABASE_URL`.
 *   - Якщо ціль == `DATABASE_URL` (бойова база) → вимагаємо `--confirm-prod`.
 *
 * ─── ЗАПУСК ───────────────────────────────────────────────────────────────────
 *   IMPORT_TARGET_DB_URL=<DATABASE_URL> \
 *     pnpm --filter @ltex/store exec tsx scripts/recompute-client-debt.ts --confirm-prod
 *
 * Скрипт у пісочниці НЕ запускався (немає БД) — лише компілюється/перевіряється.
 */

import { PrismaClient } from "@ltex/db";

import { recomputeDebtForClients } from "../lib/manager/debt-register";

const TAG = "[recompute-debt]";
function log(msg: string): void {
  console.log(`${TAG} ${msg}`);
}

interface CliArgs {
  confirmProd: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { confirmProd: false };
  for (const a of argv) {
    switch (a) {
      case "--confirm-prod":
        args.confirmProd = true;
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const targetUrl = process.env.IMPORT_TARGET_DB_URL;
  if (!targetUrl) {
    console.error(
      `${TAG} FATAL: IMPORT_TARGET_DB_URL is not set (ціль запису). ` +
        `Скрипт НІКОЛИ не фолбечить на DATABASE_URL. Для бойового запису: ` +
        `IMPORT_TARGET_DB_URL=<DATABASE_URL> ... --confirm-prod`,
    );
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && targetUrl === dbUrl && !args.confirmProd) {
    console.error(
      `${TAG} FATAL: target equals DATABASE_URL (production). Re-run with ` +
        `--confirm-prod to allow writes to the live database.`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  try {
    log(
      "перебудовую кеш MgrClient.debt з рухів MgrDebtMovement (повний прогін)…",
    );
    const updated = await recomputeDebtForClients(prisma);
    log(`готово — оновлено клієнтів: ${updated}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`${TAG} FATAL:`, e instanceof Error ? e.message : e);
  process.exit(1);
});
