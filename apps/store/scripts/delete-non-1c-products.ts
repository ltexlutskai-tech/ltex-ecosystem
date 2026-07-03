/**
 * Чистка НЕ-1С товарів (сесія 6.2, Задача B). Лишаємо у вітрині ТІЛЬКИ товари з
 * `code1C IS NOT NULL`; решту (включно з легітимним Excel-каталогом S71 —
 * user підтвердив) прибираємо.
 *
 * Специфікація: `docs/SESSION_6.2_TASK_B_CLEANUP.md`. Аудит (read-only цифри):
 * `scripts/audit-non-1c.ts`.
 *
 * ─── КЛАСИФІКАЦІЯ (чиста функція `classifyProduct`, див. нижче + тести) ─────────
 *   keep1C       — `code1C IS NOT NULL` → не чіпаємо.
 *   deleteFull   — `code1C IS NULL` і НЕМАЄ OrderItem/SaleItem/ReceivingItem
 *                  → повне видалення (Product + залежні).
 *   hideHistory  — `code1C IS NULL` і Є OrderItem/SaleItem АБО ReceivingItem
 *                  → сховати (inStock=false) + прибрати все, що робить товар
 *                    видимим/продаваним; сам Product лишається (звіти/історія цілі).
 *
 *   ⚠️ ReceivingItem має FK-Restrict на product і бізнес-цінність (рядок документа
 *   «Поступлення»). Тому товар без продажів, але з ReceivingItem, НЕ видаляємо
 *   повністю — переносимо у hideHistory (і виводимо окремим списком).
 *
 * ─── FK / onDelete (перевірено у packages/db/prisma/schema.prisma) ────────────
 *   На Product:
 *     ProductImage        Cascade   ✅ (знімається при видаленні Product)
 *     Price               Cascade   ✅
 *     Favorite            Cascade   ✅
 *     FeaturedProduct     Cascade   ✅
 *     ViewLog             Cascade   ✅
 *     VideoSubscription   Cascade   ✅
 *     PurchasePrice       Cascade   ✅
 *     Lot                 Restrict  ⚠️ видаляти ЯВНО перед Product
 *     CartItem            Restrict  ⚠️ видаляти ЯВНО перед Product
 *     ReceivingItem       Restrict  ⚠️ блокує → такі товари йдуть у hideHistory
 *     OrderItem           Restrict  ⚠️ (історія) → deleteFull їх не має за визначенням
 *     SaleItem            Restrict  ⚠️ (історія) → deleteFull їх не має за визначенням
 *   На Lot:
 *     Barcode             Cascade   ✅ (знімається при видаленні Lot)
 *     OrderItem.lotId     SetNull   ✅ (nullable)
 *     SaleItem.lotId      SetNull   ✅ (nullable)
 *     CartItem.lotId      SetNull   ✅ (nullable)
 *     ReceivingItem.createdLotId SetNull ✅ (nullable — рядок «Поступлення» цілий)
 *   ⇒ Порядок видалення для deleteFull: media(фото) → Lots → CartItems → Product.
 *     Для hideHistory: media(фото) → Images → Prices → Lots → CartItems →
 *     Favorites → Featured → inStock=false. OrderItem/SaleItem/ReceivingItem — НЕ чіпаємо.
 *
 * ─── БЕЗПЕКА ──────────────────────────────────────────────────────────────────
 *   - Ціль = `DATABASE_URL` (echo з маскуванням пароля на старті).
 *   - Без `--apply` → лише звіт (жодного запису).
 *   - `--apply` БЕЗ `--confirm-prod` → відмова.
 *   - `--apply --confirm-prod` → попередження «зробіть pg_dump» + 5с пауза, далі запис.
 *
 * ─── ЗАПУСК (user, на сервері; у пісочниці НЕ запускати — немає БД) ────────────
 *   # DATABASE_URL з apps/store/.env
 *   # 1) сухий звіт (за замовчуванням):
 *   pnpm --filter @ltex/store exec tsx scripts/delete-non-1c-products.ts
 *   # 2) реальний запис (після pg_dump + звірки цифр):
 *   pnpm --filter @ltex/store exec tsx scripts/delete-non-1c-products.ts --apply --confirm-prod
 *
 * Скрипт у пісочниці НЕ запускався (немає БД) — лише компілюється/перевіряється.
 */

