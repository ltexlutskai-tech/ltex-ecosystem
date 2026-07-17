/**
 * Аудит дублікатів номенклатури (лише читання, dry-run).
 *
 * User хоче перевірити, чи є дубльовані товари. Скрипт детектує дублікати за
 * ДВОМА незалежними осями і друкує зрозумілий звіт. НІЧОГО НЕ ПИШЕ у базу —
 * лише `findMany`/`count`.
 *
 * ─── ОСІ ДЕТЕКЦІЇ ─────────────────────────────────────────────────────────────
 *   1) За `articleCode` — товари зі спільним непорожнім артикулом.
 *   2) За 4-значним кодом у назві — багато назв починаються з коду в дужках,
 *      напр. «(0024) Велосипедне взуття», «(0100) Взуття жіноче -39р». Витягуємо
 *      цей провідний 4-значний код і групуємо товари, що його поділяють.
 *   Осі можуть перетинатися; звітуємо їх ОКРЕМО (без дедупу між осями).
 *
 * ─── ЗАПУСК (user, на сервері; у пісочниці немає БД — лише компіляція) ─────────
 *   pnpm --filter @ltex/store exec tsx scripts/audit-duplicate-products.ts
 */

import { PrismaClient, type Prisma } from "@ltex/db";

const TAG = "[audit-dup]";

// ─── Чистий хелпер витягання коду з назви (має тести) ─────────────────────────

/**
 * Повертає провідний 4-значний код з назви типу «(0024) …» → «0024».
 * Толерантний до пробілів на початку. Матчить ЛИШЕ 4-значну групу в дужках
 * на САМОМУ ПОЧАТКУ назви (це 1С-стиль коду); 4-значні числа деінде в назві
 * НЕ матчаться. Немає такого коду → null.
 */
export function extractNameCode(name: string): string | null {
  const m = /^\s*\((\d{4})\)/.exec(name);
  return m?.[1] ?? null;
}

// ─── Маскування DATABASE_URL ──────────────────────────────────────────────────

function maskDbUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://$1:***@");
  }
}

// ─── Форма товару у звіті ─────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  code1C: string | null;
  name: string;
  articleCode: string | null;
  category: { name: string } | null;
  _count: { lots: number };
}

/** Обрізає довгі назви для читабельного звіту. */
function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Скільки груп ≥2 друкувати детально (решту — згорнути в один рядок). */
const MAX_DETAIL_GROUPS = 200;

// ─── Побудова та друк груп за довільним ключем ────────────────────────────────

interface DupGroup {
  key: string;
  members: ProductRow[];
}

/**
 * Групує товари за `keyOf` (пропуск, якщо ключ null), лишає групи розміру ≥2,
 * сортує за розміром спадно (тай-брейк — ключ). Чиста функція над масивом.
 */
function groupBy(
  products: ProductRow[],
  keyOf: (p: ProductRow) => string | null,
): DupGroup[] {
  const map = new Map<string, ProductRow[]>();
  for (const p of products) {
    const key = keyOf(p);
    if (!key) continue;
    const bucket = map.get(key);
    if (bucket) bucket.push(p);
    else map.set(key, [p]);
  }
  const groups: DupGroup[] = [];
  for (const [key, members] of map) {
    if (members.length >= 2) groups.push({ key, members });
  }
  groups.sort((a, b) => {
    if (b.members.length !== a.members.length) {
      return b.members.length - a.members.length;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return groups;
}

/**
 * Друкує звіт по одній осі: заголовок з кількістю груп/товарів, потім кожну
 * групу з її членами (перші MAX_DETAIL_GROUPS, решту згортає в один рядок).
 * `_count.lots` — усі лоти товару (вільних окремо не рахуємо, щоб не робити
 * важкий groupBy у read-only аудиті).
 */
function printAxis(title: string, keyLabel: string, groups: DupGroup[]): void {
  const involved = groups.reduce((sum, g) => sum + g.members.length, 0);
  console.log("");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(` ${title}`);
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(
    `Груп-дублікатів: ${groups.length} | товарів залучено: ${involved}`,
  );
  console.log("");

  const shown = groups.slice(0, MAX_DETAIL_GROUPS);
  for (const g of shown) {
    console.log(`${keyLabel} ${g.key}  (${g.members.length} товарів)`);
    for (const m of g.members) {
      console.log(
        `    арт=${m.articleCode ?? "—"}` +
          `  code1C=${m.code1C ?? "—"}` +
          `  лотів=${m._count.lots}` +
          `  [кат: ${m.category?.name ?? "—"}]` +
          `  ${truncate(m.name)}`,
      );
    }
    console.log("");
  }
  if (groups.length > shown.length) {
    console.log(
      `  … ще ${groups.length - shown.length} груп не показано (перші ` +
        `${MAX_DETAIL_GROUPS} вище).`,
    );
    console.log("");
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(
      `${TAG} DATABASE_URL не задано — у цьому середовищі немає БД. ` +
        `Скрипт лише читає; запустіть його на сервері з підвантаженим ` +
        `apps/store/.env. Вихід без помилки.`,
    );
    return;
  }

  console.log(`${TAG} ціль БД: ${maskDbUrl(dbUrl)}`);
  console.log(`${TAG} режим: DRY-RUN (лише читання, звіт)`);

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  try {
    // Читаємо УСІ товари (code1C може бути null — вісь коду-в-назві стосується
    // будь-якого товару, не лише 1С-их).
    const select = {
      id: true,
      code1C: true,
      name: true,
      articleCode: true,
      inStock: true,
      category: { select: { name: true } },
      _count: { select: { lots: true } },
    } satisfies Prisma.ProductSelect;

    const products = (await prisma.product.findMany({
      select,
    })) as ProductRow[];

    console.log(`${TAG} усього товарів у базі: ${products.length}`);

    // Вісь 1 — за артикулом (лише непорожній).
    const byArticle = groupBy(products, (p) => {
      const a = p.articleCode?.trim();
      return a ? a : null;
    });
    printAxis(
      "ВІСЬ 1 — ДУБЛІКАТИ ЗА АРТИКУЛОМ (articleCode)",
      "Артикул",
      byArticle,
    );

    // Вісь 2 — за 4-значним кодом у назві.
    const byNameCode = groupBy(products, (p) => extractNameCode(p.name));
    printAxis(
      "ВІСЬ 2 — ДУБЛІКАТИ ЗА КОДОМ У НАЗВІ «(NNNN) …»",
      "Код",
      byNameCode,
    );

    console.log(
      `${TAG} Артикул: ${byArticle.length} груп дублікатів; ` +
        `Код у назві: ${byNameCode.length} груп.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаємо main() лише при прямому виконанні, НЕ під час імпорту модуля
// у юніт-тестах (звідки береться чистий хелпер extractNameCode).
if (!process.env.VITEST) {
  main().catch((err: unknown) => {
    console.error(`${TAG} ПОМИЛКА:`, err);
    process.exit(1);
  });
}
