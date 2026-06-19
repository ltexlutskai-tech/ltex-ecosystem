/**
 * Аудит не-1С товарів / лотів / штрихкодів (READ-ONLY).
 *
 * Мета: дати user цифри для рішення по чистці (сесія 5.7, п.7 плану
 * `docs/SESSION_5.7_DICTIONARIES_PLAN.md`). Скрипт ТІЛЬКИ читає БД — жодного
 * create/update/delete. Тож, на відміну від записувальних скриптів
 * (`import-1c-historical.ts`, `recompute-client-debt.ts`), читає `DATABASE_URL`
 * напряму через `@ltex/db` PrismaClient — без `IMPORT_TARGET_DB_URL`-гарду.
 *
 * Дискримінатори (узгоджено з планом 5.7 §7):
 *   • Product не-1С  → `code1C IS NULL`. ⚠️ АЛЕ Excel-каталог S71 теж має
 *     `code1C NULL` (легітимний!). Тому окремо рахуємо «голі» (без images/prices)
 *     vs ті, що мають images/prices (ознака легітимного каталогу).
 *   • Lot не-1С      → `receivingId IS NOT NULL` (наш документ «Поступлення»).
 *     `status = 'archived'` — ознака 1С-імпорту. (У схемі Lot ще НЕ має `code1C`
 *     — надійніший дискримінатор зʼявиться після реімпорту `--entity lots`.)
 *   • Barcode не-1С  → належить не-1С лоту (`lot.receivingId IS NOT NULL`).
 *
 * Заблоковані від видалення: FK-Restrict від OrderItem/SaleItem на product/lot
 * (історія продажів). Рахуємо, скільки сутностей мають такі посилання.
 *
 * ─── ЗАПУСК ───────────────────────────────────────────────────────────────────
 *   # DATABASE_URL береться з apps/store/.env
 *   pnpm --filter @ltex/store exec tsx scripts/audit-non-1c.ts
 *   # машинний вивід:
 *   pnpm --filter @ltex/store exec tsx scripts/audit-non-1c.ts --json
 *
 * Скрипт у пісочниці НЕ запускався (немає БД) — лише компілюється/перевіряється.
 */

import { PrismaClient } from "@ltex/db";

const TAG = "[audit-non-1c]";

interface ProductStats {
  total: number;
  with1C: number;
  nonO1C: number;
  nonO1CWithImagesOrPrices: number;
  nonO1CBare: number;
  nonO1CBlockedByHistory: number; // має OrderItem/SaleItem/Lot
  nonO1CDeletable: number; // не-1С без жодних посилань
}

interface LotStats {
  total: number;
  fromReceiving: number; // receivingId != null → наш не-1С
  archived: number; // status='archived' → ознака 1С-імпорту
  other: number; // решта (1С-імпорт без archived тощо)
  receivingBlockedByHistory: number; // не-1С лоти з OrderItem/SaleItem
  receivingDeletable: number; // не-1С лоти без посилань
}

interface BarcodeStats {
  total: number;
  onNon1CLots: number;
}

interface AuditResult {
  products: ProductStats;
  lots: LotStats;
  barcodes: BarcodeStats;
}

async function gatherProductStats(prisma: PrismaClient): Promise<ProductStats> {
  const total = await prisma.product.count();
  const with1C = await prisma.product.count({
    where: { code1C: { not: null } },
  });
  const nonO1C = await prisma.product.count({ where: { code1C: null } });

  // Не-1С з ознакою легітимного каталогу (має зображення АБО ціни).
  const nonO1CWithImagesOrPrices = await prisma.product.count({
    where: {
      code1C: null,
      OR: [{ images: { some: {} } }, { prices: { some: {} } }],
    },
  });
  const nonO1CBare = nonO1C - nonO1CWithImagesOrPrices;

  // Не-1С, заблоковані історією (FK-Restrict від OrderItem/SaleItem або наявні Lot).
  const nonO1CBlockedByHistory = await prisma.product.count({
    where: {
      code1C: null,
      OR: [
        { orderItems: { some: {} } },
        { saleItems: { some: {} } },
        { lots: { some: {} } },
      ],
    },
  });
  const nonO1CDeletable = nonO1C - nonO1CBlockedByHistory;

  return {
    total,
    with1C,
    nonO1C,
    nonO1CWithImagesOrPrices,
    nonO1CBare,
    nonO1CBlockedByHistory,
    nonO1CDeletable,
  };
}

