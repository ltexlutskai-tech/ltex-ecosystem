/**
 * Злиття дублікатів номенклатури 1С (сесія 7.1).
 *
 * 1С-номенклатура містить дублікати ОДНОГО артикула: старий запис (з історією /
 * архівними лотами у групах типу «Різне») + новий актуальний (з вільними лотами),
 * різні `code1C`. Рішення user (2026-07-03): ЗЛИВАТИ — перенести всю історію на
 * актуальний (survivor), видалити старий, і навчити реімпортер поважати злиття
 * (інакше upsert-by-code1C відтворить старий запис першим же `--entity products`).
 *
 * Специфікація: `docs/SESSION_7.1_PRODUCT_MERGE.md`.
 *
 * ─── ВИЯВЛЕННЯ ГРУП ───────────────────────────────────────────────────────────
 *   Товари з `code1C IS NOT NULL`, згруповані по `articleCode`, де у групі >1 запис.
 *   Групи 3+ теж підтримуються (усі зливаються в одного survivor-а).
 *
 * ─── ВИБІР SURVIVOR (чиста `pickSurvivor` + тести) ────────────────────────────
 *   1) найбільше ВІЛЬНИХ лотів (status ∈ free/on_sale);
 *   2) інакше inStock=true;
 *   3) інакше новіший createdAt (тай-брейкер — id для детермінізму).
 *
 * ─── ПЕРЕНЕСЕННЯ НА SURVIVOR (транзакція на групу) ────────────────────────────
 *   updateMany productId=survivor:  Lot, OrderItem, SaleItem, ReceivingItem,
 *     PurchasePrice, ViewLog.
 *   Дедуп по unique(customerId, productId):  Favorite, VideoSubscription — рядок
 *     старого видаляємо, якщо survivor (або вже перенесений з іншого старого) має
 *     той самий customerId; решту переносимо.
 *   CartItem:  БЕЗ unique (drop у міграції 20260502) → простий updateMany.
 *   Price:  переносимо лише (priceType, validFrom), яких survivor не має; конфлікти
 *     лишаємо на старому — вони каскадно зникнуть при видаленні старого Product
 *     (Price onDelete: Cascade). Логуємо кількість пропущених.
 *   ProductImage:  дописуємо в КІНЕЦЬ списку survivor-а (перерахунок position) —
 *     лише якщо у старого є фото.
 *   FeaturedProduct старого:  видаляємо (unique на product; каскад теж прибрав би,
 *     але робимо явно для чистого підрахунку).
 *   Регістри рухів (`updateMany set productId=survivor where productCode1C=oldHex`):
 *     SalesMovement, StockMovement, CostMovement, OrderRemainderMovement.
 *     Hex НЕ міняємо — це історичний ключ джерела; резолв у звітах productId-first.
 *
 * ─── ФІНАЛІЗАЦІЯ ──────────────────────────────────────────────────────────────
 *   create ProductMerge(oldCode1C → survivor, oldName), потім delete старий Product.
 *   На цей момент Restrict-посилань на старому лишитись НЕ повинно. Якщо лишились —
 *   логуємо і ПРОПУСКАЄМО групу (транзакція відкочується), а не падаємо.
 *
 * ─── FK / onDelete (перевірено у packages/db/prisma/schema.prisma) ────────────
 *   На Product Restrict:  Lot, CartItem, OrderItem, SaleItem, ReceivingItem
 *     → мусимо перенести/прибрати ПЕРЕД видаленням.
 *   На Product Cascade:  ProductImage, Price, Favorite, FeaturedProduct, ViewLog,
 *     VideoSubscription, PurchasePrice → лишок каскадно зникне з Product.
 *   PurchasePrice.supplierId — Restrict на Supplier (не на Product) → переносимо як є.
 *
 * ─── БЕЗПЕКА ──────────────────────────────────────────────────────────────────
 *   Ціль = DATABASE_URL (echo з маскуванням пароля). Без `--apply` → лише звіт.
 *   `--apply` БЕЗ `--confirm-prod` → відмова. `--apply --confirm-prod` →
 *   попередження pg_dump + 5с пауза. `--only <articleCode>` — обмежити однією групою.
 *   Транзакція на групу з timeout 120с / maxWait 20с (дефолтні 5с валили попередню
 *   чистку на каскадах).
 *
 * ─── ЗАПУСК (user, на сервері; у пісочниці НЕ запускати — немає БД) ────────────
 *   # 1) сухий звіт (список груп + survivor):
 *   pnpm --filter @ltex/store exec tsx scripts/merge-duplicate-products.ts
 *   # 2) одна група:
 *   pnpm --filter @ltex/store exec tsx scripts/merge-duplicate-products.ts --only 37047
 *   # 3) реальний запис (після pg_dump + звірки):
 *   pnpm --filter @ltex/store exec tsx scripts/merge-duplicate-products.ts --apply --confirm-prod
 *
 * ─── BROAD (--broad) ──────────────────────────────────────────────────────────
 *   Стандартне виявлення бере ЛИШЕ пари з однаковим точним артикулом і обома
 *   code1C. `--broad` розширює виявлення:
 *     • сканує ВСІ товари, включно з code1C=null (порожні Excel-двійники);
 *     • групує union-find за (точний articleCode) АБО (провідний 4-значний код
 *       у назві «(0758) …») — ловить пари, де артикул різниться нулями
 *       (206/00206) або де двійник без коду 1С.
 *   Loser без code1C НЕ пишеться у ProductMerge (реімпорт його не відтворить),
 *   просто переноситься історія (як правило порожньо) і видаляється.
 *     # сухий звіт broad:
 *     pnpm --filter @ltex/store exec tsx scripts/merge-duplicate-products.ts --broad
 *     # запис broad:
 *     pnpm --filter @ltex/store exec tsx scripts/merge-duplicate-products.ts --broad --apply --confirm-prod
 *
 * Скрипт у пісочниці НЕ запускався (немає БД) — лише компілюється/перевіряється.
 */

