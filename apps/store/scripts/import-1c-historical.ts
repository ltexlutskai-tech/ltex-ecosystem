/**
 * Імпорт історичних даних з 1С «Управління Торгівлею» (MS SQL Server, база `ltex`)
 * у нашу Prisma/PostgreSQL-схему. Сесія ORCHESTRATOR 5.2, Пріоритет 2.
 *
 * Опорні специфікації (читати перед правками!):
 *   - docs/IMPORT_SCRIPT_PLAN.md          — план (прапорці, безпека, порядок)
 *   - docs/HISTORY_MIGRATION_MAP.md       — поле-у-поле мапінг 1С → Prisma
 *   - docs/1c-mssql-schema/columns.tsv    — фізичні колонки (`_Fld<N>RRef` тощо)
 *   - docs/1c-mssql-schema/dbnames.txt    — UUID↔таблиця/поле декодер
 *
 * ─── БЕЗПЕКА (критично) ───────────────────────────────────────────────────────
 *   - Джерело 1С: `LEGACY_1C_DB_URL` (mssql://, read-only логін).
 *   - Ціль запису: ТІЛЬКИ `IMPORT_TARGET_DB_URL`. Якщо не задано → падаємо.
 *     НІКОЛИ не фолбечимо мовчки на `DATABASE_URL`.
 *   - Якщо ціль == `DATABASE_URL` (бойова база) → вимагаємо `--confirm-prod`.
 *   - `--dry-run` НЕ робить жодного запису (тільки читання + резолв зв'язків).
 *
 * ─── ПРАПОРЦІ ─────────────────────────────────────────────────────────────────
 *   --dry-run            читає 1С + резолвить зв'язки, нічого не пише
 *   --limit N            лише перші N рядків кожної сутності (пробний прогон)
 *   --entity <name>      одна сутність: customers|products|lots|barcodes|prices|
 *                        orders|sales|cashorders|routesheets (дефолт = всі в порядку)
 *   --confirm-prod       дозволити запис коли ціль = бойова база
 *   --batch N            розмір батчу запису (дефолт 500)
 *   --since YYYY-MM-DD   (опц.) лише документи з цієї дати
 *
 * ─── ЗАПУСК (диктує orchestrator) ─────────────────────────────────────────────
 *   # 1. одноразово: pnpm --filter @ltex/store add mssql; pnpm ... add -D @types/mssql
 *   # 2. сухий прогон:
 *   IMPORT_TARGET_DB_URL=<DATABASE_URL> \
 *     pnpm --filter @ltex/store exec tsx scripts/import-1c-historical.ts --dry-run
 *   # 3. пробний обмежений запис:
 *   IMPORT_TARGET_DB_URL=<DATABASE_URL> \
 *     pnpm --filter @ltex/store exec tsx scripts/import-1c-historical.ts --limit 50 --confirm-prod
 *   # 4. повний прогон (уночі):
 *   IMPORT_TARGET_DB_URL=<DATABASE_URL> \
 *     pnpm --filter @ltex/store exec tsx scripts/import-1c-historical.ts --confirm-prod
 *
 * Скрипт у пісочниці НЕ запускався (немає БД) — лише компілюється/перевіряється.
 */

// `mssql` додано у apps/store/package.json (dependencies) + @types/mssql (devDeps).
// ⚠️ User має один раз виконати `pnpm install` (оркестратор лише відредагував
// package.json — у пісочниці без мережі встановити неможливо). Типи беруться з
// @types/mssql; використовуваний API (ConnectionPool/config/Int/request/input/
// query) стабільний у версіях 9–11.
import * as mssql from "mssql";

import { PrismaClient } from "@ltex/db";

// ─── Парсинг аргументів ───────────────────────────────────────────────────────

const ENTITY_NAMES = [
  "customers",
  "products",
  "lots",
  "barcodes",
  "prices",
  "orders",
  "sales",
  "cashorders",
  "routesheets",
] as const;

type EntityName = (typeof ENTITY_NAMES)[number];

interface CliArgs {
  dryRun: boolean;
  limit: number | null;
  entity: EntityName | null;
  confirmProd: boolean;
  batch: number;
  since: Date | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    limit: null,
    entity: null,
    confirmProd: false,
    batch: 500,
    since: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--confirm-prod":
        args.confirmProd = true;
        break;
      case "--limit": {
        const v = argv[++i];
        const n = Number(v);
        if (!Number.isInteger(n) || n <= 0) {
          throw new Error(`--limit requires a positive integer (got "${v}")`);
        }
        args.limit = n;
        break;
      }
      case "--batch": {
        const v = argv[++i];
        const n = Number(v);
        if (!Number.isInteger(n) || n <= 0) {
          throw new Error(`--batch requires a positive integer (got "${v}")`);
        }
        args.batch = n;
        break;
      }
      case "--entity": {
        const v = argv[++i];
        const match = ENTITY_NAMES.find((e) => e === v);
        if (!match) {
          throw new Error(
            `--entity must be one of: ${ENTITY_NAMES.join(", ")} (got "${v}")`,
          );
        }
        args.entity = match;
        break;
      }
      case "--since": {
        const v = argv[++i];
        const d = new Date(`${v}T00:00:00.000Z`);
        if (Number.isNaN(d.getTime())) {
          throw new Error(`--since requires YYYY-MM-DD (got "${v}")`);
        }
        args.since = d;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }

  return args;
}

// ─── Логування ────────────────────────────────────────────────────────────────

const TAG = "[1C-import]";
function log(msg: string): void {
  console.log(`${TAG} ${msg}`);
}
function warn(msg: string): void {
  console.warn(`${TAG} WARN: ${msg}`);
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message.split("\n")[0]! : String(e);
}

// ─── Конфіг джерела MSSQL з LEGACY_1C_DB_URL ──────────────────────────────────
// Формат: mssql://user:pass@host:port/db

function parseMssqlUrl(raw: string): mssql.config {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(
      "LEGACY_1C_DB_URL is not a valid URL (expected mssql://user:pass@host:port/db)",
    );
  }
  if (u.protocol !== "mssql:") {
    throw new Error(
      `LEGACY_1C_DB_URL must start with mssql:// (got "${u.protocol}")`,
    );
  }
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!database) {
    throw new Error("LEGACY_1C_DB_URL is missing the database name (path)");
  }
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    server: u.hostname,
    port: u.port ? Number(u.port) : 1433,
    database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      // 1С datetime поля можуть мати дати поза JS-діапазоном лише у крайніх кейсах;
      // mssql повертає Date — пропускаємо як є (див. TODO про year-offset нижче).
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 120000,
  };
}

// ─── Hex-ключі для _IDRRef (binary(16)) ───────────────────────────────────────
// mssql повертає binary(16) як Node Buffer. Ключ словника = lower-case hex 16
// байт БЕЗ перестановки. ГОЛОВНЕ — однакова конвертація і коли зберігаємо
// _IDRRef каталогу, і коли читаємо FK-колонку документа.

function bufToHex(v: unknown): string | null {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) {
    // Порожнє посилання у 1С = 16 нульових байт.
    if (v.length === 0 || v.every((b) => b === 0)) return null;
    return v.toString("hex").toLowerCase();
  }
  // mssql інколи віддає binary як hex-рядок (залежно від драйвера/конфігу).
  if (typeof v === "string") {
    const s = v.startsWith("0x") ? v.slice(2) : v;
    const norm = s.toLowerCase();
    if (/^0+$/.test(norm)) return null;
    return norm;
  }
  return null;
}

// ─── Конвертація значень ──────────────────────────────────────────────────────

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  return String(v);
}

function asTrimmed(v: unknown): string {
  return asString(v) ?? "";
}

function asNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asNumberOr(v: unknown, fallback: number): number {
  return asNumber(v) ?? fallback;
}

// Prisma Decimal-поля краще приймати рядком, щоб уникнути float-дрейфу.
function asDecimalString(v: unknown): string | null {
  const n = asNumber(v);
  return n == null ? null : String(n);
}

// 1С `_Marked` / прапорцеві поля = binary(1). mssql → Buffer/number.
function asBool(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (Buffer.isBuffer(v)) return v.some((b) => b !== 0);
  if (typeof v === "string") return v !== "" && v !== "0" && v !== "0x00";
  return false;
}

function asDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) {
    // TODO(year-offset): окремі 1С-бази зміщують рік (base-year quirk). Поки
    // пропускаємо `_Date_Time` як є — user звіряє sample у --dry-run і за потреби
    // вмикає корекцію тут. Дати поза розумним діапазоном (рік < 1980) → null.
    const y = v.getUTCFullYear();
    if (y < 1980 || y > 2100) return null;
    return v;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Лічильники звірки ────────────────────────────────────────────────────────

interface Recon {
  entity: string;
  sourceRows: number;
  written: number;
  skipped: number;
  errors: number;
  unresolved: number;
}

function newRecon(entity: string): Recon {
  return {
    entity,
    sourceRows: 0,
    written: 0,
    skipped: 0,
    errors: 0,
    unresolved: 0,
  };
}

// Перші ~10 помилок логуються детально, решта рахується.
class ErrorSink {
  private logged = 0;
  private readonly recon: Recon;
  private readonly entity: string;
  constructor(recon: Recon, entity: string) {
    this.recon = recon;
    this.entity = entity;
  }
  record(rowKey: string, e: unknown): void {
    this.recon.errors++;
    if (this.logged < 10) {
      this.logged++;
      warn(`${this.entity} row [${rowKey}]: ${errMsg(e)}`);
    } else if (this.logged === 10) {
      this.logged++;
      warn(`${this.entity}: further row errors suppressed (counting only).`);
    }
  }
}

// ─── Стрімінговий читач MSSQL (пагінація) ─────────────────────────────────────
// ORDER BY _IDRRef OFFSET/FETCH (MSSQL 2012+). Для VT-таблиць (без _IDRRef)
// сортуємо за first column (передається orderBy).

async function* streamTable(
  pool: mssql.ConnectionPool,
  table: string,
  columns: string[],
  opts: {
    batch: number;
    limit: number | null;
    // Колонки сортування. ВАЖЛИВО для OFFSET/FETCH: щоб не дублювати/не
    // пропускати рядки на межах сторінок, порядок має бути детермінованим —
    // для не-унікальних ключів передаємо складений порядок (напр. period+recorder).
    orderBy: string[];
    where?: string;
    params?: Record<string, unknown>;
  },
): AsyncGenerator<Record<string, unknown>[], void, unknown> {
  const colList = columns.map((c) => `[${c}]`).join(", ");
  const orderClause = opts.orderBy.map((c) => `[${c}]`).join(", ");
  const whereClause = opts.where ? ` WHERE ${opts.where}` : "";
  let offset = 0;
  let yielded = 0;

  for (;;) {
    const remaining = opts.limit == null ? opts.batch : opts.limit - yielded;
    if (remaining <= 0) return;
    const fetch = Math.min(opts.batch, remaining);

    const req = pool.request();
    if (opts.params) {
      for (const [k, val] of Object.entries(opts.params)) {
        req.input(k, val);
      }
    }
    req.input("off", mssql.Int, offset);
    req.input("fetch", mssql.Int, fetch);

    const sql =
      `SELECT ${colList} FROM [${table}]${whereClause} ` +
      `ORDER BY ${orderClause} ` +
      `OFFSET @off ROWS FETCH NEXT @fetch ROWS ONLY`;

    const result = await req.query<Record<string, unknown>>(sql);
    const rows = result.recordset ?? [];
    if (rows.length === 0) return;

    yield rows;
    yielded += rows.length;
    offset += rows.length;
    if (rows.length < fetch) return;
  }
}

async function countTable(
  pool: mssql.ConnectionPool,
  table: string,
  where?: string,
  params?: Record<string, unknown>,
): Promise<number> {
  const req = pool.request();
  if (params) {
    for (const [k, val] of Object.entries(params)) req.input(k, val);
  }
  const whereClause = where ? ` WHERE ${where}` : "";
  const result = await req.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM [${table}]${whereClause}`,
  );
  return result.recordset?.[0]?.n ?? 0;
}

// ─── Контекст імпорту (словники hex → наш id) ─────────────────────────────────

interface DictEntry {
  id: string;
  code1C: string | null;
}

interface ImportContext {
  args: CliArgs;
  src: mssql.ConnectionPool;
  prisma: PrismaClient;
  // hex(_IDRRef) → { наш id, code1C } для FK-резолву
  products: Map<string, DictEntry>;
  customers: Map<string, DictEntry>;
  lots: Map<string, DictEntry>;
  orders: Map<string, DictEntry>;
  sales: Map<string, DictEntry>;
  routeSheets: Map<string, DictEntry>;
  // ШК для лота: hex(характеристики) → перший штрихкод
  lotBarcodeByCharHex: Map<string, string>;
  // довідники: hex(_IDRRef) → _Description / code
  cityNames: Map<string, string>;
  regionNames: Map<string, string>;
  priceTypeCodes: Map<string, string>; // hex → _Code (= наш Price.priceType)
}

// Чи робимо реальні записи (НЕ dry-run).
function willWrite(ctx: ImportContext): boolean {
  return !ctx.args.dryRun;
}

// ─── Дрібний довідник: hex → _Description (для city/region) ────────────────────

async function loadDictNames(
  pool: mssql.ConnectionPool,
  table: string,
  valueCol: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const result = await pool
      .request()
      .query<Record<string, unknown>>(
        `SELECT [_IDRRef], [${valueCol}] FROM [${table}]`,
      );
    for (const row of result.recordset ?? []) {
      const hex = bufToHex(row["_IDRRef"]);
      const val = asString(row[valueCol]);
      if (hex && val) map.set(hex, val);
    }
  } catch (e) {
    warn(`loadDictNames(${table}): ${errMsg(e)} — пропускаю довідник.`);
  }
  return map;
}

// ─── Завантаження вже наявних наших записів (для FK-резолву у dry-run теж) ─────
// Підтягуємо id за code1C з ЦІЛЬОВОЇ бази (read-only ок навіть у dry-run).

async function loadExistingByCode1C(
  prisma: PrismaClient,
  model: "product" | "customer" | "order" | "sale" | "routeSheet",
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    let rows: { id: string; code1C: string | null }[] = [];
    if (model === "product") {
      rows = await prisma.product.findMany({
        select: { id: true, code1C: true },
      });
    } else if (model === "customer") {
      rows = await prisma.customer.findMany({
        select: { id: true, code1C: true },
      });
    } else if (model === "order") {
      rows = await prisma.order.findMany({
        select: { id: true, code1C: true },
      });
    } else if (model === "sale") {
      rows = await prisma.sale.findMany({
        select: { id: true, code1C: true },
      });
    } else if (model === "routeSheet") {
      rows = await prisma.routeSheet.findMany({
        select: { id: true, code1C: true },
      });
    }
    for (const r of rows) {
      if (r.code1C) out.set(r.code1C, r.id);
    }
  } catch (e) {
    warn(`loadExistingByCode1C(${model}): ${errMsg(e)}`);
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// СУТНОСТІ
// ════════════════════════════════════════════════════════════════════════════

// ─── 1. Контрагенти → Customer (+ дзеркало MgrClient) ─ _Reference66 ──────────

const CUSTOMER_COLS = [
  "_IDRRef",
  "_Marked",
  "_Folder",
  "_Code",
  "_Description",
  "_Fld6740", // НомерТелефона
  "_Fld7593", // ЕМейл
  "_Fld6812RRef", // Город (FK)
  "_Fld6813RRef", // Область (FK)
  "_Fld7524", // Улица
  "_Fld7525", // Дом
  "_Fld7300", // НомерВідділенняНП
  "_Fld7521", // Геолокация
  "_Fld7519", // НаименованиеТТ
  "_Fld7522", // ОбъмЗаМесяц
  "_Fld7640", // КоличествоДнейОтПоследнейПокупки
  "_Fld7760", // ДатаПоследнейПокупки
  "_Fld6049", // Комментарий
];

async function importCustomers(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("customers");
  const sink = new ErrorSink(recon, "customers");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference66");
  log(`customers: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Reference66", CUSTOMER_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const code1C = asString(row["_Code"]);
      // 1С `_Folder`: 1 = елемент, 0 = група (ІНВЕРСНА логіка 1С!).
      // Пропускаємо групи (папки), імпортуємо елементи.
      if (!asBool(row["_Folder"])) {
        recon.skipped++;
        continue;
      }
      if (!code1C) {
        recon.skipped++;
        continue;
      }

      const name = asTrimmed(row["_Description"]) || code1C;
      const phone = asString(row["_Fld6740"]);
      const email = asString(row["_Fld7593"]);
      const cityHex = bufToHex(row["_Fld6812RRef"]);
      const regionHex = bufToHex(row["_Fld6813RRef"]);
      const city = cityHex ? (ctx.cityNames.get(cityHex) ?? null) : null;
      const region = regionHex ? (ctx.regionNames.get(regionHex) ?? null) : null;
      const notes = asString(row["_Fld6049"]);

      // Заповнюємо резолв-словник hex→{id,code1C} для документів. У dry-run id
      // лишається "(pending)" (зв'язок усе одно є за hex; документи нічого не пишуть).
      try {
        let custId = "(pending)";
        if (willWrite(ctx)) {
          const customer = await prisma.customer.upsert({
            where: { code1C },
            create: { code1C, name, phone, email, city, notes },
            update: { name, phone, email, city, notes },
          });
          custId = customer.id;

          // Дзеркало у MgrClient (повна менеджерська картка). Борг=0 на першому
          // проході (реальні залишки — окремий прохід по _AccumRg, див. план §11.Б).
          await prisma.mgrClient.upsert({
            where: { code1C },
            create: {
              code1C,
              uid1C: hex,
              name,
              phonePrimary: phone,
              city,
              region,
              street: asString(row["_Fld7524"]),
              house: asString(row["_Fld7525"]),
              novaPoshtaBranch: asString(row["_Fld7300"]),
              geolocation: asString(row["_Fld7521"]),
              tradePointName: asString(row["_Fld7519"]),
              monthlyVolume: asDecimalString(row["_Fld7522"]),
              daysSinceLastPurchase: asNumber(row["_Fld7640"]),
              lastPurchaseAt: asDate(row["_Fld7760"]),
            },
            update: {
              uid1C: hex,
              name,
              phonePrimary: phone,
              city,
              region,
              street: asString(row["_Fld7524"]),
              house: asString(row["_Fld7525"]),
              novaPoshtaBranch: asString(row["_Fld7300"]),
              geolocation: asString(row["_Fld7521"]),
              tradePointName: asString(row["_Fld7519"]),
              monthlyVolume: asDecimalString(row["_Fld7522"]),
              daysSinceLastPurchase: asNumber(row["_Fld7640"]),
              lastPurchaseAt: asDate(row["_Fld7760"]),
            },
          });
        }
        recon.written++;
        if (hex) ctx.customers.set(hex, { id: custId, code1C });
      } catch (e) {
        sink.record(code1C ?? hex ?? "?", e);
      }
    }
    log(`customers: processed ${recon.written + recon.skipped + recon.errors}`);
  }

  return recon;
}