async function gatherLotStats(prisma: PrismaClient): Promise<LotStats> {
  const total = await prisma.lot.count();
  const fromReceiving = await prisma.lot.count({
    where: { receivingId: { not: null } },
  });
  const archived = await prisma.lot.count({ where: { status: "archived" } });
  const other = total - fromReceiving - archived;

  const receivingBlockedByHistory = await prisma.lot.count({
    where: {
      receivingId: { not: null },
      OR: [{ orderItems: { some: {} } }, { saleItems: { some: {} } }],
    },
  });
  const receivingDeletable = fromReceiving - receivingBlockedByHistory;

  return {
    total,
    fromReceiving,
    archived,
    other,
    receivingBlockedByHistory,
    receivingDeletable,
  };
}

async function gatherBarcodeStats(prisma: PrismaClient): Promise<BarcodeStats> {
  const total = await prisma.barcode.count();
  const onNon1CLots = await prisma.barcode.count({
    where: { lot: { receivingId: { not: null } } },
  });
  return { total, onNon1CLots };
}

function printTable(result: AuditResult): void {
  const { products: p, lots: l, barcodes: b } = result;

  console.log("");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" АУДИТ НЕ-1С ТОВАРІВ / ЛОТІВ / ШТРИХКОДІВ (read-only)");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  console.log("");
  console.log("PRODUCTS (товари)");
  console.log(
    "  ─────────────────────────────────────────────────────────────",
  );
  console.log(`  Усього                                       ${p.total}`);
  console.log(`  З code1C (з 1С)                              ${p.with1C}`);
  console.log(`  Без code1C (не-1С)                           ${p.nonO1C}`);
  console.log(
    `    ├─ з images/prices (легітим. каталог S71)  ${p.nonO1CWithImagesOrPrices}`,
  );
  console.log(`    └─ «голі» (без images і без prices)        ${p.nonO1CBare}`);
  console.log(
    `  Не-1С заблоковані історією (OrderItem/       ${p.nonO1CBlockedByHistory}`,
  );
  console.log(`     SaleItem/Lot → FK-Restrict)`);
  console.log(
    `  Не-1С без посилань (кандидати на видалення)  ${p.nonO1CDeletable}`,
  );

  console.log("");
  console.log("LOTS (лоти/мішки)");
  console.log(
    "  ─────────────────────────────────────────────────────────────",
  );
  console.log(`  Усього                                       ${l.total}`);
  console.log(
    `  receivingId != null («Поступлення», не-1С)   ${l.fromReceiving}`,
  );
  console.log(`  status='archived' (ознака 1С-імпорту)        ${l.archived}`);
  console.log(`  решта                                        ${l.other}`);
  console.log(
    `  Не-1С (receiving) заблоковані історією        ${l.receivingBlockedByHistory}`,
  );
  console.log(
    `  Не-1С (receiving) без посилань (кандидати)    ${l.receivingDeletable}`,
  );

  console.log("");
  console.log("BARCODES (штрихкоди)");
  console.log(
    "  ─────────────────────────────────────────────────────────────",
  );
  console.log(`  Усього                                       ${b.total}`);
  console.log(
    `  На не-1С лотах (receivingId != null)         ${b.onNon1CLots}`,
  );

  console.log("");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" ПІДСУМОК");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`  Кандидати на чистку (не-1С, без історії):`);
  console.log(`     товари ${p.nonO1CDeletable}, лоти ${l.receivingDeletable}`);
  console.log(`  Заблоковані історією (лишити — FK-Restrict):`);
  console.log(
    `     товари ${p.nonO1CBlockedByHistory}, лоти ${l.receivingBlockedByHistory}`,
  );
  console.log(
    `  Лишити як легітимний Excel-каталог S71 (не-1С з images/prices):`,
  );
  console.log(`     товари ${p.nonO1CWithImagesOrPrices}`);
  console.log("");
  console.log("  ⚠️  Це ЛИШЕ аудит. Жодних змін у БД не зроблено.");
  console.log("      Архів/видалення — окремо, після рішення user.");
  console.log("");
}

async function main(): Promise<void> {
  const jsonMode = process.argv.includes("--json");

  if (!process.env.DATABASE_URL) {
    console.error(`${TAG} DATABASE_URL не задано. Запусти з apps/store/.env.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const [products, lots, barcodes] = await Promise.all([
      gatherProductStats(prisma),
      gatherLotStats(prisma),
      gatherBarcodeStats(prisma),
    ]);
    const result: AuditResult = { products, lots, barcodes };

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printTable(result);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`${TAG} помилка:`, err);
  process.exit(1);
});