import { PrismaClient, type Prisma } from "@ltex/db";

const TAG = "[merge-dup]";

// ─── Чистий вибір survivor (єдине джерело правди; має тести) ──────────────────

export interface MergeCandidate {
  id: string;
  code1C: string | null;
  name: string;
  categoryName: string | null;
  freeLots: number;
  totalLots: number;
  inStock: boolean;
  createdAt: Date;
}

/**
 * Обирає товар-survivor у групі дублікатів за евристикою:
 *   1) найбільше вільних лотів (freeLots), 2) inStock=true, 3) новіший createdAt,
 *   4) тай-брейкер за id (детермінізм). Порожній масив → кидає.
 */
/**
 * Чи виглядає code1C як «історичний» (повний 1С-код з нулями зліва,
 * напр. `00000001358`). Живий каталог має короткі коди (`1358`) — при
 * рівності вільних лотів/inStock канонічним має лишатись КОРОТКИЙ
 * (нормальна назва/категорія), а не запис-двійник з «Різне»/«Акції».
 * Підтверджено dry-run-ом 2026-07-03: 491 група, скрізь пара
 * короткий↔падений; без цього тай-брейка 2 «мертві» групи
 * (L.MIX Sleepwear M, Livarno 50*36) обирали survivor-ом падений запис.
 */
function isPaddedCode(code1C: string | null): boolean {
  return !!code1C && /^0{3,}\d+$/.test(code1C);
}