import { PrismaClient, type Prisma } from "@ltex/db";

import { deleteMediaByUrl } from "../lib/media/storage";

const TAG = "[delete-non-1c]";

// ─── Чиста класифікація (єдине джерело правди; дзеркалиться у where-фільтрах) ──

export type ProductBucket = "keep1C" | "deleteFull" | "hideHistory";

export interface ProductClassInput {
  /** hex(_IDRRef) 1С-номенклатури; null = не з 1С. */
  code1C: string | null;
  orderItemCount: number;
  saleItemCount: number;
  receivingItemCount: number;
}

export interface ProductClassification {
  bucket: ProductBucket;
  /**
   * Товар потрапив у hideHistory ВИКЛЮЧНО через ReceivingItem (немає продажів).
   * Такі виводимо окремим списком — інакше вони були б deleteFull, але FK-Restrict
   * від ReceivingItem заблокував би повне видалення.
   */
  hiddenDueToReceivingOnly: boolean;
}

/**
 * Класифікує товар за наявністю code1C та посилань історії/поступлення.
 * Правило дзеркалиться у Prisma where-фільтрах `WHERE_DELETE_FULL` /
 * `WHERE_HIDE_HISTORY` нижче — тримати синхронно.
 */
export function classifyProduct(
  input: ProductClassInput,
): ProductClassification {
  if (input.code1C !== null && input.code1C !== "") {
    return { bucket: "keep1C", hiddenDueToReceivingOnly: false };
  }

  const hasSalesHistory = input.orderItemCount > 0 || input.saleItemCount > 0;
  const hasReceiving = input.receivingItemCount > 0;

  if (hasSalesHistory || hasReceiving) {
    return {
      bucket: "hideHistory",
      hiddenDueToReceivingOnly: !hasSalesHistory && hasReceiving,
    };
  }

  return { bucket: "deleteFull", hiddenDueToReceivingOnly: false };
}

// Prisma where-фільтри — дзеркало правила classifyProduct (relational, без in-списків).
const WHERE_DELETE_FULL: Prisma.ProductWhereInput = {
  code1C: null,
  orderItems: { none: {} },
  saleItems: { none: {} },
  receivingItems: { none: {} },
};

const WHERE_HIDE_HISTORY: Prisma.ProductWhereInput = {
  code1C: null,
  OR: [
    { orderItems: { some: {} } },
    { saleItems: { some: {} } },
    { receivingItems: { some: {} } },
  ],
};

// Підмножина hideHistory, що потрапила туди лише через ReceivingItem (без продажів).
const WHERE_HIDE_RECEIVING_ONLY: Prisma.ProductWhereInput = {
  code1C: null,
  orderItems: { none: {} },
  saleItems: { none: {} },
  receivingItems: { some: {} },
};

// ─── CLI ──────────────────────────────────────────────────────────────────────

// Prisma interactive-tx має дефолтний timeout 5000мс — каскадне видалення
// ~100 товарів (lots+barcodes+images+…) його перевищує (перший прогін упав
// P2028 на 5699мс). Тому щедрий timeout + менший батч.
const TX_TIMEOUT_MS = 120_000;
const TX_MAX_WAIT_MS = 20_000;

interface CliArgs {
  apply: boolean;
  confirmProd: boolean;
  batch: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { apply: false, confirmProd: false, batch: 50 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--apply":
        args.apply = true;
        break;
      case "--confirm-prod":
        args.confirmProd = true;
        break;
      case "--batch": {
        const n = Number(argv[++i]);
        if (Number.isFinite(n) && n > 0) args.batch = Math.floor(n);
        break;
      }
      default:
        // невідомі прапорці ігноруємо (як інші скрипти)
        break;
    }
  }
  return args;
}

