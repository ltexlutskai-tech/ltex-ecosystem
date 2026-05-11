/**
 * Diagnose photo codes that did NOT match Product.code1C.
 *
 * For each unmatched (NNNN) from the photos folder, this script tries:
 *   1. Exact match on Product.articleCode
 *   2. Substring match on Product.code1C (in case of leading-zero drift)
 *   3. Substring match on Product.name (e.g. "(1681)" in name)
 *   4. Token overlap with Product.name (first 3 meaningful words)
 *
 * Output:
 *   - Console summary table
 *   - docs/PHOTOS_MISSING_DIAGNOSIS.md — per-code findings, sorted by
 *     confidence (exact articleCode → fuzzy name → no candidate)
 *
 * Usage:
 *   pnpm exec tsx scripts/photos-missing-diagnose.ts ./2025-2026-named-trimmed
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
  console.error("Usage: tsx scripts/photos-missing-diagnose.ts <photos-dir>");
  process.exit(1);
}
if (!fs.existsSync(photosDir)) {
  console.error(`Directory not found: ${photosDir}`);
  process.exit(1);
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]);

interface Parsed {
  fileName: string;
  code: string;
  rawName: string; // filename minus (NNNN), _N, ext — best-effort product name
}

function parseFileName(fileName: string): Parsed | null {
  // Try (CODE) at start
  let m = fileName.match(/^\((\d+)\)\s+(.+?)(?:_\d+)?\.\w+$/);
  if (m) return { fileName, code: m[1]!, rawName: m[2]!.trim() };
  // Try (CODE) at end
  m = fileName.match(/^(.+?)\s*\((\d+)\)(?:_\d+)?\.\w+$/);
  if (m) return { fileName, code: m[2]!, rawName: m[1]!.trim() };
  return null;
}

interface Candidate {
  productId: string;
  code1C: string | null;
  articleCode: string | null;
  name: string;
  reason: string;
  confidence:
    | "exact-articleCode"
    | "code-substring"
    | "name-substring"
    | "token-overlap";
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[(),.+\-/\\]/g, " ")
    .split(/\s+/)
    .filter(
      (t) => t.length > 3 && !/^(мікс|сток|екстра|крем|зима|літо)$/.test(t),
    );
}

async function main() {
  const entries = fs.readdirSync(photosDir!);
  const codes = new Map<string, Parsed>();
  for (const f of entries) {
    if (!IMAGE_EXTS.has(path.extname(f).toLowerCase())) continue;
    const p = parseFileName(f);
    if (p && !codes.has(p.code)) codes.set(p.code, p);
  }
  console.log(`Унікальних кодів у папці: ${codes.size}`);

  const allCodes = [...codes.keys()];
  const matched = await prisma.product.findMany({
    where: { code1C: { in: allCodes } },
    select: { code1C: true },
  });
  const matchedSet = new Set(matched.map((p) => p.code1C!));

  const missing = allCodes.filter((c) => !matchedSet.has(c));
  console.log(`code1C матча: ${matchedSet.size}`);
  console.log(`Missing: ${missing.length}\n`);

  if (missing.length === 0) {
    console.log("Усе матча — нічого діагностувати.");
    await prisma.$disconnect();
    return;
  }

  // Pre-load articleCode index + all products (for fuzzy)
  const allProducts = await prisma.product.findMany({
    select: { id: true, code1C: true, articleCode: true, name: true },
  });
  const byArticleCode = new Map<string, typeof allProducts>();
  for (const p of allProducts) {
    if (!p.articleCode) continue;
    const list = byArticleCode.get(p.articleCode) ?? [];
    list.push(p);
    byArticleCode.set(p.articleCode, list);
  }

  const findings = new Map<string, Candidate[]>();
  for (const code of missing) {
    const parsed = codes.get(code)!;
    const cands: Candidate[] = [];

    // 1. articleCode exact
    const ac = byArticleCode.get(code) ?? [];
    for (const p of ac) {
      cands.push({
        productId: p.id,
        code1C: p.code1C,
        articleCode: p.articleCode,
        name: p.name,
        reason: `articleCode = ${code}`,
        confidence: "exact-articleCode",
      });
    }

    // 2. code as substring of code1C (e.g. leading-zero drift)
    if (cands.length === 0) {
      for (const p of allProducts) {
        if (p.code1C && p.code1C.includes(code) && p.code1C !== code) {
          cands.push({
            productId: p.id,
            code1C: p.code1C,
            articleCode: p.articleCode,
            name: p.name,
            reason: `code1C "${p.code1C}" contains "${code}"`,
            confidence: "code-substring",
          });
        }
      }
    }

    // 3. code in product name (e.g. "(1681)" embedded)
    if (cands.length === 0) {
      for (const p of allProducts) {
        if (p.name.includes(`(${code})`) || p.name.includes(code)) {
          cands.push({
            productId: p.id,
            code1C: p.code1C,
            articleCode: p.articleCode,
            name: p.name,
            reason: `name contains "${code}"`,
            confidence: "name-substring",
          });
        }
      }
    }

    // 4. token overlap (rawName tokens vs Product.name tokens)
    if (cands.length === 0 && parsed.rawName) {
      const fileTokens = tokenize(parsed.rawName);
      if (fileTokens.length >= 2) {
        for (const p of allProducts) {
          const productTokens = tokenize(p.name);
          const overlap = fileTokens.filter((t) => productTokens.includes(t));
          if (overlap.length >= Math.min(3, fileTokens.length)) {
            cands.push({
              productId: p.id,
              code1C: p.code1C,
              articleCode: p.articleCode,
              name: p.name,
              reason: `token overlap (${overlap.length}/${fileTokens.length}): ${overlap.join(", ")}`,
              confidence: "token-overlap",
            });
          }
        }
        // Limit fuzzy candidates to top 5 per missing code
        cands.length = Math.min(cands.length, 5);
      }
    }

    findings.set(code, cands);
  }

  // Stats
  const buckets = {
    "exact-articleCode": 0,
    "code-substring": 0,
    "name-substring": 0,
    "token-overlap": 0,
    "no-candidate": 0,
  };
  for (const cands of findings.values()) {
    if (cands.length === 0) buckets["no-candidate"]++;
    else buckets[cands[0]!.confidence]++;
  }

  console.log("Розподіл missing codes:");
  console.log(`  exact-articleCode: ${buckets["exact-articleCode"]}`);
  console.log(`  code-substring:    ${buckets["code-substring"]}`);
  console.log(`  name-substring:    ${buckets["name-substring"]}`);
  console.log(`  token-overlap:     ${buckets["token-overlap"]}`);
  console.log(`  NO CANDIDATE:      ${buckets["no-candidate"]}\n`);

  // Markdown report
  const out: string[] = [];
  out.push(`# Photos missing-code diagnosis`);
  out.push(``);
  out.push(`Source folder: \`${path.resolve(photosDir!)}\``);
  out.push(`Total missing: ${missing.length}`);
  out.push(``);
  out.push(`## Summary`);
  out.push(``);
  out.push(`| Bucket | Count |`);
  out.push(`| --- | ---: |`);
  out.push(`| exact-articleCode | ${buckets["exact-articleCode"]} |`);
  out.push(`| code-substring | ${buckets["code-substring"]} |`);
  out.push(`| name-substring | ${buckets["name-substring"]} |`);
  out.push(`| token-overlap | ${buckets["token-overlap"]} |`);
  out.push(`| NO CANDIDATE | ${buckets["no-candidate"]} |`);
  out.push(``);

  const order: Candidate["confidence"][] = [
    "exact-articleCode",
    "code-substring",
    "name-substring",
    "token-overlap",
  ];
  for (const conf of order) {
    const codesInBucket = [...findings.entries()].filter(
      ([, c]) => c.length > 0 && c[0]!.confidence === conf,
    );
    if (codesInBucket.length === 0) continue;
    out.push(`## ${conf} (${codesInBucket.length})`);
    out.push(``);
    for (const [code, cands] of codesInBucket) {
      const file = codes.get(code)!.fileName;
      out.push(`### (${code}) — \`${file}\``);
      for (const c of cands) {
        out.push(
          `- **${c.name}** — code1C=\`${c.code1C ?? "—"}\`, articleCode=\`${c.articleCode ?? "—"}\` → ${c.reason}`,
        );
      }
      out.push(``);
    }
  }

  const noCand = [...findings.entries()].filter(([, c]) => c.length === 0);
  if (noCand.length > 0) {
    out.push(`## NO CANDIDATE (${noCand.length})`);
    out.push(``);
    out.push(
      `Цих товарів немає у БД — або не імпортовані, або іменування фото відрізняється від каталогу.`,
    );
    out.push(``);
    for (const [code] of noCand) {
      const file = codes.get(code)!.fileName;
      out.push(`- (${code}) — \`${file}\``);
    }
    out.push(``);
  }

  const reportPath = "docs/PHOTOS_MISSING_DIAGNOSIS.md";
  fs.writeFileSync(reportPath, out.join("\n"), "utf-8");
  console.log(`Звіт: ${reportPath}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