export function pickSurvivor(candidates: MergeCandidate[]): MergeCandidate {
  if (candidates.length === 0) {
    throw new Error("pickSurvivor: порожня група");
  }
  const sorted = [...candidates].sort((a, b) => {
    if (b.freeLots !== a.freeLots) return b.freeLots - a.freeLots;
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    // Короткий (непадений) code1C — канонічний запис живого каталогу.
    const aPad = isPaddedCode(a.code1C);
    const bPad = isPaddedCode(b.code1C);
    if (aPad !== bPad) return aPad ? 1 : -1;
    const t = b.createdAt.getTime() - a.createdAt.getTime();
    if (t !== 0) return t;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  // sorted[0] гарантовано існує (перевірили length вище).
  return sorted[0] as MergeCandidate;
}

// ─── Чисті хелпери дедупу (мають тести) ───────────────────────────────────────

/**
 * Розбиває рядки з unique(customerId, productId) на «перенести»/«видалити».
 * `taken` — множина customerId, які вже є у survivor-а (мутується: перенесені
 * додаються, щоб уникнути конфлікту між кількома старими у групі 3+).
 */
export function splitByCustomer<T extends { id: string; customerId: string }>(
  rows: T[],
  taken: Set<string>,
): { moveIds: string[]; dropIds: string[] } {
  const moveIds: string[] = [];
  const dropIds: string[] = [];
  for (const r of rows) {
    if (taken.has(r.customerId)) {
      dropIds.push(r.id);
    } else {
      moveIds.push(r.id);
      taken.add(r.customerId);
    }
  }
  return { moveIds, dropIds };
}

/**
 * Розбиває Price-рядки на «перенести»/«конфлікт» за ключем (priceType|validFrom).
 * `taken` — ключі, які вже є у survivor-а (мутується перенесеними).
 */
export function splitPricesByKey(
  rows: { id: string; priceType: string; validFrom: Date }[],
  taken: Set<string>,
): { moveIds: string[]; conflictIds: string[] } {
  const moveIds: string[] = [];
  const conflictIds: string[] = [];
  for (const r of rows) {
    const key = `${r.priceType}|${r.validFrom.toISOString()}`;
    if (taken.has(key)) {
      conflictIds.push(r.id);
    } else {
      moveIds.push(r.id);
      taken.add(key);
    }
  }
  return { moveIds, conflictIds };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

// Prisma interactive-tx має дефолтний timeout 5000мс — перенесення історії групи
// (лоти + рухи регістрів + продажі) його перевищує. Щедрий timeout + maxWait.
const TX_TIMEOUT_MS = 120_000;
const TX_MAX_WAIT_MS = 20_000;

interface CliArgs {
  apply: boolean;
  confirmProd: boolean;
  only: string | null;
  broad: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    apply: false,
    confirmProd: false,
    only: null,
    broad: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--apply":
        args.apply = true;
        break;
      case "--confirm-prod":
        args.confirmProd = true;
        break;
      case "--broad":
        args.broad = true;
        break;
      case "--only": {
        const v = argv[++i];
        if (v) args.only = v.trim();
        break;
      }
      default:
        break;
    }
  }
  return args;
}

/**
 * Провідний 4-значний код у назві «(0758) …» → «0758» (1С-код у дужках на
 * початку). Немає — null. Дублює логіку audit-duplicate-products.ts свідомо
 * (не імпортуємо, щоб не запустити його main() під час імпорту модуля).
 */
export function leadingNameCode(name: string): string | null {
  const m = /^\s*\((\d{4})\)/.exec(name);
  return m?.[1] ?? null;
}

function maskDbUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://$1:***@");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Побудова груп ────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  code1C: string | null;
  name: string;
  articleCode: string | null;
  inStock: boolean;
  createdAt: Date;
  category: { name: string } | null;
}

interface Group {
  articleCode: string;
  survivor: MergeCandidate;
  losers: MergeCandidate[];
}

/** Множина статусів лота, що вважаються «вільними». */
const FREE_STATUSES = ["free", "on_sale"];

/**
 * Групування рядків у «сирі» групи (масиви ≥2):
 *   • звичайний режим — точний непорожній articleCode (як у 7.1);
 *   • broad — union-find за спільним (точний articleCode) АБО (провідний
 *     4-значний код у назві). Це ловить пари, де артикул різниться нулями
 *     (206/00206) або де двійник без code1C (порожні Excel-дублі).
 * `keyOf` для звіту — представницький ключ групи.
 */
function buildRawGroups(
  products: ProductRow[],
  broad: boolean,
): { key: string; rows: ProductRow[] }[] {
  if (!broad) {
    const byArticle = new Map<string, ProductRow[]>();
    for (const p of products) {
      const art = p.articleCode?.trim();
      if (!art) continue;
      const bucket = byArticle.get(art);
      if (bucket) bucket.push(p);
      else byArticle.set(art, [p]);
    }
    return [...byArticle.entries()]
      .filter(([, rows]) => rows.length >= 2)
      .map(([key, rows]) => ({ key, rows }));
  }

  // ── broad: union-find по двох ключах ──
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c) ?? r;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const p of products) parent.set(p.id, p.id);

  // Ребра: спільний articleCode; спільний провідний код у назві.
  const firstByArticle = new Map<string, string>();
  const firstByNameCode = new Map<string, string>();
  for (const p of products) {
    const art = p.articleCode?.trim();
    if (art) {
      const rep = firstByArticle.get(art);
      if (rep) union(rep, p.id);
      else firstByArticle.set(art, p.id);
    }
    const nc = leadingNameCode(p.name);
    if (nc) {
      const rep = firstByNameCode.get(nc);
      if (rep) union(rep, p.id);
      else firstByNameCode.set(nc, p.id);
    }
  }

  const byRoot = new Map<string, ProductRow[]>();
  for (const p of products) {
    const root = find(p.id);
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(p);
    else byRoot.set(root, [p]);
  }
  return [...byRoot.values()]
    .filter((rows) => rows.length >= 2)
    .map((rows) => {
      const rep = rows[0];
      const key =
        rep?.articleCode?.trim() ||
        (rep ? leadingNameCode(rep.name) : null) ||
        rep?.id ||
        "—";
      return { key, rows };
    });
}

