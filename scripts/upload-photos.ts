/**
 * Upload product photos to Supabase Storage.
 *
 * Expects a flat folder of photos named like:
 *   (0594) Мікс джинсів Livergy,Esmara_3.jpg
 *   (0758) Мікс спортивного одягу Екстра_2.jpg
 *   Іграшки тверді мікс Шотландія 1й сорт + Екстра (1567).jpg
 *   Іграшки тверді мікс Шотландія 1й сорт + Екстра (1567)_2.jpg
 *
 * Pattern: articleCode in parentheses (can be at start or end),
 * optional _N suffix for position.
 *
 * Usage:
 *   npx tsx scripts/upload-photos.ts ./photos --dry-run
 *   npx tsx scripts/upload-photos.ts ./photos
 *   npx tsx scripts/upload-photos.ts ./photos --skip-existing --concurrency 3
 *   npx tsx scripts/upload-photos.ts ./photos --replace --max-per-product=10
 *
 * Flags:
 *   --dry-run               do not write to Storage or DB
 *   --skip-existing         skip products that already have any ProductImage
 *   --replace               for each touched product: delete all old Storage
 *                           files under {productId}/ and ProductImage rows
 *                           before uploading the new set
 *   --max-per-product=N     cap to first N photos (sorted by position) per code
 *   --concurrency=N         parallel product groups (default 5)
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

// Load .env files if present (root then apps/store override). No dotenv dep —
// keeps the script portable. apps/store/.env is the canonical home for
// SUPABASE_* and DATABASE_URL on the production server.
function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(path.resolve(".env"));
loadEnvFile(path.resolve("apps/store/.env"));

const prisma = new PrismaClient();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "product-images";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.",
  );
  console.error(
    "Looked in process.env, ./.env, and ./apps/store/.env — none had them set.",
  );
  process.exit(1);
}

// ─── Parse CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const photosDir = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const skipExisting = args.includes("--skip-existing");
const replaceMode = args.includes("--replace");
const concurrencyArg = args.find((a) => a.startsWith("--concurrency"));
const concurrency = concurrencyArg
  ? parseInt(
      concurrencyArg.split("=")[1] ??
        args[args.indexOf(concurrencyArg) + 1] ??
        "5",
    )
  : 5;
const maxPerProductArg = args.find((a) => a.startsWith("--max-per-product"));
const maxPerProduct = maxPerProductArg
  ? parseInt(
      maxPerProductArg.includes("=")
        ? maxPerProductArg.split("=")[1]!
        : (args[args.indexOf(maxPerProductArg) + 1] ?? "10"),
      10,
    )
  : Number.POSITIVE_INFINITY;

if (skipExisting && replaceMode) {
  console.error("--skip-existing and --replace are mutually exclusive.");
  process.exit(1);
}
if (Number.isNaN(maxPerProduct) || maxPerProduct < 1) {
  console.error(`Invalid --max-per-product: ${maxPerProductArg}`);
  process.exit(1);
}

if (!photosDir) {
  console.error(
    "Usage: npx tsx scripts/upload-photos.ts <photos-dir> [--dry-run] [--skip-existing] [--concurrency N]",
  );
  process.exit(1);
}

if (!fs.existsSync(photosDir)) {
  console.error(`Directory not found: ${photosDir}`);
  process.exit(1);
}

// ─── Parse filename ─────────────────────────────────────────────────────────

interface ParsedFile {
  filePath: string;
  fileName: string;
  articleCode: string;
  position: number;
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]);

/**
 * Parse article code and position from filename.
 *
 * Supports two patterns:
 * 1. (0594) Назва товару_3.jpg        → code=0594, position=3
 * 2. Назва товару (1567).jpg          → code=1567, position=1
 * 3. Назва товару (1567)_2.jpg        → code=1567, position=2
 */
function parseFileName(
  fileName: string,
): { articleCode: string; position: number } | null {
  // Try pattern: (CODE) at the start
  const startMatch = fileName.match(/^\((\d+)\)\s+.+?(?:_(\d+))?\.\w+$/);
  if (startMatch) {
    return {
      articleCode: startMatch[1]!,
      position: startMatch[2] ? parseInt(startMatch[2]) : 1,
    };
  }

  // Try pattern: (CODE) at the end (before optional _N and extension)
  const endMatch = fileName.match(/^.+\((\d+)\)(?:_(\d+))?\.\w+$/);
  if (endMatch) {
    return {
      articleCode: endMatch[1]!,
      position: endMatch[2] ? parseInt(endMatch[2]) : 1,
    };
  }

  return null;
}

