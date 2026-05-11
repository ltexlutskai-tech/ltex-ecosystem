/**
 * List products that have zero ProductImage rows.
 *
 * Writes docs/PRODUCTS_NO_PHOTOS.md grouped by category and prints
 * a short summary to console.
 *
 * Usage:
 *   pnpm exec tsx scripts/products-without-photos.ts
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

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

const args = process.argv.slice(2);
const photosDir = args.find((a) => !a.startsWith("--"));

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]);

function extractCode(fileName: string): string | null {
  const start = fileName.match(/^\((\d+)\)\s+/);
  if (start) return start[1]!;
  const end = fileName.match(/\((\d+)\)(?:_\d+)?\.\w+$/);
  if (end) return end[1]!;
  return null;
}

function csvCell(s: string | null | undefined): string {
  const v = (s ?? "").replace(/"/g, '""');
  return /[",\n;]/.test(v) ? `"${v}"` : v;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { images: { none: {} } },
    select: {
      id: true,
      code1C: true,
      articleCode: true,
      name: true,
      inStock: true,
      category: { select: { name: true, slug: true } },
    },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  const total = await prisma.product.count();
  const inStockMissing = products.filter((p) => p.inStock).length;

  console.log(`\nТоварів у БД:           ${total}`);
  console.log(`Без жодного ProductImage: ${products.length}`);
  console.log(`  з них inStock=true:    ${inStockMissing}`);
  console.log(`  з них inStock=false:   ${products.length - inStockMissing}\n`);

  // Group by category
  const byCat = new Map<string, typeof products>();
  for (const p of products) {
    const key = p.category?.name ?? "(без категорії)";
    const list = byCat.get(key) ?? [];
    list.push(p);
    byCat.set(key, list);
  }
  const sortedCats = [...byCat.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  console.log("Розподіл по категоріях:");
  for (const [cat, list] of sortedCats) {
    console.log(`  ${cat}: ${list.length}`);
  }

  // Markdown report
  const out: string[] = [];
  out.push(`# Товари без фотографій`);
  out.push(``);
  out.push(`- Усього товарів у БД: ${total}`);
  out.push(`- Без жодної \`ProductImage\`: **${products.length}**`);
  out.push(`  - inStock=true: ${inStockMissing}`);
  out.push(`  - inStock=false: ${products.length - inStockMissing}`);
  out.push(``);

  for (const [cat, list] of sortedCats) {
    out.push(`## ${cat} (${list.length})`);
    out.push(``);
    out.push(`| code1C | articleCode | inStock | Назва |`);
    out.push(`| --- | --- | :---: | --- |`);
    for (const p of list) {
      out.push(
        `| ${p.code1C ?? "—"} | ${p.articleCode ?? "—"} | ${p.inStock ? "✓" : "✗"} | ${p.name} |`,
      );
    }
    out.push(``);
  }

  const reportPath = "docs/PRODUCTS_NO_PHOTOS.md";
  fs.writeFileSync(reportPath, out.join("\n"), "utf-8");
  console.log(`\nЗвіт MD: ${reportPath}`);

  // CSV — flat list, easy to open in Excel
  const csvLines: string[] = [];
  csvLines.push("code1C;articleCode;name;category;inStock;hasPhotoInFolder");

  // Cross-check with photos folder if provided
  let folderCodes = new Set<string>();
  if (photosDir && fs.existsSync(photosDir)) {
    for (const f of fs.readdirSync(photosDir)) {
      if (!IMAGE_EXTS.has(path.extname(f).toLowerCase())) continue;
      const c = extractCode(f);
      if (c) folderCodes.add(c);
    }
    console.log(`\nКодів у папці ${photosDir}: ${folderCodes.size}`);
  }

  let hasPhoto = 0;
  for (const p of products) {
    const inFolder =
      (p.code1C && folderCodes.has(p.code1C)) ||
      (p.articleCode && folderCodes.has(p.articleCode));
    if (inFolder) hasPhoto++;
    csvLines.push(
      [
        csvCell(p.code1C),
        csvCell(p.articleCode),
        csvCell(p.name),
        csvCell(p.category?.name),
        p.inStock ? "1" : "0",
        inFolder ? "1" : "0",
      ].join(";"),
    );
  }
  const csvPath = "docs/PRODUCTS_NO_PHOTOS.csv";
  fs.writeFileSync(csvPath, csvLines.join("\n"), "utf-8");
  console.log(`Звіт CSV: ${csvPath}`);

  if (photosDir) {
    console.log(`\nЗ ${products.length} товарів без фото:`);
    console.log(`  фото є у папці (code1C або articleCode): ${hasPhoto}`);
    console.log(
      `  фото немає у папці взагалі:              ${products.length - hasPhoto}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
