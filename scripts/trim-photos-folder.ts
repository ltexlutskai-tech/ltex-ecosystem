/**
 * Trim a flat photos folder to keep at most N photos per product code.
 *
 * Photo filenames follow the pattern used by L-TEX photo team:
 *   (0594) Мікс джинсів Livergy,Esmara.jpg
 *   (0594) Мікс джинсів Livergy,Esmara_2.jpg
 *   AGD Товари для декору (0170)_12.jpg
 *
 * The 4-digit code in parens is `Product.code1C`; `_N` suffix is the
 * sequential position (no suffix == position 1).
 *
 * What this script does:
 *   1. Scans <source-dir> recursively (one level only — flat folder).
 *   2. Groups files by code, sorts by position (natural).
 *   3. Keeps the first N (default 10) per code; logs the rest as "skipped".
 *   4. With --apply: copies the kept files into <dest-dir> preserving
 *      original filenames. Without --apply: dry-run report only.
 *   5. Writes <dest-dir>/trim-report.md with the per-code breakdown.
 *
 * Usage:
 *   npx tsx scripts/trim-photos-folder.ts ./2025-2026-named ./2025-2026-named-trimmed
 *   npx tsx scripts/trim-photos-folder.ts ./2025-2026-named ./2025-2026-named-trimmed --apply
 *   npx tsx scripts/trim-photos-folder.ts ./src ./dst --max=8 --apply
 *
 * Idempotent: re-running with --apply overwrites existing files.
 */

import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const sourceDir = positional[0];
const destDir = positional[1];
const apply = args.includes("--apply");
const maxArg = args.find((a) => a.startsWith("--max"));
const max = maxArg
  ? parseInt(
      maxArg.includes("=")
        ? maxArg.split("=")[1]!
        : (args[args.indexOf(maxArg) + 1] ?? "10"),
      10,
    )
  : 10;

if (!sourceDir || !destDir) {
  console.error(
    "Usage: tsx scripts/trim-photos-folder.ts <source-dir> <dest-dir> [--max=10] [--apply]",
  );
  process.exit(1);
}

if (!Number.isFinite(max) || max < 1) {
  console.error(`Invalid --max value: ${maxArg}`);
  process.exit(1);
}

