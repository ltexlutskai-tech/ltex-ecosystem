/**
 * Bulk-import / sync products + categories from `Повний каталог товарів.xlsx` → DB.
 *
 * Usage:
 *   pnpm exec tsx scripts/import-catalog-from-excel.ts
 *     → DRY-RUN: reads Excel, generates docs/CATALOG_IMPORT_DRY_RUN_REPORT.md, no DB writes.
 *
 *   pnpm exec tsx scripts/import-catalog-from-excel.ts --apply
 *     → APPLY: reconciles categories, upserts products, syncs prices.
 *       (Run only after orchestrator review of the dry-run report.)
 *
 *   pnpm exec tsx scripts/import-catalog-from-excel.ts --report=path/to/report.md
 *     → write report to a custom location.
 *
 * See `docs/CATALOG_IMPORT_OPERATIONS.md` for runbook.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";

import {
  CATEGORIES,
  CATEGORY_MIGRATIONS,
  CATEGORY_SLUG_MAP,
  DEPRECATED_CATEGORY_SLUGS,
  isFootwear,
  parseCategoryCell,
  parseDescription,
  parseNomenklatura,
  parseRangeString,
  SKU_CATEGORY_OVERRIDE,
  slugify,
  type ClassifiedToken,
  type DescriptionFields,
} from "@ltex/shared";

import { prisma } from "@ltex/db";

const ARGV = process.argv.slice(2);
const DRY_RUN = !ARGV.includes("--apply");
let dbAvailable = true;

async function probeDb(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch (err) {
    console.warn(
      `[L-TEX import] WARN: DB probe failed (${err instanceof Error ? err.message.split("\n")[0] : String(err)}). Continuing in offline DRY-RUN mode — DB-dependent sections will be empty.`,
    );
    return false;
  }
}
const REPORT_PATH =
  ARGV.find((a) => a.startsWith("--report="))?.slice("--report=".length) ??
  path.resolve(process.cwd(), "docs/CATALOG_IMPORT_DRY_RUN_REPORT.md");
const EXCEL_PATH = path.resolve(process.cwd(), "Повний каталог товарів.xlsx");

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowIndex: number;
  articleCode: string;
  name: string;
  videoUrl: string | null;
  description: string;
  weightFromName: number | null;
  parsed: DescriptionFields;
  catTokens: ClassifiedToken[];
  catQuality: string | null;
  catSeason: string | null;
  catCountry: string | null;
  catGender: string | null;
  // resolved
  categorySlug: string | null;
  categoryFallback: string | null;
  // raw prices/qty
  purchasePriceEur: number | null;
  priceEur: number | null;
  salePriceEur: number | null;
  quantityPieces: number | null;
  weightKg: number | null;
}

interface ProductReportEntry {
  action: "CREATE" | "UPDATE";
  articleCode: string;
  name: string;
  slug: string;
  categorySlug: string;
  quality: string;
  country: string;
  season: string;
  priceEur: number | null;
  salePriceEur: number | null;
  inStock: boolean;
}

interface DryRunReport {
  generatedAt: string;
  dbConnected: boolean;
  totalRows: number;
  skipped: { articleCode: string; reason: string }[];
  toCreate: ProductReportEntry[];
  toUpdate: ProductReportEntry[];
  toDelete: { articleCode: string; name: string; reason: string }[];
  categoriesToAdd: { slug: string; name: string; parentSlug: string }[];
  categoriesDeprecated: {
    slug: string;
    target: string;
    productCount: number;
  }[];
  noPriceSell: { articleCode: string; name: string }[];
  noQuantity: string[];
  stubDescriptions: string[];
  slugCollisions: { slug: string; articles: string[] }[];
  unrecognizedTokens: { token: string; articles: string[] }[];
  unrecognizedCategoryFallback: { articleCode: string; rawTokens: string[] }[];
  blockedDeletes: { articleCode: string; reason: string }[];
}

// ─── Phase 2: read Excel ────────────────────────────────────────────────────

function readExcel(): unknown[][] {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel not found at ${EXCEL_PATH}`);
  }
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Excel has no sheets");
  const ws = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
  });
  return rows;
}

// ─── Phase 3: per-row parsing ───────────────────────────────────────────────

function toNumberOrNull(cell: unknown): number | null {
  if (cell == null || cell === "") return null;
  const n = typeof cell === "number" ? cell : Number(cell);
  return Number.isFinite(n) ? n : null;
}

function parseRow(row: unknown[], rowIndex: number): ParsedRow | null {
  const articleRaw = row[0];
  if (articleRaw == null || articleRaw === "") return null;
  const articleCode = String(articleRaw).trim();
  if (!articleCode || articleCode === "Разом") return null;

  const nom = parseNomenklatura(row[1]);
  const description = row[2] == null ? "" : String(row[2]);
  const parsed = parseDescription(description);
  const catTokens = parseCategoryCell(row[3]);

  const catQuality = catTokens.find((t) => t.kind === "quality")?.value ?? null;
  const catSeason = catTokens.find((t) => t.kind === "season")?.value ?? null;
  const catCountry = catTokens.find((t) => t.kind === "country")?.value ?? null;
  const catGender = catTokens.find((t) => t.kind === "gender")?.value ?? null;

  return {
    rowIndex,
    articleCode,
    name: nom.name,
    videoUrl: nom.videoUrl,
    description,
    weightFromName: nom.weightFromName,
    parsed,
    catTokens,
    catQuality,
    catSeason,
    catCountry,
    catGender,
    categorySlug: null,
    categoryFallback: null,
    purchasePriceEur: toNumberOrNull(row[4]),
    priceEur: toNumberOrNull(row[5]),
    salePriceEur: toNumberOrNull(row[6]),
    quantityPieces: toNumberOrNull(row[7]),
    weightKg: toNumberOrNull(row[8]),
  };
}

// ─── Category resolution ────────────────────────────────────────────────────

// Top-level / umbrella tokens that should only win when nothing more specific
// is present in the same row.
const UMBRELLA_TOKENS = new Set([
  "одяг",
  "одяг мікс",
  "взуття",
  "взуття мікс",
  "аксесуари",
  "дім та побут",
  "іграшки",
  "bric-a-brac",
  "bric a brac",
  "косметика",
]);

function resolveCategorySlug(
  row: ParsedRow,
  unrecognized: Map<string, Set<string>>,
): { slug: string; fallback: boolean } {
  // 1. Explicit SKU override (Sheet-3 special-cases)
  const override = SKU_CATEGORY_OVERRIDE[row.articleCode];
  if (override && override.slug) {
    return { slug: override.slug, fallback: false };
  }

  // 2. Prefer the most specific category match. Iterate twice — first
  //    looking for non-umbrella tokens, then umbrellas as a fallback.
  let umbrellaMatch: string | null = null;
  for (const tok of row.catTokens) {
    if (tok.kind !== "category") continue;
    const slug = CATEGORY_SLUG_MAP[tok.value];
    if (!slug) continue;
    if (UMBRELLA_TOKENS.has(tok.value)) {
      if (umbrellaMatch == null) umbrellaMatch = slug;
      continue;
    }
    return { slug, fallback: false };
  }
  if (umbrellaMatch) return { slug: umbrellaMatch, fallback: false };

  // 3. Track unrecognized tokens for the report
  for (const tok of row.catTokens) {
    if (tok.kind !== "category") continue;
    if (!unrecognized.has(tok.value)) unrecognized.set(tok.value, new Set());
    unrecognized.get(tok.value)!.add(row.articleCode);
  }

  return { slug: "inshe-odyag", fallback: true };
}

// ─── Slug uniqueness ────────────────────────────────────────────────────────

function ensureUniqueSlug(
  base: string,
  takenSlugs: Set<string>,
  collisions: Map<string, Set<string>>,
  articleCode: string,
): string {
  if (!base) base = "product";
  let candidate = base;
  let i = 2;
  while (takenSlugs.has(candidate)) {
    if (!collisions.has(base)) collisions.set(base, new Set());
    collisions.get(base)!.add(articleCode);
    candidate = `${base}-${i}`;
    i++;
  }
  takenSlugs.add(candidate);
  return candidate;
}

// ─── Phase 1: category reconciliation (DB) ──────────────────────────────────

interface CategoryReconcileResult {
  added: { slug: string; name: string; parentSlug: string }[];
  deprecated: {
    slug: string;
    target: string;
    productCount: number;
  }[];
}

async function reconcileCategories(
  apply: boolean,
): Promise<CategoryReconcileResult> {
  const result: CategoryReconcileResult = {
    added: [],
    deprecated: [],
  };

  if (!dbAvailable) {
    // Offline mode — assume an empty DB and treat every catalog category as
    // "would be added". Deprecated migrations are reported as "needs DB to verify".
    for (const cat of CATEGORIES) {
      result.added.push({
        slug: cat.slug,
        name: cat.name,
        parentSlug: "(top-level)",
      });
      for (const sub of cat.subcategories) {
        result.added.push({
          slug: sub.slug,
          name: sub.name,
          parentSlug: cat.slug,
        });
      }
    }
    for (const oldSlug of DEPRECATED_CATEGORY_SLUGS) {
      result.deprecated.push({
        slug: oldSlug,
        target: CATEGORY_MIGRATIONS[oldSlug] ?? "(none)",
        productCount: -1,
      });
    }
    return result;
  }

  const dbCategories = await prisma.category.findMany();
  const dbBySlug = new Map(dbCategories.map((c) => [c.slug, c]));

  // 1. Upsert top-level categories
  const topLevel = new Map<string, { id: string }>();
  for (const cat of CATEGORIES) {
    const existing = dbBySlug.get(cat.slug);
    if (existing) {
      topLevel.set(cat.slug, { id: existing.id });
    } else {
      result.added.push({
        slug: cat.slug,
        name: cat.name,
        parentSlug: "(top-level)",
      });
      if (apply) {
        const created = await prisma.category.create({
          data: { slug: cat.slug, name: cat.name, parentId: null },
        });
        topLevel.set(cat.slug, { id: created.id });
      }
    }
  }

  // 2. Upsert subcategories
  for (const cat of CATEGORIES) {
    const parent = topLevel.get(cat.slug);
    for (const sub of cat.subcategories) {
      if (!dbBySlug.has(sub.slug)) {
        result.added.push({
          slug: sub.slug,
          name: sub.name,
          parentSlug: cat.slug,
        });
        if (apply && parent) {
          await prisma.category.create({
            data: { slug: sub.slug, name: sub.name, parentId: parent.id },
          });
        }
      }
    }
  }

  // 3. Migrate products from deprecated → target
  for (const oldSlug of DEPRECATED_CATEGORY_SLUGS) {
    const oldCat = dbBySlug.get(oldSlug);
    if (!oldCat) {
      result.deprecated.push({
        slug: oldSlug,
        target: CATEGORY_MIGRATIONS[oldSlug] ?? "(none)",
        productCount: 0,
      });
      continue;
    }
    const targetSlug = CATEGORY_MIGRATIONS[oldSlug];
    if (!targetSlug) continue;
    const productCount = await prisma.product.count({
      where: { categoryId: oldCat.id },
    });
    result.deprecated.push({
      slug: oldSlug,
      target: targetSlug,
      productCount,
    });
    if (apply && productCount > 0) {
      // Refetch the (possibly newly-created) target by slug
      const targetCat = await prisma.category.findUnique({
        where: { slug: targetSlug },
      });
      if (targetCat) {
        await prisma.product.updateMany({
          where: { categoryId: oldCat.id },
          data: { categoryId: targetCat.id },
        });
      }
    }
    if (apply) {
      // Delete deprecated category if no products / children left
      const stillHas = await prisma.product.count({
        where: { categoryId: oldCat.id },
      });
      const childCount = await prisma.category.count({
        where: { parentId: oldCat.id },
      });
      if (stillHas === 0 && childCount === 0) {
        await prisma.category.delete({ where: { id: oldCat.id } }).catch(() => {
          // Swallow — FK from another table would block; surfaces in next run
        });
      }
    }
  }

  return result;
}

// ─── Phase 4: product upsert ────────────────────────────────────────────────

/**
 * Run `fn` over `items` in fixed-size batches with bounded concurrency.
 * 4 is the tested sweet spot for local Postgres (no pool tuning needed).
 */
