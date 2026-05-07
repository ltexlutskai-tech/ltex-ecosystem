/**
 * One-shot backfill: parse existing `Product.unitsPerKg` / `Product.unitWeight`
 * human-readable strings → fill the `*Min` / `*Max` Float columns introduced by
 * migration `20260508_product_numeric_ranges`.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill-numeric-ranges.ts
 *     → DRY-RUN: prints how many rows would be updated, plus first 10 parse
 *       errors. No DB writes.
 *
 *   pnpm exec tsx scripts/backfill-numeric-ranges.ts --apply
 *     → APPLY: updates rows whose numeric columns are still null.
 *
 * Idempotent — only touches rows where the corresponding `*Min` is null.
 */

import { prisma } from "@ltex/db";
import { parseRangeString } from "@ltex/shared";

const ARGV = process.argv.slice(2);
const DRY_RUN = !ARGV.includes("--apply");

async function main(): Promise<void> {
  console.log(
    `[L-TEX backfill] mode=${DRY_RUN ? "DRY-RUN" : "APPLY"} — scanning products with text ranges and null numeric pairs…`,
  );

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { unitsPerKg: { not: null }, unitsPerKgMin: null },
        { unitWeight: { not: null }, unitWeightMin: null },
      ],
    },
    select: {
      id: true,
      articleCode: true,
      unitsPerKg: true,
      unitWeight: true,
      unitsPerKgMin: true,
      unitWeightMin: true,
    },
  });

  console.log(`[L-TEX backfill] candidates=${products.length}`);

  let updated = 0;
  let skipped = 0;
  const parseErrors: string[] = [];

  for (const p of products) {
    const data: {
      unitsPerKgMin?: number;
      unitsPerKgMax?: number;
      unitWeightMin?: number;
      unitWeightMax?: number;
    } = {};

    if (p.unitsPerKg && p.unitsPerKgMin == null) {
      const range = parseRangeString(p.unitsPerKg);
      if (range) {
        data.unitsPerKgMin = range.min;
        data.unitsPerKgMax = range.max;
      } else {
        parseErrors.push(
          `${p.articleCode ?? p.id}: unitsPerKg=${JSON.stringify(p.unitsPerKg)}`,
        );
      }
    }

    if (p.unitWeight && p.unitWeightMin == null) {
      const range = parseRangeString(p.unitWeight);
      if (range) {
        data.unitWeightMin = range.min;
        data.unitWeightMax = range.max;
      } else {
        parseErrors.push(
          `${p.articleCode ?? p.id}: unitWeight=${JSON.stringify(p.unitWeight)}`,
        );
      }
    }

    if (Object.keys(data).length === 0) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      updated++;
    } else {
      await prisma.product.update({ where: { id: p.id }, data });
      updated++;
    }
  }

  console.log(
    `[L-TEX backfill] result: updated=${updated} skipped=${skipped} parseErrors=${parseErrors.length}`,
  );
  if (parseErrors.length > 0) {
    console.log("[L-TEX backfill] First 10 parse errors:");
    for (const err of parseErrors.slice(0, 10)) console.log(`  • ${err}`);
  }
  if (DRY_RUN) {
    console.log(
      "[L-TEX backfill] DRY-RUN complete — re-run with --apply to write changes.",
    );
  }
}

main()
  .catch((err) => {
    console.error("[L-TEX backfill] FATAL:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