if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory not found: ${sourceDir}`);
  process.exit(1);
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]);

interface ParsedFile {
  fileName: string;
  absPath: string;
  code: string;
  position: number;
  size: number;
}

function parseFileName(
  fileName: string,
): { code: string; position: number } | null {
  // Pattern A: (CODE) at start — "(0594) Назва_3.jpg"
  const startMatch = fileName.match(/^\((\d+)\)\s+.+?(?:_(\d+))?\.\w+$/);
  if (startMatch) {
    return {
      code: startMatch[1]!,
      position: startMatch[2] ? parseInt(startMatch[2]!, 10) : 1,
    };
  }
  // Pattern B: (CODE) at end — "Назва (1567)_2.jpg" or "Назва (1567).jpg"
  const endMatch = fileName.match(/^.+\((\d+)\)(?:_(\d+))?\.\w+$/);
  if (endMatch) {
    return {
      code: endMatch[1]!,
      position: endMatch[2] ? parseInt(endMatch[2]!, 10) : 1,
    };
  }
  return null;
}

function main() {
  console.log(`\nСкан: ${path.resolve(sourceDir!)}`);
  console.log(`Dest: ${path.resolve(destDir!)}`);
  console.log(`Max per code: ${max}`);
  console.log(`Mode: ${apply ? "--apply (PHYSICAL COPY)" : "dry-run"}\n`);

  const entries = fs.readdirSync(sourceDir!);
  const parsed: ParsedFile[] = [];
  const unparsed: string[] = [];

  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;

    const abs = path.join(sourceDir!, entry);
    const stat = fs.statSync(abs);
    if (!stat.isFile()) continue;

    const meta = parseFileName(entry);
    if (!meta) {
      unparsed.push(entry);
      continue;
    }
    parsed.push({
      fileName: entry,
      absPath: abs,
      code: meta.code,
      position: meta.position,
      size: stat.size,
    });
  }

  console.log(`Знайдено фото-файлів: ${parsed.length + unparsed.length}`);
  console.log(`Розпізнано з (NNNN): ${parsed.length}`);
  if (unparsed.length > 0) {
    console.log(`Не розпізнано: ${unparsed.length}`);
  }

  // Group by code, sort by (position, fileName) so duplicate positions stay deterministic
  const grouped = new Map<string, ParsedFile[]>();
  for (const f of parsed) {
    const list = grouped.get(f.code) ?? [];
    list.push(f);
    grouped.set(f.code, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) =>
      a.position === b.position
        ? a.fileName.localeCompare(b.fileName)
        : a.position - b.position,
    );
  }

  console.log(`Унікальних кодів: ${grouped.size}`);

  // Plan: per-code keep first <= max, rest = skipped
  const kept: ParsedFile[] = [];
  const skipped: ParsedFile[] = [];
  for (const list of grouped.values()) {
    kept.push(...list.slice(0, max));
    skipped.push(...list.slice(max));
  }

  console.log(`До копіювання: ${kept.length}`);
  console.log(`Skip (понад ${max}/код): ${skipped.length}`);

  // Distribution
  const overLimitCodes = [...grouped.entries()]
    .filter(([, list]) => list.length > max)
    .sort((a, b) => b[1].length - a[1].length);
  if (overLimitCodes.length > 0) {
    console.log(`\nТовари з > ${max} фото (top 10):`);
    for (const [code, list] of overLimitCodes.slice(0, 10)) {
      console.log(`  (${code}) — ${list.length} фото → залишимо ${max}`);
    }
    if (overLimitCodes.length > 10) {
      console.log(`  ... і ще ${overLimitCodes.length - 10} кодів`);
    }
  }

  if (!apply) {
    console.log("\n--- DRY RUN ---");
    console.log(`Запусти з --apply щоб фактично скопіювати у ${destDir}`);
    return;
  }

  // Apply: ensure destDir, copy each kept file
  fs.mkdirSync(destDir!, { recursive: true });

  let copied = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const f of kept) {
    const dest = path.join(destDir!, f.fileName);
    try {
      fs.copyFileSync(f.absPath, dest);
      copied++;
    } catch (err) {
      failed++;
      failures.push(
        `${f.fileName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Markdown report
  const reportLines: string[] = [];
  reportLines.push(`# Trim photos report`);
  reportLines.push(``);
  reportLines.push(`- Source: \`${path.resolve(sourceDir!)}\``);
  reportLines.push(`- Dest: \`${path.resolve(destDir!)}\``);
  reportLines.push(`- Max per code: ${max}`);
  reportLines.push(`- Total scanned: ${parsed.length + unparsed.length}`);
  reportLines.push(`- Parsed: ${parsed.length}`);
  reportLines.push(`- Unique codes: ${grouped.size}`);
  reportLines.push(`- Copied: ${copied}`);
  reportLines.push(`- Skipped (over ${max}/code): ${skipped.length}`);
  reportLines.push(`- Failed copies: ${failed}`);
  reportLines.push(`- Unparsed filenames: ${unparsed.length}`);
  reportLines.push(``);

  if (overLimitCodes.length > 0) {
    reportLines.push(`## Codes that exceeded ${max} photos`);
    reportLines.push(``);
    reportLines.push(`| Code | Total | Kept | Skipped |`);
    reportLines.push(`| --- | ---: | ---: | ---: |`);
    for (const [code, list] of overLimitCodes) {
      reportLines.push(
        `| ${code} | ${list.length} | ${max} | ${list.length - max} |`,
      );
    }
    reportLines.push(``);
    reportLines.push(`### Skipped filenames`);
    reportLines.push(``);
    for (const f of skipped) {
      reportLines.push(`- (${f.code}) \`${f.fileName}\``);
    }
    reportLines.push(``);
  }

  if (unparsed.length > 0) {
    reportLines.push(`## Unparsed filenames (no \`(NNNN)\` code)`);
    reportLines.push(``);
    for (const f of unparsed) {
      reportLines.push(`- \`${f}\``);
    }
    reportLines.push(``);
  }

  if (failures.length > 0) {
    reportLines.push(`## Copy failures`);
    reportLines.push(``);
    for (const f of failures) {
      reportLines.push(`- ${f}`);
    }
    reportLines.push(``);
  }

  const reportPath = path.join(destDir!, "trim-report.md");
  fs.writeFileSync(reportPath, reportLines.join("\n"), "utf-8");

  console.log(`\n════════════════════════════════════`);
  console.log(`          РЕЗУЛЬТАТ`);
  console.log(`════════════════════════════════════`);
  console.log(`Скопійовано:    ${copied}`);
  console.log(`Помилки копії:  ${failed}`);
  console.log(`Skip (понад ліміт): ${skipped.length}`);
  console.log(`Не розпізнано:  ${unparsed.length}`);
  console.log(`\nЗвіт: ${reportPath}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();