/** Маскує пароль у postgres-URL для безпечного echo. */
function maskDbUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    // не URL — маскуємо ділянку між ":" та "@" консервативно
    return url.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://$1:***@");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Звіт ─────────────────────────────────────────────────────────────────────

interface DeleteFullTally {
  products: number;
  images: number;
  prices: number;
  lots: number;
  barcodes: number;
  cartItems: number;
  favorites: number;
  featured: number;
  viewLog: number;
  videoSubscriptions: number;
  purchasePrices: number;
}

interface HideTally {
  products: number;
  images: number;
  prices: number;
  lots: number;
  barcodes: number;
  cartItems: number;
  favorites: number;
  featured: number;
  receivingOnly: number;
}

async function tallyDeleteFull(prisma: PrismaClient): Promise<DeleteFullTally> {
  const p = WHERE_DELETE_FULL;
  const [
    products,
    images,
    prices,
    lots,
    barcodes,
    cartItems,
    favorites,
    featured,
    viewLog,
    videoSubscriptions,
    purchasePrices,
  ] = await Promise.all([
    prisma.product.count({ where: p }),
    prisma.productImage.count({ where: { product: p } }),
    prisma.price.count({ where: { product: p } }),
    prisma.lot.count({ where: { product: p } }),
    prisma.barcode.count({ where: { lot: { product: p } } }),
    prisma.cartItem.count({ where: { product: p } }),
    prisma.favorite.count({ where: { product: p } }),
    prisma.featuredProduct.count({ where: { product: p } }),
    prisma.viewLog.count({ where: { product: p } }),
    prisma.videoSubscription.count({ where: { product: p } }),
    prisma.purchasePrice.count({ where: { product: p } }),
  ]);
  return {
    products,
    images,
    prices,
    lots,
    barcodes,
    cartItems,
    favorites,
    featured,
    viewLog,
    videoSubscriptions,
    purchasePrices,
  };
}

async function tallyHide(prisma: PrismaClient): Promise<HideTally> {
  const p = WHERE_HIDE_HISTORY;
  const [
    products,
    images,
    prices,
    lots,
    barcodes,
    cartItems,
    favorites,
    featured,
    receivingOnly,
  ] = await Promise.all([
    prisma.product.count({ where: p }),
    prisma.productImage.count({ where: { product: p } }),
    prisma.price.count({ where: { product: p } }),
    prisma.lot.count({ where: { product: p } }),
    prisma.barcode.count({ where: { lot: { product: p } } }),
    prisma.cartItem.count({ where: { product: p } }),
    prisma.favorite.count({ where: { product: p } }),
    prisma.featuredProduct.count({ where: { product: p } }),
    prisma.product.count({ where: WHERE_HIDE_RECEIVING_ONLY }),
  ]);
  return {
    products,
    images,
    prices,
    lots,
    barcodes,
    cartItems,
    favorites,
    featured,
    receivingOnly,
  };
}

function printPlan(keep1C: number, df: DeleteFullTally, hd: HideTally): void {
  console.log("");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(" ПЛАН ЧИСТКИ НЕ-1С ТОВАРІВ (Задача B)");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("");
  console.log("КЛАСИФІКАЦІЯ ТОВАРІВ");
  console.log(`  keep1C (code1C != null, лишаємо)             ${keep1C}`);
  console.log(`  deleteFull (не-1С, без історії → видалити)   ${df.products}`);
  console.log(`  hideHistory (не-1С, з історією → сховати)    ${hd.products}`);
  console.log(
    `    └─ з них лише через ReceivingItem (без продажів) ${hd.receivingOnly}`,
  );
  console.log("");
  console.log("DELETE-FULL — залежні записи на видалення (Cascade + явні)");
  console.log(`  ProductImage        ${df.images}`);
  console.log(`  Price               ${df.prices}`);
  console.log(`  Lot                 ${df.lots}`);
  console.log(`  Barcode             ${df.barcodes}`);
  console.log(`  CartItem            ${df.cartItems}`);
  console.log(`  Favorite            ${df.favorites}`);
  console.log(`  FeaturedProduct     ${df.featured}`);
  console.log(`  ViewLog             ${df.viewLog}`);
  console.log(`  VideoSubscription   ${df.videoSubscriptions}`);
  console.log(`  PurchasePrice       ${df.purchasePrices}`);
  console.log("");
  console.log("HIDE-HISTORY — записи, що прибираємо (Product лишається)");
  console.log(`  ProductImage        ${hd.images}`);
  console.log(`  Price               ${hd.prices}`);
  console.log(`  Lot                 ${hd.lots}`);
  console.log(`  Barcode             ${hd.barcodes}`);
  console.log(`  CartItem            ${hd.cartItems}`);
  console.log(`  Favorite            ${hd.favorites}`);
  console.log(`  FeaturedProduct     ${hd.featured}`);
  console.log("");
}