async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function buildCategoryIdMap(): Promise<Map<string, string>> {
  if (!dbAvailable) return new Map();
  const cats = await prisma.category.findMany({
    select: { id: true, slug: true },
  });
  return new Map(cats.map((c) => [c.slug, c.id]));
}

async function loadExistingProducts(): Promise<
  Map<string, { id: string; slug: string }>
> {
  if (!dbAvailable) return new Map();
  const products = await prisma.product.findMany({
    where: { articleCode: { not: null } },
    select: { id: true, slug: true, articleCode: true },
  });
  const out = new Map<string, { id: string; slug: string }>();
  for (const p of products) {
    if (p.articleCode) out.set(p.articleCode, { id: p.id, slug: p.slug });
  }
  return out;
}

async function loadAllSlugs(): Promise<Set<string>> {
  if (!dbAvailable) return new Set();
  const products = await prisma.product.findMany({ select: { slug: true } });
  return new Set(products.map((p) => p.slug));
}

async function upsertProductRow(
  row: ParsedRow,
  categoryId: string,
  resolvedSlug: string,
  existing: { id: string; slug: string } | null,
): Promise<void> {
  const overrideGender = SKU_CATEGORY_OVERRIDE[row.articleCode]?.gender ?? null;
  const unitsRange = parseRangeString(row.parsed.unitsPerKg);
  const weightRange = parseRangeString(row.parsed.unitWeight);
  const data = {
    articleCode: row.articleCode,
    name: row.name || row.articleCode,
    slug: resolvedSlug,
    description: row.description,
    categoryId,
    quality: row.parsed.quality ?? row.catQuality ?? "mix",
    country: row.parsed.country ?? row.catCountry ?? "germany",
    season: row.parsed.season ?? row.catSeason ?? "",
    gender: overrideGender ?? row.parsed.gender ?? row.catGender ?? null,
    sizes: row.parsed.sizes,
    unitsPerKg: row.parsed.unitsPerKg,
    unitsPerKgMin: unitsRange?.min ?? null,
    unitsPerKgMax: unitsRange?.max ?? null,
    unitWeight: row.parsed.unitWeight,
    unitWeightMin: weightRange?.min ?? null,
    unitWeightMax: weightRange?.max ?? null,
    videoUrl: row.videoUrl,
    priceUnit: isFootwear(
      Object.entries(CATEGORY_SLUG_MAP).find(
        ([, v]) => v === resolvedSlug,
      )?.[1] ?? resolvedSlug,
    )
      ? "piece"
      : "kg",
    averageWeight:
      row.weightKg ?? row.weightFromName ?? row.parsed.weightLot ?? null,
    inStock: row.priceEur != null && (row.quantityPieces ?? 1) > 0,
  };

  if (existing) {
    await prisma.product.update({ where: { id: existing.id }, data });
  } else {
    await prisma.product.create({ data });
  }

  // Sync prices: refresh wholesale + akciya for this product.
  const product = existing
    ? existing
    : await prisma.product.findUnique({
        where: { slug: resolvedSlug },
        select: { id: true, slug: true },
      });
  if (!product) return;
  await prisma.price.deleteMany({
    where: {
      productId: product.id,
      priceType: { in: ["wholesale", "akciya"] },
      validTo: null,
    },
  });
  const priceRows: { priceType: string; amount: number }[] = [];
  if (row.priceEur != null)
    priceRows.push({ priceType: "wholesale", amount: row.priceEur });
  if (row.salePriceEur != null)
    priceRows.push({ priceType: "akciya", amount: row.salePriceEur });
  if (priceRows.length > 0) {
    await prisma.price.createMany({
      data: priceRows.map((p) => ({
        productId: product.id,
        priceType: p.priceType,
        currency: "EUR",
        amount: p.amount,
      })),
    });
  }
}