async function buildGroups(
  prisma: PrismaClient,
  only: string | null,
  broad: boolean,
): Promise<Group[]> {
  // У broad-режимі скануємо ВСІ товари (включно з code1C=null — порожні
  // Excel-двійники); у звичайному — лише 1С-товари з непорожнім артикулом.
  const where: Prisma.ProductWhereInput = broad
    ? {}
    : { code1C: { not: null }, articleCode: only ? only : { not: null } };
  const products = (await prisma.product.findMany({
    where,
    select: {
      id: true,
      code1C: true,
      name: true,
      articleCode: true,
      inStock: true,
      createdAt: true,
      category: { select: { name: true } },
    },
  })) as ProductRow[];

  let rawGroups = buildRawGroups(products, broad);

  // `--only` у broad-режимі: лишаємо групи, де хоч один член має цей артикул
  // або цей код у назві (у звичайному режимі фільтр уже в `where`).
  if (broad && only) {
    rawGroups = rawGroups.filter((g) =>
      g.rows.some(
        (r) =>
          r.articleCode?.trim() === only || leadingNameCode(r.name) === only,
      ),
    );
  }

  // Лічильники лотів (free + total) для всіх товарів у групах-дублікатах.
  const dupProductIds: string[] = [];
  for (const g of rawGroups) for (const r of g.rows) dupProductIds.push(r.id);
  const freeByProduct = new Map<string, number>();
  const totalByProduct = new Map<string, number>();
  if (dupProductIds.length > 0) {
    const grouped = await prisma.lot.groupBy({
      by: ["productId", "status"],
      where: { productId: { in: dupProductIds } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      const cnt = g._count._all;
      totalByProduct.set(
        g.productId,
        (totalByProduct.get(g.productId) ?? 0) + cnt,
      );
      if (FREE_STATUSES.includes(g.status)) {
        freeByProduct.set(
          g.productId,
          (freeByProduct.get(g.productId) ?? 0) + cnt,
        );
      }
    }
  }

  const groups: Group[] = [];
  for (const { key, rows } of rawGroups) {
    if (rows.length < 2) continue;
    const candidates: MergeCandidate[] = rows.map((r) => ({
      id: r.id,
      code1C: r.code1C,
      name: r.name,
      categoryName: r.category?.name ?? null,
      freeLots: freeByProduct.get(r.id) ?? 0,
      totalLots: totalByProduct.get(r.id) ?? 0,
      inStock: r.inStock,
      createdAt: r.createdAt,
    }));
    const survivor = pickSurvivor(candidates);
    const losers = candidates.filter((c) => c.id !== survivor.id);
    groups.push({ articleCode: key, survivor, losers });
  }
  // Стабільний порядок для звіту.
  groups.sort((a, b) => (a.articleCode < b.articleCode ? -1 : 1));
  return groups;
}

function printGroups(groups: Group[]): void {
  console.log("");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" ГРУПИ ДУБЛІКАТІВ НОМЕНКЛАТУРИ (артикул → survivor + старі)");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`Груп-дублікатів: ${groups.length}`);
  console.log("");
  for (const g of groups) {
    console.log(`Артикул ${g.articleCode}`);
    const all = [g.survivor, ...g.losers];
    for (const c of all) {
      const mark = c.id === g.survivor.id ? "★ SURVIVOR" : "  старий   ";
      console.log(
        `  ${mark}  ${c.name}` +
          `  [кат: ${c.categoryName ?? "—"}]` +
          `  лотів: ${c.freeLots} вільн / ${c.totalLots} усього` +
          `  inStock=${c.inStock}` +
          `  code1C=${c.code1C ?? "—"}`,
      );
    }
    console.log("");
  }
}

// ─── Підрахунок перенесеного ──────────────────────────────────────────────────