// ─── Supabase upload ────────────────────────────────────────────────────────

async function uploadToStorage(
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed for ${storagePath}: ${res.status} ${err}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

async function deleteFromStorage(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: storagePaths }),
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Storage delete failed: ${res.status} ${err}`);
  }
}

async function listStoragePrefix(prefix: string): Promise<string[]> {
  const url = `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix, limit: 1000 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage list failed: ${res.status} ${err}`);
  }
  const items = (await res.json()) as Array<{ name: string }>;
  // Recurse into sub-folders (full/, thumb/) — list returns only one level
  const out: string[] = [];
  for (const item of items) {
    const full = `${prefix}${item.name}`;
    if (!item.name.includes(".")) {
      // looks like a sub-folder
      const nested = await listStoragePrefix(`${full}/`);
      out.push(...nested);
    } else {
      out.push(full);
    }
  }
  return out;
}

async function clearProductStorage(productId: string): Promise<number> {
  const paths = await listStoragePrefix(`${productId}/`);
  if (paths.length === 0) return 0;
  await deleteFromStorage(paths);
  return paths.length;
}

// ─── Process images with sharp ──────────────────────────────────────────────

async function processImage(
  filePath: string,
): Promise<{ full: Buffer; thumb: Buffer }> {
  const full = await sharp(filePath)
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  const thumb = await sharp(filePath)
    .resize(400, 400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  return { full, thumb };
}

// ─── Concurrency helper ─────────────────────────────────────────────────────

async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item, j) => fn(item, i + j)),
    );
    results.push(...batchResults);
  }
  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nСканування папки: ${path.resolve(photosDir!)}`);
  if (dryRun) console.log("Режим: --dry-run (без завантаження)\n");

  // 1. Read and parse all files
  const allFiles = fs.readdirSync(photosDir!);
  const parsed: ParsedFile[] = [];
  const unparsed: string[] = [];

  for (const fileName of allFiles) {
    const ext = path.extname(fileName).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;

    const result = parseFileName(fileName);
    if (result) {
      parsed.push({
        filePath: path.join(photosDir!, fileName),
        fileName,
        articleCode: result.articleCode,
        position: result.position,
      });
    } else {
      unparsed.push(fileName);
    }
  }

  console.log(`Знайдено файлів: ${parsed.length + unparsed.length}`);
  console.log(`Розпізнано: ${parsed.length}`);
  if (unparsed.length > 0) {
    console.log(`\nНе розпізнано назву (${unparsed.length}):`);
    for (const f of unparsed.slice(0, 20)) {
      console.log(`  - ${f}`);
    }
    if (unparsed.length > 20) {
      console.log(`  ... і ще ${unparsed.length - 20}`);
    }
  }

  // 2. Group by articleCode + sort each group + cap to maxPerProduct
  const grouped = new Map<string, ParsedFile[]>();
  for (const file of parsed) {
    const existing = grouped.get(file.articleCode) ?? [];
    existing.push(file);
    grouped.set(file.articleCode, existing);
  }
  let cappedCount = 0;
  for (const [code, list] of grouped) {
    list.sort((a, b) =>
      a.position === b.position
        ? a.fileName.localeCompare(b.fileName)
        : a.position - b.position,
    );
    if (Number.isFinite(maxPerProduct) && list.length > maxPerProduct) {
      cappedCount += list.length - maxPerProduct;
      grouped.set(code, list.slice(0, maxPerProduct));
    }
  }

  console.log(`\nУнікальних артикулів: ${grouped.size}`);
  if (Number.isFinite(maxPerProduct)) {
    console.log(
      `Cap per product: ${maxPerProduct} (skipped ${cappedCount} файлів)`,
    );
  }

  // 3. Find products in DB by code1C (numeric code in filenames matches code1C, not articleCode)
  const articleCodes = [...grouped.keys()];
  const products = await prisma.product.findMany({
    where: { code1C: { in: articleCodes } },
    select: { id: true, code1C: true, name: true },
  });

  const productMap = new Map(products.map((p) => [p.code1C!, p]));

  const notFound: string[] = [];
  for (const code of articleCodes) {
    if (!productMap.has(code)) {
      notFound.push(code);
    }
  }

  console.log(`Знайдено в БД: ${products.length}`);
  if (notFound.length > 0) {
    console.log(`\nНе знайдено товар для артикулів (${notFound.length}):`);
    for (const code of notFound.slice(0, 20)) {
      const files = grouped.get(code)!;
      console.log(`  (${code}) — ${files[0]!.fileName}`);
    }
    if (notFound.length > 20) {
      console.log(`  ... і ще ${notFound.length - 20}`);
    }
  }

  if (dryRun) {
    console.log("\n--- DRY RUN завершено ---");
    console.log(
      `Буде завантажено: ${parsed.length - notFound.reduce((sum, code) => sum + (grouped.get(code)?.length ?? 0), 0)} фото`,
    );
    console.log(`Для ${products.length} товарів`);
    await prisma.$disconnect();
    return;
  }

  // 4. Check existing images if --skip-existing
  let existingProductIds = new Set<string>();
  if (skipExisting) {
    const existing = await prisma.productImage.findMany({
      select: { productId: true },
      distinct: ["productId"],
    });
    existingProductIds = new Set(existing.map((e) => e.productId));
    console.log(`\nТоварів з фото (пропуск): ${existingProductIds.size}`);
  }

  // 5. Upload
  let uploaded = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  const entries = [...grouped.entries()].filter(([code]) =>
    productMap.has(code),
  );

  let cleared = 0;

  await processInBatches(entries, concurrency, async ([code, files], index) => {
    const product = productMap.get(code)!;

    if (skipExisting && existingProductIds.has(product.id)) {
      skipped += files.length;
      return;
    }

    // Sort by position (already sorted in grouping step but be defensive)
    files.sort((a, b) => a.position - b.position);

    if (replaceMode) {
      try {
        const removed = await clearProductStorage(product.id);
        cleared += removed;
        await prisma.productImage.deleteMany({
          where: { productId: product.id },
        });
      } catch (err) {
        errors++;
        const msg = `(${code}) clear failed: ${err instanceof Error ? err.message : String(err)}`;
        errorDetails.push(msg);
        console.error(`  ✗ ${msg}`);
        return; // skip uploads if clear failed — leave old set intact
      }
    }

    for (const file of files) {
      try {
        const { full, thumb } = await processImage(file.filePath);

        const fullPath = `${product.id}/full/${file.position}.webp`;
        const thumbPath = `${product.id}/thumb/${file.position}.webp`;

        const fullUrl = await uploadToStorage(fullPath, full, "image/webp");
        await uploadToStorage(thumbPath, thumb, "image/webp");

        if (replaceMode) {
          // Storage + rows already cleared above — always create fresh
          await prisma.productImage.create({
            data: {
              productId: product.id,
              url: fullUrl,
              position: file.position,
              alt: product.name,
            },
          });
        } else {
          // Upsert product_images record
          const existing = await prisma.productImage.findFirst({
            where: { productId: product.id, position: file.position },
          });
          if (existing) {
            await prisma.productImage.update({
              where: { id: existing.id },
              data: { url: fullUrl, alt: product.name },
            });
          } else {
            await prisma.productImage.create({
              data: {
                productId: product.id,
                url: fullUrl,
                position: file.position,
                alt: product.name,
              },
            });
          }
        }

        uploaded++;
        console.log(
          `[${index + 1}/${entries.length}] (${code}) ${product.name} — фото ${file.position} ✓`,
        );
      } catch (err) {
        errors++;
        const msg = `(${code}) ${file.fileName}: ${err instanceof Error ? err.message : String(err)}`;
        errorDetails.push(msg);
        console.error(`  ✗ ${msg}`);
      }
    }
  });

  // 6. Summary
  console.log("\n════════════════════════════════════");
  console.log("          РЕЗУЛЬТАТ");
  console.log("════════════════════════════════════");
  console.log(`Завантажено:    ${uploaded} фото`);
  console.log(`Пропущено:      ${skipped} фото`);
  if (replaceMode) {
    console.log(`Видалено старих: ${cleared} файлів зі Storage`);
  }
  console.log(`Помилки:        ${errors}`);
  console.log(`Не розпізнано:  ${unparsed.length} файлів`);
  console.log(`Не знайдено:    ${notFound.length} артикулів`);

  if (errorDetails.length > 0) {
    console.log("\nПомилки:");
    for (const e of errorDetails) {
      console.log(`  - ${e}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