// ─── 2. Номенклатура → Product ─ _Reference76 ─────────────────────────────────
// Наша схема вимагає categoryId (NOT NULL) + quality + country + slug (unique).
// 1С-Номенклатура НЕ має quality/season/gender (вони на рівні рядка реалізації).
// Стратегія: новий товар → дефолтна категорія «imported-1c» + дефолти; існуючий
// (за code1C) → лише оновити name/videoUrl/averageWeight/description, НЕ чіпати
// category/quality (щоб не зламати каталог магазину).

async function ensureImportCategoryId(
  ctx: ImportContext,
): Promise<string | null> {
  if (!willWrite(ctx)) return "(pending)";
  const slug = "imported-1c";
  const existing = await ctx.prisma.category.findUnique({ where: { slug } });
  if (existing) return existing.id;
  const created = await ctx.prisma.category.create({
    data: { slug, name: "Імпортовано з 1С", parentId: null },
  });
  return created.id;
}

const PRODUCT_COLS = [
  "_IDRRef",
  "_Marked",
  "_Folder",
  "_Code",
  "_Description",
  "_Fld6255", // Артикул
  "_Fld6916", // СсылкаНаYouTube
  "_Fld7365", // СреднийВес (текст)
  "_Fld6257", // Весовой (binary)
  "_Fld7696", // ВідображатиВШтуках (binary)
  "_Fld6283", // ДополнительноеОписание
  "_Fld7392", // ДатаСозданияЭлемента
];