interface MoveTally {
  groupsMerged: number;
  groupsSkipped: number;
  oldProductsDeleted: number;
  lots: number;
  orderItems: number;
  saleItems: number;
  receivingItems: number;
  purchasePrices: number;
  viewLog: number;
  favoritesMoved: number;
  favoritesDropped: number;
  videoSubsMoved: number;
  videoSubsDropped: number;
  cartItems: number;
  pricesMoved: number;
  pricesConflict: number;
  images: number;
  featuredDeleted: number;
  salesMovements: number;
  stockMovements: number;
  costMovements: number;
  orderRemainderMovements: number;
}

function emptyTally(): MoveTally {
  return {
    groupsMerged: 0,
    groupsSkipped: 0,
    oldProductsDeleted: 0,
    lots: 0,
    orderItems: 0,
    saleItems: 0,
    receivingItems: 0,
    purchasePrices: 0,
    viewLog: 0,
    favoritesMoved: 0,
    favoritesDropped: 0,
    videoSubsMoved: 0,
    videoSubsDropped: 0,
    cartItems: 0,
    pricesMoved: 0,
    pricesConflict: 0,
    images: 0,
    featuredDeleted: 0,
    salesMovements: 0,
    stockMovements: 0,
    costMovements: 0,
    orderRemainderMovements: 0,
  };
}

// ─── Перенесення однієї групи (у транзакції) ──────────────────────────────────

interface SkippedGroup {
  articleCode: string;
  reason: string;
}

/**
 * Переносить історію всіх старих товарів групи на survivor, створює ProductMerge
 * і видаляє старі Product. Уся група — в одній транзакції; при помилці транзакція
 * відкочується, група позначається skipped.
 */
