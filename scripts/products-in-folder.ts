/**
 * List products whose code matches ANY photo in a folder.
 *
 * Walks <photos-dir>, extracts (NNNN) codes + per-code file count,
 * then for each product in DB whose code1C OR articleCode matches a
 * folder code, emits a row.
 *
 * Output:
 *   - docs/PRODUCTS_IN_FOLDER.csv (semicolon, Excel-friendly)
 *   - docs/PRODUCTS_IN_FOLDER.md  (grouped by category)
 *
 * Usage:
 *   pnpm exec tsx scripts/products-in-folder.ts ./2025-2026-named
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
if (!photosDir) {
  console.error("Usage: tsx scripts/products-in-folder.ts <photos-dir>");
  process.exit(1);
}
if (!fs.existsSync(photosDir)) {
  console.error(`Directory not found: ${photosDir}`);
  process.exit(1);
}

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
  // 1. Count photos per code in folder
  const folderCount = new Map<string, number>();
  for (const f of fs.readdirSync(photosDir!)) {
    if (!IMAGE_EXTS.has(path.extname(f).toLowerCase())) continue;
    const c = extractCode(f);
    if (!c) continue;
    folderCount.set(c, (folderCount.get(c) ?? 0) + 1);
  }
  const folderCodes = [...folderCount.keys()];
  console.log(`Унікальних кодів у папці: ${folderCodes.length}`);

  // 2. Load products that match by code1C OR articleCode
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { code1C: { in: folderCodes } },
        { articleCode: { in: folderCodes } },
      ],
    },
    select: {
      id: true,
      code1C: true,
      articleCode: true,
      name: true,
      inStock: true,
      category: { select: { name: true, slug: true } },
      _count: { select: { images: true } },
    },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  console.log(`Знайдено товарів у БД: ${products.length}`);

  let viaCode1C = 0;
  let viaArticleCode = 0;
  for (const p of products) {
    if (p.code1C && folderCount.has(p.code1C)) viaCode1C++;
    else if (p.articleCode && folderCount.has(p.articleCode)) viaArticleCode++;
  }
  console.log(`  через code1C:      ${viaCode1C}`);
  console.log(`  через articleCode: ${viaArticleCode}`);

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
  console.log("\nРозподіл по категоріях:");
  for (const [cat, list] of sortedCats) {
    console.log(`  ${cat}: ${list.length}`);
  }

  // 3. Markdown report (grouped by category)
  const mdOut: string[] = [];
  mdOut.push(`# Товари з фотографіями у папці`);
  mdOut.push(``);
  mdOut.push(`- Папка: \`${path.resolve(photosDir!)}\``);
  mdOut.push(`- Унікальних кодів у папці: ${folderCodes.length}`);
  mdOut.push(`- Знайдено товарів у БД: **${products.length}**`);
  mdOut.push(`  - через code1C: ${viaCode1C}`);
  mdOut.push(`  - через articleCode: ${viaArticleCode}`);
  mdOut.push(``);

  for (const [cat, list] of sortedCats) {
    mdOut.push(`## ${cat} (${list.length})`);
    mdOut.push(``);
    mdOut.push(
      `| code1C | articleCode | Фото в папці | Фото на сайті | inStock | Назва |`,
    );
    mdOut.push(`| --- | --- | ---: | ---: | :---: | --- |`);
    for (const p of list) {
      const matchedCode =
        (p.code1C && folderCount.has(p.code1C) && p.code1C) ||
        (p.articleCode && folderCount.has(p.articleCode) && p.articleCode) ||
        null;
      const folderN = matchedCode ? folderCount.get(matchedCode)! : 0;
      mdOut.push(
        `| ${p.code1C ?? "—"} | ${p.articleCode ?? "—"} | ${folderN} | ${p._count.images} | ${p.inStock ? "✓" : "✗"} | ${p.name} |`,
      );
    }
    mdOut.push(``);
  }
  const mdPath = "docs/PRODUCTS_IN_FOLDER.md";
  fs.writeFileSync(mdPath, mdOut.join("\n"), "utf-8");
  console.log(`\nЗвіт MD: ${mdPath}`);

  // 4. CSV flat list
  const csvLines: string[] = [];
  csvLines.push(
    "code1C;articleCode;name;category;inStock;photosInFolder;photosOnSite;matchedVia",
  );
  for (const p of products) {
    let matchedCode: string | null = null;
    let matchedVia = "";
    if (p.code1C && folderCount.has(p.code1C)) {
      matchedCode = p.code1C;
      matchedVia = "code1C";
    } else if (p.articleCode && folderCount.has(p.articleCode)) {
      matchedCode = p.articleCode;
      matchedVia = "articleCode";
    }
    const folderN = matchedCode ? folderCount.get(matchedCode)! : 0;
    csvLines.push(
      [
        csvCell(p.code1C),
        csvCell(p.articleCode),
        csvCell(p.name),
        csvCell(p.category?.name),
        p.inStock ? "1" : "0",
        String(folderN),
        String(p._count.images),
        matchedVia,
      ].join(";"),
    );
  }
  const csvPath = "docs/PRODUCTS_IN_FOLDER.csv";
  fs.writeFileSync(csvPath, csvLines.join("\n"), "utf-8");
  console.log(`Звіт CSV: ${csvPath}`);

  // 5. Codes that exist in folder but have NO matching product
  const matchedFolderCodes = new Set<string>();
  for (const p of products) {
    if (p.code1C && folderCount.has(p.code1C)) matchedFolderCodes.add(p.code1C);
    if (p.articleCode && folderCount.has(p.articleCode))
      matchedFolderCodes.add(p.articleCode);
  }
  const orphanCodes = folderCodes.filter((c) => !matchedFolderCodes.has(c));
  console.log(`\nКоди з папки БЕЗ матча у БД: ${orphanCodes.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