function parseAverageWeight(v: unknown): number | null {
  const s = asString(v);
  if (!s) return null;
  const m = s.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

async function importProducts(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("products");
  const sink = new ErrorSink(recon, "products");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference76");
  log(`products: source rows = ${recon.sourceRows}`);

  const importCategoryId = await ensureImportCategoryId(ctx);
  const usedSlugs = new Set<string>();
  if (willWrite(ctx)) {
    const all = await prisma.product.findMany({ select: { slug: true } });
    for (const p of all) usedSlugs.add(p.slug);
  }

  for await (const rows of streamTable(src, "_Reference76", PRODUCT_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const code1C = asString(row["_Code"]);
      // 1С `_Folder`: 1 = елемент, 0 = група (ІНВЕРСНА логіка 1С!).
      // Пропускаємо групи (папки), імпортуємо елементи.
      if (!asBool(row["_Folder"])) {
        recon.skipped++;
        continue;
      }
      if (!code1C) {
        recon.skipped++;
        continue;
      }

      const name = asTrimmed(row["_Description"]) || code1C;
      const articleCode = asString(row["_Fld6255"]);
      const videoUrl = asString(row["_Fld6916"]);
      const averageWeight = parseAverageWeight(row["_Fld7365"]);
      const description = asTrimmed(row["_Fld6283"]);
      const isPiece = asBool(row["_Fld7696"]) || !asBool(row["_Fld6257"]);
      const priceUnit = isPiece ? "piece" : "kg";

      try {
        let prodId = "(pending)";
        if (willWrite(ctx) && importCategoryId) {
          const existing = await prisma.product.findUnique({
            where: { code1C },
            select: { id: true },
          });
          if (existing) {
            // Існуючий товар магазину — оновлюємо лише безпечні поля.
            await prisma.product.update({
              where: { id: existing.id },
              data: {
                name,
                articleCode,
                videoUrl,
                averageWeight: averageWeight ?? undefined,
                description: description || undefined,
              },
            });
            prodId = existing.id;
          } else {
            const slug = makeUniqueSlug(name, code1C, usedSlugs);
            const created = await prisma.product.create({
              data: {
                code1C,
                articleCode,
                name,
                slug,
                categoryId: importCategoryId,
                description,
                quality: "mix",
                country: "germany",
                season: "",
                priceUnit,
                averageWeight,
                videoUrl,
                inStock: false,
              },
              select: { id: true },
            });
            prodId = created.id;
          }
        }
        recon.written++;
        if (hex) ctx.products.set(hex, { id: prodId, code1C });
      } catch (e) {
        sink.record(code1C ?? hex ?? "?", e);
      }
    }
    log(`products: processed ${recon.written + recon.skipped + recon.errors}`);
  }

  return recon;
}

function slugify(s: string): string {
  // Транслітерація укр/рос → латиниця для slug. Спрощена — для імпортованих
  // товарів slug унікалізується суфіксом code1C, тож головне детермінованість.
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "h",
    ґ: "g",
    д: "d",
    е: "e",
    є: "ie",
    ж: "zh",
    з: "z",
    и: "y",
    і: "i",
    ї: "i",
    й: "i",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "kh",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "shch",
    ь: "",
    ю: "iu",
    я: "ia",
    ъ: "",
    ы: "y",
    э: "e",
    ё: "e",
  };
  return s
    .toLowerCase()
    .replace(/[а-яёіїєґъыэ]/g, (ch) => map[ch] ?? "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function makeUniqueSlug(
  name: string,
  code1C: string,
  used: Set<string>,
): string {
  const base = slugify(name) || "product";
  const codeSlug = code1C.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let candidate = `${base}-${codeSlug}`.replace(/-+/g, "-").slice(0, 90);
  if (!candidate || candidate === "-") candidate = `product-${codeSlug}`;
  let i = 2;
  let unique = candidate;
  while (used.has(unique)) {
    unique = `${candidate}-${i++}`;
  }
  used.add(unique);
  return unique;
}

// ─── 3. Штрихкоди → мапа характеристика(лот) → barcode ─ _InfoRg5249 ─────────
// Будуємо лише ПАМ'ЯТЬ-мапу (Barcode-рядки створюються разом з лотами у §4,
// бо Barcode.lotId — обов'язковий FK). _Fld5254RRef → ХарактеристикаНоменклатуры.

const BARCODE_COLS = [
  "_Fld5250", // Штрихкод
  "_Fld5254RRef", // ХарактеристикаНоменклатуры (= лот)
];

async function importBarcodes(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("barcodes");
  const { args, src } = ctx;

  recon.sourceRows = await countTable(src, "_InfoRg5249");
  log(`barcodes: source rows = ${recon.sourceRows}`);

  // _InfoRg5249 не має _IDRRef — сортуємо за _Fld5254RRef (характеристика).
  for await (const rows of streamTable(src, "_InfoRg5249", BARCODE_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_Fld5254RRef", "_Fld5250"],
  })) {
    for (const row of rows) {
      const barcode = asString(row["_Fld5250"]);
      const charHex = bufToHex(row["_Fld5254RRef"]);
      if (!barcode || !charHex) {
        recon.skipped++;
        continue;
      }
      // Беремо ПЕРШИЙ штрихкод на характеристику (1 лот може мати кілька ШК).
      if (!ctx.lotBarcodeByCharHex.has(charHex)) {
        ctx.lotBarcodeByCharHex.set(charHex, barcode);
        recon.written++; // "written" тут = додано у мапу
      } else {
        recon.skipped++;
      }
    }
  }
  log(`barcodes: mapped ${ctx.lotBarcodeByCharHex.size} char→barcode`);
  return recon;
}

// ─── 4. ХарактеристикиНоменклатуры → Lot (+Barcode) ─ _Reference113 ──────────
// Lot.barcode обов'язковий + unique. Беремо з мапи §5; якщо нема → синтетичний
// `L-<hex>`. priceEur/quantity на характеристиці немає → quantity=1, priceEur=0
// (per-lot ціни — окремий прохід по регістру цін; план §6).

const LOT_COLS = [
  "_IDRRef",
  "_Marked",
  "_OwnerIDRRef", // Владелец → Номенклатура
  "_Description",
  "_Fld6607", // Вага
  "_Fld6814", // Открыт
  "_Fld7351", // Целевой
  "_Fld7439", // СсылкаНаYouTube
  "_Fld7440", // Описание
  "_Fld7693", // ДатаПоставки
  "_Fld7727", // СекторНаСкладі
  "_Fld7728", // Коментар
];