async function mergeGroup(
  prisma: PrismaClient,
  group: Group,
  tally: MoveTally,
  skipped: SkippedGroup[],
): Promise<void> {
  const survivor = group.survivor;
  try {
    await prisma.$transaction(
      async (tx) => {
        // Множини «зайнятих» ключів survivor-а для дедупу (мутуються по групі).
        const favTaken = new Set(
          (
            await tx.favorite.findMany({
              where: { productId: survivor.id },
              select: { customerId: true },
            })
          ).map((r) => r.customerId),
        );
        const subTaken = new Set(
          (
            await tx.videoSubscription.findMany({
              where: { productId: survivor.id },
              select: { customerId: true },
            })
          ).map((r) => r.customerId),
        );
        const priceTaken = new Set(
          (
            await tx.price.findMany({
              where: { productId: survivor.id },
              select: { priceType: true, validFrom: true },
            })
          ).map((r) => `${r.priceType}|${r.validFrom.toISOString()}`),
        );
        // Наступна position для дозапису фото у кінець списку survivor-а.
        const maxPos = await tx.productImage.aggregate({
          where: { productId: survivor.id },
          _max: { position: true },
        });
        let nextPos = (maxPos._max.position ?? -1) + 1;

        for (const old of group.losers) {
          const oldHex = old.code1C;

          // ── Прості перенесення (Restrict + деякі Cascade) ──
          tally.lots += (
            await tx.lot.updateMany({
              where: { productId: old.id },
              data: { productId: survivor.id },
            })
          ).count;
          tally.orderItems += (
            await tx.orderItem.updateMany({
              where: { productId: old.id },
              data: { productId: survivor.id },
            })
          ).count;
          tally.saleItems += (
            await tx.saleItem.updateMany({
              where: { productId: old.id },
              data: { productId: survivor.id },
            })
          ).count;
          tally.receivingItems += (
            await tx.receivingItem.updateMany({
              where: { productId: old.id },
              data: { productId: survivor.id },
            })
          ).count;
          tally.purchasePrices += (
            await tx.purchasePrice.updateMany({
              where: { productId: old.id },
              data: { productId: survivor.id },
            })
          ).count;
          tally.viewLog += (
            await tx.viewLog.updateMany({
              where: { productId: old.id },
              data: { productId: survivor.id },
            })
          ).count;
          // CartItem — БЕЗ unique (drop 20260502) → простий перенос.
          tally.cartItems += (
            await tx.cartItem.updateMany({
              where: { productId: old.id },
              data: { productId: survivor.id },
            })
          ).count;

          // ── Favorite: дедуп по (customerId, productId) ──
          {
            const rows = await tx.favorite.findMany({
              where: { productId: old.id },
              select: { id: true, customerId: true },
            });
            const { moveIds, dropIds } = splitByCustomer(rows, favTaken);
            if (dropIds.length) {
              await tx.favorite.deleteMany({ where: { id: { in: dropIds } } });
            }
            if (moveIds.length) {
              await tx.favorite.updateMany({
                where: { id: { in: moveIds } },
                data: { productId: survivor.id },
              });
            }
            tally.favoritesMoved += moveIds.length;
            tally.favoritesDropped += dropIds.length;
          }

          // ── VideoSubscription: дедуп по (customerId, productId) ──
          {
            const rows = await tx.videoSubscription.findMany({
              where: { productId: old.id },
              select: { id: true, customerId: true },
            });
            const { moveIds, dropIds } = splitByCustomer(rows, subTaken);
            if (dropIds.length) {
              await tx.videoSubscription.deleteMany({
                where: { id: { in: dropIds } },
              });
            }
            if (moveIds.length) {
              await tx.videoSubscription.updateMany({
                where: { id: { in: moveIds } },
                data: { productId: survivor.id },
              });
            }
            tally.videoSubsMoved += moveIds.length;
            tally.videoSubsDropped += dropIds.length;
          }

          // ── Price: переносимо лише неконфліктні (priceType, validFrom) ──
          {
            const rows = await tx.price.findMany({
              where: { productId: old.id },
              select: { id: true, priceType: true, validFrom: true },
            });
            const { moveIds, conflictIds } = splitPricesByKey(rows, priceTaken);
            if (moveIds.length) {
              await tx.price.updateMany({
                where: { id: { in: moveIds } },
                data: { productId: survivor.id },
              });
            }
            // Конфліктні лишаємо на старому — зникнуть каскадом при delete Product.
            tally.pricesMoved += moveIds.length;
            tally.pricesConflict += conflictIds.length;
          }

          // ── ProductImage: дозапис у кінець списку survivor-а ──
          {
            const imgs = await tx.productImage.findMany({
              where: { productId: old.id },
              select: { id: true },
              orderBy: { position: "asc" },
            });
            for (const img of imgs) {
              await tx.productImage.update({
                where: { id: img.id },
                data: { productId: survivor.id, position: nextPos },
              });
              nextPos++;
            }
            tally.images += imgs.length;
          }

          // ── FeaturedProduct старого — прибрати (unique на product) ──
          tally.featuredDeleted += (
            await tx.featuredProduct.deleteMany({
              where: { productId: old.id },
            })
          ).count;

          // ── Регістри рухів: repoint productId, hex НЕ чіпаємо ──
          if (oldHex) {
            tally.salesMovements += (
              await tx.salesMovement.updateMany({
                where: { productCode1C: oldHex },
                data: { productId: survivor.id },
              })
            ).count;
            tally.stockMovements += (
              await tx.stockMovement.updateMany({
                where: { productCode1C: oldHex },
                data: { productId: survivor.id },
              })
            ).count;
            tally.costMovements += (
              await tx.costMovement.updateMany({
                where: { productCode1C: oldHex },
                data: { productId: survivor.id },
              })
            ).count;
            tally.orderRemainderMovements += (
              await tx.orderRemainderMovement.updateMany({
                where: { productCode1C: oldHex },
                data: { productId: survivor.id },
              })
            ).count;
          }

          // ── Журнал злиття ──
          // ProductMerge потрібен лише щоб реімпортер (upsert by code1C) не
          // відтворив злитий 1С-товар. Порожній двійник без code1C реімпорт
          // ніколи не відтворить (нема ключа) → журнал не пишемо, просто
          // видаляємо. Для losers з code1C — пишемо як раніше.
          if (oldHex) {
            await tx.productMerge.create({
              data: {
                oldCode1C: oldHex,
                targetProductId: survivor.id,
                oldName: old.name,
              },
            });
          }

          // ── Видалення старого Product (Restrict-посилань уже нема) ──
          await tx.product.delete({ where: { id: old.id } });
          tally.oldProductsDeleted++;
        }
      },
      { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
    );
    tally.groupsMerged++;
    console.log(
      `${TAG}   ✓ артикул ${group.articleCode}: злито ${group.losers.length} → ${survivor.name}`,
    );
  } catch (e) {
    tally.groupsSkipped++;
    const reason = e instanceof Error ? e.message : String(e);
    skipped.push({ articleCode: group.articleCode, reason });
    console.warn(
      `${TAG}   ✗ артикул ${group.articleCode} ПРОПУЩЕНО: ${reason}`,
    );
  }
}

function printSummary(
  tally: MoveTally,
  skipped: SkippedGroup[],
  apply: boolean,
): void {
  console.log("");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(apply ? " РЕЗУЛЬТАТ ЗЛИТТЯ" : " ПІДСУМОК (dry-run — без запису)");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`  Груп злито               ${tally.groupsMerged}`);
  console.log(`  Груп пропущено           ${tally.groupsSkipped}`);
  console.log(`  Старих Product видалено  ${tally.oldProductsDeleted}`);
  console.log("");
  console.log("  ПЕРЕНЕСЕНО НА SURVIVOR:");
  console.log(`    Lot                    ${tally.lots}`);
  console.log(`    OrderItem              ${tally.orderItems}`);
  console.log(`    SaleItem               ${tally.saleItems}`);
  console.log(`    ReceivingItem          ${tally.receivingItems}`);
  console.log(`    PurchasePrice          ${tally.purchasePrices}`);
  console.log(`    ViewLog                ${tally.viewLog}`);
  console.log(`    CartItem               ${tally.cartItems}`);
  console.log(
    `    Favorite               ${tally.favoritesMoved} (дублів прибрано ${tally.favoritesDropped})`,
  );
  console.log(
    `    VideoSubscription      ${tally.videoSubsMoved} (дублів прибрано ${tally.videoSubsDropped})`,
  );
  console.log(
    `    Price                  ${tally.pricesMoved} (конфліктів пропущено ${tally.pricesConflict})`,
  );
  console.log(`    ProductImage           ${tally.images}`);
  console.log(`    FeaturedProduct прибрано ${tally.featuredDeleted}`);
  console.log("");
  console.log("  РЕГІСТРИ РУХІВ (repoint productId, hex збережено):");
  console.log(`    SalesMovement          ${tally.salesMovements}`);
  console.log(`    StockMovement          ${tally.stockMovements}`);
  console.log(`    CostMovement           ${tally.costMovements}`);
  console.log(`    OrderRemainderMovement ${tally.orderRemainderMovements}`);
  if (skipped.length > 0) {
    console.log("");
    console.log("  ПРОПУЩЕНІ ГРУПИ:");
    for (const s of skipped) {
      console.log(`    • артикул ${s.articleCode}: ${s.reason}`);
    }
  }
  console.log("");
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(
      `${TAG} FATAL: DATABASE_URL не задано (підвантаж apps/store/.env).`,
    );
    process.exit(1);
  }

  console.log(`${TAG} ціль БД: ${maskDbUrl(dbUrl)}`);
  console.log(
    `${TAG} режим: ${args.apply ? "APPLY (запис)" : "DRY-RUN (звіт)"}` +
      (args.broad
        ? " | BROAD (артикул+код-у-назві, з порожніми двійниками)"
        : "") +
      (args.only ? ` | тільки ${args.only}` : ""),
  );

  if (args.apply && !args.confirmProd) {
    console.error(
      `${TAG} FATAL: --apply вимагає --confirm-prod (захист від випадкового ` +
        `запису у бойову базу).`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  try {
    const groups = await buildGroups(prisma, args.only, args.broad);
    printGroups(groups);

    const tally = emptyTally();
    const skipped: SkippedGroup[] = [];

    if (!args.apply) {
      // Нульову таблицю лічильників у dry-run НЕ друкуємо — вона стосується
      // лише реального запису й лише збиває з пантелику (список груп вище —
      // це і є результат dry-run).
      console.log(
        `${TAG} DRY-RUN завершено — жодного запису. Груп-дублікатів знайдено: ` +
          `${groups.length} (список вище). Для реального запису: --apply --confirm-prod`,
      );
      return;
    }

    console.log("");
    console.log(
      "⚠️  APPLY: зробіть свіжий pg_dump ПЕРЕД запуском! Запис почнеться за 5с…",
    );
    await sleep(5000);

    for (const group of groups) {
      await mergeGroup(prisma, group, tally, skipped);
    }

    printSummary(tally, skipped, true);
    console.log(`${TAG} APPLY завершено.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаємо main() лише при прямому виконанні (tsx scripts/...), НЕ під час
// імпорту модуля у юніт-тестах (звідки беруться чисті хелпери).
if (!process.env.VITEST) {
  main().catch((err: unknown) => {
    console.error(`${TAG} ПОМИЛКА:`, err);
    process.exit(1);
  });
}