// ─── Report generation ──────────────────────────────────────────────────────

function formatReport(report: DryRunReport): string {
  const lines: string[] = [];
  lines.push("# Catalog Import Report (DRY-RUN)\n");
  lines.push(`Generated: ${report.generatedAt}\n`);
  lines.push(`Source: \`Повний каталог товарів.xlsx\`\n`);
  lines.push(
    `DB connected: ${report.dbConnected ? "yes" : "**no — offline mode** (DB-dependent sections empty; re-run on the server with DATABASE_URL set for accurate counts)"}\n`,
  );
  lines.push("");

  lines.push("## Summary\n");
  lines.push(`- Total Excel rows: **${report.totalRows}**`);
  lines.push(`- Skipped: **${report.skipped.length}**`);
  lines.push(`- To CREATE: **${report.toCreate.length}**`);
  lines.push(`- To UPDATE: **${report.toUpdate.length}**`);
  lines.push(`- To DELETE (not in Excel): **${report.toDelete.length}**`);
  lines.push(
    `- DB products that block deletion (have orders): **${report.blockedDeletes.length}**`,
  );
  lines.push(`- Categories to ADD: **${report.categoriesToAdd.length}**`);
  lines.push(
    `- Categories DEPRECATED (migrate + drop): **${report.categoriesDeprecated.length}**`,
  );
  lines.push("");

  // Categories
  if (report.categoriesToAdd.length > 0) {
    lines.push("## Categories to ADD\n");
    for (const c of report.categoriesToAdd) {
      lines.push(`- \`${c.slug}\` ("${c.name}") under \`${c.parentSlug}\``);
    }
    lines.push("");
  }

  if (report.categoriesDeprecated.length > 0) {
    lines.push("## DEPRECATED categories migration\n");
    for (const c of report.categoriesDeprecated) {
      lines.push(
        `- \`${c.slug}\` → \`${c.target}\`: ${c.productCount} product(s) to migrate`,
      );
    }
    lines.push("");
  }

  // Issues
  lines.push("## Issues found\n");

  lines.push(
    `### Without \`Цена продажи\` (${report.noPriceSell.length} SKU — imported with inStock=false)\n`,
  );
  if (report.noPriceSell.length > 0) {
    for (const x of report.noPriceSell) {
      lines.push(`- \`${x.articleCode}\` — ${x.name}`);
    }
  } else {
    lines.push("_(none)_");
  }
  lines.push("");

  lines.push(
    `### Without \`Количество (шт)\` (${report.noQuantity.length} SKU)\n`,
  );
  if (report.noQuantity.length > 0) {
    lines.push(report.noQuantity.map((a) => `\`${a}\``).join(", "));
  } else {
    lines.push("_(none)_");
  }
  lines.push("");

  lines.push(
    `### Stub descriptions / parsed fields = null (${report.stubDescriptions.length} SKU)\n`,
  );
  if (report.stubDescriptions.length > 0) {
    lines.push(report.stubDescriptions.map((a) => `\`${a}\``).join(", "));
  } else {
    lines.push("_(none)_");
  }
  lines.push("");

  if (report.slugCollisions.length > 0) {
    lines.push(
      `### Slug collisions (last-wins applied — original retained for first SKU, suffixes for the rest)\n`,
    );
    for (const c of report.slugCollisions) {
      lines.push(
        `- \`${c.slug}\` ← ${c.articles.map((a) => `\`${a}\``).join(", ")}`,
      );
    }
    lines.push("");
  }

  if (report.unrecognizedTokens.length > 0) {
    lines.push(
      `### Unrecognized category tokens (fell back to \`inshe-odyag\`) — top 30\n`,
    );
    const sorted = [...report.unrecognizedTokens]
      .sort((a, b) => b.articles.length - a.articles.length)
      .slice(0, 30);
    for (const u of sorted) {
      lines.push(
        `- \`${u.token}\` × ${u.articles.length}: ${u.articles
          .slice(0, 5)
          .map((a) => `\`${a}\``)
          .join(", ")}${u.articles.length > 5 ? ", …" : ""}`,
      );
    }
    lines.push("");
  }

  if (report.unrecognizedCategoryFallback.length > 0) {
    lines.push(
      `### SKUs forced to fallback (\`inshe-odyag\`) — ${report.unrecognizedCategoryFallback.length}\n`,
    );
    for (const x of report.unrecognizedCategoryFallback.slice(0, 30)) {
      lines.push(
        `- \`${x.articleCode}\` — raw tokens: ${x.rawTokens.map((t) => `"${t}"`).join(", ") || "(none)"}`,
      );
    }
    if (report.unrecognizedCategoryFallback.length > 30) {
      lines.push(
        `- _… and ${report.unrecognizedCategoryFallback.length - 30} more_`,
      );
    }
    lines.push("");
  }

  if (report.skipped.length > 0) {
    lines.push("## Skipped SKUs\n");
    for (const s of report.skipped) {
      lines.push(`- \`${s.articleCode}\` — ${s.reason}`);
    }
    lines.push("");
  }

  // Sample CREATE preview
  if (report.toCreate.length > 0) {
    lines.push("## Sample CREATE preview (first 3)\n");
    lines.push("```json");
    lines.push(JSON.stringify(report.toCreate.slice(0, 3), null, 2));
    lines.push("```");
    lines.push("");
  }

  // Sample UPDATE preview
  if (report.toUpdate.length > 0) {
    lines.push("## Sample UPDATE preview (first 3)\n");
    lines.push("```json");
    lines.push(JSON.stringify(report.toUpdate.slice(0, 3), null, 2));
    lines.push("```");
    lines.push("");
  }

  if (report.toDelete.length > 0) {
    lines.push(`## Products to DELETE (${report.toDelete.length})\n`);
    for (const d of report.toDelete) {
      lines.push(`- \`${d.articleCode}\` — ${d.name} (${d.reason})`);
    }
    lines.push("");
  }

  if (report.blockedDeletes.length > 0) {
    lines.push(
      `## Products blocked from deletion (have order history) — ${report.blockedDeletes.length}\n`,
    );
    for (const b of report.blockedDeletes) {
      lines.push(`- \`${b.articleCode}\` — ${b.reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `[L-TEX import] mode=${DRY_RUN ? "DRY-RUN" : "APPLY"} report=${REPORT_PATH}`,
  );

  dbAvailable = await probeDb();
  if (!dbAvailable && !DRY_RUN) {
    console.error("[L-TEX import] FATAL: --apply requires DB connectivity.");
    process.exit(1);
  }

  // Phase 2: read
  const rawRows = readExcel();
  console.log(`[L-TEX import] read ${rawRows.length} raw rows`);

  // Phase 3: parse
  const rows: ParsedRow[] = [];
  const unrecognizedTokens = new Map<string, Set<string>>();
  const skipped: { articleCode: string; reason: string }[] = [];
  const stubDescriptions: string[] = [];
  const noPriceSell: { articleCode: string; name: string }[] = [];
  const noQuantity: string[] = [];
  const fallbackArticles: { articleCode: string; rawTokens: string[] }[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;
    const parsed = parseRow(row, i + 1);
    if (!parsed) continue;

    // SKU override null → SKIP
    const override = SKU_CATEGORY_OVERRIDE[parsed.articleCode];
    if (override && override.slug === null) {
      skipped.push({
        articleCode: parsed.articleCode,
        reason: "SKU_CATEGORY_OVERRIDE.slug=null (not in stock)",
      });
      continue;
    }

    const { slug, fallback } = resolveCategorySlug(parsed, unrecognizedTokens);
    parsed.categorySlug = slug;
    if (fallback) {
      parsed.categoryFallback = "inshe-odyag";
      fallbackArticles.push({
        articleCode: parsed.articleCode,
        rawTokens: parsed.catTokens
          .filter((t) => t.kind === "category")
          .map((t) => t.raw),
      });
    }

    if (parsed.priceEur == null) {
      noPriceSell.push({
        articleCode: parsed.articleCode,
        name: parsed.name || parsed.articleCode,
      });
    }
    if (parsed.quantityPieces == null) {
      noQuantity.push(parsed.articleCode);
    }

    const allDescNull =
      parsed.parsed.quality == null &&
      parsed.parsed.season == null &&
      parsed.parsed.gender == null &&
      parsed.parsed.sizes == null &&
      parsed.parsed.unitsPerKg == null &&
      parsed.parsed.unitWeight == null &&
      parsed.parsed.country == null;
    if (allDescNull && parsed.description.includes("✔")) {
      stubDescriptions.push(parsed.articleCode);
    }

    rows.push(parsed);
  }

  console.log(
    `[L-TEX import] parsed ${rows.length} valid rows, ${skipped.length} skipped`,
  );

  // Phase 1: category reconciliation
  const catReconcile = await reconcileCategories(!DRY_RUN);
  if (DRY_RUN) {
    console.log(
      `[L-TEX import] categories: would add ${catReconcile.added.length}, deprecate ${catReconcile.deprecated.length}`,
    );
  } else {
    console.log(
      `[L-TEX import] categories: added ${catReconcile.added.length}, migrated/deprecated ${catReconcile.deprecated.length}`,
    );
  }

  // Build category id map (post-reconcile in apply mode)
  const categoryIdBySlug = await buildCategoryIdMap();
  // In dry-run, newly-added categories aren't in DB yet — patch the map so the
  // pretend-upsert can proceed. Use a sentinel id "(pending)".
  for (const add of catReconcile.added) {
    if (!categoryIdBySlug.has(add.slug)) {
      categoryIdBySlug.set(add.slug, "(pending)");
    }
  }

  const existingProducts = await loadExistingProducts();
  const allSlugs = await loadAllSlugs();
  const slugCollisions = new Map<string, Set<string>>();

  // Phase 4: upsert
  const toCreate: ProductReportEntry[] = [];
  const toUpdate: ProductReportEntry[] = [];

  // Phase 4a (sequential): resolve category, slug-uniqueness and build report
  // entries. Slug collision detection requires linear state (`allSlugs`) so
  // this part stays single-threaded; the actual DB writes run concurrently
  // below.
  type UpsertTarget = {
    row: ParsedRow;
    categoryId: string;
    slug: string;
    existing: { id: string; slug: string } | null;
  };
  const upsertTargets: UpsertTarget[] = [];

  for (const row of rows) {
    const targetSlug = row.categorySlug ?? "inshe-odyag";
    const categoryId = categoryIdBySlug.get(targetSlug);
    if (!categoryId) {
      console.warn(
        `[L-TEX import] WARN: unknown category slug "${targetSlug}" for ${row.articleCode}`,
      );
      continue;
    }

    const existing = existingProducts.get(row.articleCode) ?? null;
    let slug = existing?.slug ?? slugify(row.name);
    if (!existing) {
      // For new products, ensure no collision with existing slugs.
      slug = ensureUniqueSlug(slug, allSlugs, slugCollisions, row.articleCode);
    }

    const action: "CREATE" | "UPDATE" = existing ? "UPDATE" : "CREATE";
    const entry: ProductReportEntry = {
      action,
      articleCode: row.articleCode,
      name: row.name || row.articleCode,
      slug,
      categorySlug: targetSlug,
      quality: row.parsed.quality ?? row.catQuality ?? "mix",
      country: row.parsed.country ?? row.catCountry ?? "germany",
      season: row.parsed.season ?? row.catSeason ?? "",
      priceEur: row.priceEur,
      salePriceEur: row.salePriceEur,
      inStock: row.priceEur != null && (row.quantityPieces ?? 1) > 0,
    };
    if (action === "CREATE") toCreate.push(entry);
    else toUpdate.push(entry);

    upsertTargets.push({ row, categoryId, slug, existing });
    // Track slug as taken for the next row's uniqueness check. The DB
    // `slug @unique` constraint is the actual safety net.
    allSlugs.add(slug);
  }

  // Phase 4b (concurrent): execute the DB upserts in batches of 4. The local
  // Postgres pool stays well under saturation at this concurrency, and each
  // upsertProductRow only touches its own product + price rows (no cross-row
  // dependencies once slugs are resolved).
  if (!DRY_RUN) {
    await processInBatches(
      upsertTargets,
      4,
      ({ row, categoryId, slug, existing }) =>
        upsertProductRow(row, categoryId, slug, existing),
    );
  }

  // Phase 5: deletions
  const excelArticles = new Set(rows.map((r) => r.articleCode));
  for (const sk of skipped) excelArticles.add(sk.articleCode);
  const dbProducts = dbAvailable
    ? await prisma.product.findMany({
        where: { articleCode: { not: null } },
        select: {
          id: true,
          articleCode: true,
          name: true,
          _count: { select: { orderItems: true } },
        },
      })
    : [];

  const toDelete: { articleCode: string; name: string; reason: string }[] = [];
  const blockedDeletes: { articleCode: string; reason: string }[] = [];
  for (const p of dbProducts) {
    if (!p.articleCode) continue;
    if (excelArticles.has(p.articleCode)) continue;
    if (p._count.orderItems > 0) {
      blockedDeletes.push({
        articleCode: p.articleCode,
        reason: `has ${p._count.orderItems} order item(s) — Restrict FK`,
      });
      continue;
    }
    toDelete.push({
      articleCode: p.articleCode,
      name: p.name,
      reason: "not in Excel",
    });
    if (!DRY_RUN) {
      await prisma.product.delete({ where: { id: p.id } }).catch((err) => {
        console.warn(
          `[L-TEX import] WARN: delete ${p.articleCode} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      });
    }
  }

  // Phase 6: report
  const slugCollisionsArr: { slug: string; articles: string[] }[] = [];
  for (const [slug, set] of slugCollisions) {
    slugCollisionsArr.push({ slug, articles: [...set] });
  }
  const unrecognizedTokensArr: { token: string; articles: string[] }[] = [];
  for (const [token, set] of unrecognizedTokens) {
    unrecognizedTokensArr.push({ token, articles: [...set] });
  }

  const report: DryRunReport = {
    generatedAt: new Date().toISOString(),
    dbConnected: dbAvailable,
    totalRows: rows.length + skipped.length,
    skipped,
    toCreate,
    toUpdate,
    toDelete,
    categoriesToAdd: catReconcile.added,
    categoriesDeprecated: catReconcile.deprecated,
    noPriceSell,
    noQuantity,
    stubDescriptions,
    slugCollisions: slugCollisionsArr,
    unrecognizedTokens: unrecognizedTokensArr,
    unrecognizedCategoryFallback: fallbackArticles,
    blockedDeletes,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, formatReport(report), "utf8");
  console.log(`[L-TEX import] report → ${REPORT_PATH}`);
  console.log(
    `[L-TEX import] summary: create=${toCreate.length} update=${toUpdate.length} delete=${toDelete.length} blocked=${blockedDeletes.length} skipped=${skipped.length}`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[L-TEX import] FATAL:", err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