/** Друкує перші N товарів, схованих ЛИШЕ через ReceivingItem (для уваги user). */
async function printReceivingOnlyList(prisma: PrismaClient): Promise<void> {
  const sample = await prisma.product.findMany({
    where: WHERE_HIDE_RECEIVING_ONLY,
    select: { id: true, name: true, articleCode: true, slug: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  if (sample.length === 0) return;
  console.log(
    "УВАГА — товари, приховані ЛИШЕ через ReceivingItem (без продажів):",
  );
  for (const s of sample) {
    console.log(`  • ${s.articleCode ?? "—"}  ${s.name}  (slug=${s.slug})`);
  }
  console.log(
    `  (показано ${sample.length}; повна кількість у рядку hideHistory→ReceivingItem)`,
  );
  console.log("");
}

// ─── Батч-хелпери ─────────────────────────────────────────────────────────────

async function collectProductIds(
  prisma: PrismaClient,
  where: Prisma.ProductWhereInput,
): Promise<string[]> {
  const rows = await prisma.product.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Best-effort видалення локальних медіа-файлів фото для набору товарів. */
async function purgeMediaForProducts(
  prisma: PrismaClient,
  productIds: string[],
): Promise<void> {
  const images = await prisma.productImage.findMany({
    where: { productId: { in: productIds } },
    select: { url: true },
  });
  for (const img of images) {
    await deleteMediaByUrl(img.url).catch(() => undefined);
  }
}

interface DeletedCounts {
  lots: number;
  cartItems: number;
  images: number;
  prices: number;
  favorites: number;
  featured: number;
  products: number;
}

function emptyDeleted(): DeletedCounts {
  return {
    lots: 0,
    cartItems: 0,
    images: 0,
    prices: 0,
    favorites: 0,
    featured: 0,
    products: 0,
  };
}

async function runDeleteFull(
  prisma: PrismaClient,
  batchSize: number,
): Promise<DeletedCounts> {
  const ids = await collectProductIds(prisma, WHERE_DELETE_FULL);
  const acc = emptyDeleted();
  const batches = chunk(ids, batchSize);
  console.log(
    `${TAG} DELETE-FULL: ${ids.length} товарів у ${batches.length} батчах…`,
  );

  let done = 0;
  for (const batch of batches) {
    await purgeMediaForProducts(prisma, batch);
    await prisma.$transaction(
      async (tx) => {
        // Lot (Restrict на Product) — barcodes cascade; lotId-посилання SetNull.
        const lots = await tx.lot.deleteMany({
          where: { productId: { in: batch } },
        });
        // CartItem (Restrict на Product).
        const cart = await tx.cartItem.deleteMany({
          where: { productId: { in: batch } },
        });
        // Product — cascades: images/prices/favorites/featured/viewLog/
        // videoSubscriptions/purchasePrices.
        const prod = await tx.product.deleteMany({
          where: { id: { in: batch } },
        });
        acc.lots += lots.count;
        acc.cartItems += cart.count;
        acc.products += prod.count;
      },
      // Каскадне видалення сотні товарів довше за дефолтні 5с interactive-tx.
      { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
    );
    done += batch.length;
    console.log(`${TAG}   … ${done}/${ids.length}`);
  }
  return acc;
}

async function runHideHistory(
  prisma: PrismaClient,
  batchSize: number,
): Promise<DeletedCounts> {
  const ids = await collectProductIds(prisma, WHERE_HIDE_HISTORY);
  const acc = emptyDeleted();
  const batches = chunk(ids, batchSize);
  console.log(
    `${TAG} HIDE-HISTORY: ${ids.length} товарів у ${batches.length} батчах…`,
  );

  let done = 0;
  for (const batch of batches) {
    await purgeMediaForProducts(prisma, batch);
    await prisma.$transaction(
      async (tx) => {
        const images = await tx.productImage.deleteMany({
          where: { productId: { in: batch } },
        });
        const prices = await tx.price.deleteMany({
          where: { productId: { in: batch } },
        });
        // Lot — barcodes cascade; OrderItem/SaleItem.lotId → SetNull (історія ціла).
        const lots = await tx.lot.deleteMany({
          where: { productId: { in: batch } },
        });
        const cart = await tx.cartItem.deleteMany({
          where: { productId: { in: batch } },
        });
        const favs = await tx.favorite.deleteMany({
          where: { productId: { in: batch } },
        });
        const feat = await tx.featuredProduct.deleteMany({
          where: { productId: { in: batch } },
        });
        // Ховаємо з вітрини (базовий фільтр каталогу — where { inStock:true }).
        const hiddenProducts = await tx.product.updateMany({
          where: { id: { in: batch } },
          data: { inStock: false },
        });
        acc.products += hiddenProducts.count;
        acc.images += images.count;
        acc.prices += prices.count;
        acc.lots += lots.count;
        acc.cartItems += cart.count;
        acc.favorites += favs.count;
        acc.featured += feat.count;
      },
      // Каскадне видалення сотні товарів довше за дефолтні 5с interactive-tx.
      { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
    );
    done += batch.length;
    console.log(`${TAG}   … ${done}/${ids.length}`);
  }
  return acc;
}

// ─── Категорії ────────────────────────────────────────────────────────────────

/**
 * Видаляє порожні НЕ-1С категорії (code1C IS NULL, 0 товарів, 0 дочірніх),
 * знизу-вгору, кількома проходами поки щось видаляється. 1С-дерево
 * (code1C != null) не чіпаємо навіть порожнє.
 */
async function deleteEmptyNon1CCategories(
  prisma: PrismaClient,
  apply: boolean,
): Promise<{ deleted: string[]; keptEmpty1C: number }> {
  const deleted: string[] = [];

  for (let pass = 0; pass < 100; pass++) {
    const empty = await prisma.category.findMany({
      where: {
        code1C: null,
        products: { none: {} },
        children: { none: {} },
      },
      select: { id: true, name: true, slug: true },
    });
    if (empty.length === 0) break;

    for (const c of empty) {
      deleted.push(`${c.name} (slug=${c.slug})`);
    }
    if (apply) {
      await prisma.category.deleteMany({
        where: { id: { in: empty.map((c) => c.id) } },
      });
    } else {
      // dry-run: не видаляємо → зупиняємось після одного проходу, інакше
      // цикл нескінченний (кандидати не зникають).
      break;
    }
  }

  const keptEmpty1C = await prisma.category.count({
    where: {
      code1C: { not: null },
      products: { none: {} },
      children: { none: {} },
    },
  });

  return { deleted, keptEmpty1C };
}

// ─── Пост-звіт Supabase ───────────────────────────────────────────────────────

async function printSupabaseReport(prisma: PrismaClient): Promise<void> {
  const [images, banners] = await Promise.all([
    prisma.productImage.count({ where: { url: { contains: "supabase" } } }),
    prisma.banner.count({ where: { imageUrl: { contains: "supabase" } } }),
  ]);
  console.log("");
  console.log("ПОСТ-ЗВІТ SUPABASE (залишкові URL із «supabase»)");
  console.log(`  ProductImage.url ~ %supabase%   ${images}`);
  console.log(`  Banner.imageUrl  ~ %supabase%   ${banners}`);
  if (images === 0 && banners === 0) {
    console.log(
      "  ✅ 0 — можна прибирати *.supabase.co з CSP/remotePatterns (next.config.js).",
    );
  } else {
    console.log(
      "  ⚠️ ще лишились supabase-URL — НЕ прибирайте *.supabase.co з CSP,",
    );
    console.log("     інакше ці зображення перестануть вантажитись.");
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
    `${TAG} режим: ${args.apply ? "APPLY (запис)" : "DRY-RUN (звіт)"}`,
  );

  if (args.apply && !args.confirmProd) {
    console.error(
      `${TAG} FATAL: --apply вимагає --confirm-prod (захист від випадкового ` +
        `запису у бойову базу). Додай --confirm-prod, щоб дозволити запис.`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    // ── Звіт-план (у будь-якому режимі) ──
    const [keep1C, df, hd] = await Promise.all([
      prisma.product.count({ where: { code1C: { not: null } } }),
      tallyDeleteFull(prisma),
      tallyHide(prisma),
    ]);
    printPlan(keep1C, df, hd);
    await printReceivingOnlyList(prisma);

    if (!args.apply) {
      // Порожні НЕ-1С категорії (прев'ю, без запису).
      const cat = await deleteEmptyNon1CCategories(prisma, false);
      console.log("КАТЕГОРІЇ (dry-run — прев'ю першого проходу)");
      console.log(
        `  Порожні не-1С категорії (кандидати, ≥1 прохід)  ${cat.deleted.length}`,
      );
      for (const c of cat.deleted.slice(0, 50)) console.log(`    • ${c}`);
      console.log(
        `  Порожні 1С-категорії (лишаємо, не чіпаємо)      ${cat.keptEmpty1C}`,
      );
      await printSupabaseReport(prisma);
      console.log(
        `${TAG} DRY-RUN завершено — жодного запису. Для реального запису: ` +
          `--apply --confirm-prod`,
      );
      return;
    }

    // ── APPLY ──
    console.log("");
    console.log(
      "⚠️  APPLY: зробіть свіжий pg_dump ПЕРЕД запуском! Запис почнеться за 5с…",
    );
    await sleep(5000);

    const delFull = await runDeleteFull(prisma, args.batch);
    const hidden = await runHideHistory(prisma, args.batch);
    const cat = await deleteEmptyNon1CCategories(prisma, true);

    console.log("");
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log(" РЕЗУЛЬТАТ ЗАПИСУ");
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("DELETE-FULL (явно видалено; решта — Cascade на Product)");
    console.log(`  Product             ${delFull.products}`);
    console.log(`  Lot                 ${delFull.lots}`);
    console.log(`  CartItem            ${delFull.cartItems}`);
    console.log("HIDE-HISTORY (inStock=false + прибрано)");
    console.log(`  Товарів сховано     ${hidden.products}`);
    console.log(`  ProductImage        ${hidden.images}`);
    console.log(`  Price               ${hidden.prices}`);
    console.log(`  Lot                 ${hidden.lots}`);
    console.log(`  CartItem            ${hidden.cartItems}`);
    console.log(`  Favorite            ${hidden.favorites}`);
    console.log(`  FeaturedProduct     ${hidden.featured}`);
    console.log("КАТЕГОРІЇ");
    console.log(`  Видалено порожніх не-1С   ${cat.deleted.length}`);
    console.log(`  Лишено порожніх 1С        ${cat.keptEmpty1C}`);

    await printSupabaseReport(prisma);
    console.log(`${TAG} APPLY завершено.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаємо main() лише при прямому виконанні (tsx scripts/...), НЕ під час
// імпорту модуля у юніт-тестах (звідки береться чиста функція classifyProduct).
if (!process.env.VITEST) {
  main().catch((err: unknown) => {
    console.error(`${TAG} ПОМИЛКА:`, err);
    process.exit(1);
  });
}
