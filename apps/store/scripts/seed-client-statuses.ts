/**
 * Сід довідника статусів контрагентів `MgrClientStatus` (порт 1С
 * `Справочник.СтатусыКонтрагентов`). 7 предвизначених статусів — коди/назви
 * відомі офлайн з `docs/1c-export-2026-06-02/Catalogs/СтатусыКонтрагентов/
 * Ext/Predefined.xml` (MSSQL НЕ потрібен).
 *
 * Idempotent upsert по `code`. Призначає `colorHex` + `sortOrder` (наша
 * семантика — у 1С кольорів немає).
 *
 * ─── ГАРАНТІЇ БЕЗПЕКИ (як інші seed-скрипти) ──────────────────────────────────
 *   - Ціль запису: ТІЛЬКИ `IMPORT_TARGET_DB_URL`. Якщо не задано → падаємо.
 *     НІКОЛИ не фолбечимо мовчки на `DATABASE_URL`.
 *   - Якщо ціль == `DATABASE_URL` (бойова база) → вимагаємо `--confirm-prod`.
 *   - `--dry-run` НЕ робить жодного запису.
 *
 * ─── ЗАПУСК ───────────────────────────────────────────────────────────────────
 *   # сухий прогон:
 *   IMPORT_TARGET_DB_URL=<DATABASE_URL> \
 *     pnpm --filter @ltex/store exec tsx scripts/seed-client-statuses.ts --dry-run
 *   # бойовий запис:
 *   IMPORT_TARGET_DB_URL=<DATABASE_URL> \
 *     pnpm --filter @ltex/store exec tsx scripts/seed-client-statuses.ts --confirm-prod
 *
 * Скрипт у пісочниці НЕ запускався (немає БД) — лише компілюється/перевіряється.
 */

import { PrismaClient } from "@ltex/db";

import { CLIENT_STATUS_SEED } from "../lib/manager/client-status-codes";

interface Flags {
  dryRun: boolean;
  confirmProd: boolean;
}

function parseFlags(argv: string[]): Flags {
  let dryRun = false;
  let confirmProd = false;
  for (const arg of argv.slice(2)) {
    switch (arg) {
      case "--dry-run":
        dryRun = true;
        break;
      case "--confirm-prod":
        confirmProd = true;
        break;
      default:
        throw new Error(`Невідомий прапор: ${arg}`);
    }
  }
  return { dryRun, confirmProd };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);

  const targetUrl = process.env.IMPORT_TARGET_DB_URL;
  if (!targetUrl) {
    throw new Error(
      "IMPORT_TARGET_DB_URL is required (ціль запису). НЕ фолбечимо на DATABASE_URL.",
    );
  }
  const isProd = targetUrl === process.env.DATABASE_URL;
  if (isProd && !flags.confirmProd && !flags.dryRun) {
    throw new Error(
      "Ціль == DATABASE_URL (бойова база). Додай --confirm-prod (або --dry-run).",
    );
  }

  if (flags.dryRun) {
    console.log("[seed-client-statuses] --dry-run: запис не виконується.");
    for (const s of CLIENT_STATUS_SEED) {
      console.log(`  ${s.code}  ${s.label}  ${s.colorHex}  #${s.sortOrder}`);
    }
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  try {
    let created = 0;
    let updated = 0;
    for (const s of CLIENT_STATUS_SEED) {
      const existing = await prisma.mgrClientStatus.findUnique({
        where: { code: s.code },
        select: { id: true },
      });
      await prisma.mgrClientStatus.upsert({
        where: { code: s.code },
        create: {
          code: s.code,
          label: s.label,
          colorHex: s.colorHex,
          sortOrder: s.sortOrder,
        },
        update: {
          label: s.label,
          colorHex: s.colorHex,
          sortOrder: s.sortOrder,
        },
      });
      if (existing) updated += 1;
      else created += 1;
    }
    console.log(
      `[seed-client-statuses] готово: створено ${created}, оновлено ${updated}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-client-statuses] помилка:", err);
  process.exitCode = 1;
});