async function importLots(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("lots");
  const sink = new ErrorSink(recon, "lots");
  const { args, src, prisma } = ctx;

  // Лоти потребують Product-словник. Якщо порожній (запуск --entity lots
  // окремо) — підтягуємо наявні Product за code1C неможливо (треба hex);
  // тому при ізольованому запуску спершу будуємо словник з 1С Номенклатури.
  if (ctx.products.size === 0) {
    warn("lots: продуктовий словник порожній — підвантажую з 1С Номенклатури.");
    await buildProductDictFromSource(ctx);
  }
  // Якщо мапи штрихкодів немає — будуємо її.
  if (ctx.lotBarcodeByCharHex.size === 0) {
    await importBarcodes(ctx);
  }

  recon.sourceRows = await countTable(src, "_Reference113");
  log(`lots: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Reference113", LOT_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const ownerHex = bufToHex(row["_OwnerIDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const product = ownerHex ? ctx.products.get(ownerHex) : null;
      if (!product) {
        // Лот без резолвленого товару не вставити (productId NOT NULL).
        recon.unresolved++;
        recon.skipped++;
        continue;
      }

      const barcode = ctx.lotBarcodeByCharHex.get(hex) ?? `L-${hex}`;
      const weight = asNumberOr(row["_Fld6607"], 0);
      const isOpen = asBool(row["_Fld6814"]);
      const isTarget = asBool(row["_Fld7351"]);
      const videoUrl = asString(row["_Fld7439"]);
      const description = asString(row["_Fld7440"]);
      const arrivalDate = asDate(row["_Fld7693"]);
      const sector = asString(row["_Fld7727"]);
      const comment = asString(row["_Fld7728"]);
      const status = asBool(row["_Marked"]) ? "sold" : "free";

      try {
        let lotId = "(pending)";
        if (willWrite(ctx)) {
          const lot = await prisma.lot.upsert({
            where: { barcode },
            create: {
              productId: product.id,
              barcode,
              weight,
              quantity: 1,
              status,
              priceEur: 0,
              videoUrl,
              isTarget,
              isOpen,
              arrivalDate,
              sector,
              comment,
              description,
            },
            update: {
              productId: product.id,
              weight,
              status,
              videoUrl,
              isTarget,
              isOpen,
              arrivalDate,
              sector,
              comment,
              description,
            },
            select: { id: true },
          });
          lotId = lot.id;

          // Усі штрихкоди характеристики (поки що лише основний з мапи).
          await prisma.barcode.upsert({
            where: { code: barcode },
            create: { lotId: lot.id, code: barcode },
            update: { lotId: lot.id },
          });
        }
        recon.written++;
        ctx.lots.set(hex, { id: lotId, code1C: barcode });
      } catch (e) {
        sink.record(barcode, e);
      }
    }
    log(`lots: processed ${recon.written + recon.skipped + recon.errors}`);
  }

  return recon;
}

// Побудувати hex→Product-словник напряму з 1С (для ізольованого --entity).
async function buildProductDictFromSource(ctx: ImportContext): Promise<void> {
  const existing = await loadExistingByCode1C(ctx.prisma, "product");
  for await (const rows of streamTable(
    ctx.src,
    "_Reference76",
    ["_IDRRef", "_Code"],
    { batch: 2000, limit: null, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const code1C = asString(row["_Code"]);
      if (!hex || !code1C) continue;
      const id = existing.get(code1C) ?? "(pending)";
      ctx.products.set(hex, { id, code1C });
    }
  }
}

// ─── 5. ЦеныНоменклатуры → Price ─ _InfoRg5225 ────────────────────────────────
// Періодичний регістр. Беремо лише ціни на рівні ТОВАРУ (без характеристики);
// per-lot ціни (з _Fld5228RRef) поки пропускаємо (план §6). Імпортуємо КОЖЕН
// активний рух як Price з validFrom=_Period (повна історія; усі validTo=null).
// TODO: окремий пост-крок може закрити старіші validTo та лишити лише останню
// чинну ціну на (товар, тип цін), якщо знадобиться. На першому проході — як є.

const PRICE_COLS = [
  "_Period",
  "_RecorderRRef", // реєстратор (тай-брейкер сортування)
  "_LineNo", // № рядка реєстратора (тай-брейкер)
  "_Active",
  "_Fld5226RRef", // ТипЦен
  "_Fld5227RRef", // Номенклатура
  "_Fld5228RRef", // Характеристика (якщо є → per-lot, пропуск)
  "_Fld5230", // Цена
];

async function importPrices(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("prices");
  const sink = new ErrorSink(recon, "prices");
  const { args, src, prisma } = ctx;

  if (ctx.products.size === 0) {
    warn("prices: продуктовий словник порожній — підвантажую з 1С.");
    await buildProductDictFromSource(ctx);
  }
  if (ctx.priceTypeCodes.size === 0) {
    ctx.priceTypeCodes = await loadDictNames(src, "_Reference105", "_Code");
  }

  // _Active = binary(1); 0x01 = чинний рух регістру.
  const activeWhere = "_Active = 0x01";
  recon.sourceRows = await countTable(src, "_InfoRg5225", activeWhere);
  log(`prices: active source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_InfoRg5225", PRICE_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_Period", "_RecorderRRef", "_LineNo"],
    where: activeWhere,
  })) {
    for (const row of rows) {
      // Per-lot ціна (характеристика заповнена) — поки пропускаємо.
      if (bufToHex(row["_Fld5228RRef"]) != null) {
        recon.skipped++;
        continue;
      }
      const prodHex = bufToHex(row["_Fld5227RRef"]);
      const product = prodHex ? ctx.products.get(prodHex) : null;
      if (!product) {
        recon.unresolved++;
        recon.skipped++;
        continue;
      }
      const ptHex = bufToHex(row["_Fld5226RRef"]);
      const priceType =
        (ptHex ? ctx.priceTypeCodes.get(ptHex) : null) ?? "wholesale";
      const amount = asNumber(row["_Fld5230"]);
      const validFrom = asDate(row["_Period"]) ?? new Date();
      if (amount == null) {
        recon.skipped++;
        continue;
      }

      try {
        if (willWrite(ctx) && product.id !== "(pending)") {
          // Idempotency: (productId, priceType, validFrom). Видаляємо існуючий
          // запис із тим самим ключем і вставляємо заново (повторний прогон ок).
          await prisma.price.deleteMany({
            where: { productId: product.id, priceType, validFrom },
          });
          await prisma.price.create({
            data: {
              productId: product.id,
              priceType,
              currency: "EUR",
              amount,
              validFrom,
            },
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(`${product.code1C}/${priceType}`, e);
      }
    }
    log(`prices: processed ${recon.written + recon.skipped + recon.errors}`);
  }

  return recon;
}

// ─── 6. ЗаказПокупателя → Order + OrderItem ─ _Document130 / VT1098 ──────────

const ORDER_COLS = [
  "_IDRRef",
  "_Number",
  "_Date_Time",
  "_Posted",
  "_Fld1075RRef", // Контрагент
  "_Fld1085", // СуммаДокумента
  "_Fld1077", // КурсВзаиморасчетов
  "_Fld1074", // Комментарий
  "_Fld6886RRef", // ТорговийАгент
  "_Fld7326", // Наложка
  "_Fld6914", // Закрытие
];

const ORDER_ITEM_COLS = [
  "_Document130_IDRRef",
  "_LineNo1099",
  "_Fld1105RRef", // Номенклатура
  "_Fld1112RRef", // Характеристика (лот)
  "_Fld1102", // Количество
  "_Fld1110", // Сумма (line total)
  "_Fld6618", // ЦенаПродажиВес
];

async function importOrders(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("orders");
  const sink = new ErrorSink(recon, "orders");
  const { args, src, prisma } = ctx;

  await ensureCustomerDict(ctx);
  await ensureProductLotDicts(ctx);

  const where = args.since ? "_Date_Time >= @since" : undefined;
  const params = args.since ? { since: args.since } : undefined;

  recon.sourceRows = await countTable(src, "_Document130", where, params);
  log(`orders: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Document130", ORDER_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
    where,
    params,
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const code1C = asString(row["_Number"]);
      if (!hex || !code1C) {
        recon.skipped++;
        continue;
      }
      const custHex = bufToHex(row["_Fld1075RRef"]);
      const customer = custHex ? ctx.customers.get(custHex) : null;
      // Контрагент не знайдено у словнику → замовлення без власника не вставити.
      if (!customer) {
        recon.unresolved++;
        recon.skipped++;
        continue;
      }
      // У dry-run id ще "(pending)" — це НЕ unresolved (зв'язок є), просто не пишемо.
      if (willWrite(ctx) && customer.id === "(pending)") {
        recon.skipped++;
        continue;
      }

      const exchangeRate = asNumberOr(row["_Fld1077"], 0);
      const totalDoc = asNumberOr(row["_Fld1085"], 0);
      const posted = asBool(row["_Posted"]);
      const createdAt = asDate(row["_Date_Time"]);
      const notes = asString(row["_Fld1074"]);
      const closed = asBool(row["_Fld6914"]);

      // Рядки замовлення.
      const items = await loadOrderItems(ctx, hex);

      try {
        if (willWrite(ctx)) {
          await prisma.$transaction(async (tx) => {
            const order = await tx.order.upsert({
              where: { code1C },
              create: {
                code1C,
                customerId: customer.id,
                status: posted ? "posted" : "draft",
                totalEur: totalDoc,
                totalUah: exchangeRate > 0 ? totalDoc * exchangeRate : 0,
                exchangeRate,
                notes,
                archived: posted,
                closedAt: closed ? (createdAt ?? new Date()) : null,
                exportTo1C: false,
                ...(createdAt ? { createdAt } : {}),
              },
              update: {
                customerId: customer.id,
                status: posted ? "posted" : "draft",
                totalEur: totalDoc,
                totalUah: exchangeRate > 0 ? totalDoc * exchangeRate : 0,
                exchangeRate,
                notes,
                archived: posted,
                closedAt: closed ? (createdAt ?? new Date()) : null,
              },
              select: { id: true },
            });
            // Рядки: видалити+вставити (idempotent повторний прогон).
            await tx.orderItem.deleteMany({ where: { orderId: order.id } });
            if (items.length > 0) {
              await tx.orderItem.createMany({
                data: items.map((it) => ({
                  orderId: order.id,
                  productId: it.productId,
                  lotId: it.lotId,
                  priceEur: it.priceEur,
                  weight: it.weight,
                  quantity: it.quantity,
                })),
              });
            }
          });
        }
        // У dry-run рахуємо як "would write" (фактичний запис — вище під гардом).
        recon.written++;
        ctx.orders.set(hex, { id: "(pending)", code1C });
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(`orders: processed ${recon.written + recon.skipped + recon.errors}`);
  }

  return recon;
}

interface ResolvedItem {
  productId: string;
  lotId: string | null;
  priceEur: number;
  weight: number;
  quantity: number;
}

async function loadOrderItems(
  ctx: ImportContext,
  orderHex: string,
): Promise<ResolvedItem[]> {
  const out: ResolvedItem[] = [];
  const orderBuf = Buffer.from(orderHex, "hex");
  for await (const rows of streamTable(
    ctx.src,
    "_Document130_VT1098",
    ORDER_ITEM_COLS,
    {
      batch: 1000,
      limit: null,
      orderBy: ["_LineNo1099"],
      where: "_Document130_IDRRef = @owner",
      params: { owner: orderBuf },
    },
  )) {
    for (const row of rows) {
      const prodHex = bufToHex(row["_Fld1105RRef"]);
      const product = prodHex ? ctx.products.get(prodHex) : null;
      if (!product || product.id === "(pending)") continue;
      const lotHex = bufToHex(row["_Fld1112RRef"]);
      const lot = lotHex ? ctx.lots.get(lotHex) : null;
      const lotId = lot && lot.id !== "(pending)" ? lot.id : null;
      out.push({
        productId: product.id,
        lotId,
        priceEur: asNumberOr(row["_Fld1110"], 0),
        weight: asNumberOr(row["_Fld1102"], 0),
        quantity: 1,
      });
    }
  }
  return out;
}

// ─── 7. РеализацияТоваровУслуг → Sale + SaleItem ─ _Document189 / VT3525 ─────

const SALE_COLS = [
  "_IDRRef",
  "_Number",
  "_Date_Time",
  "_Posted",
  "_Fld3493RRef", // Контрагент
  "_Fld3501", // СуммаДокумента
  "_Fld7299", // КурсEUR
  "_Fld7298", // КурсUSD
  "_Fld6887RRef", // ТорговийАгент
  "_Fld6729RRef", // МаршрутныйЛист
  "_Fld7327", // Наложка
  "_Fld7775", // СумаОплатиНаложкою
  "_Fld7332", // НомерВідділенняНП
  "_Fld7768", // НомерЭкспрессНакладной
  "_Fld3489", // Комментарий
];

const SALE_ITEM_COLS = [
  "_Document189_IDRRef",
  "_LineNo3526",
  "_Fld3533RRef", // Номенклатура
  "_Fld3540RRef", // Характеристика (лот)
  "_Fld3530", // Количество
  "_Fld3541", // Цена
  "_Fld6621", // ЦенаПродажиВес
  "_Fld3538", // Сумма (line total)
];

async function importSales(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("sales");
  const sink = new ErrorSink(recon, "sales");
  const { args, src, prisma } = ctx;

  await ensureCustomerDict(ctx);
  await ensureProductLotDicts(ctx);

  const where = args.since ? "_Date_Time >= @since" : undefined;
  const params = args.since ? { since: args.since } : undefined;

  recon.sourceRows = await countTable(src, "_Document189", where, params);
  log(`sales: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Document189", SALE_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
    where,
    params,
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const code1C = asString(row["_Number"]);
      if (!hex || !code1C) {
        recon.skipped++;
        continue;
      }
      const custHex = bufToHex(row["_Fld3493RRef"]);
      const customer = custHex ? ctx.customers.get(custHex) : null;
      if (!customer) {
        recon.unresolved++;
        recon.skipped++;
        continue;
      }
      if (willWrite(ctx) && customer.id === "(pending)") {
        recon.skipped++;
        continue;
      }

      const rateEur = asNumberOr(row["_Fld7299"], 0);
      const rateUsd = asNumberOr(row["_Fld7298"], 0);
      const totalDoc = asNumberOr(row["_Fld3501"], 0);
      const posted = asBool(row["_Posted"]);
      const createdAt = asDate(row["_Date_Time"]);
      const notes = asString(row["_Fld3489"]);
      const cod = asBool(row["_Fld7327"]);
      const codAmount = asNumber(row["_Fld7775"]);
      const npBranch = asString(row["_Fld7332"]);
      const waybill = asString(row["_Fld7768"]);

      const items = await loadSaleItems(ctx, hex);

      try {
        if (willWrite(ctx)) {
          await prisma.$transaction(async (tx) => {
            const sale = await tx.sale.upsert({
              where: { code1C },
              create: {
                code1C,
                customerId: customer.id,
                status: posted ? "posted" : "draft",
                totalEur: totalDoc,
                totalUah: rateEur > 0 ? totalDoc * rateEur : 0,
                exchangeRateEur: rateEur,
                exchangeRateUsd: rateUsd,
                cashOnDelivery: cod,
                codAmountUah: codAmount,
                novaPoshtaBranch: npBranch,
                expressWaybill: waybill,
                notes,
                archived: posted,
                exportTo1C: false,
                ...(createdAt ? { createdAt } : {}),
              },
              update: {
                customerId: customer.id,
                status: posted ? "posted" : "draft",
                totalEur: totalDoc,
                totalUah: rateEur > 0 ? totalDoc * rateEur : 0,
                exchangeRateEur: rateEur,
                exchangeRateUsd: rateUsd,
                cashOnDelivery: cod,
                codAmountUah: codAmount,
                novaPoshtaBranch: npBranch,
                expressWaybill: waybill,
                notes,
                archived: posted,
              },
              select: { id: true },
            });
            await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
            if (items.length > 0) {
              await tx.saleItem.createMany({
                data: items.map((it) => ({
                  saleId: sale.id,
                  productId: it.productId,
                  lotId: it.lotId,
                  barcode: it.barcode,
                  pricePerKg: it.pricePerKg,
                  weight: it.weight,
                  quantity: it.quantity,
                  priceEur: it.priceEur,
                })),
              });
            }
          });
        }
        recon.written++;
        ctx.sales.set(hex, { id: "(pending)", code1C });
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(`sales: processed ${recon.written + recon.skipped + recon.errors}`);
  }

  return recon;
}

interface ResolvedSaleItem {
  productId: string;
  lotId: string | null;
  barcode: string | null;
  pricePerKg: number;
  weight: number;
  quantity: number;
  priceEur: number;
}

async function loadSaleItems(
  ctx: ImportContext,
  saleHex: string,
): Promise<ResolvedSaleItem[]> {
  const out: ResolvedSaleItem[] = [];
  const ownerBuf = Buffer.from(saleHex, "hex");
  for await (const rows of streamTable(
    ctx.src,
    "_Document189_VT3525",
    SALE_ITEM_COLS,
    {
      batch: 1000,
      limit: null,
      orderBy: ["_LineNo3526"],
      where: "_Document189_IDRRef = @owner",
      params: { owner: ownerBuf },
    },
  )) {
    for (const row of rows) {
      const prodHex = bufToHex(row["_Fld3533RRef"]);
      const product = prodHex ? ctx.products.get(prodHex) : null;
      if (!product || product.id === "(pending)") continue;
      const lotHex = bufToHex(row["_Fld3540RRef"]);
      const lot = lotHex ? ctx.lots.get(lotHex) : null;
      const lotId = lot && lot.id !== "(pending)" ? lot.id : null;
      const barcode =
        lotHex != null ? (ctx.lotBarcodeByCharHex.get(lotHex) ?? null) : null;
      const pricePerKg =
        asNumber(row["_Fld6621"]) ?? asNumberOr(row["_Fld3541"], 0);
      out.push({
        productId: product.id,
        lotId,
        barcode,
        pricePerKg,
        weight: asNumberOr(row["_Fld3530"], 0),
        quantity: 1,
        priceEur: asNumberOr(row["_Fld3538"], 0),
      });
    }
  }
  return out;
}

// ─── 8. ПКО/РКО → MgrCashOrder (income/expense) ─ _Document183 / _Document187 ─
// Контрагент і ДокументОснование — поліморфні (_TYPE/_RTRef/_RRRef). Стратегія
// (план §12.В): читаємо _RRRef→hex, резолвимо проти словника Customer/Sale; якщо
// не знайдено — лишаємо null + рахуємо unresolved (НЕ падаємо).

interface CashOrderFieldMap {
  table: string;
  type: "income" | "expense";
  number: string;
  date: string;
  posted: string;
  customerRRef: string; // поліморфний _Fld..._RRRef
  amount: string;
  rateEur: string;
  rateUsd: string;
  docNumber: string;
  comment: string;
  baseDocRRef: string; // ДокументОснование _Fld..._RRRef
  cashlessAmount: string | null; // тільки ПКО
}

const PKO_MAP: CashOrderFieldMap = {
  table: "_Document183",
  type: "income",
  number: "_Number",
  date: "_Date_Time",
  posted: "_Posted",
  customerRRef: "_Fld3264_RRRef",
  amount: "_Fld3268",
  rateEur: "_Fld7345",
  rateUsd: "_Fld7346",
  docNumber: "_Fld3272",
  comment: "_Fld3278",
  baseDocRRef: "_Fld3279_RRRef",
  cashlessAmount: "_Fld3290",
};

const RKO_MAP: CashOrderFieldMap = {
  table: "_Document187",
  type: "expense",
  number: "_Number",
  date: "_Date_Time",
  posted: "_Posted",
  customerRRef: "_Fld3403_RRRef",
  amount: "_Fld3407",
  rateEur: "_Fld7347",
  rateUsd: "_Fld7348",
  docNumber: "_Fld3416",
  comment: "_Fld3402",
  baseDocRRef: "_Fld3419_RRRef",
  cashlessAmount: null,
};

async function importCashOrders(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("cashorders");
  await ensureCustomerDict(ctx);
  await ensureSaleDict(ctx);
  for (const map of [PKO_MAP, RKO_MAP]) {
    await importCashOrderTable(ctx, map, recon);
  }
  return recon;
}

async function importCashOrderTable(
  ctx: ImportContext,
  map: CashOrderFieldMap,
  recon: Recon,
): Promise<void> {
  const sink = new ErrorSink(recon, `cashorders(${map.type})`);
  const { args, src, prisma } = ctx;

  const cols = [
    "_IDRRef",
    map.number,
    map.date,
    map.posted,
    map.customerRRef,
    map.amount,
    map.rateEur,
    map.rateUsd,
    map.docNumber,
    map.comment,
    map.baseDocRRef,
    ...(map.cashlessAmount ? [map.cashlessAmount] : []),
  ];

  const where = args.since ? `${map.date} >= @since` : undefined;
  const params = args.since ? { since: args.since } : undefined;

  const cnt = await countTable(src, map.table, where, params);
  recon.sourceRows += cnt;
  log(`cashorders(${map.type}): source rows = ${cnt}`);

  for await (const rows of streamTable(src, map.table, cols, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
    where,
    params,
  })) {
    for (const row of rows) {
      const code1C = asString(row[map.number]);
      if (!code1C) {
        recon.skipped++;
        continue;
      }
      // Поліморфний Контрагент: резолв за hex проти Customer-словника.
      const custHex = bufToHex(row[map.customerRRef]);
      const customer = custHex ? ctx.customers.get(custHex) : null;
      if (custHex && !customer) recon.unresolved++;
      // Поліморфний ДокументОснование: пробуємо як реалізацію (Sale).
      const baseHex = bufToHex(row[map.baseDocRRef]);
      const sale = baseHex ? ctx.sales.get(baseHex) : null;

      const amount = asNumberOr(row[map.amount], 0);
      const rateEur = asNumberOr(row[map.rateEur], 0);
      const rateUsd = asNumberOr(row[map.rateUsd], 0);
      const docNumber = asNumber(row[map.docNumber]);
      const comment = asString(row[map.comment]);
      const cashless = map.cashlessAmount
        ? asNumberOr(row[map.cashlessAmount], 0)
        : 0;
      const paidAt = asDate(row[map.date]);
      const customerId =
        customer && customer.id !== "(pending)" ? customer.id : null;
      const saleId = sale && sale.id !== "(pending)" ? sale.id : null;

      try {
        if (willWrite(ctx)) {
          await prisma.mgrCashOrder.upsert({
            where: { code1C },
            create: {
              code1C,
              type: map.type,
              ...(docNumber != null ? { docNumber } : {}),
              customerId,
              saleId,
              amountUah: amount,
              amountUahCashless: cashless,
              rateEur,
              rateUsd,
              archived: asBool(row[map.posted]),
              comment,
              ...(paidAt ? { paidAt } : {}),
            },
            update: {
              type: map.type,
              customerId,
              saleId,
              amountUah: amount,
              amountUahCashless: cashless,
              rateEur,
              rateUsd,
              archived: asBool(row[map.posted]),
              comment,
              ...(paidAt ? { paidAt } : {}),
            },
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(
      `cashorders(${map.type}): processed ${recon.written + recon.skipped + recon.errors}`,
    );
  }
}

// ─── 9. МаршрутныйЛист → RouteSheet (STUB) ─ _Document6630 ───────────────────
// TODO(routesheets): дочірні VT (Заказы/ТоварыЗаказов/Загрузка/Продажи/Расчеты/
// Оплата/Завдання) мають по 10+ _Fld-колонок, чиї бізнес-імена НЕ розкриті
// поіменно у HISTORY_MIGRATION_MAP §10.2 (там сказано декодувати кожен VT
// окремо через recipe). Щоб не імпортувати їх наосліп (ризик зіпсувати дані),
// зараз імпортуємо ЛИШЕ шапку RouteSheet; дочірні VT — наступний раунд після
// поіменного декодування. `--entity routesheets` працює (не падає), але імпортує
// тільки шапки.

const ROUTE_SHEET_COLS = [
  "_IDRRef",
  "_Number",
  "_Date_Time",
  "_Posted",
  "_Fld6636", // ОдометрНачало
  "_Fld6637", // ОдометрКонец
  "_Fld6645", // Комментарий
  "_Fld6646", // СуммаДокумента
  "_Fld6647", // ДатаПриезда
  "_Fld7352", // Архивный
];

async function importRouteSheets(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("routesheets");
  const sink = new ErrorSink(recon, "routesheets");
  const { args, src, prisma } = ctx;

  const where = args.since ? "_Date_Time >= @since" : undefined;
  const params = args.since ? { since: args.since } : undefined;

  recon.sourceRows = await countTable(src, "_Document6630", where, params);
  log(`routesheets: source rows = ${recon.sourceRows} (шапки; VT — TODO)`);

  for await (const rows of streamTable(src, "_Document6630", ROUTE_SHEET_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
    where,
    params,
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const code1C = asString(row["_Number"]);
      if (!hex || !code1C) {
        recon.skipped++;
        continue;
      }
      const date = asDate(row["_Date_Time"]) ?? new Date();
      const arrivalDate = asDate(row["_Fld6647"]);
      const totalDoc = asNumberOr(row["_Fld6646"], 0);
      const comment = asString(row["_Fld6645"]);
      const mileageStart = asNumber(row["_Fld6636"]);
      const mileageEnd = asNumber(row["_Fld6637"]);
      const posted = asBool(row["_Posted"]);
      const archived = asBool(row["_Fld7352"]);

      try {
        if (willWrite(ctx)) {
          await prisma.routeSheet.upsert({
            where: { code1C },
            create: {
              code1C,
              date,
              arrivalDate,
              status: posted ? "completed" : "draft",
              totalUah: totalDoc,
              comment,
              mileageStartKm: mileageStart,
              mileageEndKm: mileageEnd,
              posted,
              archived,
              exportTo1C: false,
            },
            update: {
              date,
              arrivalDate,
              status: posted ? "completed" : "draft",
              totalUah: totalDoc,
              comment,
              mileageStartKm: mileageStart,
              mileageEndKm: mileageEnd,
              posted,
              archived,
            },
          });
        }
        recon.written++;
        ctx.routeSheets.set(hex, { id: "(pending)", code1C });
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(`routesheets: processed ${recon.written + recon.skipped + recon.errors}`);
  }

  return recon;
}

// ─── Підвантаження словників для ізольованих --entity запусків ────────────────

async function ensureCustomerDict(ctx: ImportContext): Promise<void> {
  if (ctx.customers.size > 0) return;
  warn("резолв-словник Контрагентів порожній — підвантажую з 1С.");
  const existing = await loadExistingByCode1C(ctx.prisma, "customer");
  for await (const rows of streamTable(
    ctx.src,
    "_Reference66",
    ["_IDRRef", "_Code"],
    { batch: 2000, limit: null, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const code1C = asString(row["_Code"]);
      if (!hex || !code1C) continue;
      ctx.customers.set(hex, { id: existing.get(code1C) ?? "(pending)", code1C });
    }
  }
}

async function ensureProductLotDicts(ctx: ImportContext): Promise<void> {
  if (ctx.products.size === 0) await buildProductDictFromSource(ctx);
  if (ctx.lotBarcodeByCharHex.size === 0) await importBarcodes(ctx);
  if (ctx.lots.size === 0) await buildLotDictFromSource(ctx);
}

async function buildLotDictFromSource(ctx: ImportContext): Promise<void> {
  warn("резолв-словник Лотів порожній — підвантажую з 1С + цільової бази.");
  // Прив'язка hex(характеристики) → наш Lot.id через barcode (Lot.barcode unique).
  const byBarcode = new Map<string, string>();
  if (willWrite(ctx)) {
    const lots = await ctx.prisma.lot.findMany({
      select: { id: true, barcode: true },
    });
    for (const l of lots) byBarcode.set(l.barcode, l.id);
  }
  for await (const rows of streamTable(
    ctx.src,
    "_Reference113",
    ["_IDRRef"],
    { batch: 2000, limit: null, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) continue;
      const barcode = ctx.lotBarcodeByCharHex.get(hex) ?? `L-${hex}`;
      const id = byBarcode.get(barcode) ?? "(pending)";
      ctx.lots.set(hex, { id, code1C: barcode });
    }
  }
}

async function ensureSaleDict(ctx: ImportContext): Promise<void> {
  if (ctx.sales.size > 0) return;
  const existing = await loadExistingByCode1C(ctx.prisma, "sale");
  for await (const rows of streamTable(
    ctx.src,
    "_Document189",
    ["_IDRRef", "_Number"],
    { batch: 2000, limit: null, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const code1C = asString(row["_Number"]);
      if (!hex || !code1C) continue;
      ctx.sales.set(hex, { id: existing.get(code1C) ?? "(pending)", code1C });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

const ENTITY_RUNNERS: Record<
  EntityName,
  (ctx: ImportContext) => Promise<Recon>
> = {
  customers: importCustomers,
  products: importProducts,
  lots: importLots,
  barcodes: importBarcodes,
  prices: importPrices,
  orders: importOrders,
  sales: importSales,
  cashorders: importCashOrders,
  routesheets: importRouteSheets,
};

// Порядок за FK-залежностями (план §13).
const DEFAULT_ORDER: EntityName[] = [
  "customers",
  "products",
  "barcodes",
  "lots",
  "prices",
  "orders",
  "sales",
  "cashorders",
  "routesheets",
];

function printReconTable(recons: Recon[], dryRun: boolean): void {
  const head = dryRun
    ? ["entity", "source rows", "would write", "skipped", "errors", "unresolved"]
    : ["entity", "source rows", "written", "skipped", "errors", "unresolved"];
  const rows = recons.map((r) => [
    r.entity,
    String(r.sourceRows),
    String(r.written),
    String(r.skipped),
    String(r.errors),
    String(r.unresolved),
  ]);
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i]!.length)),
  );
  const fmt = (cells: string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  console.log("");
  console.log(`${TAG} ── Reconciliation ${dryRun ? "(DRY-RUN)" : ""} ──`);
  console.log(`${TAG} ${fmt(head)}`);
  console.log(`${TAG} ${fmt(widths.map((w) => "-".repeat(w)))}`);
  for (const row of rows) console.log(`${TAG} ${fmt(row)}`);
  console.log("");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // ─── Безпека цілі ───────────────────────────────────────────────────────────
  const targetUrl = process.env.IMPORT_TARGET_DB_URL;
  if (!targetUrl) {
    console.error(
      `${TAG} FATAL: IMPORT_TARGET_DB_URL is not set. Set it explicitly ` +
        `(this script NEVER falls back to DATABASE_URL). For prod writes use ` +
        `IMPORT_TARGET_DB_URL=<DATABASE_URL> ... --confirm-prod`,
    );
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && targetUrl === dbUrl && !args.confirmProd) {
    console.error(
      `${TAG} FATAL: target equals DATABASE_URL (production). Re-run with ` +
        `--confirm-prod to allow writes to the live database.`,
    );
    process.exit(1);
  }

  const legacyUrl = process.env.LEGACY_1C_DB_URL;
  if (!legacyUrl) {
    console.error(
      `${TAG} FATAL: LEGACY_1C_DB_URL is not set (1C MSSQL source).`,
    );
    process.exit(1);
  }

  log(
    `mode=${args.dryRun ? "DRY-RUN" : "WRITE"} ` +
      `entity=${args.entity ?? "ALL"} limit=${args.limit ?? "∞"} ` +
      `batch=${args.batch} since=${args.since?.toISOString().slice(0, 10) ?? "—"} ` +
      `confirmProd=${args.confirmProd}`,
  );

  // ─── Підключення ────────────────────────────────────────────────────────────
  const mssqlConfig = parseMssqlUrl(legacyUrl);
  log(
    `connecting to 1C MSSQL ${mssqlConfig.server}:${mssqlConfig.port}/${mssqlConfig.database} (read-only)`,
  );
  const src = await new mssql.ConnectionPool(mssqlConfig).connect();

  const prisma = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  const ctx: ImportContext = {
    args,
    src,
    prisma,
    products: new Map(),
    customers: new Map(),
    lots: new Map(),
    orders: new Map(),
    sales: new Map(),
    routeSheets: new Map(),
    lotBarcodeByCharHex: new Map(),
    cityNames: new Map(),
    regionNames: new Map(),
    priceTypeCodes: new Map(),
  };

  // Дрібні довідники назв (city/region) — потрібні для Customer.
  const entities = args.entity ? [args.entity] : DEFAULT_ORDER;
  if (entities.includes("customers")) {
    ctx.cityNames = await loadDictNames(src, "_Reference6810", "_Description");
    ctx.regionNames = await loadDictNames(src, "_Reference6811", "_Description");
    log(
      `dicts: cities=${ctx.cityNames.size} regions=${ctx.regionNames.size}`,
    );
  }

  const recons: Recon[] = [];
  for (const entity of entities) {
    log(`── entity: ${entity} ──`);
    try {
      const recon = await ENTITY_RUNNERS[entity](ctx);
      recons.push(recon);
    } catch (e) {
      // Одна сутність не валить інші.
      warn(`entity ${entity} FAILED: ${errMsg(e)}`);
      const r = newRecon(entity);
      r.errors = 1;
      recons.push(r);
    }
  }

  printReconTable(recons, args.dryRun);

  await src.close().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  log("done.");
}

main().catch((e) => {
  console.error(`${TAG} FATAL:`, e);
  process.exit(1);
});
