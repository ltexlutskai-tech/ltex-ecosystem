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
 *   --recategorize       (лише з --entity products|без --entity) переносить товари
 *                        з запасної «Імпортовано з 1С» у 1С-групу за _ParentIDRRef.
 *                        Без прапора categoryId існуючих товарів не змінюється.
 *   --entity <name>      одна сутність: customers|categories|products|lots|barcodes|prices|
 *                        dictionaries|dictionaries-full|rates|orders|sales|cashorders|
 *                        routesheets|debt|misc|sales-reg|cashflow-reg|stock-reg|
 *                        orders-reg|bankdocs|cashtransfers|product-receipt-names
 *                        (дефолт = всі, крім rates/*-reg/bankdocs/cashtransfers/
 *                        product-receipt-names)
 *                        product-receipt-names = Номенклатура.Название → Product.receiptName
 *                        (назва товару для чеку, матч за code1C=hex(_IDRRef))
 *                        dictionaries-full = Фаза 1: одиниці/міста/області/агенти
 *                        rates = Фаза 4: історичні курси валют
 *                        misc = Фаза 8: історія статусів клієнтів + надійність постачальників
 *                        *-reg = Фаза 2: регістри-обороти Продажі/ДДС/Залишки/Замовлення
 *                        bankdocs/cashtransfers = Фаза 6: банк-документи/переміщення готівки
 *   --confirm-prod       дозволити запис коли ціль = бойова база
 *   --batch N            розмір батчу запису (дефолт 500)
 *   --since YYYY-MM-DD   (опц.) лише документи з цієї дати
 *   --print-columns      надрукувати колонки _Reference76 (Номенклатура) і вийти
 *                        (звірка фізичного _Fld для реквізиту «Название» на сервері)
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

import { recomputeDebtForClients } from "../lib/manager/debt-register";
import {
  buildSalesMovement,
  buildCashFlowMovement,
  buildStockMovement,
  buildOrderRemainderMovement,
} from "../lib/manager/registry-import-map";

// ─── Парсинг аргументів ───────────────────────────────────────────────────────

const ENTITY_NAMES = [
  "customers",
  "categories",
  "products",
  "lots",
  "barcodes",
  "prices",
  "dictionaries",
  "dictionaries-full",
  "rates",
  "orders",
  "sales",
  "cashorders",
  "routesheets",
  "debt",
  // ── Фаза 5 — документи руху товару ──
  "returns",
  "repack",
  "writeoff",
  "stockadjust",
  "inventory",
  "transfer",
  "misc",
  "sales-reg",
  "cashflow-reg",
  "stock-reg",
  "orders-reg",
  "cost-reg",
  "bankdocs",
  "cashtransfers",
  // ── Картка клієнта — «Історія роботи з клієнтом» (ИсторияРаботыСКлиентом) ──
  "client-timeline",
  // ── Назва товару для чеку (Номенклатура.Название → Product.receiptName) ──
  "product-receipt-names",
] as const;

type EntityName = (typeof ENTITY_NAMES)[number];

interface CliArgs {
  dryRun: boolean;
  limit: number | null;
  entity: EntityName | null;
  confirmProd: boolean;
  batch: number;
  since: Date | null;
  // Сесія 5.7: переносити товари з запасної «Імпортовано з 1С» у відповідну
  // 1С-групу (за _ParentIDRRef). Без прапора update НЕ чіпає categoryId.
  recategorize: boolean;
  // Діагностика: надрукувати перелік колонок _Reference76 (Номенклатура) з
  // INFORMATION_SCHEMA.COLUMNS і вийти (для звірки _Fld####). Нічого не пише.
  printColumns: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    limit: null,
    entity: null,
    confirmProd: false,
    batch: 500,
    since: null,
    recategorize: false,
    printColumns: false,
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
      case "--recategorize":
        args.recategorize = true;
        break;
      case "--print-columns":
        args.printColumns = true;
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
  if (!(e instanceof Error)) return String(e);
  // Prisma-помилки часто мають порожній перший рядок — беремо перший НЕпорожній
  // (+ назву помилки), інакше WARN був би порожній і діагностика неможлива.
  const firstNonEmpty =
    e.message
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  return `${e.name}: ${firstNonEmpty}`.trim();
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
  // Захист: прибираємо null-байти (U+0000) — Postgres TEXT їх не приймає
  // (бінарні значення/буфери, помилково прочитані як рядок, інакше валять запис).
  const raw = typeof v === "string" ? v : String(v);
  const t = raw.replace(/\x00/g, "").trim();
  return t.length ? t : null;
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
    // The year-offset is read from `_YearOffset` at startup and stored in
    // YEAR_OFFSET. We subtract it from the raw UTC year to get the real date.
    // If a sample date still looks wrong in --dry-run, flip the sign here
    // (add instead of subtract) — that covers the opposite-shift edge case.
    const realYear = v.getUTCFullYear() - YEAR_OFFSET;
    const d = new Date(
      Date.UTC(
        realYear,
        v.getUTCMonth(),
        v.getUTCDate(),
        v.getUTCHours(),
        v.getUTCMinutes(),
        v.getUTCSeconds(),
      ),
    );
    const y = d.getUTCFullYear();
    if (y < 1990 || y > 2100) return null; // implausible after shift → null
    return d;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

const DEFAULT_HISTORICAL_RATE = 43; // fallback EUR→UAH when doc rate is 0

// Округлення до 2 знаків (для грошових EUR-сум).
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Year-offset (A1) ─────────────────────────────────────────────────────────
// 1С on MS SQL stores dates shifted by a base-year value kept in `_YearOffset`.
// We read the offset once at startup and subtract it from every Date value.
let YEAR_OFFSET = 0;

async function loadYearOffset(pool: mssql.ConnectionPool): Promise<number> {
  try {
    const result = await pool
      .request()
      .query<Record<string, unknown>>("SELECT * FROM _YearOffset");
    const row = result.recordset?.[0];
    if (!row) {
      warn("_YearOffset table is empty — using 0");
      return 0;
    }
    for (const val of Object.values(row)) {
      const n = typeof val === "number" ? val : Number(val);
      if (Number.isFinite(n)) {
        log(`year-offset = ${n}`);
        return n;
      }
    }
    warn("_YearOffset: no numeric column found — using 0");
    return 0;
  } catch (e) {
    warn(`loadYearOffset: ${errMsg(e)} — using 0`);
    return 0;
  }
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

// ─── Діагностика: перелік колонок таблиці (--print-columns) ───────────────────
// Дампить INFORMATION_SCHEMA.COLUMNS для звірки фізичних _Fld#### на живому MSSQL
// (напр. підтвердити, що реквізит «Название» Номенклатури = _Fld7773).

async function printReferenceColumns(
  pool: mssql.ConnectionPool,
  table: string,
): Promise<void> {
  const req = pool.request();
  req.input("t", mssql.NVarChar, table);
  const result = await req.query<{
    COLUMN_NAME: string;
    DATA_TYPE: string;
    CHARACTER_MAXIMUM_LENGTH: number | null;
  }>(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH ` +
      `FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t ` +
      `ORDER BY ORDINAL_POSITION`,
  );
  const rows = result.recordset ?? [];
  log(`columns of [${table}] (${rows.length}):`);
  for (const r of rows) {
    const len =
      r.CHARACTER_MAXIMUM_LENGTH == null
        ? ""
        : `(${r.CHARACTER_MAXIMUM_LENGTH})`;
    console.log(`${TAG}   ${r.COLUMN_NAME}  ${r.DATA_TYPE}${len}`);
  }
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
  legalTypeByHex: Map<string, string>; // hex(_IDRRef of _Enum377) → label
  // ── 5.4.6a — довідники + резолв-мапи для документів (частина 2) ──
  cashFlowArticleByHex: Map<string, string>; // hex → MgrCashFlowArticle.id
  bankAccountByHex: Map<string, string>; // hex → MgrBankAccount.id
  agentNameByHex: Map<string, string>; // hex → ТорговийАгент._Description
  agentUserIdByHex: Map<string, string>; // hex(1С-агент _IDRRef = User.code1C) → User.id (Фаза 2 ретро-прив'язка)
  unitNameByHex: Map<string, string>; // hex → ЕдиницаИзмерения._Description
  eurRateByDay: Map<string, number>; // "YYYY-MM-DD" → грн за 1 EUR
  // ── Фаза 1 (5.6) — довідники-повний паритет ──
  regionIdByHex: Map<string, string>; // hex(_Reference6811) → Region.id
  // ── Сесія 5.7 — дерево категорій з 1С (групи Номенклатури _Reference76) ──
  categoryHexToId: Map<string, string>; // hex(групи _IDRRef) → Category.id
  categoryParentHex: Map<string, string>; // hex(групи) → hex(батька-групи)
  // ── Фаза 5 — стокові документи: hex(_Reference95) → Warehouse.id ──
  warehouseIdByHex: Map<string, string>;
  // ── Сесія 7.1 — мапа злиттів дублікатів: hex старого товару → survivor id ──
  // Заповнюється з таблиці ProductMerge на старті. Реімпорт по старому code1C
  // НЕ відтворює видалений товар, а маршрутизує посилання на survivor.
  mergedCode1C: Map<string, string>;
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
      .query<
        Record<string, unknown>
      >(`SELECT [_IDRRef], [${valueCol}] FROM [${table}]`);
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

// ─── Enum ЮрФизЛицо (_Enum377) ──────────────────────────────────────────────────
// XML-декларація: Enums/ЮрФизЛицо.xml, UUID aef6efc5-46ab-40f2-87c8-81d03c6718af.
// Фізична таблиця: _Enum377 (dbnames.txt рядок 379).
// Порядок оголошення у XML (= _EnumOrder у MSSQL, 0-based):
//   0 = ЮрЛицо  → "Юридична особа"
//   1 = ФизЛицо → "Фізична особа"

const LEGAL_TYPE_ORDER_MAP: Record<number, string> = {
  0: "Юридична особа",
  1: "Фізична особа",
};

async function loadLegalTypeEnum(
  pool: mssql.ConnectionPool,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const result = await pool
      .request()
      .query<
        Record<string, unknown>
      >("SELECT [_IDRRef], [_EnumOrder] FROM [_Enum377]");
    for (const row of result.recordset ?? []) {
      const hex = bufToHex(row["_IDRRef"]);
      const order = asNumber(row["_EnumOrder"]);
      if (!hex || order == null) continue;
      const label = LEGAL_TYPE_ORDER_MAP[order] ?? null;
      if (label) map.set(hex, label);
    }
    log(`dicts: legalType=${map.size} entries loaded from _Enum377`);
  } catch (e) {
    warn(`loadLegalTypeEnum(_Enum377): ${errMsg(e)} — пропускаю довідник.`);
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

// Сесія 7.1 — мапа злиттів дублікатів: hex(старого code1C) → survivor Product.id.
async function loadProductMergeMap(
  prisma: PrismaClient,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const rows = await prisma.productMerge.findMany({
      select: { oldCode1C: true, targetProductId: true },
    });
    for (const r of rows) out.set(r.oldCode1C, r.targetProductId);
  } catch (e) {
    warn(`loadProductMergeMap: ${errMsg(e)}`);
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
  "_Fld6047", // ИНН
  "_Fld6061", // КодПоЕДРПОУ
  "_Fld6050", // НаименованиеПолное
  "_Fld6046", // ДополнительноеОписание
  "_Fld6058", // РасписаниеРаботыСтрокой
  "_Fld6044RRef", // ГоловнойКонтрагент (self-ref head client)
  "_Fld6060RRef", // ЮрФизЛицо (EnumRef)
  "_Fld6889RRef", // ТорговийАгент (агент клієнта → User.code1C)
];

async function importCustomers(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("customers");
  const sink = new ErrorSink(recon, "customers");
  const { args, src, prisma } = ctx;

  // Lazy load guard — при ізольованому --entity customers карта може бути порожньою,
  // якщо customers не входив до блоку дрібних довідників у main() (напр. cold run).
  if (ctx.legalTypeByHex.size === 0) {
    ctx.legalTypeByHex = await loadLegalTypeEnum(src);
  }
  // Карта 1С-агент(hex)→User.id для прив'язки клієнта до менеджера (_Fld6889RRef).
  if (ctx.agentUserIdByHex.size === 0) {
    await loadAgentUserIds(ctx);
  }

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
      const region = regionHex
        ? (ctx.regionNames.get(regionHex) ?? null)
        : null;
      const notes = asString(row["_Fld6049"]);
      const legalType = (() => {
        const h = bufToHex(row["_Fld6060RRef"]);
        return h ? (ctx.legalTypeByHex.get(h) ?? null) : null;
      })();

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
              // ── 5.4.0 — паритет з 1С (Catalog.Контрагенты) ──
              email,
              inn: asString(row["_Fld6047"]),
              edrpou: asString(row["_Fld6061"]),
              fullName: asString(row["_Fld6050"]),
              comment: notes, // notes = asString(_Fld6049)
              additionalDescription: asString(row["_Fld6046"]),
              workingHours: asString(row["_Fld6058"]),
              parentCode1C: (() => {
                const h = bufToHex(row["_Fld6044RRef"]);
                return h ? (ctx.customers.get(h)?.code1C ?? null) : null;
              })(),
              legalType,
              agentUserId: (() => {
                const h = bufToHex(row["_Fld6889RRef"]);
                return h ? (ctx.agentUserIdByHex.get(h) ?? null) : null;
              })(),
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
              // ── 5.4.0 — паритет з 1С (Catalog.Контрагенты) ──
              email,
              inn: asString(row["_Fld6047"]),
              edrpou: asString(row["_Fld6061"]),
              fullName: asString(row["_Fld6050"]),
              comment: notes, // notes = asString(_Fld6049)
              additionalDescription: asString(row["_Fld6046"]),
              workingHours: asString(row["_Fld6058"]),
              parentCode1C: (() => {
                const h = bufToHex(row["_Fld6044RRef"]);
                return h ? (ctx.customers.get(h)?.code1C ?? null) : null;
              })(),
              legalType,
              agentUserId: (() => {
                const h = bufToHex(row["_Fld6889RRef"]);
                return h ? (ctx.agentUserIdByHex.get(h) ?? null) : null;
              })(),
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

// ─── 2a. Дерево категорій з 1С (групи Номенклатури) ─ _Reference76 ───────────
// 1С-Номенклатура — ієрархічний довідник: `_Folder=0` ПАПКА (= група/категорія),
// `_Folder=1` ЕЛЕМЕНТ (= товар, ІНВЕРСНА логіка). Папки утворюють дерево через
// `_ParentIDRRef` (binary16, посилання на батьківську папку; корінь = 16 нулів).
//
// 2-фазний прохід (патерн як MgrCashFlowArticle, але тут ОБОВʼЯЗКОВО лінкуємо
// ієрархію 2-ю фазою, бо порядок _IDRRef не гарантує parent-before-child):
//   • Фаза A — стрім усіх папок, upsert Category по code1C=hex(_IDRRef) (name,
//     унікальний slug, parentId=null), будуємо categoryHexToId + categoryParentHex.
//   • Фаза B — простав parentId за categoryParentHex (hex батька → Category.id).
//
// Окреме 1С-дерево (рішення user): НЕ зливаємо з курованим веб-каталогом —
// 1С-категорії мають власний code1C; куровані/Excel-категорії лишаються code1C=null.

const CATEGORY_COLS = [
  "_IDRRef",
  "_Folder", // 0 = папка/група, 1 = елемент/товар
  "_ParentIDRRef", // hex батька-групи (корінь = нулі → null)
  "_Code",
  "_Description",
];

async function importCategories(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("categories");
  const sink = new ErrorSink(recon, "categories");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference76");
  log(`categories: source rows (Номенклатура total) = ${recon.sourceRows}`);

  // Набір уже зайнятих slug-ів (товари + категорії спільно унікальні? — ні,
  // Category.slug унікальний лише серед категорій). Тягнемо наявні Category-slug.
  const usedSlugs = new Set<string>();
  if (willWrite(ctx)) {
    const all = await prisma.category.findMany({ select: { slug: true } });
    for (const c of all) usedSlugs.add(c.slug);
  }

  // ── Фаза A — папки → Category (parentId=null), зібрати мапи ──
  for await (const rows of streamTable(src, "_Reference76", CATEGORY_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      // Папки: _Folder=0 (ІНВЕРСНА логіка 1С). Елементи (товари) пропускаємо.
      if (asBool(row["_Folder"])) {
        recon.skipped++;
        continue;
      }
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const code = asString(row["_Code"]);
      const name = asTrimmed(row["_Description"]) || code || hex;
      const parentHex = bufToHex(row["_ParentIDRRef"]);
      if (parentHex) ctx.categoryParentHex.set(hex, parentHex);

      try {
        let id = "(pending)";
        if (willWrite(ctx)) {
          // Спершу шукаємо за code1C — щоб не плодити дублі при реімпорті.
          const existing = await prisma.category.findUnique({
            where: { code1C: hex },
            select: { id: true },
          });
          if (existing) {
            await prisma.category.update({
              where: { id: existing.id },
              data: { name },
              select: { id: true },
            });
            id = existing.id;
          } else {
            const slug = makeUniqueSlug(name, hex, usedSlugs);
            const created = await prisma.category.create({
              data: { code1C: hex, name, slug, parentId: null },
              select: { id: true },
            });
            id = created.id;
          }
        }
        ctx.categoryHexToId.set(hex, id);
        recon.written++;
      } catch (e) {
        sink.record(code ?? hex, e);
      }
    }
  }
  log(`categories: phase A mapped ${ctx.categoryHexToId.size} folder→id`);

  // ── Фаза B — простав parentId за hex батька ──
  if (willWrite(ctx)) {
    let linked = 0;
    for (const [hex, parentHex] of ctx.categoryParentHex) {
      const id = ctx.categoryHexToId.get(hex);
      const parentId = ctx.categoryHexToId.get(parentHex);
      if (!id || !parentId) continue; // корінь або батько поза вибіркою
      try {
        await prisma.category.update({
          where: { id },
          data: { parentId },
          select: { id: true },
        });
        linked++;
      } catch (e) {
        sink.record(hex, e);
      }
    }
    log(`categories: phase B linked ${linked} parent edges`);
  }

  return recon;
}

const PRODUCT_COLS = [
  "_IDRRef",
  "_Marked",
  "_Folder",
  "_ParentIDRRef", // Група-власник (1С-категорія) — резолв у categoryId (5.7)
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

// Для ізольованого `--entity products` (без попереднього `categories`) карта
// categoryHexToId порожня — підтягуємо її з нашої БД за вже імпортованими
// 1С-категоріями (Category.code1C). No-op коли карта вже заповнена або dry-run.
async function ensureCategoryHexMap(ctx: ImportContext): Promise<void> {
  if (ctx.categoryHexToId.size > 0 || !willWrite(ctx)) return;
  const cats = await ctx.prisma.category.findMany({
    where: { code1C: { not: null } },
    select: { id: true, code1C: true },
  });
  for (const c of cats) {
    if (c.code1C) ctx.categoryHexToId.set(c.code1C, c.id);
  }
  log(`products: loaded ${ctx.categoryHexToId.size} 1С-categories from DB`);
}

async function importProducts(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("products");
  const sink = new ErrorSink(recon, "products");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference76");
  log(`products: source rows = ${recon.sourceRows}`);
  // Скільки 1С-товарів пропущено як злиті дублікати (Сесія 7.1).
  let mergedSkipped = 0;

  const importCategoryId = await ensureImportCategoryId(ctx);
  await ensureCategoryHexMap(ctx);
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

      // Сесія 7.1 — злитий дублікат: НЕ відтворюємо старий Product (інакше upsert
      // resurrect-ить видалений запис). Реєструємо alias hex → survivor id, щоб
      // усі подальші резолви (лоти/ціни/рухи) вели на survivor.
      const mergedTargetId = hex ? ctx.mergedCode1C.get(hex) : undefined;
      if (hex && mergedTargetId) {
        ctx.products.set(hex, { id: mergedTargetId, code1C });
        recon.skipped++;
        mergedSkipped++;
        continue;
      }

      const name = asTrimmed(row["_Description"]) || code1C;
      const articleCode = asString(row["_Fld6255"]);
      const videoUrl = asString(row["_Fld6916"]);
      const averageWeight = parseAverageWeight(row["_Fld7365"]);
      const description = asTrimmed(row["_Fld6283"]);
      const isPiece = asBool(row["_Fld7696"]) || !asBool(row["_Fld6257"]);
      const priceUnit = isPiece ? "piece" : "kg";
      // 1С-група товару → наша Category (за code1C=hex).
      const parentHex = bufToHex(row["_ParentIDRRef"]);
      const groupCategoryId = parentHex
        ? ctx.categoryHexToId.get(parentHex)
        : undefined;

      try {
        let prodId = "(pending)";
        if (willWrite(ctx) && importCategoryId) {
          // Fallback — запасна «Імпортовано з 1С», якщо групи нема у мапі.
          const resolvedCategoryId = groupCategoryId ?? importCategoryId;
          const existing = await prisma.product.findUnique({
            where: { code1C },
            select: { id: true, category: { select: { slug: true } } },
          });
          if (existing) {
            // Існуючий товар магазину — оновлюємо лише безпечні поля.
            // categoryId переносимо ЛИШЕ під --recategorize і ЛИШЕ для
            // «осиротілих» (поточна категорія = imported-1c) — щоб не зачепити
            // ручні/Excel-товари. resolvedCategoryId має відрізнятись від поточної.
            const recategorize =
              args.recategorize &&
              existing.category?.slug === "imported-1c" &&
              resolvedCategoryId !== importCategoryId;
            await prisma.product.update({
              where: { id: existing.id },
              data: {
                name,
                articleCode,
                videoUrl,
                averageWeight: averageWeight ?? undefined,
                description: description || undefined,
                ...(recategorize ? { categoryId: resolvedCategoryId } : {}),
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
                categoryId: resolvedCategoryId,
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

  if (mergedSkipped > 0) {
    log(`products: пропущено ${mergedSkipped} злитих дублікатів (Сесія 7.1)`);
  }

  return recon;
}

// ─── 2b. Номенклатура.Название → Product.receiptName ─ _Reference76 ───────────
// Кастомний реквізит «Название» (uuid 86c89be2-30a1-43d1-8ffb-085fd5c28cf7) —
// коротка узагальнена назва для чеку («Одяг вживаний»/«Взуття вживане»/…), НЕ
// плутати зі стандартним `_Description` (name) і `НаименованиеПолное` (повна).
// Фізична колонка визначена ОФЛАЙН:
//   dbnames.txt: {86c89be2-30a1-43d1-8ffb-085fd5c28cf7,"Fld",7773} → _Fld7773
//   columns.tsv: _Reference76 → _Fld7773 nvarchar(100) (= xs:string length 100 у XML)
// ⚠️ ЗВІРИТИ НА СЕРВЕРІ через `--print-columns`, якщо на живій базі структура
// відрізняється (напр. після оновлення конфігурації 1С), і за потреби змінити.
const NAZVANIE_FLD = "_Fld7773";

const RECEIPT_NAME_COLS = ["_IDRRef", "_Folder", NAZVANIE_FLD];
const RECEIPT_NAME_WRITE_BATCH = 200;

async function importProductReceiptNames(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("product-receipt-names");
  const sink = new ErrorSink(recon, "product-receipt-names");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference76");
  log(`product-receipt-names: source rows = ${recon.sourceRows}`);

  // Мапа code1C(=hex _IDRRef) → Product.id. Читання цільової бази дозволене й у
  // dry-run (read-only), тож звірка matched/not-found коректна в обох режимах.
  const productIdByCode = new Map<string, string>();
  const all = await prisma.product.findMany({
    where: { code1C: { not: null } },
    select: { id: true, code1C: true },
  });
  for (const p of all) if (p.code1C) productIdByCode.set(p.code1C, p.id);
  log(`product-receipt-names: loaded ${productIdByCode.size} products from DB`);

  let emptySource = 0;
  let notFound = 0;

  // Накопичуємо оновлення й пишемо батчами у транзакціях (ідемпотентно —
  // повторний прогін перезаписує тим самим значенням).
  let batchUpdates: { id: string; receiptName: string }[] = [];
  const flush = async (): Promise<void> => {
    if (batchUpdates.length === 0 || !willWrite(ctx)) {
      batchUpdates = [];
      return;
    }
    const chunk = batchUpdates;
    batchUpdates = [];
    try {
      await prisma.$transaction(
        chunk.map((u) =>
          prisma.product.update({
            where: { id: u.id },
            data: { receiptName: u.receiptName },
          }),
        ),
      );
    } catch (e) {
      // Транзакція впала цілим блоком → рахуємо кожен рядок як помилку.
      recon.written -= chunk.length;
      for (const u of chunk) sink.record(u.id, e);
    }
  };

  for await (const rows of streamTable(src, "_Reference76", RECEIPT_NAME_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      // 1С `_Folder`: 1 = елемент, 0 = група (ІНВЕРСНА логіка 1С!). Групи не мають
      // товару в нашій БД — пропускаємо.
      if (!asBool(row["_Folder"])) {
        recon.skipped++;
        continue;
      }
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const receiptName = asString(row[NAZVANIE_FLD]);
      if (!receiptName) {
        emptySource++;
        recon.skipped++;
        continue;
      }

      // code1C = hex(_IDRRef). Враховуємо злиття дублікатів (Сесія 7.1):
      // mergedCode1C дає survivor Product.id напряму.
      const targetId = ctx.mergedCode1C.get(hex) ?? productIdByCode.get(hex);
      if (!targetId) {
        notFound++;
        recon.unresolved++;
        continue;
      }

      recon.written++;
      batchUpdates.push({ id: targetId, receiptName });
      if (batchUpdates.length >= RECEIPT_NAME_WRITE_BATCH) await flush();
    }
  }
  await flush();

  log(
    `product-receipt-names: matched/updated=${recon.written} ` +
      `not-found=${notFound} empty-source=${emptySource} ` +
      `skipped(groups+empty)=${recon.skipped}`,
  );
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
  const codeSlug = code1C
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
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
  "_Fld7729", // Ефір
  "_Fld7730", // ЕфірНаДоставку
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
      const onAir = asBool(row["_Fld7729"]);
      const onAirDelivery = asBool(row["_Fld7730"]);
      // Історичний лот ховаємо від публічної вітрини: статус "archived"
      // НЕ входить у публічний фільтр free/on_sale. (_Marked не використовуємо —
      // усі імпортовані лоти історичні за визначенням.)
      const status = "archived";

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
              onAir,
              onAirDelivery,
            },
            // Наявні лоти НЕ чіпаємо у вагах/статусі/секторі (можуть бути ЖИВІ
            // на сайті). Виняток — нові поля Ефір/ЕфірНаДоставку (5.4.0): вони
            // безпечні для backfill, тож оновлюємо й для існуючих історичних лотів.
            update: { onAir, onAirDelivery },
            select: { id: true },
          });
          lotId = lot.id;

          // Штрихкод створюємо лише для нового лоту; наявні не чіпаємо.
          await prisma.barcode.upsert({
            where: { code: barcode },
            create: { lotId: lot.id, code: barcode },
            update: {},
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
      // Сесія 7.1 — злитий дублікат: alias hex → survivor id (старого Product
      // у ЦІЛЬОВІЙ базі вже нема, existing.get дав би "(pending)").
      const mergedId = ctx.mergedCode1C.get(hex);
      const id = mergedId ?? existing.get(code1C) ?? "(pending)";
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
  "_Marked",
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
  "_Fld1100RRef", // ЕдиницаИзмерения (Товары) → _Reference52 (CatalogRef.ЕдиницыИзмерения)
  "_Fld1102", // Количество
  "_Fld1110", // Сумма (line total)
  "_Fld6618", // ЦенаПродажиВес
  "_Fld1107", // ПроцентСкидкиНаценки
];

async function importOrders(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("orders");
  const sink = new ErrorSink(recon, "orders");
  const { args, src, prisma } = ctx;

  await ensureCustomerDict(ctx);
  await ensureProductLotDicts(ctx);
  await ensureDictMaps(ctx);

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
      // Документний code1C = hex(_IDRRef): унікальний у всій 1С-базі.
      // НЕ беремо `_Number` — 1С нумерує щорічно з 0, отже один номер
      // зустрічається у кожному році → upsert затирав би попередні роки.
      // (1С `_Number` тут не пишемо — у Sale/CashOrder/RouteSheet поле
      // `docNumber` має autoincrement, конфлікт послідовності не вартий.)
      const code1C = hex;
      // Людський номер документа (1С _Number, напр. "L0000002477") — для
      // відображення. НЕ унікальний (нумерація щорічна) → лишається display-only.
      const number1C = asString(row["_Number"]);
      if (!hex || !code1C) {
        recon.skipped++;
        continue;
      }
      // Документи, позначені на вилучення у 1С (_Marked), не переносимо;
      // якщо такий уже імпортувався раніше — видаляємо (каскад на рядки).
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.order.deleteMany({ where: { code1C } });
        }
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
      const agentName = (() => {
        const h = bufToHex(row["_Fld6886RRef"]);
        return h ? (ctx.agentNameByHex.get(h) ?? null) : null;
      })();
      const assignedAgentUserId = (() => {
        const h = bufToHex(row["_Fld6886RRef"]);
        return h ? (ctx.agentUserIdByHex.get(h) ?? null) : null;
      })();

      // Рядки замовлення.
      const items = await loadOrderItems(ctx, hex);
      const itemsTotalEur = items.reduce((s, it) => s + it.priceEur, 0);
      const totalEur = itemsTotalEur > 0 ? itemsTotalEur : totalDoc;
      // Курс на дату документа (історичний); fallback на курс документа → дефолт.
      const rate =
        eurRateForDate(ctx, createdAt) ??
        (exchangeRate > 0 ? exchangeRate : DEFAULT_HISTORICAL_RATE);
      const totalUah = totalEur * rate;

      try {
        if (willWrite(ctx)) {
          await prisma.$transaction(async (tx) => {
            const order = await tx.order.upsert({
              where: { code1C },
              create: {
                code1C,
                number1C,
                customerId: customer.id,
                status: posted ? "posted" : "draft",
                totalEur,
                totalUah,
                exchangeRate,
                notes,
                agentName,
                assignedAgentUserId,
                archived: posted,
                closedAt: closed ? (createdAt ?? new Date()) : null,
                exportTo1C: false,
                ...(createdAt ? { createdAt } : {}),
              },
              update: {
                number1C,
                customerId: customer.id,
                status: posted ? "posted" : "draft",
                totalEur,
                totalUah,
                exchangeRate,
                notes,
                agentName,
                assignedAgentUserId,
                archived: posted,
                closedAt: closed ? (createdAt ?? new Date()) : null,
                // Дата теж оновлюється на реімпорті: усі історичні документи
                // вже існують з 5.2 → upsert іде шляхом update; без цього
                // createdAt лишався б дефолтним now() (= дата 1-го імпорту).
                ...(createdAt ? { createdAt } : {}),
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
                  unitPriceEur: it.unitPriceEur,
                  discountPercent: it.discountPercent,
                  // it.unit декодовано (_Fld1100RRef → ЕдиницаИзмерения), але
                  // модель OrderItem не має поля `unit` — не пишемо у БД.
                  // (схему свідомо не розширюємо у 5.4.6a-2; follow-up за потреби)
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
  unitPriceEur: number | null;
  discountPercent: number | null;
  // Декодовано з _Fld1100RRef (ЕдиницаИзмерения → _Reference52). OrderItem
  // не має поля `unit`, тож у БД не пишемо — лишаємо для майбутнього use.
  unit: string | null;
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
      const unitHex = bufToHex(row["_Fld1100RRef"]);
      const unit = unitHex ? (ctx.unitNameByHex.get(unitHex) ?? null) : null;
      out.push({
        productId: product.id,
        lotId,
        priceEur: asNumberOr(row["_Fld1110"], 0),
        weight: asNumberOr(row["_Fld1102"], 0),
        quantity: 1,
        unitPriceEur: asNumber(row["_Fld6618"]),
        discountPercent: asNumber(row["_Fld1107"]),
        unit,
      });
    }
  }
  return out;
}

// ─── 7. РеализацияТоваровУслуг → Sale + SaleItem ─ _Document189 / VT3525 ─────

const SALE_COLS = [
  "_IDRRef",
  "_Marked",
  "_Number",
  "_Date_Time",
  "_Posted",
  "_Fld3493RRef", // Контрагент
  "_Fld3501", // СуммаДокумента
  "_Fld7299", // КурсEUR
  "_Fld7298", // КурсUSD
  "_Fld6887RRef", // ТорговийАгент
  "_Fld6729RRef", // МаршрутныйЛист
  "_Fld3490_RRRef", // Сделка → Заказ (polymorphic, читаємо тільки RRRef)
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
  await ensureOrderDict(ctx);
  await ensureDictMaps(ctx);

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
      // Документний code1C = hex(_IDRRef): унікальний у всій 1С-базі.
      // code1C лишається унікальним ключем (1С нумерує `_Number` щорічно з 0 →
      // один номер у кожному році, тому як ключ непридатний).
      const code1C = hex;
      // Людський номер документа (1С _Number) — лише для відображення.
      const number1C = asString(row["_Number"]);
      if (!hex || !code1C) {
        recon.skipped++;
        continue;
      }
      // Документи, позначені на вилучення у 1С (_Marked), не переносимо;
      // якщо такий уже імпортувався раніше — видаляємо (каскад на рядки).
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.sale.deleteMany({ where: { code1C } });
        }
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
      const agentName = (() => {
        const h = bufToHex(row["_Fld6887RRef"]);
        return h ? (ctx.agentNameByHex.get(h) ?? null) : null;
      })();
      const assignedAgentUserId = (() => {
        const h = bufToHex(row["_Fld6887RRef"]);
        return h ? (ctx.agentUserIdByHex.get(h) ?? null) : null;
      })();
      // Сделка → Заказ (полиморфне посилання, читаємо лише RRRef-частину).
      const orderId = (() => {
        const h = bufToHex(row["_Fld3490_RRRef"]);
        const o = h ? ctx.orders.get(h) : null;
        return o && o.id !== "(pending)" ? o.id : null;
      })();

      const items = await loadSaleItems(ctx, hex);
      const itemsTotalEur = items.reduce((s, it) => s + it.priceEur, 0);
      const totalEur = itemsTotalEur > 0 ? itemsTotalEur : totalDoc;
      // Курс на дату документа (історичний); fallback на курс реалізації → дефолт.
      const rate =
        eurRateForDate(ctx, createdAt) ??
        (rateEur > 0 ? rateEur : DEFAULT_HISTORICAL_RATE);
      const totalUah = totalEur * rate;

      try {
        if (willWrite(ctx)) {
          await prisma.$transaction(async (tx) => {
            const sale = await tx.sale.upsert({
              where: { code1C },
              create: {
                code1C,
                number1C,
                customerId: customer.id,
                status: posted ? "posted" : "draft",
                totalEur,
                totalUah,
                exchangeRateEur: rateEur,
                exchangeRateUsd: rateUsd,
                cashOnDelivery: cod,
                codAmountUah: codAmount,
                novaPoshtaBranch: npBranch,
                expressWaybill: waybill,
                notes,
                agentName,
                assignedAgentUserId,
                orderId,
                archived: posted,
                exportTo1C: false,
                ...(createdAt ? { createdAt } : {}),
              },
              update: {
                number1C,
                customerId: customer.id,
                status: posted ? "posted" : "draft",
                totalEur,
                totalUah,
                exchangeRateEur: rateEur,
                exchangeRateUsd: rateUsd,
                cashOnDelivery: cod,
                codAmountUah: codAmount,
                novaPoshtaBranch: npBranch,
                expressWaybill: waybill,
                notes,
                agentName,
                assignedAgentUserId,
                orderId,
                archived: posted,
                // Дата оновлюється і на реімпорті (див. коментар у importOrders).
                ...(createdAt ? { createdAt } : {}),
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

// SaleItem-одиниці (ЕдиницаИзмерения у _Document189_VT3525) НЕ переносимо —
// модель SaleItem не має поля `unit`; схему у 5.4.6a-2 свідомо не розширюємо.
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
  articleRRef: string; // СтаттяРухуГрошовихКоштів → _Reference96
  bankRRef: string; // БанковскийСчет → _Reference29
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
  articleRRef: "_Fld3282RRef",
  bankRRef: "_Fld3283RRef",
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
  articleRRef: "_Fld3422RRef",
  bankRRef: "_Fld3423RRef",
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

  // Резолв-мапи довідників (стаття/банк/курс/агент) для standalone-прогону.
  await ensureDictMaps(ctx);

  const cols = [
    "_IDRRef",
    "_Marked",
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
    map.articleRRef,
    map.bankRRef,
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
      // Документний code1C = hex(_IDRRef): унікальний у всій 1С-базі.
      // code1C лишається унікальним ключем (1С нумерує `_Number` щорічно з 0,
      // тому як ключ непридатний — баг було помічено: 30k вхідних → 8k у БД).
      const hex = bufToHex(row["_IDRRef"]);
      const code1C = hex;
      // Людський номер документа (1С _Number) — лише для відображення.
      const number1C = asString(row[map.number]);
      if (!code1C) {
        recon.skipped++;
        continue;
      }
      // Документи, позначені на вилучення у 1С (_Marked), не переносимо;
      // якщо такий уже імпортувався раніше — видаляємо (каскад на рядки).
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.mgrCashOrder.deleteMany({ where: { code1C } });
        }
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
      // Зведена сума у EUR (СуммаДокумента) — як `reduceToEur` у живій касі:
      // суми ПКО/РКО зберігаються у гривні (підтверджено даними проду), тож
      // EUR = (готівка + безнал) ÷ курс. Без цього вкладка Оплати показує «0 €».
      // Курс беремо історичний на дату документа; fallback — курс документа → дефолт.
      const histRate = eurRateForDate(ctx, paidAt);
      const effRate =
        histRate ?? (rateEur > 0 ? rateEur : DEFAULT_HISTORICAL_RATE);
      const documentSumEur =
        effRate > 0 ? round2((amount + cashless) / effRate) : 0;
      const customerId =
        customer && customer.id !== "(pending)" ? customer.id : null;
      const saleId = sale && sale.id !== "(pending)" ? sale.id : null;
      // Стаття руху коштів + банк-рахунок (← довідники _Reference96 / _Reference29).
      const cashFlowArticleId = (() => {
        const id = ctx.cashFlowArticleByHex.get(
          bufToHex(row[map.articleRRef]) ?? "",
        );
        return id && id !== "(pending)" ? id : null;
      })();
      const bankAccountId = (() => {
        const id = ctx.bankAccountByHex.get(bufToHex(row[map.bankRRef]) ?? "");
        return id && id !== "(pending)" ? id : null;
      })();

      try {
        if (willWrite(ctx)) {
          await prisma.mgrCashOrder.upsert({
            where: { code1C },
            create: {
              code1C,
              number1C,
              type: map.type,
              ...(docNumber != null ? { docNumber } : {}),
              customerId,
              saleId,
              cashFlowArticleId,
              bankAccountId,
              amountUah: amount,
              amountUahCashless: cashless,
              rateEur,
              rateUsd,
              documentSumEur,
              archived: asBool(row[map.posted]),
              comment,
              ...(paidAt ? { paidAt } : {}),
            },
            update: {
              number1C,
              type: map.type,
              customerId,
              saleId,
              cashFlowArticleId,
              bankAccountId,
              amountUah: amount,
              amountUahCashless: cashless,
              rateEur,
              rateUsd,
              documentSumEur,
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

// ─── 9. МаршрутныйЛист → RouteSheet (+дочірні VT) ─ _Document6630 ────────────
// Імпортуємо шапку RouteSheet ПЛЮС дочірні табличні частини (VT) у наші child-
// таблиці + зворотні посилання, які додаток читає для вкладок картки:
//   Заказы       VT6648 → RouteSheetOrder
//   ТоварыЗаказов VT6654 → RouteSheetItem
//   ЗагрузкаМашины VT6795 → RouteSheetLoading
//   Завдання     VT7622 → RouteSheetTask
//   Витрати      VT7334 → RouteSheetExpense (стаття-довідника нема → articleName=null)
//   Реалізації/Продажі — ЗВОРОТНЕ посилання Sale.routeSheetId (_Document189._Fld6729RRef)
//   Оплати       VT6787 → ЗВОРОТНЕ посилання MgrCashOrder.routeSheetId
// УВАГА: RouteSheetSale/RouteSheetSaleItem/RouteSheetPayment child-таблиці
// додаток свідомо ІГНОРУЄ (вкладки Реалізації/Продажі/Оплати беруться зі
// зворотних посилань) — тому у них НЕ пишемо.
// Дрібні follow-up: `unit` рядків і `RouteSheetOrder.city` лишаються null.

const ROUTE_SHEET_COLS = [
  "_IDRRef",
  "_Marked",
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

  // Дочірні VT резолвлять order/customer/product/lot/barcode → підвантажуємо
  // словники (orders/sales вже існують у цільовій базі — routesheets останні).
  await ensureCustomerDict(ctx);
  await ensureProductLotDicts(ctx);
  await ensureOrderDict(ctx);
  await ensureDictMaps(ctx);

  const where = args.since ? "_Date_Time >= @since" : undefined;
  const params = args.since ? { since: args.since } : undefined;

  recon.sourceRows = await countTable(src, "_Document6630", where, params);
  log(`routesheets: source rows = ${recon.sourceRows} (шапки + VT)`);

  for await (const rows of streamTable(src, "_Document6630", ROUTE_SHEET_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
    where,
    params,
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      // Документний code1C = hex(_IDRRef): унікальний у всій 1С-базі.
      // code1C лишається унікальним ключем (1С нумерує `_Number` щорічно з 0 →
      // один номер у кожному році, тому як ключ непридатний).
      const code1C = hex;
      // Людський номер документа (1С _Number) — лише для відображення.
      const number1C = asString(row["_Number"]);
      if (!hex || !code1C) {
        recon.skipped++;
        continue;
      }
      // Документи, позначені на вилучення у 1С (_Marked), не переносимо;
      // якщо такий уже імпортувався раніше — видаляємо (каскад на рядки).
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.routeSheet.deleteMany({ where: { code1C } });
        }
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
        let routeId = "(pending)";
        if (willWrite(ctx)) {
          const rs = await prisma.routeSheet.upsert({
            where: { code1C },
            create: {
              code1C,
              number1C,
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
              number1C,
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
          routeId = rs.id;
          await importRouteSheetChildren(ctx, hex, rs.id);
        }
        recon.written++;
        ctx.routeSheets.set(hex, { id: routeId, code1C });
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(
      `routesheets: processed ${recon.written + recon.skipped + recon.errors}`,
    );
  }

  return recon;
}

// ─── Дочірні табличні частини маршрутного листа (VT) ─────────────────────────
// Усі VT мають спільну колонку-власника `_Document6630_IDRRef` (binary(16)).

// Резолв-хелпери: повертають наш id лише коли він не "(pending)" (інакше null).
function resolveOrderId(ctx: ImportContext, hex: string | null): string | null {
  if (!hex) return null;
  const e = ctx.orders.get(hex);
  return e && e.id !== "(pending)" ? e.id : null;
}
function resolveCustomerId(
  ctx: ImportContext,
  hex: string | null,
): string | null {
  if (!hex) return null;
  const e = ctx.customers.get(hex);
  return e && e.id !== "(pending)" ? e.id : null;
}
/**
 * Чистий резолв товару по hex з урахуванням мапи злиттів (Сесія 7.1).
 * Спершу дивимось у мапу злиттів (старий code1C → survivor id), інакше — у
 * словник товарів. Експортовано для юніт-тесту.
 */
export function resolveMergedProductId(
  hex: string | null,
  products: Map<string, { id: string; code1C: string | null }>,
  merged: Map<string, string>,
): string | null {
  if (!hex) return null;
  const target = merged.get(hex);
  if (target) return target;
  const e = products.get(hex);
  return e && e.id !== "(pending)" ? e.id : null;
}

function resolveProductId(
  ctx: ImportContext,
  hex: string | null,
): string | null {
  return resolveMergedProductId(hex, ctx.products, ctx.mergedCode1C);
}
function resolveLotId(
  ctx: ImportContext,
  charHex: string | null,
): string | null {
  if (!charHex) return null;
  const e = ctx.lots.get(charHex);
  return e && e.id !== "(pending)" ? e.id : null;
}

const RS_ORDER_COLS = [
  "_LineNo6649",
  "_Fld6650RRef", // ЗаказПокупателя
  "_Fld6651RRef", // Контрагент
];
const RS_ITEM_COLS = [
  "_LineNo6655",
  "_Fld6664RRef", // ЗаказПокупателя
  "_Fld6656RRef", // Номенклатура
  "_Fld6657RRef", // Характеристика (лот)
  "_Fld6660", // Количество
  "_Fld6661", // Цена
  "_Fld6662", // Сумма
  "_Fld6820", // КоличествоЗагружено
];
const RS_LOADING_COLS = [
  "_LineNo6796",
  "_Fld6848RRef", // Контрагент
  "_Fld6797RRef", // ЗаказПокупателя
  "_Fld6798RRef", // Номенклатура
  "_Fld6799RRef", // Характеристика (лот)
  "_Fld6821", // Штрихкод
  "_Fld6801", // Количество
  "_Fld6802", // Вес
  "_Fld6803", // Цена
  "_Fld6804", // Сумма
  "_Fld6852", // ЦенаЗаКг
  "_Fld6805", // Загружено (bin1)
  "_Fld6816", // Возврат (bin1)
];
const RS_TASK_COLS = [
  "_LineNo7623",
  "_Fld7624RRef", // Контрагент
  "_Fld7625", // Комментарий (ntext)
];
const RS_PAYMENT_COLS = [
  "_LineNo6788",
  "_Fld7321_RRRef", // поліморфне посилання на касовий ордер
];
const RS_EXPENSE_COLS = [
  "_LineNo7335",
  "_Fld7336RRef", // СтаттяВитрат (довідника поки нема → articleName=null)
  "_Fld7337", // Сума
];

async function importRouteSheetChildren(
  ctx: ImportContext,
  routeHex: string,
  routeId: string,
): Promise<void> {
  const { src, prisma } = ctx;
  const owner = Buffer.from(routeHex, "hex");

  // ── Заказы → RouteSheetOrder ──
  const orderRows: {
    routeSheetId: string;
    orderId: string;
    customerId: string | null;
    city: null;
  }[] = [];
  for await (const rows of streamTable(
    src,
    "_Document6630_VT6648",
    RS_ORDER_COLS,
    {
      batch: 1000,
      limit: null,
      orderBy: ["_LineNo6649"],
      where: "_Document6630_IDRRef = @owner",
      params: { owner },
    },
  )) {
    for (const row of rows) {
      const orderId = resolveOrderId(ctx, bufToHex(row["_Fld6650RRef"]));
      if (!orderId) continue;
      orderRows.push({
        routeSheetId: routeId,
        orderId,
        customerId: resolveCustomerId(ctx, bufToHex(row["_Fld6651RRef"])),
        city: null,
      });
    }
  }

  // ── ТоварыЗаказов → RouteSheetItem ──
  const itemRows: {
    routeSheetId: string;
    orderId: string | null;
    productId: string;
    lotId: string | null;
    unit: null;
    quantity: number;
    price: number;
    sum: number;
    quantityLoaded: number;
  }[] = [];
  for await (const rows of streamTable(
    src,
    "_Document6630_VT6654",
    RS_ITEM_COLS,
    {
      batch: 1000,
      limit: null,
      orderBy: ["_LineNo6655"],
      where: "_Document6630_IDRRef = @owner",
      params: { owner },
    },
  )) {
    for (const row of rows) {
      const productId = resolveProductId(ctx, bufToHex(row["_Fld6656RRef"]));
      if (!productId) continue;
      itemRows.push({
        routeSheetId: routeId,
        orderId: resolveOrderId(ctx, bufToHex(row["_Fld6664RRef"])),
        productId,
        lotId: resolveLotId(ctx, bufToHex(row["_Fld6657RRef"])),
        unit: null,
        quantity: asNumberOr(row["_Fld6660"], 0),
        price: asNumberOr(row["_Fld6661"], 0),
        sum: asNumberOr(row["_Fld6662"], 0),
        quantityLoaded: asNumberOr(row["_Fld6820"], 0),
      });
    }
  }

  // ── ЗагрузкаМашины → RouteSheetLoading ──
  const loadingRows: {
    routeSheetId: string;
    orderId: string | null;
    customerId: string | null;
    productId: string;
    lotId: string;
    barcode: string;
    unit: null;
    quantity: number;
    weight: number;
    price: number;
    sum: number;
    pricePerKg: number;
    loaded: boolean;
    isReturn: boolean;
  }[] = [];
  for await (const rows of streamTable(
    src,
    "_Document6630_VT6795",
    RS_LOADING_COLS,
    {
      batch: 1000,
      limit: null,
      orderBy: ["_LineNo6796"],
      where: "_Document6630_IDRRef = @owner",
      params: { owner },
    },
  )) {
    for (const row of rows) {
      const productId = resolveProductId(ctx, bufToHex(row["_Fld6798RRef"]));
      const charHex = bufToHex(row["_Fld6799RRef"]);
      const lotId = resolveLotId(ctx, charHex);
      const barcode =
        asString(row["_Fld6821"]) ??
        (charHex ? (ctx.lotBarcodeByCharHex.get(charHex) ?? null) : null);
      if (!productId || !lotId || !barcode) continue;
      loadingRows.push({
        routeSheetId: routeId,
        orderId: resolveOrderId(ctx, bufToHex(row["_Fld6797RRef"])),
        customerId: resolveCustomerId(ctx, bufToHex(row["_Fld6848RRef"])),
        productId,
        lotId,
        barcode,
        unit: null,
        quantity: asNumberOr(row["_Fld6801"], 0),
        weight: asNumberOr(row["_Fld6802"], 0),
        price: asNumberOr(row["_Fld6803"], 0),
        sum: asNumberOr(row["_Fld6804"], 0),
        pricePerKg: asNumberOr(row["_Fld6852"], 0),
        loaded: asBool(row["_Fld6805"]),
        isReturn: asBool(row["_Fld6816"]),
      });
    }
  }

  // ── Завдання → RouteSheetTask ──
  const taskRows: {
    routeSheetId: string;
    customerId: string | null;
    comment: string;
  }[] = [];
  for await (const rows of streamTable(
    src,
    "_Document6630_VT7622",
    RS_TASK_COLS,
    {
      batch: 1000,
      limit: null,
      orderBy: ["_LineNo7623"],
      where: "_Document6630_IDRRef = @owner",
      params: { owner },
    },
  )) {
    for (const row of rows) {
      const comment = asString(row["_Fld7625"]);
      if (!comment) continue;
      taskRows.push({
        routeSheetId: routeId,
        customerId: resolveCustomerId(ctx, bufToHex(row["_Fld7624RRef"])),
        comment,
      });
    }
  }

  // ── Витрати → RouteSheetExpense ──
  // Стаття витрат (_Fld7336RRef) — посилання на довідник, якого у нас нема →
  // articleName лишаємо null (follow-up: дозбір довідника статей з 1С).
  const expenseRows: {
    routeSheetId: string;
    articleName: null;
    amount: number;
  }[] = [];
  for await (const rows of streamTable(
    src,
    "_Document6630_VT7334",
    RS_EXPENSE_COLS,
    {
      batch: 1000,
      limit: null,
      orderBy: ["_LineNo7335"],
      where: "_Document6630_IDRRef = @owner",
      params: { owner },
    },
  )) {
    for (const row of rows) {
      expenseRows.push({
        routeSheetId: routeId,
        articleName: null,
        amount: asNumberOr(row["_Fld7337"], 0),
      });
    }
  }

  // Запис дочірніх таблиць (delete-then-insert = idempotent повторний прогон).
  await prisma.$transaction(async (tx) => {
    await tx.routeSheetOrder.deleteMany({ where: { routeSheetId: routeId } });
    if (orderRows.length > 0) {
      await tx.routeSheetOrder.createMany({ data: orderRows });
    }
    await tx.routeSheetItem.deleteMany({ where: { routeSheetId: routeId } });
    if (itemRows.length > 0) {
      await tx.routeSheetItem.createMany({ data: itemRows });
    }
    await tx.routeSheetLoading.deleteMany({ where: { routeSheetId: routeId } });
    if (loadingRows.length > 0) {
      await tx.routeSheetLoading.createMany({ data: loadingRows });
    }
    await tx.routeSheetTask.deleteMany({ where: { routeSheetId: routeId } });
    if (taskRows.length > 0) {
      await tx.routeSheetTask.createMany({ data: taskRows });
    }
    await tx.routeSheetExpense.deleteMany({
      where: { routeSheetId: routeId },
    });
    if (expenseRows.length > 0) {
      await tx.routeSheetExpense.createMany({ data: expenseRows });
    }
  });

  // ── Зворотне посилання: Реалізації/Продажі ─ Sale.routeSheetId ──
  // Запитуємо реалізації, що вказують на цей маршрут (_Document189._Fld6729RRef).
  try {
    const saleHexes: string[] = [];
    for await (const rows of streamTable(src, "_Document189", ["_IDRRef"], {
      batch: 1000,
      limit: null,
      orderBy: ["_IDRRef"],
      where: "_Fld6729RRef = @owner",
      params: { owner },
    })) {
      for (const row of rows) {
        const h = bufToHex(row["_IDRRef"]);
        if (h) saleHexes.push(h);
      }
    }
    if (saleHexes.length > 0) {
      await prisma.sale.updateMany({
        where: { code1C: { in: saleHexes } },
        data: { routeSheetId: routeId },
      });
    }
  } catch (e) {
    warn(`routesheets ${routeHex}: sale back-link: ${errMsg(e)}`);
  }

  // ── Зворотне посилання: Оплати ─ MgrCashOrder.routeSheetId ──
  // VT6787 містить поліморфні посилання на касові ордери (_Fld7321_RRRef).
  try {
    const cashHexes: string[] = [];
    for await (const rows of streamTable(
      src,
      "_Document6630_VT6787",
      RS_PAYMENT_COLS,
      {
        batch: 1000,
        limit: null,
        orderBy: ["_LineNo6788"],
        where: "_Document6630_IDRRef = @owner",
        params: { owner },
      },
    )) {
      for (const row of rows) {
        const h = bufToHex(row["_Fld7321_RRRef"]);
        if (h) cashHexes.push(h);
      }
    }
    if (cashHexes.length > 0) {
      await prisma.mgrCashOrder.updateMany({
        where: { code1C: { in: cashHexes } },
        data: { routeSheetId: routeId },
      });
    }
  } catch (e) {
    warn(`routesheets ${routeHex}: cash-order back-link: ${errMsg(e)}`);
  }
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
      ctx.customers.set(hex, {
        id: existing.get(code1C) ?? "(pending)",
        code1C,
      });
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
  for await (const rows of streamTable(ctx.src, "_Reference113", ["_IDRRef"], {
    batch: 2000,
    limit: null,
    orderBy: ["_IDRRef"],
  })) {
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
      const code1C = hex;
      if (!hex || !code1C) continue;
      ctx.sales.set(hex, { id: existing.get(code1C) ?? "(pending)", code1C });
    }
  }
}

async function ensureOrderDict(ctx: ImportContext): Promise<void> {
  if (ctx.orders.size > 0) return;
  const existing = await loadExistingByCode1C(ctx.prisma, "order");
  for await (const rows of streamTable(ctx.src, "_Document130", ["_IDRRef"], {
    batch: 2000,
    limit: null,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const code1C = hex;
      if (!hex || !code1C) continue;
      ctx.orders.set(hex, { id: existing.get(code1C) ?? "(pending)", code1C });
    }
  }
}

// ─── Підвантаження довідкових резолв-мап для документів (5.4.6a, частина 2) ───
// При ізольованому `--entity orders|sales|cashorders|routesheets` мапи з main()
// порожні (бо dictionaries не виконувався). Заповнюємо їх ліниво (guard по size),
// щоб standalone-прогони документів резолвили агента/курс/статтю/банк-рахунок.
async function ensureDictMaps(ctx: ImportContext): Promise<void> {
  if (ctx.agentNameByHex.size === 0) await loadAgentNames(ctx);
  if (ctx.agentUserIdByHex.size === 0) await loadAgentUserIds(ctx);
  if (ctx.unitNameByHex.size === 0) await loadUnitNames(ctx);
  if (ctx.eurRateByDay.size === 0) {
    // importRates і апсертить ExchangeRate, і наповнює eurRateByDay; на повторі
    // upsert ідемпотентний — безпечно.
    await importRates(ctx);
  }
  if (ctx.cashFlowArticleByHex.size === 0 || ctx.bankAccountByHex.size === 0) {
    // Id-мапи беремо з ЦІЛЬОВОЇ бази за code1C (= hex), бо довідники вже
    // імпортовані окремою сутністю `dictionaries`.
    try {
      const articles = await ctx.prisma.mgrCashFlowArticle.findMany({
        select: { id: true, code1C: true },
      });
      for (const a of articles) {
        if (a.code1C) ctx.cashFlowArticleByHex.set(a.code1C, a.id);
      }
    } catch (e) {
      warn(`ensureDictMaps(cashFlowArticles): ${errMsg(e)}`);
    }
    try {
      const banks = await ctx.prisma.mgrBankAccount.findMany({
        select: { id: true, code1C: true },
      });
      for (const b of banks) {
        if (b.code1C) ctx.bankAccountByHex.set(b.code1C, b.id);
      }
    } catch (e) {
      warn(`ensureDictMaps(bankAccounts): ${errMsg(e)}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 10. ДОВІДНИКИ + КУРСИ ВАЛЮТ (5.4.6a, частина 1)
// ════════════════════════════════════════════════════════════════════════════
// Імпортуємо довідкові каталоги у наші таблиці + будуємо резолв-мапи у
// ImportContext, на які покладатиметься дозбір документів (частина 2). Усі
// підімпорти самодостатні (будують власні мапи + таблиці) — стандалон-запуск
// `--entity dictionaries` не залежить від інших сутностей.

// ─── 10.1 СтатьиДвиженияДенежныхСредств → MgrCashFlowArticle ─ _Reference96 ───
// Ієрархічний довідник (_Folder/_ParentIDRRef). 2-фазний прохід: спершу upsert
// усіх (папки + елементи) з code1C/code/name, потім лінкуємо parentId за hex
// батька (папки-категорії статей: Затрати / ЗП / Рух коштів → підпапки → стаття).

const CASH_FLOW_ARTICLE_COLS = [
  "_IDRRef",
  "_Code", // nchar(9)
  "_Description", // nvarchar(100)
  "_ParentIDRRef", // hex батька-папки (корінь = нулі → null)
];

async function importCashFlowArticles(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("cashflowarticles");
  const sink = new ErrorSink(recon, "cashflowarticles");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference96");
  log(`cashflowarticles: source rows = ${recon.sourceRows}`);

  // hex статті → hex батька (для 2-ї фази лінкування ієрархії).
  const parentHexByHex = new Map<string, string>();

  for await (const rows of streamTable(
    src,
    "_Reference96",
    CASH_FLOW_ARTICLE_COLS,
    {
      batch: args.batch,
      limit: args.limit,
      orderBy: ["_IDRRef"],
    },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const code = asString(row["_Code"]);
      const name = asTrimmed(row["_Description"]) || hex;
      const parentHex = bufToHex(row["_ParentIDRRef"]);
      if (parentHex) parentHexByHex.set(hex, parentHex);
      try {
        let id = "(pending)";
        if (willWrite(ctx)) {
          const created = await prisma.mgrCashFlowArticle.upsert({
            where: { code1C: hex },
            create: { code1C: hex, code, name },
            update: { code, name },
            select: { id: true },
          });
          id = created.id;
        }
        ctx.cashFlowArticleByHex.set(hex, id);
        recon.written++;
      } catch (e) {
        sink.record(code ?? hex, e);
      }
    }
  }

  // Фаза 2: лінкуємо ієрархію parentId за hex батька.
  if (willWrite(ctx)) {
    let linked = 0;
    for (const [hex, parentHex] of parentHexByHex) {
      const id = ctx.cashFlowArticleByHex.get(hex);
      const parentId = ctx.cashFlowArticleByHex.get(parentHex);
      if (!id || !parentId || id === parentId) continue;
      try {
        await prisma.mgrCashFlowArticle.update({
          where: { id },
          data: { parentId },
        });
        linked++;
      } catch (e) {
        sink.record(hex, e);
      }
    }
    log(`cashflowarticles: linked ${linked} parent relations`);
  }

  log(`cashflowarticles: mapped ${ctx.cashFlowArticleByHex.size} hex→id`);
  return recon;
}

// ─── 10.2 БанковскиеСчета → MgrBankAccount ─ _Reference29 ─────────────────────

const BANK_ACCOUNT_COLS = [
  "_IDRRef",
  "_Description", // name
  "_Fld5869", // IBAN/№ рахунку (nvarchar34)
  "_Fld7710", // НеВідображатиВДодатку (bin1)
];

async function importBankAccounts(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("bankaccounts");
  const sink = new ErrorSink(recon, "bankaccounts");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference29");
  log(`bankaccounts: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Reference29", BANK_ACCOUNT_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const name = asTrimmed(row["_Description"]) || hex;
      const description = asString(row["_Fld5869"]);
      const hiddenInApp = asBool(row["_Fld7710"]);
      try {
        let id = "(pending)";
        if (willWrite(ctx)) {
          const created = await prisma.mgrBankAccount.upsert({
            where: { code1C: hex },
            create: { code1C: hex, name, description, hiddenInApp },
            update: { name, description, hiddenInApp },
            select: { id: true },
          });
          id = created.id;
        }
        ctx.bankAccountByHex.set(hex, id);
        recon.written++;
      } catch (e) {
        sink.record(hex, e);
      }
    }
  }
  log(`bankaccounts: mapped ${ctx.bankAccountByHex.size} hex→id`);
  return recon;
}

// ─── 10.2b Кассы → MgrBankAccount ─ _Reference56 ─────────────────────────────
// Каси (готівкові «рахунки») лежать в окремому довіднику _Reference56, але у
// звіті/переглядачі ДДС резолвляться з тієї ж мапи `mgrBankAccount` по code1C
// (cashflow-flex.ts::resolveMaps). Тому вантажимо їх у ту саму модель
// MgrBankAccount (без зміни схеми) — тоді назва каси показується замість hex.
// `_Folder` (ІНВЕРСНА логіка 1С!): 1 = елемент (каса), 0 = група/папка → папки
// пропускаємо.
const CASH_REGISTER_COLS = [
  "_IDRRef",
  "_Folder", // 1 = каса (елемент), 0 = папка (група)
  "_Description", // назва каси (nvarchar50)
];

async function importCashRegisters(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("cashregisters");
  const sink = new ErrorSink(recon, "cashregisters");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference56");
  log(`cashregisters: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(
    src,
    "_Reference56",
    CASH_REGISTER_COLS,
    {
      batch: args.batch,
      limit: args.limit,
      orderBy: ["_IDRRef"],
    },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      // Папки (групи) пропускаємо: _Folder=0 → група (ІНВЕРСНА логіка 1С).
      if (!asBool(row["_Folder"])) {
        recon.skipped++;
        continue;
      }
      const name = asTrimmed(row["_Description"]) || hex;
      try {
        let id = "(pending)";
        if (willWrite(ctx)) {
          const created = await prisma.mgrBankAccount.upsert({
            where: { code1C: hex },
            create: { code1C: hex, name },
            update: { name },
            select: { id: true },
          });
          id = created.id;
        }
        ctx.bankAccountByHex.set(hex, id);
        recon.written++;
      } catch (e) {
        sink.record(hex, e);
      }
    }
  }
  log(
    `cashregisters: mapped ${ctx.bankAccountByHex.size} hex→id (разом з банк-рахунками)`,
  );
  return recon;
}

// ─── 10.2a ТипыЦенНоменклатуры → MgrPriceType ─ _Reference105 ─────────────────
// Цей довідник наповнює таблицю `mgr_price_types` (dropdow «Тип цін» у формі
// замовлення). Invariant: MgrPriceType.code === Price.priceType. Upserting by
// `code` (= _Code) — same value used when importing prices in §5.

const PRICE_TYPE_COLS = [
  "_IDRRef",
  "_Code", // nchar(10) — ідентифікатор типу ціни (напр. "wholesale", "akciya")
  "_Description", // nvarchar(25) — людська назва
];

async function importPriceTypes(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("pricetypes");
  const sink = new ErrorSink(recon, "pricetypes");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference105");
  log(`pricetypes: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Reference105", PRICE_TYPE_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const code = asString(row["_Code"]) ?? hex;
      const label = asTrimmed(row["_Description"]) || code;
      try {
        if (willWrite(ctx)) {
          await prisma.mgrPriceType.upsert({
            where: { code },
            create: { code, label, sortOrder: 0 },
            update: { label },
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(code, e);
      }
    }
  }
  log(`pricetypes: written ${recon.written} price types`);
  return recon;
}

// ─── 10.3 Маршруты → MgrRoute ─ _Reference7513 ───────────────────────────────
// Recon-сутність "routes1c" (щоб не плутати з документами "routesheets").

const ROUTE_COLS = [
  "_IDRRef",
  "_Description", // name
];

async function importRoutes(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("routes1c");
  const sink = new ErrorSink(recon, "routes1c");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference7513");
  log(`routes1c: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Reference7513", ROUTE_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const name = asTrimmed(row["_Description"]) || hex;
      try {
        if (willWrite(ctx)) {
          await prisma.mgrRoute.upsert({
            where: { code1C: hex },
            create: { code1C: hex, name },
            update: { name },
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(hex, e);
      }
    }
  }
  return recon;
}

// ─── 10.4 ТорговыеАгенты → мапа hex→назва ─ _Reference6628 ────────────────────
// Лише пам'ять-мапа (таблиці нема — менеджери/агенти резолвляться окремо).

async function loadAgentNames(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("agents");
  const { args, src } = ctx;

  recon.sourceRows = await countTable(src, "_Reference6628");
  log(`agents: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(
    src,
    "_Reference6628",
    ["_IDRRef", "_Description"],
    { batch: args.batch, limit: args.limit, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const name = asTrimmed(row["_Description"]);
      if (!hex || !name) {
        recon.skipped++;
        continue;
      }
      ctx.agentNameByHex.set(hex, name);
      recon.written++; // "written" тут = додано у мапу
    }
  }
  log(`agents: mapped ${ctx.agentNameByHex.size} hex→name`);
  return recon;
}

// ─── Мапа hex(1С-агент) → User.id (Фаза 2: ретро-прив'язка документів) ───────
// Будується з НАШОЇ бази: усі User з заповненим code1C (= hex 1С-агента,
// lower-case, як bufToHex). Покриває й активних, й архівних менеджерів.
async function loadAgentUserIds(ctx: ImportContext): Promise<void> {
  const users = await ctx.prisma.user.findMany({
    where: { code1C: { not: null } },
    select: { id: true, code1C: true },
  });
  for (const u of users) {
    if (u.code1C) ctx.agentUserIdByHex.set(u.code1C.toLowerCase(), u.id);
  }
  log(`agent-users: mapped ${ctx.agentUserIdByHex.size} hex→User.id`);
}

// ─── 10.5 ЕдиницыИзмерения → мапа hex→назва ─ _Reference52 ────────────────────
// Лише пам'ять-мапа (кг/шт/пара) для майбутнього резолву одиниць у рядках.

async function loadUnitNames(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("units");
  const { args, src } = ctx;

  recon.sourceRows = await countTable(src, "_Reference52");
  log(`units: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(
    src,
    "_Reference52",
    ["_IDRRef", "_Description"],
    { batch: args.batch, limit: args.limit, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      const name = asTrimmed(row["_Description"]);
      if (!hex || !name) {
        recon.skipped++;
        continue;
      }
      ctx.unitNameByHex.set(hex, name);
      recon.written++; // "written" тут = додано у мапу
    }
  }
  log(`units: mapped ${ctx.unitNameByHex.size} hex→name`);
  return recon;
}

// ─── 10.6 КурсыВалют → ExchangeRate ─ _InfoRg4655 (+ _Reference30 Валюты) ─────
// EUR/USD визначаємо за Валютою: _Description="EUR"/"USD" АБО ISO _Code
// "978"/"840". Курс = _Fld4657 / _Fld4658(кратність). Дата = _Period (вже з
// year-offset через asDate). EUR-рядки також пишемо у ctx.eurRateByDay для
// документів частини 2.

const CURRENCY_COLS = [
  "_IDRRef",
  "_Code", // nchar(3) ISO numeric
  "_Description", // nvarchar(10) alpha
];

function classifyCurrency(
  code: string | null,
  desc: string | null,
): "EUR" | "USD" | null {
  const d = (desc ?? "").trim().toUpperCase();
  const c = (code ?? "").trim();
  if (d === "EUR" || c === "978") return "EUR";
  if (d === "USD" || c === "840") return "USD";
  return null;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── Історичний курс EUR→UAH на дату документа (5.4.6a, частина 2) ────────────
// Повертає курс грн/EUR для заданого дня з ctx.eurRateByDay: точний день, або —
// якщо такого нема — НАЙБЛИЖЧИЙ РАНІШИЙ день (≤ цільового). null коли дата
// порожня або мапа порожня. Відсортований масив [dayKey, rate] кешується ліниво
// й перебудовується лише коли змінився розмір мапи.
let _eurRateSorted: [string, number][] | null = null;
let _eurRateSortedSize = -1;

function eurRateForDate(ctx: ImportContext, date: Date | null): number | null {
  if (!date) return null;
  const map = ctx.eurRateByDay;
  if (map.size === 0) return null;
  if (_eurRateSorted === null || _eurRateSortedSize !== map.size) {
    _eurRateSorted = [...map.entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
    );
    _eurRateSortedSize = map.size;
  }
  const target = dayKey(date);
  const exact = map.get(target);
  if (exact != null) return exact;
  // Найбільший ключ ≤ target (бінарний пошук по відсортованому масиву).
  const entries = _eurRateSorted;
  let lo = 0;
  let hi = entries.length - 1;
  let best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid]![0] <= target) {
      best = entries[mid]![1];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

const RATE_COLS = [
  "_Period",
  "_Fld4656RRef", // Валюта (FK → _Reference30)
  "_Fld4657", // Курс (numeric10,4)
  "_Fld4658", // Кратность (numeric10,0)
];

async function importRates(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("rates");
  const sink = new ErrorSink(recon, "rates");
  const { args, src, prisma } = ctx;

  // Локальна мапа hex(валюта) → "EUR"|"USD"|null.
  const currencyByHex = new Map<string, "EUR" | "USD" | null>();
  for await (const rows of streamTable(src, "_Reference30", CURRENCY_COLS, {
    batch: 2000,
    limit: null,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) continue;
      currencyByHex.set(
        hex,
        classifyCurrency(asString(row["_Code"]), asString(row["_Description"])),
      );
    }
  }
  log(`rates: currencies decoded = ${currencyByHex.size}`);

  recon.sourceRows = await countTable(src, "_InfoRg4655");
  log(`rates: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_InfoRg4655", RATE_COLS, {
    batch: args.batch,
    limit: args.limit,
    // _InfoRg4655 (КурсыВалют) — незалежний періодичний регістр: НЕМАЄ
    // _RecorderRRef/_LineNo. Сортуємо по періоду+валюті+курсу (детерміновано).
    orderBy: ["_Period", "_Fld4656RRef", "_Fld4657"],
  })) {
    for (const row of rows) {
      const curHex = bufToHex(row["_Fld4656RRef"]);
      const cur = curHex ? (currencyByHex.get(curHex) ?? null) : null;
      if (!cur) {
        recon.skipped++;
        continue;
      }
      const mult = asNumberOr(row["_Fld4658"], 1) || 1;
      const rate = asNumberOr(row["_Fld4657"], 0) / mult;
      const date = asDate(row["_Period"]);
      if (!date || rate <= 0) {
        recon.skipped++;
        continue;
      }

      try {
        if (willWrite(ctx)) {
          // Idempotent через складений унікальний ключ (currencyFrom, currencyTo,
          // date). Один прогон = один запис на (валюта, дата).
          await prisma.exchangeRate.upsert({
            where: {
              currencyFrom_currencyTo_date: {
                currencyFrom: cur,
                currencyTo: "UAH",
                date,
              },
            },
            create: {
              currencyFrom: cur,
              currencyTo: "UAH",
              rate,
              date,
              source: "1c",
            },
            update: { rate, source: "1c" },
          });
        }
        if (cur === "EUR") ctx.eurRateByDay.set(dayKey(date), rate);
        recon.written++;
      } catch (e) {
        sink.record(`${cur}/${dayKey(date)}`, e);
      }
    }
    log(`rates: processed ${recon.written + recon.skipped + recon.errors}`);
  }
  log(`rates: eurRateByDay = ${ctx.eurRateByDay.size} days`);
  return recon;
}

// ─── 10.0 Раннер сутності `dictionaries` ─────────────────────────────────────
// Виконує всі підімпорти + мапи; повертає один зведений Recon (лічильники —
// сума підімпортів) для інформативного звіту.

async function importDictionaries(ctx: ImportContext): Promise<Recon> {
  const combined = newRecon("dictionaries");
  const parts = [
    await importPriceTypes(ctx),
    await importCashFlowArticles(ctx),
    await importBankAccounts(ctx),
    await importCashRegisters(ctx),
    await importRoutes(ctx),
    await loadAgentNames(ctx),
    await loadUnitNames(ctx),
    await importRates(ctx),
  ];
  for (const p of parts) {
    combined.sourceRows += p.sourceRows;
    combined.written += p.written;
    combined.skipped += p.skipped;
    combined.errors += p.errors;
    combined.unresolved += p.unresolved;
  }
  return combined;
}

// ════════════════════════════════════════════════════════════════════════════
// 10.7 — ФАЗА 1 (5.6): закрити прогалини довідників (--entity dictionaries-full)
// Одиниці виміру · Області · Міста · Торгові агенти · Контакти Viber.
// Кожен мапер — ЧИСТА функція (raw row → upsert-shape) для юніт-тестів.
// ════════════════════════════════════════════════════════════════════════════

// ─── Одиниці виміру (← _Reference52 ЕдиницыИзмерения) ─────────────────────────
// OWNED-довідник (одиниця належить номенклатурі/класифікатору). Вантажимо
// плоский глобальний список як довідник: name(_Description), code(_Code),
// coefficient(_Fld5990). `fullName`/`classifierCode` поки лишаємо null —
// класифікатор у окремому довіднику (КлассификаторЕдиницИзмерения), без
// підтвердженого _Fld на живій MSSQL (TODO).
const UNIT_FULL_COLS = [
  "_IDRRef",
  "_Code", // nchar(9)
  "_Description", // nvarchar(50) — кг/шт/пара
  "_Fld5990", // numeric(10,3) Коэффициент
];

export interface UnitUpsert {
  code1C: string;
  code: string | null;
  name: string;
  coefficient: string | null;
}

/** Чистий мапер рядка _Reference52 → дані upsert (null коли немає _IDRRef). */
export function mapUnitRow(row: Record<string, unknown>): UnitUpsert | null {
  const hex = bufToHex(row["_IDRRef"]);
  if (!hex) return null;
  return {
    code1C: hex,
    code: asString(row["_Code"]),
    name: asTrimmed(row["_Description"]) || hex,
    coefficient: asDecimalString(row["_Fld5990"]),
  };
}

async function importUnitsFull(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("units-dict");
  const sink = new ErrorSink(recon, "units-dict");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference52");
  log(`units-dict: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Reference52", UNIT_FULL_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const data = mapUnitRow(row);
      if (!data) {
        recon.skipped++;
        continue;
      }
      try {
        if (willWrite(ctx)) {
          await prisma.unit.upsert({
            where: { code1C: data.code1C },
            create: {
              code1C: data.code1C,
              code: data.code,
              name: data.name,
              coefficient: data.coefficient,
            },
            update: {
              code: data.code,
              name: data.name,
              coefficient: data.coefficient,
            },
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(data.code1C, e);
      }
    }
  }
  log(`units-dict: written ${recon.written}`);
  return recon;
}

// ─── Області (← _Reference6811 Области) ──────────────────────────────────────
const REGION_COLS = [
  "_IDRRef",
  "_Code", // nvarchar(9)
  "_Description", // nvarchar(50)
];

export interface RegionUpsert {
  code1C: string;
  code: string | null;
  name: string;
}

export function mapRegionRow(
  row: Record<string, unknown>,
): RegionUpsert | null {
  const hex = bufToHex(row["_IDRRef"]);
  if (!hex) return null;
  return {
    code1C: hex,
    code: asString(row["_Code"]),
    name: asTrimmed(row["_Description"]) || hex,
  };
}

async function importRegions(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("regions");
  const sink = new ErrorSink(recon, "regions");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference6811");
  log(`regions: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Reference6811", REGION_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const data = mapRegionRow(row);
      if (!data) {
        recon.skipped++;
        continue;
      }
      try {
        let id = "(pending)";
        if (willWrite(ctx)) {
          const created = await prisma.region.upsert({
            where: { code1C: data.code1C },
            create: { code1C: data.code1C, code: data.code, name: data.name },
            update: { code: data.code, name: data.name },
            select: { id: true },
          });
          id = created.id;
        }
        ctx.regionIdByHex.set(data.code1C, id);
        recon.written++;
      } catch (e) {
        sink.record(data.code1C, e);
      }
    }
  }
  log(`regions: mapped ${ctx.regionIdByHex.size} hex→id`);
  return recon;
}

// ─── Міста (← _Reference6810 Города, OWNED областю _OwnerIDRRef) ──────────────
const CITY_COLS = [
  "_IDRRef",
  "_OwnerIDRRef", // → область-власник (_Reference6811)
  "_Code", // nvarchar(9)
  "_Description", // nvarchar(50)
];

export interface CityUpsert {
  code1C: string;
  code: string | null;
  name: string;
  regionCode1C: string | null;
}

export function mapCityRow(row: Record<string, unknown>): CityUpsert | null {
  const hex = bufToHex(row["_IDRRef"]);
  if (!hex) return null;
  return {
    code1C: hex,
    code: asString(row["_Code"]),
    name: asTrimmed(row["_Description"]) || hex,
    regionCode1C: bufToHex(row["_OwnerIDRRef"]),
  };
}

async function importCities(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("cities");
  const sink = new ErrorSink(recon, "cities");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference6810");
  log(`cities: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Reference6810", CITY_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const data = mapCityRow(row);
      if (!data) {
        recon.skipped++;
        continue;
      }
      // Резолв області-власника через мапу (regions імпортуються першими).
      const regionId = data.regionCode1C
        ? (ctx.regionIdByHex.get(data.regionCode1C) ?? null)
        : null;
      if (data.regionCode1C && !regionId) recon.unresolved++;
      try {
        if (willWrite(ctx)) {
          await prisma.cityy.upsert({
            where: { code1C: data.code1C },
            create: {
              code1C: data.code1C,
              code: data.code,
              name: data.name,
              regionCode1C: data.regionCode1C,
              regionId,
            },
            update: {
              code: data.code,
              name: data.name,
              regionCode1C: data.regionCode1C,
              regionId,
            },
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(data.code1C, e);
      }
    }
  }
  log(`cities: written ${recon.written}`);
  return recon;
}

// ─── Торгові агенти (← _Reference6628 ТорговыеАгенты) ─────────────────────────
// `_Fld7445RRef` (Користувач) → hex збігається з User.code1C (hex 1С-агента),
// тож резолвимо через наявну мапу ctx.agentUserIdByHex (key = hex агента, той
// самий _IDRRef). Зв'язок userId опційний.
const TRADE_AGENT_COLS = [
  "_IDRRef",
  "_Code", // nvarchar(9)
  "_Description", // nvarchar(25) — ПІБ агента
];

export interface TradeAgentUpsert {
  code1C: string;
  code: string | null;
  name: string;
}

export function mapTradeAgentRow(
  row: Record<string, unknown>,
): TradeAgentUpsert | null {
  const hex = bufToHex(row["_IDRRef"]);
  if (!hex) return null;
  return {
    code1C: hex,
    code: asString(row["_Code"]),
    name: asTrimmed(row["_Description"]) || hex,
  };
}

async function importTradeAgents(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("trade-agents");
  const sink = new ErrorSink(recon, "trade-agents");
  const { args, src, prisma } = ctx;

  // User-мапа (hex 1С-агента = User.code1C) для опційного userId-лінку.
  if (ctx.agentUserIdByHex.size === 0) {
    await loadAgentUserIds(ctx);
  }

  recon.sourceRows = await countTable(src, "_Reference6628");
  log(`trade-agents: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(
    src,
    "_Reference6628",
    TRADE_AGENT_COLS,
    { batch: args.batch, limit: args.limit, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const data = mapTradeAgentRow(row);
      if (!data) {
        recon.skipped++;
        continue;
      }
      const userId = ctx.agentUserIdByHex.get(data.code1C) ?? null;
      try {
        if (willWrite(ctx)) {
          await prisma.mgrTradeAgent.upsert({
            where: { code1C: data.code1C },
            create: {
              code1C: data.code1C,
              code: data.code,
              name: data.name,
              userId,
            },
            update: { code: data.code, name: data.name, userId },
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(data.code1C, e);
      }
    }
  }
  log(`trade-agents: written ${recon.written}`);
  return recon;
}

// ─── Контакти Viber (← Catalog.КонтактыViber) ────────────────────────────────
// ✅ ДЕКОДОВАНО офлайн (docs/1C_MSSQL_CODES.md). Каталог КонтактыViber у
// ЦЕНТРАЛЬНОМУ дампі (docs/1c-export-2026-06-02/Catalogs/КонтактыViber.xml):
//   UUID 31a8bbfa-8275-40a8-80bb-feb4f51d88d4 → _Reference7527.
// Атрибути (XML декларація → _Fld-колонки, типи звірені з columns.tsv — HIGH):
//   _Fld7570=Фото, _Fld7571RRef=СтатусДиалога(EnumRef→hex), _Fld7572=ДатаПодписки,
//   _Fld7573=ДатаОтписки, _Fld7574=Телефон, _Fld7575=ФИО, _Fld7576=Подписан,
//   _Fld7577RRef=ИсточникПривличения, _Fld7578RRef=Контрагент, _Fld7579=Идентификатор,
//   _Fld7580=ДатаРегистрации, _Fld7581=НовоеСообщение, _Fld7597RRef=Менеджер,
//   _Fld7639=ЗапросОбласти, _Fld7731=ОстатокСесии, _Fld7735RRef=Область.
//   ⚠️ СтатусДиалога — посилання на Enum (зберігаємо hex; декод у текст — окремо).
const VIBER_CONTACT_TABLE = "_Reference7527"; // КонтактыViber (HIGH)
const VIBER_PHONE_COL = "_Fld7574"; // Телефон (HIGH)
const VIBER_SUBSCRIBED_COL = "_Fld7572"; // ДатаПодписки (HIGH)
const VIBER_CLIENT_COL = "_Fld7578RRef"; // Контрагент (HIGH)
const VIBER_STATUS_COL = "_Fld7571RRef"; // СтатусДиалога (EnumRef→hex) (HIGH)

export interface ViberContactUpsert {
  code1C: string;
  phone: string;
  subscribedAt: Date | null;
  clientCode1C: string | null;
  dialogStatus: string | null;
}

/**
 * Чистий мапер рядка КонтактыViber → дані upsert. Параметри `cols` дозволяють
 * передати фактичні імена колонок (резолвлені на живій MSSQL) — за замовчанням
 * беруться placeholder-константи. Повертає null коли немає _IDRRef або телефону.
 */
export function mapViberContactRow(
  row: Record<string, unknown>,
  cols: {
    phone: string;
    subscribed: string;
    client: string;
    status: string;
  } = {
    phone: VIBER_PHONE_COL,
    subscribed: VIBER_SUBSCRIBED_COL,
    client: VIBER_CLIENT_COL,
    status: VIBER_STATUS_COL,
  },
): ViberContactUpsert | null {
  const hex = bufToHex(row["_IDRRef"]);
  if (!hex) return null;
  const phone = asString(row[cols.phone]);
  if (!phone) return null;
  return {
    code1C: hex,
    phone,
    subscribedAt: asDate(row[cols.subscribed]),
    clientCode1C: bufToHex(row[cols.client]),
    dialogStatus: asString(row[cols.status]),
  };
}

async function importViberContacts(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("viber-contacts");
  const sink = new ErrorSink(recon, "viber-contacts");
  const { args, src, prisma } = ctx;

  if (!VIBER_CONTACT_TABLE) {
    warn(
      "viber-contacts: MSSQL-таблиця КонтактыViber не уточнена (відсутня в " +
        "офлайн-дампі) — пропускаю. Уточнити _ReferenceNNN + _Fld коди на живій " +
        "MSSQL (див. TODO у import-1c-historical.ts).",
    );
    return recon;
  }

  const cols = {
    phone: VIBER_PHONE_COL,
    subscribed: VIBER_SUBSCRIBED_COL,
    client: VIBER_CLIENT_COL,
    status: VIBER_STATUS_COL,
  };

  recon.sourceRows = await countTable(src, VIBER_CONTACT_TABLE);
  log(`viber-contacts: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(
    src,
    VIBER_CONTACT_TABLE,
    ["_IDRRef", cols.phone, cols.subscribed, cols.client, cols.status],
    { batch: args.batch, limit: args.limit, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const data = mapViberContactRow(row, cols);
      if (!data) {
        recon.skipped++;
        continue;
      }
      try {
        if (willWrite(ctx)) {
          await prisma.viberContact.upsert({
            where: { code1C: data.code1C },
            create: {
              code1C: data.code1C,
              phone: data.phone,
              subscribedAt: data.subscribedAt,
              clientCode1C: data.clientCode1C,
              dialogStatus: data.dialogStatus,
            },
            update: {
              phone: data.phone,
              subscribedAt: data.subscribedAt,
              clientCode1C: data.clientCode1C,
              dialogStatus: data.dialogStatus,
            },
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(data.code1C, e);
      }
    }
  }
  log(`viber-contacts: written ${recon.written}`);
  return recon;
}

// ─── Склади (← _Reference95 Склады) ──────────────────────────────────────────
// ✅ ДЕКОДОВАНО: Catalog.Склады uuid=c99983ef → dbnames "Reference",95.
// Колонки (docs/1c-mssql-schema/columns.tsv): _IDRRef, _Code(nchar 9),
// _Description(nvarchar 50). Ієрархічний (_ParentIDRRef/_Folder).
// ⚠️ ВИПРАВЛЕНО: `_Folder` у 1С ІНВЕРСНА (як у Номенклатурі/Кассах/Містах):
//   1 = ЕЛЕМЕНТ (реальний склад), 0 = ГРУПА/папка → пропускаємо ПАПКИ (_Folder=0).
//   Раніше логіка була дзеркальна (skip _Folder=1) → імпортувалась 1 папка
//   замість реальних складів, тож warehouseId складських документів не резолвився.
const WAREHOUSE_COLS = [
  "_IDRRef",
  "_Folder", // 1 = склад (елемент), 0 = папка (група) → пропускаємо папки
  "_Code", // nchar(9)
  "_Description", // nvarchar(50)
];

export interface WarehouseUpsert {
  code1C: string;
  code: string | null;
  name: string;
}

/** Чистий мапер рядка _Reference95 → дані upsert (null коли папка/без _IDRRef). */
export function mapWarehouseRow(
  row: Record<string, unknown>,
): WarehouseUpsert | null {
  const hex = bufToHex(row["_IDRRef"]);
  if (!hex) return null;
  // _Folder (ІНВЕРСНА логіка 1С): 0 = група (папка) → пропускаємо; 1 = елемент.
  if (!asBool(row["_Folder"])) {
    return null;
  }
  return {
    code1C: hex,
    code: asString(row["_Code"]),
    name: asTrimmed(row["_Description"]) || hex,
  };
}

async function importWarehouses(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("warehouses");
  const sink = new ErrorSink(recon, "warehouses");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference95");
  log(`warehouses: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Reference95", WAREHOUSE_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const data = mapWarehouseRow(row);
      if (!data) {
        recon.skipped++;
        continue;
      }
      try {
        if (willWrite(ctx)) {
          await prisma.warehouse.upsert({
            where: { code1C: data.code1C },
            create: {
              code1C: data.code1C,
              name: data.name,
            },
            update: { name: data.name },
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(data.code1C, e);
      }
    }
  }
  log(`warehouses: written ${recon.written}`);
  return recon;
}

// ─── Якість (← _Reference59 Качество) ────────────────────────────────────────
// ✅ ДЕКОДОВАНО: Catalog.Качество uuid=8a9969c7 → dbnames "Reference",59.
// Колонки: _IDRRef, _Code(nchar 9), _Description(nvarchar 40). Невеликий довідник
// (Новий / Сток / 1-й сорт …) → модель Quality (upsert по code1C).
const QUALITY_COLS = [
  "_IDRRef",
  "_Code", // nchar(9)
  "_Description", // nvarchar(40)
];

export interface QualityUpsert {
  code1C: string;
  code: string | null;
  name: string;
}

/** Чистий мапер рядка _Reference59 → дані upsert (null коли немає _IDRRef). */
export function mapQualityRow(
  row: Record<string, unknown>,
): QualityUpsert | null {
  const hex = bufToHex(row["_IDRRef"]);
  if (!hex) return null;
  return {
    code1C: hex,
    code: asString(row["_Code"]),
    name: asTrimmed(row["_Description"]) || hex,
  };
}

async function importQualities(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("qualities");
  const sink = new ErrorSink(recon, "qualities");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_Reference59");
  log(`qualities: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, "_Reference59", QUALITY_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
  })) {
    for (const row of rows) {
      const data = mapQualityRow(row);
      if (!data) {
        recon.skipped++;
        continue;
      }
      try {
        if (willWrite(ctx)) {
          await prisma.quality.upsert({
            where: { code1C: data.code1C },
            create: {
              code1C: data.code1C,
              code: data.code,
              name: data.name,
            },
            update: { code: data.code, name: data.name },
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(data.code1C, e);
      }
    }
  }
  log(`qualities: written ${recon.written}`);
  return recon;
}

// ─── Раннер сутності `dictionaries-full` ─────────────────────────────────────
// Regions ПЕРЕД cities (cities резолвлять регіон по hex з мапи).
async function importDictionariesFull(ctx: ImportContext): Promise<Recon> {
  const combined = newRecon("dictionaries-full");
  const parts = [
    await importUnitsFull(ctx),
    await importRegions(ctx),
    await importCities(ctx),
    await importTradeAgents(ctx),
    await importViberContacts(ctx),
    await importWarehouses(ctx),
    await importQualities(ctx),
  ];
  for (const p of parts) {
    combined.sourceRows += p.sourceRows;
    combined.written += p.written;
    combined.skipped += p.skipped;
    combined.errors += p.errors;
    combined.unresolved += p.unresolved;
  }
  return combined;
}

// ─── 11. ВзаиморасчетыСКонтрагентами → MgrDebtMovement (opening) ─ _AccumRg5269 ─
// Регістр накопичення «Взаиморасчеты с контрагентами». Раніше (5.4.5a) ми
// агрегували чистий борг клієнта в одне число й писали ОДИН `opening`-рух на
// клієнта (sourceId=hex контрагента). Тепер (5.5-Звіт-0) — пишемо ПОМАШИННІ
// рухи боргу: по рядку регістра, кожен зі своєю датою (_Period) — фундамент для
// старіння дебіторки у звіті.
//
// Колонки (docs/1c-mssql-schema/columns.tsv):
//   _Period       — дата руху (occurredAt; asDate віднімає year-offset 1С);
//   _RecorderRRef — документ-реєстратор (16 байт);
//   _LineNo       — № рядка у реєстраторі;
//   _RecordKind   — 0 = приход/+ (збільшує борг клієнта перед нами), 1 = расход/−;
//   _Fld5273RRef  — Контрагент;
//   _Fld5275      — СуммаУпр (EUR, ресурс);
//   _Active       — прапор активного руху.
//
// На кожен активний рядок створюємо MgrDebtMovement:
//   kind=opening (єдиний простий лейбл «з історії 1С»; реальний знак — у amountEur),
//   sourceType=accum_rg5269, sourceId=`<hexРеєстратора>:<lineNo>`,
//   occurredAt=_Period, amountEur=±СуммаУпр.
// Реалізації/оплати НЕ резолвимо тут (це крок Звіт-2 — детальніша класифікація).
//
// Клієнтів зіставляємо за uid1C (hex _IDRRef контрагента), який importCustomers
// зберіг раніше. Прелоад мапи uid1C→id (78к рядків — без точкового findUnique).
//
// Ідемпотентність: на старті чисто видаляємо всі рухи з sourceType=accum_rg5269
// (і старий агрегат-opening з 5.4.5a, і попередній помашинний прогін). Live-рухи
// (sourceType sale/cash_order/manual) НЕ зачіпаються.
//
// Порядок сортування: ["_RecorderRRef", "_LineNo"] — детермінований складений
// ключ (обидва наявні у _AccumRg5269 згідно docs/1c-mssql-schema/columns.tsv).
// Фільтр активних рухів: _Active = 0x01 (колонка _Active binary(1) присутня).

// Множник знаку боргу. Якщо у живих даних борг показується з інвертованим
// знаком — змінити на -1.
// TODO: якщо знак боргу інвертований на живих даних — змінити на -1
const DEBT_SIGN = 1;

// Запасна дата руху, якщо _Period порожній (теоретично — поле NOT NULL у 1С).
const DEBT_OPENING_AS_OF = new Date("2021-01-01T00:00:00Z");

const DEBT_COLS = [
  "_Period",
  "_RecorderRRef",
  "_LineNo",
  "_RecordKind",
  "_Fld5273RRef",
  "_Fld5275",
];

// Тип одного помашинного руху боргу для батчевої вставки.
type DebtMovementRow = {
  clientId: string;
  amountEur: number;
  kind: "opening";
  sourceType: string;
  sourceId: string;
  occurredAt: Date;
  note: string;
};

const DEBT_INSERT_BATCH = 1000;

async function importDebt(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("debt");
  const sink = new ErrorSink(recon, "debt");
  const { args, src, prisma } = ctx;

  const activeWhere = "_Active = 0x01";
  recon.sourceRows = await countTable(src, "_AccumRg5269", activeWhere);
  log(`debt: active source rows = ${recon.sourceRows}`);

  // Прелоад мапи клієнтів: uid1C (hex контрагента) → MgrClient.id.
  const clientByHex = new Map<string, string>();
  const clients = await prisma.mgrClient.findMany({
    where: { uid1C: { not: null } },
    select: { id: true, uid1C: true },
  });
  for (const c of clients) {
    if (c.uid1C) clientByHex.set(c.uid1C, c.id);
  }
  log(`debt: preloaded ${clientByHex.size} clients by uid1C`);

  if (willWrite(ctx)) {
    // Чисте перестворення: прибираємо старий агрегат-opening (5.4.5a) і
    // попередній помашинний прогін. Live-рухи (sale/cash_order/manual) лишаються.
    const deleted = await prisma.mgrDebtMovement.deleteMany({
      where: { sourceType: "accum_rg5269" },
    });
    log(`debt: deleted ${deleted.count} prior accum_rg5269 movements`);

    let processed = 0;
    const touchedClientIds = new Set<string>();
    let buffer: DebtMovementRow[] = [];

    const flush = async (): Promise<void> => {
      if (buffer.length === 0) return;
      // Після deleteMany колізій бути не повинно; skipDuplicates — страховка
      // від дублю recorder:lineNo у вихідних даних.
      await prisma.mgrDebtMovement.createMany({
        data: buffer,
        skipDuplicates: true,
      });
      buffer = [];
    };

    for await (const rows of streamTable(src, "_AccumRg5269", DEBT_COLS, {
      batch: args.batch,
      limit: args.limit,
      orderBy: ["_RecorderRRef", "_LineNo"],
      where: activeWhere,
    })) {
      for (const row of rows) {
        processed++;
        try {
          const clientHex = bufToHex(row["_Fld5273RRef"]);
          if (!clientHex || !clientByHex.has(clientHex)) {
            recon.unresolved++;
            continue;
          }
          const amt = asNumberOr(row["_Fld5275"], 0);
          const kind = asNumber(row["_RecordKind"]) ?? 0;
          // RecordKind 0 = приход (+), 1 = витрата (−).
          const signed = round2(DEBT_SIGN * (kind === 0 ? amt : -amt));
          const recorderHex = bufToHex(row["_RecorderRRef"]) ?? "—";
          const lineNo = asNumber(row["_LineNo"]) ?? 0;
          const sourceId = `${recorderHex}:${lineNo}`;
          const occurredAt = asDate(row["_Period"]) ?? DEBT_OPENING_AS_OF;

          buffer.push({
            clientId: clientByHex.get(clientHex)!,
            amountEur: signed,
            kind: "opening",
            sourceType: "accum_rg5269",
            sourceId,
            occurredAt,
            note: "Рух боргу з 1С (_AccumRg5269)",
          });
          touchedClientIds.add(clientByHex.get(clientHex)!);
          recon.written++;

          if (buffer.length >= DEBT_INSERT_BATCH) await flush();
        } catch (e) {
          sink.record(bufToHex(row["_RecorderRRef"]) ?? `row#${processed}`, e);
        }
      }
      log(
        `debt: ${recon.written} movements written (${recon.unresolved} unresolved, ${processed} rows processed)`,
      );
    }
    await flush();

    // Повний прогін: обнуляємо всіх клієнтів і виставляємо MgrClient.debt = Σ
    // рухів. Коректно, бо ми перестворили всі accum-рухи; live-рухи теж у сумі.
    const recomputed = await recomputeDebtForClients(prisma);
    log(
      `debt: recomputed cache for ${recomputed} clients (touched ${touchedClientIds.size})`,
    );
  } else {
    // dry-run: рахуємо скільки рядків записали б (без запису в БД).
    for await (const rows of streamTable(src, "_AccumRg5269", DEBT_COLS, {
      batch: args.batch,
      limit: args.limit,
      orderBy: ["_RecorderRRef", "_LineNo"],
      where: activeWhere,
    })) {
      for (const row of rows) {
        const clientHex = bufToHex(row["_Fld5273RRef"]);
        if (!clientHex || !clientByHex.has(clientHex)) {
          recon.unresolved++;
          continue;
        }
        recon.written++;
      }
    }
  }

  log(
    `debt: done — written=${recon.written} unresolved=${recon.unresolved} errors=${recon.errors}`,
  );
  return recon;
}

// ─── 12. ФАЗА 8 — дрібні / службові регістри (`--entity misc`) ───────────────
//
// Зведений раннер `misc`: переносить історичні дані тих службових регістрів, що
// реально містять дані L-TEX і піддаються декодуванню за наявними картами:
//   - ИсторияСтатусовКонтрагентов (_InfoRg7647)  → ClientStatusHistory
//   - НадежностьПоставщиков        (_InfoRg4678)  → SupplierReliability
//
// `НормыЗапасов` та `СтатусДня` живуть у МОБІЛЬНІЙ конфізі (docs/1c-export-mobile-
// full/), а не в центральній УТ — їхні фізичні `_InfoRg…`/`_Reference…` номери у
// центральній MSSQL невідомі (немає у docs/1c-mssql-schema/dbnames.txt). Тому їх
// мапери лишені як TODO-заглушки: таблиці/UI готові, дані заллються, коли user
// підтвердить фізичні назви (або якщо реєстри з'являться у дампі центральної).

const STATUS_HISTORY_COLS = [
  "_Period",
  "_Fld7648RRef", // Контрагент
  "_Fld7649RRef", // СтатусКонтрагента
  "_Fld7650RRef", // ОперативныйСтатусКонтрагента
];

const RELIABILITY_COLS = [
  "_Period",
  "_Fld4679RRef", // Контрагент
  "_Fld4680RRef", // Надежность (Enum Важность)
];

interface StatusHistoryRowData {
  clientCode1C: string;
  statusCode1C: string | null;
  operationalStatus: string | null;
  changedAt: Date;
}

async function importClientStatusHistory(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("status_history");
  const sink = new ErrorSink(recon, "status_history");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_InfoRg7647");
  log(`status_history: source rows = ${recon.sourceRows}`);

  if (willWrite(ctx)) {
    const deleted = await prisma.clientStatusHistory.deleteMany({});
    log(`status_history: deleted ${deleted.count} prior rows`);
  }

  let buffer: StatusHistoryRowData[] = [];
  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    await prisma.clientStatusHistory.createMany({
      data: buffer,
      skipDuplicates: true,
    });
    buffer = [];
  };

  // _InfoRg7647 — незалежний періодичний регістр (День): без _RecorderRRef.
  for await (const rows of streamTable(
    src,
    "_InfoRg7647",
    STATUS_HISTORY_COLS,
    {
      batch: args.batch,
      limit: args.limit,
      orderBy: ["_Period", "_Fld7648RRef"],
    },
  )) {
    for (const row of rows) {
      try {
        const clientHex = bufToHex(row["_Fld7648RRef"]);
        const changedAt = asDate(row["_Period"]);
        if (!clientHex || !changedAt) {
          recon.skipped++;
          continue;
        }
        buffer.push({
          clientCode1C: clientHex,
          statusCode1C: bufToHex(row["_Fld7649RRef"]),
          operationalStatus: bufToHex(row["_Fld7650RRef"]),
          changedAt,
        });
        recon.written++;
        if (willWrite(ctx) && buffer.length >= 500) await flush();
        if (!willWrite(ctx)) buffer = []; // dry-run: не накопичуємо
      } catch (e) {
        sink.record(bufToHex(row["_Fld7648RRef"]) ?? "?", e);
      }
    }
  }
  if (willWrite(ctx)) await flush();
  log(`status_history: written=${recon.written} skipped=${recon.skipped}`);
  return recon;
}

// ─── Історія роботи з клієнтом → MgrClientTimelineEntry ─ _InfoRg7459 ─────────
// 1С InformationRegister «ИсторияРаботыСКлиентом» (uuid 58e29ac7…, періодичність
// Секунда). Фізична таблиця `_InfoRg7459`, колонки декодовано з
// docs/1c-mssql-schema (dbnames.txt + columns.tsv):
//   _Period        → occurredAt (дата-час запису)
//   _Fld7460RRef   → Торговый (агент-автор, CatalogRef.ТорговыеАгенты) → User
//   _Fld7461RRef   → Клиент (Контрагент, Master) → MgrClient
//   _Fld7462       → Запись (текст нотатки, ntext) → body
//   _Fld7463       → УИД_Записи (v8:UUID, binary16) → metadata.uid1C
//   _Fld7682       → АвтоматичнийЗаписБезВзаємодіїЗКлієнтом (bool, binary1)
// kind: manual → "note_1c", автоматичний → "note_1c_auto" (обидва read-only у
// картці; ClientTimelineItem редагує лише kind="comment").
const CLIENT_TIMELINE_COLS = [
  "_Period",
  "_Fld7460RRef", // Торговый (агент-автор)
  "_Fld7461RRef", // Клиент (Контрагент)
  "_Fld7462", // Запись (текст)
  "_Fld7463", // УИД_Записи
  "_Fld7682", // АвтоматичнийЗапис
];

interface ClientTimelineRowData {
  clientId: string;
  kind: string;
  body: string;
  occurredAt: Date;
  authorUserId: string | null;
  metadata: { uid1C: string | null; auto: boolean };
}

async function importClientTimeline(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("client_timeline");
  const sink = new ErrorSink(recon, "client_timeline");
  const { args, src, prisma } = ctx;

  // Карта агент(hex)→User.id для автора запису.
  if (ctx.agentUserIdByHex.size === 0) {
    await loadAgentUserIds(ctx);
  }

  // Карта Контрагент(hex = MgrClient.uid1C) → MgrClient.id.
  const clientIdByHex = new Map<string, string>();
  const clients = await prisma.mgrClient.findMany({
    select: { id: true, uid1C: true },
  });
  for (const c of clients) {
    if (c.uid1C) clientIdByHex.set(c.uid1C.toLowerCase(), c.id);
  }
  log(`client_timeline: mapped ${clientIdByHex.size} hex→MgrClient.id`);

  recon.sourceRows = await countTable(src, "_InfoRg7459");
  log(`client_timeline: source rows = ${recon.sourceRows}`);

  // Ідемпотентність: прибираємо лише раніше імпортовані записи (наші app-події
  // мають інші kind — comment/order/sale/… — і не чіпаються).
  if (willWrite(ctx)) {
    const deleted = await prisma.mgrClientTimelineEntry.deleteMany({
      where: { kind: { in: ["note_1c", "note_1c_auto"] } },
    });
    log(`client_timeline: deleted ${deleted.count} prior imported rows`);
  }

  let buffer: ClientTimelineRowData[] = [];
  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    await prisma.mgrClientTimelineEntry.createMany({ data: buffer });
    buffer = [];
  };

  for await (const rows of streamTable(
    src,
    "_InfoRg7459",
    CLIENT_TIMELINE_COLS,
    {
      batch: args.batch,
      limit: args.limit,
      orderBy: ["_Period", "_Fld7461RRef"],
    },
  )) {
    for (const row of rows) {
      try {
        const clientHex = bufToHex(row["_Fld7461RRef"]);
        const occurredAt = asDate(row["_Period"]);
        const body = asString(row["_Fld7462"]);
        const clientId = clientHex
          ? (clientIdByHex.get(clientHex) ?? null)
          : null;
        // Без клієнта у нашій базі, без дати або без тексту — пропускаємо.
        if (!clientId || !occurredAt || !body) {
          recon.skipped++;
          continue;
        }
        const agentHex = bufToHex(row["_Fld7460RRef"]);
        const authorUserId = agentHex
          ? (ctx.agentUserIdByHex.get(agentHex) ?? null)
          : null;
        const auto = asBool(row["_Fld7682"]);
        buffer.push({
          clientId,
          kind: auto ? "note_1c_auto" : "note_1c",
          body,
          occurredAt,
          authorUserId,
          metadata: { uid1C: bufToHex(row["_Fld7463"]), auto },
        });
        recon.written++;
        if (willWrite(ctx) && buffer.length >= 500) await flush();
        if (!willWrite(ctx)) buffer = []; // dry-run: не накопичуємо
      } catch (e) {
        sink.record(bufToHex(row["_Fld7461RRef"]) ?? "?", e);
      }
    }
    log(
      `client_timeline: processed ${recon.written + recon.skipped + recon.errors}`,
    );
  }
  if (willWrite(ctx)) await flush();
  log(`client_timeline: written=${recon.written} skipped=${recon.skipped}`);
  return recon;
}

interface ReliabilityRowData {
  supplierCode1C: string;
  reliability: string;
  occurredAt: Date;
}

async function importSupplierReliability(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("reliability");
  const sink = new ErrorSink(recon, "reliability");
  const { args, src, prisma } = ctx;

  recon.sourceRows = await countTable(src, "_InfoRg4678");
  log(`reliability: source rows = ${recon.sourceRows}`);

  if (willWrite(ctx)) {
    const deleted = await prisma.supplierReliability.deleteMany({});
    log(`reliability: deleted ${deleted.count} prior rows`);
  }

  let buffer: ReliabilityRowData[] = [];
  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    await prisma.supplierReliability.createMany({
      data: buffer,
      skipDuplicates: true,
    });
    buffer = [];
  };

  for await (const rows of streamTable(src, "_InfoRg4678", RELIABILITY_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_Period", "_Fld4679RRef"],
  })) {
    for (const row of rows) {
      try {
        const supplierHex = bufToHex(row["_Fld4679RRef"]);
        const occurredAt = asDate(row["_Period"]);
        if (!supplierHex || !occurredAt) {
          recon.skipped++;
          continue;
        }
        // `Важность` — Enum (hex-посилання). Зберігаємо hex-код; мапу
        // hex→low/medium/high можна навісити у звіті за потреби (// TODO).
        buffer.push({
          supplierCode1C: supplierHex,
          reliability: bufToHex(row["_Fld4680RRef"]) ?? "—",
          occurredAt,
        });
        recon.written++;
        if (willWrite(ctx) && buffer.length >= 500) await flush();
        if (!willWrite(ctx)) buffer = [];
      } catch (e) {
        sink.record(bufToHex(row["_Fld4679RRef"]) ?? "?", e);
      }
    }
  }
  if (willWrite(ctx)) await flush();
  log(`reliability: written=${recon.written} skipped=${recon.skipped}`);
  return recon;
}

// НормыЗапасов (мобільна конфіга) → StockNorm. Фізична таблиця у центральній
// MSSQL невідома (метаданий UUID d8ce1ff8-… не зматчений у dbnames.txt). Коли
// user підтвердить `_InfoRg<N>` + `_Fld<N>RRef` — розкоментувати streamTable за
// зразком вище, мапа вимірів: Номенклатура / Склад? / Характеристика / ОВ /
// ресурс Количество + _Period (set_at). Idempotent через @@unique stock_norm_key
// (підставляти "" замість null у warehouse/char/unit-кодах перед upsert).
async function importStockNorms(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("stock_norms");
  log(
    "stock_norms: SKIPPED — фізична таблиця _InfoRg для НормыЗапасов у " +
      "центральній MSSQL невідома (метадані лише у mobile-full). // TODO user",
  );
  void ctx;
  return recon;
}

// СтатусДня (Enum, мобільна конфіга) — тайм-трекінг дня агента. У центральній УТ
// окремого регістру немає; у мобільній це службовий регістр відомостей. Коли
// з'явиться фізична таблиця — мапити userId через agentUserIdByHex (1С-агент →
// User.code1C), kind ∈ {start,end}, date + at з _Period/реквізиту події.
async function importAgentDayLog(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("agent_day_log");
  log(
    "agent_day_log: SKIPPED — регістр СтатусДня лише у mobile-full; фізична " +
      "таблиця у центральній MSSQL невідома. // TODO user",
  );
  void ctx;
  return recon;
}

// Зведений раннер `misc`: усі підімпорти Фази 8; повертає сумарний Recon.
async function importMisc(ctx: ImportContext): Promise<Recon> {
  const combined = newRecon("misc");
  const parts = [
    await importClientStatusHistory(ctx),
    await importSupplierReliability(ctx),
    await importStockNorms(ctx),
    await importAgentDayLog(ctx),
  ];
  for (const p of parts) {
    combined.sourceRows += p.sourceRows;
    combined.written += p.written;
    combined.skipped += p.skipped;
    combined.errors += p.errors;
    combined.unresolved += p.unresolved;
  }
  return combined;
}

// ════════════════════════════════════════════════════════════════════════════
// 12. РЕГІСТРИ-ОБОРОТИ (Фаза 2, 5.6) — _AccumRg5604/5309/5788/5374
// ════════════════════════════════════════════════════════════════════════════
// Патерн дзеркалить importDebt: stream активних рядків регістра → мапер (з
// registry-import-map) → батчева createMany з idempotent-ключем джерела.
// Ідемпотентність: на старті deleteMany по всій таблиці (повне перестворення),
// далі skipDuplicates як страховка від колізій recorder:lineNo у джерелі.
//
// ⚠️ Фізичні коди _FldNNNN звірені з docs/1c-mssql-schema/columns.tsv + XML
// AccumulationRegisters, але НЕ перевірені на живому MSSQL. Якщо звірка не зійдеться
// — уточнити мапінг колонок нижче.

const REG_INSERT_BATCH = 1000;
const REG_AS_OF_FALLBACK = new Date("2021-01-01T00:00:00Z");

// Резолв clientId за hex(Контрагент) з ctx.customers (Customer.id) — для регістрів
// беремо MgrClient через uid1C напряму, бо clientCode1C тут = hex контрагента.
async function loadClientIdByHex(
  ctx: ImportContext,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const clients = await ctx.prisma.mgrClient.findMany({
      where: { uid1C: { not: null } },
      select: { id: true, uid1C: true },
    });
    for (const c of clients) {
      if (c.uid1C) map.set(c.uid1C, c.id);
    }
  } catch (e) {
    warn(`loadClientIdByHex: ${errMsg(e)}`);
  }
  return map;
}

// ─── 12a. Продажи → SalesMovement ─ _AccumRg5604 ──────────────────────────────
// ✅ ДЕКОДОВАНО офлайн (docs/1C_MSSQL_CODES.md). UUID ada2135a-… → _AccumRg5604.
// Виміри (XML декларація → _Fld): _Fld5605RRef=Номенклатура,
//   _Fld5606RRef=ХарактеристикаНоменклатуры, _Fld5607_RRRef=ЗаказПокупателя(поліморф),
//   _Fld5608RRef=ДоговорКонтрагента, _Fld5609_RRRef=ДокументПродажи(поліморф),
//   _Fld5610RRef=Подразделение, _Fld5611RRef=Проект, _Fld5612RRef=Организация,
//   _Fld5613RRef=Контрагент. Ресурси: _Fld5614=Количество, _Fld5615=Стоимость,
//   _Fld5616=СтоимостьБезСкидок, _Fld5617=НДС, _Fld7293=Вес. Усе — HIGH.
// Продажи — оборотний регістр (без _RecordKind): усе recordKind=0 (прихід).
const SALES_REG_TABLE = "_AccumRg5604";
const SALES_REG_COLS = [
  "_Period",
  "_RecorderRRef",
  "_LineNo",
  "_Fld5605RRef", // Номенклатура
  "_Fld5606RRef", // ХарактеристикаНоменклатуры (лот)
  "_Fld5607_RRRef", // ЗаказПокупателя
  "_Fld5609_RRRef", // ДокументПродажи
  "_Fld5613RRef", // Контрагент
  "_Fld5614", // Количество
  "_Fld5615", // Стоимость
  "_Fld5616", // СтоимостьБезСкидок
  "_Fld7293", // Вес
];

async function importSalesRegister(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("sales-reg");
  const sink = new ErrorSink(recon, "sales-reg");
  const { args, src, prisma } = ctx;

  await ensureProductLotDicts(ctx);
  const clientByHex = await loadClientIdByHex(ctx);

  const activeWhere = "_Active = 0x01";
  recon.sourceRows = await countTable(src, SALES_REG_TABLE, activeWhere);
  log(`sales-reg: active source rows = ${recon.sourceRows}`);

  if (willWrite(ctx)) {
    const del = await prisma.salesMovement.deleteMany({});
    log(`sales-reg: cleared ${del.count} prior rows`);
  }

  let buffer: ReturnType<typeof buildSalesMovement>[] = [];
  const flush = async (): Promise<void> => {
    if (buffer.length === 0 || !willWrite(ctx)) {
      buffer = [];
      return;
    }
    await prisma.salesMovement.createMany({
      data: buffer,
      skipDuplicates: true,
    });
    buffer = [];
  };

  let processed = 0;
  for await (const rows of streamTable(src, SALES_REG_TABLE, SALES_REG_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_RecorderRRef", "_LineNo"],
    where: activeWhere,
  })) {
    for (const row of rows) {
      processed++;
      try {
        const recorderHex = bufToHex(row["_RecorderRRef"]) ?? "—";
        const lineNo = asNumber(row["_LineNo"]) ?? 0;
        const productHex = bufToHex(row["_Fld5605RRef"]);
        const clientHex = bufToHex(row["_Fld5613RRef"]);
        buffer.push(
          buildSalesMovement({
            occurredAt: asDate(row["_Period"]) ?? REG_AS_OF_FALLBACK,
            recorderCode1C: recorderHex,
            lineNo,
            productCode1C: productHex,
            productId: resolveProductId(ctx, productHex),
            lotCode1C: bufToHex(row["_Fld5606RRef"]),
            clientCode1C: clientHex,
            clientId: clientHex ? (clientByHex.get(clientHex) ?? null) : null,
            agentCode1C: null, // агента на регістрі немає — беремо з документа Sale
            orderCode1C: bufToHex(row["_Fld5607_RRRef"]),
            saleCode1C: bufToHex(row["_Fld5609_RRRef"]),
            qty: asNumberOr(row["_Fld5614"], 0),
            weightKg: asNumber(row["_Fld7293"]),
            revenueEur: asNumberOr(row["_Fld5615"], 0),
            revenueNoDiscountEur: asNumber(row["_Fld5616"]),
            recordKind: 0,
          }),
        );
        recon.written++;
        if (buffer.length >= REG_INSERT_BATCH) await flush();
      } catch (e) {
        sink.record(`row#${processed}`, e);
      }
    }
    log(`sales-reg: ${recon.written} written (${processed} processed)`);
  }
  await flush();
  log(`sales-reg: done — written=${recon.written} errors=${recon.errors}`);
  return recon;
}

// ─── 12b. ДвиженияДенежныхСредств → CashFlowMovement ─ _AccumRg5309 ───────────
// ✅ ДЕКОДОВАНО офлайн (docs/1C_MSSQL_CODES.md). UUID 0a5d4601-… → _AccumRg5309.
// Вимірювання (XML декларація → послідовні _Fld-колонки):
//   _Fld5310_RRRef=БанковскийСчетКасса(поліморф), _Fld5311RRef=ВидДенежныхСредств,
//   _Fld5312RRef=ПриходРасход(Enum), _Fld5313RRef=СтатьяДвиженияДенежныхСредств,
//   _Fld5314_RRRef=ДокументДвижения(поліморф), _Fld5315_RRRef=Контрагент(поліморф),
//   _Fld5316RRef=ДоговорКонтрагента, _Fld5317_RRRef=Сделка(поліморф),
//   _Fld5318RRef=Проект, _Fld5319_RRRef=ДокументПланированияПлатежа(поліморф),
//   _Fld5320_RRRef=ДокументРасчетовСКонтрагентом(поліморф), _Fld5321RRef=Организация.
//   Ресурси: _Fld5322=Сумма (грн), _Fld5323=СуммаУпр (EUR).
//   ⚠️ ВИПРАВЛЕНО: раніше Контрагент помилково читали з _Fld5318RRef (= Проект);
//   правильно — поліморфний _Fld5315_RRRef. СуммаУпр=_Fld5323 — підтверджено (HIGH).
//   ПриходРасход — Enum-посилання; напрямок зчитуємо з _EnumOrder через мапу
//   (0=Приход, 1=Расход), яку будуємо з _Enum-таблиці руху коштів.
const CASHFLOW_REG_TABLE = "_AccumRg5309";
const CASHFLOW_REG_COLS = [
  "_Period",
  "_RecorderRRef",
  "_LineNo",
  "_Fld5310_RRRef", // БанковскийСчетКасса (поліморф)
  "_Fld5312RRef", // ПриходРасход (Enum)
  "_Fld5313RRef", // СтатьяДвиженияДенежныхСредств
  "_Fld5315_RRRef", // Контрагент (поліморф) — ВИПРАВЛЕНО (було _Fld5318RRef=Проект)
  "_Fld5322", // Сумма (грн)
  "_Fld5323", // СуммаУпр (EUR) — HIGH
];

// Мапа hex(_IDRRef ПриходРасход) → 0|1. ПриходРасход у 1С — системний Enum
// "ВидДвиженияНакопления" (Приход=0, Расход=1). Будуємо з _EnumOrder.
async function loadCashDirectionEnum(
  pool: mssql.ConnectionPool,
  enumTable: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const result = await pool
      .request()
      .query<
        Record<string, unknown>
      >(`SELECT [_IDRRef], [_EnumOrder] FROM [${enumTable}]`);
    for (const row of result.recordset ?? []) {
      const hex = bufToHex(row["_IDRRef"]);
      const order = asNumber(row["_EnumOrder"]);
      if (hex && order != null) map.set(hex, order === 0 ? 0 : 1);
    }
  } catch (e) {
    warn(`loadCashDirectionEnum(${enumTable}): ${errMsg(e)}`);
  }
  return map;
}

/**
 * Мапа hex(БанковскийСчетКасса) → валюта ("UAH"|"EUR"|"USD").
 * Рахунок руху коштів поліморфний: банк-рахунок (`_Reference29`, валюта
 * `_Fld5873RRef`) АБО каса (`_Reference56` Кассы, валюта `_Fld6004RRef`).
 * Обидва посилаються на довідник валют `_Reference30` → classifyCurrency.
 * null (не EUR/USD) → "UAH".
 */
async function loadAccountCurrencyByHex(
  src: mssql.ConnectionPool,
): Promise<Map<string, "UAH" | "EUR" | "USD">> {
  const out = new Map<string, "UAH" | "EUR" | "USD">();

  // Довідник валют: hex → "EUR"|"USD"|null(UAH).
  const currencyByHex = new Map<string, "EUR" | "USD" | null>();
  try {
    for await (const rows of streamTable(src, "_Reference30", CURRENCY_COLS, {
      batch: 2000,
      limit: null,
      orderBy: ["_IDRRef"],
    })) {
      for (const row of rows) {
        const hex = bufToHex(row["_IDRRef"]);
        if (hex)
          currencyByHex.set(
            hex,
            classifyCurrency(
              asString(row["_Code"]),
              asString(row["_Description"]),
            ),
          );
      }
    }
  } catch (e) {
    warn(`loadAccountCurrencyByHex: валюти (_Reference30) — ${errMsg(e)}`);
  }

  const resolve = (curHex: string | null): "UAH" | "EUR" | "USD" =>
    (curHex ? currencyByHex.get(curHex) : null) ?? "UAH";

  // Банк-рахунки (_Reference29, валюта _Fld5873RRef).
  try {
    for await (const rows of streamTable(
      src,
      "_Reference29",
      ["_IDRRef", "_Fld5873RRef"],
      { batch: 2000, limit: null, orderBy: ["_IDRRef"] },
    )) {
      for (const row of rows) {
        const hex = bufToHex(row["_IDRRef"]);
        if (hex) out.set(hex, resolve(bufToHex(row["_Fld5873RRef"])));
      }
    }
  } catch (e) {
    warn(
      `loadAccountCurrencyByHex: банк-рахунки (_Reference29) — ${errMsg(e)}`,
    );
  }

  // Каси (_Reference56 Кассы, валюта _Fld6004RRef).
  try {
    for await (const rows of streamTable(
      src,
      "_Reference56",
      ["_IDRRef", "_Fld6004RRef"],
      { batch: 2000, limit: null, orderBy: ["_IDRRef"] },
    )) {
      for (const row of rows) {
        const hex = bufToHex(row["_IDRRef"]);
        if (hex) out.set(hex, resolve(bufToHex(row["_Fld6004RRef"])));
      }
    }
  } catch (e) {
    warn(`loadAccountCurrencyByHex: каси (_Reference56) — ${errMsg(e)}`);
  }

  return out;
}

async function importCashFlowRegister(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("cashflow-reg");
  const sink = new ErrorSink(recon, "cashflow-reg");
  const { args, src, prisma } = ctx;

  const clientByHex = await loadClientIdByHex(ctx);
  const accountCurrencyByHex = await loadAccountCurrencyByHex(src);
  log(`cashflow-reg: account currencies mapped = ${accountCurrencyByHex.size}`);
  // ✅ ДЕКОДОВАНО: Enum ПриходРасход = ВидыДвиженийПриходРасход → _Enum225
  // (Приход=order 0, Расход=order 1). Будуємо мапу hex(_IDRRef)→0|1 з _EnumOrder.
  // Фолбек (порожня мапа / нерезолвлений hex) — знак суми (<0 → розхід).
  const dirEnum = await loadCashDirectionEnum(src, "_Enum225");

  const activeWhere = "_Active = 0x01";
  recon.sourceRows = await countTable(src, CASHFLOW_REG_TABLE, activeWhere);
  log(`cashflow-reg: active source rows = ${recon.sourceRows}`);

  if (willWrite(ctx)) {
    const del = await prisma.cashFlowMovement.deleteMany({});
    log(`cashflow-reg: cleared ${del.count} prior rows`);
  }

  let buffer: ReturnType<typeof buildCashFlowMovement>[] = [];
  const flush = async (): Promise<void> => {
    if (buffer.length === 0 || !willWrite(ctx)) {
      buffer = [];
      return;
    }
    await prisma.cashFlowMovement.createMany({
      data: buffer,
      skipDuplicates: true,
    });
    buffer = [];
  };

  let processed = 0;
  for await (const rows of streamTable(
    src,
    CASHFLOW_REG_TABLE,
    CASHFLOW_REG_COLS,
    {
      batch: args.batch,
      limit: args.limit,
      orderBy: ["_RecorderRRef", "_LineNo"],
      where: activeWhere,
    },
  )) {
    for (const row of rows) {
      processed++;
      try {
        const recorderHex = bufToHex(row["_RecorderRRef"]) ?? "—";
        const lineNo = asNumber(row["_LineNo"]) ?? 0;
        const dirHex = bufToHex(row["_Fld5312RRef"]);
        const amountUah = asNumberOr(row["_Fld5322"], 0);
        // Напрямок: спершу з Enum, фолбек — знак суми (<0 → розхід).
        const direction =
          (dirHex ? dirEnum.get(dirHex) : undefined) ?? (amountUah < 0 ? 1 : 0);
        const accHex = bufToHex(row["_Fld5310_RRRef"]);
        buffer.push(
          buildCashFlowMovement({
            occurredAt: asDate(row["_Period"]) ?? REG_AS_OF_FALLBACK,
            recorderCode1C: recorderHex,
            lineNo,
            accountCode1C: accHex,
            articleCode1C: bufToHex(row["_Fld5313RRef"]),
            direction,
            clientCode1C: bufToHex(row["_Fld5315_RRRef"]),
            amountUah: Math.abs(amountUah),
            amountUpr: asNumber(row["_Fld5323"]),
            currencyCode: (accHex && accountCurrencyByHex.get(accHex)) || "UAH",
          }),
        );
        recon.written++;
        if (buffer.length >= REG_INSERT_BATCH) await flush();
      } catch (e) {
        sink.record(`row#${processed}`, e);
      }
    }
    log(`cashflow-reg: ${recon.written} written (${processed} processed)`);
  }
  await flush();
  log(`cashflow-reg: done — written=${recon.written} errors=${recon.errors}`);
  return recon;
}

// ─── 12c. ТоварыНаСкладах → StockMovement ─ _AccumRg5788 ──────────────────────
// ✅ ДЕКОДОВАНО офлайн (docs/1C_MSSQL_CODES.md). UUID 4967cf32-… → _AccumRg5788.
// Виміри (XML декларація): _Fld5789RRef=Склад, _Fld5790RRef=Номенклатура,
//   _Fld5791RRef=ХарактеристикаНоменклатуры, _Fld5792RRef=СерияНоменклатуры,
//   _Fld5793RRef=Качество. Ресурс: _Fld5794=Количество (HIGH).
// Балансовий регістр (_RecordKind). Вага у штучному регістрі відсутня — приходить
// з окремого вагового регістру ТовариНаСкладахУВазі (UUID d378703b-… →
//   _AccumRg6608: _Fld6609RRef=Склад, _Fld6610RRef=Номенклатура,
//   _Fld6611RRef=Характеристика, _Fld6612=Количество[=вага,кг]).
//   ✅ JOIN реалізовано нижче (loadStockWeightMap → weightKey по
//   recorder|product|char|warehouse); weightKg проставляється з мапи, fallback null.
const STOCK_REG_TABLE = "_AccumRg5788";
const STOCK_REG_COLS = [
  "_Period",
  "_RecorderRRef",
  "_LineNo",
  "_RecordKind",
  "_Fld5789RRef", // Склад
  "_Fld5790RRef", // Номенклатура
  "_Fld5791RRef", // ХарактеристикаНоменклатуры (лот)
  "_Fld5793RRef", // Качество
  "_Fld5794", // Количество
];

// ─── Ваговий регістр ТовариНаСкладахУВазі (_AccumRg6608, uuid d378703b) ───────
// Виміри: _Fld6609RRef=Склад, _Fld6610RRef=Номенклатура, _Fld6611RRef=Характеристика.
// Ресурс: _Fld6612=Количество (= вага, кг). Має _RecorderRRef + _LineNo.
// Будуємо мапу (recorderHex|productHex|charHex|warehouseHex) → Σвага для підстановки
// у штучний регістр (де _Fld5794=Количество[шт], а ваги немає).
const WEIGHT_REG_TABLE = "_AccumRg6608";
const WEIGHT_REG_COLS = [
  "_RecorderRRef",
  "_Fld6609RRef", // Склад
  "_Fld6610RRef", // Номенклатура
  "_Fld6611RRef", // Характеристика
  "_Fld6612", // вага, кг
];

function weightKey(
  recorderHex: string,
  productHex: string | null,
  charHex: string | null,
  warehouseHex: string | null,
): string {
  return `${recorderHex}|${productHex ?? ""}|${charHex ?? ""}|${warehouseHex ?? ""}`;
}

/**
 * Завантажує мапу ваги з _AccumRg6608: (recorder|product|char|warehouse) → Σвага.
 * Сума на випадок кількох рядків з однаковим ключем у межах документа.
 */
async function loadStockWeightMap(
  ctx: ImportContext,
): Promise<Map<string, number>> {
  const { args, src } = ctx;
  const map = new Map<string, number>();
  let rowsSeen = 0;
  for await (const rows of streamTable(src, WEIGHT_REG_TABLE, WEIGHT_REG_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_RecorderRRef", "_LineNo"],
    where: "_Active = 0x01",
  })) {
    for (const row of rows) {
      rowsSeen++;
      const recorderHex = bufToHex(row["_RecorderRRef"]);
      if (!recorderHex) continue;
      const w = asNumber(row["_Fld6612"]);
      if (w == null || w === 0) continue;
      const key = weightKey(
        recorderHex,
        bufToHex(row["_Fld6610RRef"]),
        bufToHex(row["_Fld6611RRef"]),
        bufToHex(row["_Fld6609RRef"]),
      );
      map.set(key, (map.get(key) ?? 0) + Math.abs(w));
    }
  }
  log(`stock-reg: weight map loaded — ${map.size} keys (${rowsSeen} rows)`);
  return map;
}

async function importStockRegister(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("stock-reg");
  const sink = new ErrorSink(recon, "stock-reg");
  const { args, src, prisma } = ctx;

  await ensureProductLotDicts(ctx);

  const activeWhere = "_Active = 0x01";
  recon.sourceRows = await countTable(src, STOCK_REG_TABLE, activeWhere);
  log(`stock-reg: active source rows = ${recon.sourceRows}`);

  // Прелоад ваги з окремого вагового регістру (_AccumRg6608). Best-effort:
  // якщо таблиці немає — лишаємо weightKg=null (не валимо імпорт стоку).
  let weightMap = new Map<string, number>();
  try {
    weightMap = await loadStockWeightMap(ctx);
  } catch (e) {
    warn(
      `stock-reg: ваговий регістр _AccumRg6608 недоступний — weightKg=null (${
        e instanceof Error ? e.message : String(e)
      })`,
    );
  }

  if (willWrite(ctx)) {
    const del = await prisma.stockMovement.deleteMany({});
    log(`stock-reg: cleared ${del.count} prior rows`);
  }

  let buffer: ReturnType<typeof buildStockMovement>[] = [];
  const flush = async (): Promise<void> => {
    if (buffer.length === 0 || !willWrite(ctx)) {
      buffer = [];
      return;
    }
    await prisma.stockMovement.createMany({
      data: buffer,
      skipDuplicates: true,
    });
    buffer = [];
  };

  let processed = 0;
  for await (const rows of streamTable(src, STOCK_REG_TABLE, STOCK_REG_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_RecorderRRef", "_LineNo"],
    where: activeWhere,
  })) {
    for (const row of rows) {
      processed++;
      try {
        const recorderHex = bufToHex(row["_RecorderRRef"]) ?? "—";
        const lineNo = asNumber(row["_LineNo"]) ?? 0;
        const productHex = bufToHex(row["_Fld5790RRef"]);
        if (!productHex) {
          recon.unresolved++;
          continue;
        }
        const charHex = bufToHex(row["_Fld5791RRef"]);
        const warehouseHex = bufToHex(row["_Fld5789RRef"]);
        // Підстановка ваги з вагового регістру по (recorder|product|char|warehouse).
        const wKey = weightKey(recorderHex, productHex, charHex, warehouseHex);
        const weightKg = weightMap.get(wKey) ?? null;
        buffer.push(
          buildStockMovement({
            occurredAt: asDate(row["_Period"]) ?? REG_AS_OF_FALLBACK,
            recorderCode1C: recorderHex,
            lineNo,
            warehouseCode1C: warehouseHex,
            productCode1C: productHex,
            productId: resolveProductId(ctx, productHex),
            lotCode1C: charHex,
            quality: bufToHex(row["_Fld5793RRef"]),
            qty: asNumberOr(row["_Fld5794"], 0),
            weightKg,
            recordKind: asNumber(row["_RecordKind"]) ?? 0,
          }),
        );
        recon.written++;
        if (buffer.length >= REG_INSERT_BATCH) await flush();
      } catch (e) {
        sink.record(`row#${processed}`, e);
      }
    }
    log(`stock-reg: ${recon.written} written (${processed} processed)`);
  }
  await flush();
  log(
    `stock-reg: done — written=${recon.written} unresolved=${recon.unresolved} errors=${recon.errors}`,
  );
  return recon;
}

// ─── 12d. ЗаказыПокупателей → OrderRemainderMovement ─ _AccumRg5374 ───────────
// ✅ ДЕКОДОВАНО офлайн (docs/1C_MSSQL_CODES.md). UUID 3c40f824-… → _AccumRg5374.
// Виміри (XML декларація): _Fld5375RRef=ДоговорКонтрагента,
//   _Fld5376RRef=ЗаказПокупателя, _Fld5377RRef=СтатусПартии,
//   _Fld5378RRef=Номенклатура, _Fld5379RRef=ХарактеристикаНоменклатуры,
//   _Fld5380=Цена(dim!), ... ресурс _Fld5387=Количество.
//   ⚠️ УВАГА: у ЗаказыПокупателей «Количество» — це РЕСУРС _Fld5387, а _Fld5380
//   насправді вимір «Цена». Поточний код читає _Fld5380 як qty → див. нижче
//   виправлення колонки на _Fld5387 (HIGH).
const ORDERS_REG_TABLE = "_AccumRg5374";
const ORDERS_REG_COLS = [
  "_Period",
  "_RecorderRRef",
  "_LineNo",
  "_RecordKind",
  "_Fld5376RRef", // ЗаказПокупателя
  "_Fld5378RRef", // Номенклатура
  "_Fld5387", // Количество (ресурс) — ВИПРАВЛЕНО (було _Fld5380=Цена)
];

async function importOrderRemainderRegister(
  ctx: ImportContext,
): Promise<Recon> {
  const recon = newRecon("orders-reg");
  const sink = new ErrorSink(recon, "orders-reg");
  const { args, src, prisma } = ctx;

  await ensureProductLotDicts(ctx);
  await ensureOrderDict(ctx);

  const activeWhere = "_Active = 0x01";
  recon.sourceRows = await countTable(src, ORDERS_REG_TABLE, activeWhere);
  log(`orders-reg: active source rows = ${recon.sourceRows}`);

  if (willWrite(ctx)) {
    const del = await prisma.orderRemainderMovement.deleteMany({});
    log(`orders-reg: cleared ${del.count} prior rows`);
  }

  let buffer: ReturnType<typeof buildOrderRemainderMovement>[] = [];
  const flush = async (): Promise<void> => {
    if (buffer.length === 0 || !willWrite(ctx)) {
      buffer = [];
      return;
    }
    await prisma.orderRemainderMovement.createMany({
      data: buffer,
      skipDuplicates: true,
    });
    buffer = [];
  };

  let processed = 0;
  for await (const rows of streamTable(src, ORDERS_REG_TABLE, ORDERS_REG_COLS, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_RecorderRRef", "_LineNo"],
    where: activeWhere,
  })) {
    for (const row of rows) {
      processed++;
      try {
        const recorderHex = bufToHex(row["_RecorderRRef"]) ?? "—";
        const lineNo = asNumber(row["_LineNo"]) ?? 0;
        const orderHex = bufToHex(row["_Fld5376RRef"]);
        if (!orderHex) {
          recon.unresolved++;
          continue;
        }
        const orderEntry = ctx.orders.get(orderHex);
        const productHex = bufToHex(row["_Fld5378RRef"]);
        buffer.push(
          buildOrderRemainderMovement({
            occurredAt: asDate(row["_Period"]) ?? REG_AS_OF_FALLBACK,
            recorderCode1C: recorderHex,
            lineNo,
            orderCode1C: orderHex,
            orderId:
              orderEntry && orderEntry.id !== "(pending)"
                ? orderEntry.id
                : null,
            productCode1C: productHex,
            productId: resolveProductId(ctx, productHex),
            qty: asNumberOr(row["_Fld5387"], 0),
            recordKind: asNumber(row["_RecordKind"]) ?? 0,
          }),
        );
        recon.written++;
        if (buffer.length >= REG_INSERT_BATCH) await flush();
      } catch (e) {
        sink.record(`row#${processed}`, e);
      }
    }
    log(`orders-reg: ${recon.written} written (${processed} processed)`);
  }
  await flush();
  log(
    `orders-reg: done — written=${recon.written} unresolved=${recon.unresolved} errors=${recon.errors}`,
  );
  return recon;
}

// ─── Фаза 6: фінансові документи банк/каса ─ _Document… ──────────────────────
//
// Платіжні доручення вхідне/вихідне + переміщення готівки.
//
// ⚠️ ФІЗИЧНІ КОДИ ТАБЛИЦЬ/КОЛОНОК (_DocumentNNN / _FldNNN) НЕ зашиті — їх треба
// декодувати проти live-MSSQL метаданих (`_Config`/`sp_help`), як було зроблено
// для ПКО/РКО (PKO_MAP/RKO_MAP). Поки `table === null` — імпортер коректно
// пропускає сутність із попередженням (НЕ кидає, idempotent).
//
// Як заповнити (на сервері з доступом до 1С MSSQL):
//   1. Знайти номер таблиці документа у `_Config` за іменем метаданих
//      («ПлатежноеПоручениеВходящее» / «…Исходящее» /
//       «ВнутреннееПеремещениеНаличныхДенежныхСредств»);
//   2. `sp_help '_DocumentNNN'` → зіставити _FldNNN з реквізитами з
//      docs/1c-export-2026-06-02/Documents/<Док>.xml (Контрагент / СуммаДокумента /
//      ВалютаДокумента / СчетОрганизации / СтатьяДвиженияДенежныхСредств /
//      НазначениеПлатежа / Оплачено / ДатаОплаты);
//   3. Підставити коди у відповідний *_MAP нижче.
//
// Резолв довідників (рахунок/стаття/контрагент) — через наявні ctx-мапи
// (ensureDictMaps / ensureCustomerDict), як у importCashOrderTable.

interface BankDocFieldMap {
  /** null = коди ще не декодовані → пропустити з попередженням. */
  table: string | null;
  direction: "incoming" | "outgoing";
  number: string;
  date: string;
  posted: string;
  customerRRef: string; // Контрагент _Fld..._RRRef (поліморфний)
  amount: string; // СуммаДокумента
  currencyRRef: string | null; // ВалютаДокумента → _Reference30 (опц.)
  bankRRef: string; // СчетОрганизации → _Reference29
  articleRRef: string; // СтаттяДвиженняГрошовихКоштів → _Reference96
  purpose: string | null; // НазначениеПлатежа
  iban?: string; // НЕ мапимо RRef сюди (див. BANK_*_MAP) — лишається null у записі
  comment: string | null;
}

// ✅ ДЕКОДОВАНО офлайн (docs/1C_MSSQL_CODES.md). ПлатежноеПоручениеВходящее
// UUID e65470e0-… → _Document170; колонки звірені позиційно зі звірянням типів
// (HIGH): Контрагент=_Fld2440RRef, СуммаДокумента=_Fld2443,
// СчетОрганизации=_Fld2439RRef, СтатьяДвиженияДенежныхСредств=_Fld2453RRef,
// ВалютаДокумента=_Fld2444RRef, НазначениеПлатежа=_Fld2456,
// СчетКонтрагента=_Fld2441RRef, Комментарий=_Fld2450.
const BANK_INCOMING_MAP: BankDocFieldMap = {
  table: "_Document170", // ПлатежноеПоручениеВходящее (HIGH)
  direction: "incoming",
  number: "_Number",
  date: "_Date_Time",
  posted: "_Posted",
  customerRRef: "_Fld2440RRef", // Контрагент (CatalogRef)
  amount: "_Fld2443", // СуммаДокумента
  currencyRRef: "_Fld2444RRef", // ВалютаДокумента → _Reference30
  bankRRef: "_Fld2439RRef", // СчетОрганизации → _Reference29
  articleRRef: "_Fld2453RRef", // СтатьяДвиженияДенежныхСредств → _Reference96
  purpose: "_Fld2456", // НазначениеПлатежа
  // iban НЕ мапимо: _Fld2441RRef — це RRef (СчетКонтрагента), а не текст IBAN;
  // asString на 16-байтному буфері дає рядок із null-байтами, які Postgres TEXT
  // не приймає → падали ВСІ рядки. Лишаємо iban=null.
  comment: "_Fld2450", // Комментарий
};

// ✅ ДЕКОДОВАНО: ПлатежноеПоручениеИсходящее UUID b2999d93-… → _Document171
// (HIGH): Контрагент=_Fld2495RRef, СуммаДокумента=_Fld2506,
// СчетОрганизации=_Fld2508RRef, СтатьяДвиженияДенежныхСредств=_Fld2505RRef,
// ВалютаДокумента=_Fld2488RRef, НазначениеПлатежа=_Fld2496,
// СчетКонтрагента=_Fld2507RRef, Комментарий=_Fld2494.
const BANK_OUTGOING_MAP: BankDocFieldMap = {
  table: "_Document171", // ПлатежноеПоручениеИсходящее (HIGH)
  direction: "outgoing",
  number: "_Number",
  date: "_Date_Time",
  posted: "_Posted",
  customerRRef: "_Fld2495RRef", // Контрагент
  amount: "_Fld2506", // СуммаДокумента
  currencyRRef: "_Fld2488RRef", // ВалютаДокумента → _Reference30
  bankRRef: "_Fld2508RRef", // СчетОрганизации → _Reference29
  articleRRef: "_Fld2505RRef", // СтатьяДвиженияДенежныхСредств → _Reference96
  purpose: "_Fld2496", // НазначениеПлатежа
  // iban НЕ мапимо: _Fld2507RRef — RRef (СчетКонтрагента), не текст IBAN (див. incoming).
  comment: "_Fld2494", // Комментарий
};

async function importBankDocs(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("bankdocs");
  await ensureCustomerDict(ctx);
  await ensureDictMaps(ctx);
  for (const map of [BANK_INCOMING_MAP, BANK_OUTGOING_MAP]) {
    await importBankDocTable(ctx, map, recon);
  }
  return recon;
}

async function importBankDocTable(
  ctx: ImportContext,
  map: BankDocFieldMap,
  recon: Recon,
): Promise<void> {
  if (!map.table) {
    warn(
      `bankdocs(${map.direction}): коди таблиці/колонок не декодовані — пропуск. ` +
        `Заповніть BANK_${map.direction === "incoming" ? "INCOMING" : "OUTGOING"}_MAP (див. коментар).`,
    );
    return;
  }

  const sink = new ErrorSink(recon, `bankdocs(${map.direction})`);
  const { args, src, prisma } = ctx;

  const cols = [
    "_IDRRef",
    "_Marked",
    map.number,
    map.date,
    map.posted,
    map.customerRRef,
    map.amount,
    map.bankRRef,
    map.articleRRef,
    ...(map.currencyRRef ? [map.currencyRRef] : []),
    ...(map.purpose ? [map.purpose] : []),
    ...(map.iban ? [map.iban] : []),
    ...(map.comment ? [map.comment] : []),
  ];

  const where = args.since ? `${map.date} >= @since` : undefined;
  const params = args.since ? { since: args.since } : undefined;

  const cnt = await countTable(src, map.table, where, params);
  recon.sourceRows += cnt;
  log(`bankdocs(${map.direction}): source rows = ${cnt}`);

  for await (const rows of streamTable(src, map.table, cols, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
    where,
    params,
  })) {
    for (const row of rows) {
      const code1C = bufToHex(row["_IDRRef"]);
      if (!code1C) {
        recon.skipped++;
        continue;
      }
      const number1C = asString(row[map.number]);
      // Помічені на вилучення — пропускаємо; раніше імпортовані видаляємо.
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          if (map.direction === "incoming") {
            await prisma.bankPaymentIncoming.deleteMany({ where: { code1C } });
          } else {
            await prisma.bankPaymentOutgoing.deleteMany({ where: { code1C } });
          }
        }
        recon.skipped++;
        continue;
      }

      const custHex = bufToHex(row[map.customerRRef]);
      const customer = custHex ? ctx.customers.get(custHex) : null;
      if (custHex && !customer) recon.unresolved++;
      const customerId =
        customer && customer.id !== "(pending)" ? customer.id : null;

      const amount = asNumberOr(row[map.amount], 0);
      const paidAt = asDate(row[map.date]);
      const posted = asBool(row[map.posted]);
      const purpose = map.purpose ? asString(row[map.purpose]) : null;
      const iban = map.iban ? asString(row[map.iban]) : null;
      const comment = map.comment ? asString(row[map.comment]) : null;

      // Зведена сума EUR за історичним курсом дати (як у касі).
      const histRate = eurRateForDate(ctx, paidAt);
      const effRate = histRate ?? DEFAULT_HISTORICAL_RATE;
      const amountEur = effRate > 0 ? round2(amount / effRate) : 0;

      const bankAccountId = (() => {
        const id = ctx.bankAccountByHex.get(bufToHex(row[map.bankRRef]) ?? "");
        return id && id !== "(pending)" ? id : null;
      })();
      const cashFlowArticleId = (() => {
        const id = ctx.cashFlowArticleByHex.get(
          bufToHex(row[map.articleRRef]) ?? "",
        );
        return id && id !== "(pending)" ? id : null;
      })();

      const data = {
        number1C,
        customerId,
        bankAccountId,
        cashFlowArticleId,
        amount,
        currency: "UAH",
        amountEur,
        rateEur: effRate,
        iban,
        purpose,
        status: posted ? "posted" : "draft",
        archived: posted,
        comment,
        ...(paidAt ? { paidAt } : {}),
      };

      try {
        if (willWrite(ctx)) {
          if (map.direction === "incoming") {
            await prisma.bankPaymentIncoming.upsert({
              where: { code1C },
              create: { code1C, ...data },
              update: data,
            });
          } else {
            await prisma.bankPaymentOutgoing.upsert({
              where: { code1C },
              create: { code1C, ...data },
              update: data,
            });
          }
        }
        recon.written++;
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(
      `bankdocs(${map.direction}): processed ${recon.written + recon.skipped + recon.errors}`,
    );
  }
}

// ─── Фаза 6: переміщення готівки / інкасація ─ _Document… ────────────────────

interface CashTransferFieldMap {
  table: string | null; // null = коди ще не декодовані
  number: string;
  date: string;
  posted: string;
  fromBankRRef: string; // Касса/СчетОтправитель → _Reference29 (null-резолв = готівка)
  toBankRRef: string; // КассаПолучатель/СчетПолучатель → _Reference29
  amount: string; // СуммаДокумента
  articleRRef: string | null; // СтаттяДвиженняГрошовихКоштів
  comment: string | null;
}

// ✅ ДЕКОДОВАНО офлайн (docs/1C_MSSQL_CODES.md). ВнутреннееПеремещениеНаличных-
// ДенежныхСредств UUID 8bc96d47-… → _Document121 (HIGH):
//   _Fld662RRef=ОрганизацияОтправитель, _Fld663RRef=Касса(відправник),
//   _Fld664RRef=ОрганизацияПолучатель, _Fld665RRef=КассаПолучатель,
//   _Fld666RRef=ВалютаДокумента, _Fld667=СуммаДокумента, _Fld668=Оплачено,
//   _Fld669RRef=СтатьяДвиженияДенежныхСредств, _Fld670RRef=Ответственный,
//   _Fld671=Комментарий.
//   ⚠️ from/to — це Кассы (_Reference Кассы), НЕ банк-рахунки; ctx.bankAccountByHex
//   їх не зрезолвить → fromAccountId/toAccountId=null (трактується як готівка) —
//   це коректно для внутрішнього переміщення готівки.
const CASH_TRANSFER_MAP: CashTransferFieldMap = {
  table: "_Document121", // ВнутреннееПеремещениеНаличныхДенежныхСредств (HIGH)
  number: "_Number",
  date: "_Date_Time",
  posted: "_Posted",
  fromBankRRef: "_Fld663RRef", // Касса (відправник)
  toBankRRef: "_Fld665RRef", // КассаПолучатель
  amount: "_Fld667", // СуммаДокумента
  articleRRef: "_Fld669RRef", // СтатьяДвиженияДенежныхСредств → _Reference96
  comment: "_Fld671", // Комментарий
};

async function importCashTransfers(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("cashtransfers");
  await ensureDictMaps(ctx);
  const map = CASH_TRANSFER_MAP;

  if (!map.table) {
    warn(
      "cashtransfers: коди таблиці/колонок не декодовані — пропуск. " +
        "Заповніть CASH_TRANSFER_MAP (див. коментар у importBankDocTable).",
    );
    return recon;
  }

  const sink = new ErrorSink(recon, "cashtransfers");
  const { args, src, prisma } = ctx;

  const cols = [
    "_IDRRef",
    "_Marked",
    map.number,
    map.date,
    map.posted,
    map.fromBankRRef,
    map.toBankRRef,
    map.amount,
    ...(map.articleRRef ? [map.articleRRef] : []),
    ...(map.comment ? [map.comment] : []),
  ];

  const where = args.since ? `${map.date} >= @since` : undefined;
  const params = args.since ? { since: args.since } : undefined;

  recon.sourceRows = await countTable(src, map.table, where, params);
  log(`cashtransfers: source rows = ${recon.sourceRows}`);

  for await (const rows of streamTable(src, map.table, cols, {
    batch: args.batch,
    limit: args.limit,
    orderBy: ["_IDRRef"],
    where,
    params,
  })) {
    for (const row of rows) {
      const code1C = bufToHex(row["_IDRRef"]);
      if (!code1C) {
        recon.skipped++;
        continue;
      }
      const number1C = asString(row[map.number]);
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.cashTransfer.deleteMany({ where: { code1C } });
        }
        recon.skipped++;
        continue;
      }

      const amount = asNumberOr(row[map.amount], 0);
      const transferredAt = asDate(row[map.date]);
      const posted = asBool(row[map.posted]);
      const comment = map.comment ? asString(row[map.comment]) : null;

      const histRate = eurRateForDate(ctx, transferredAt);
      const effRate = histRate ?? DEFAULT_HISTORICAL_RATE;
      const amountEur = effRate > 0 ? round2(amount / effRate) : 0;

      // null рахунок = готівкова каса (немає дзеркала у MgrBankAccount).
      const fromAccountId = (() => {
        const id = ctx.bankAccountByHex.get(
          bufToHex(row[map.fromBankRRef]) ?? "",
        );
        return id && id !== "(pending)" ? id : null;
      })();
      const toAccountId = (() => {
        const id = ctx.bankAccountByHex.get(
          bufToHex(row[map.toBankRRef]) ?? "",
        );
        return id && id !== "(pending)" ? id : null;
      })();
      const cashFlowArticleId = map.articleRRef
        ? (() => {
            const id = ctx.cashFlowArticleByHex.get(
              bufToHex(row[map.articleRRef!]) ?? "",
            );
            return id && id !== "(pending)" ? id : null;
          })()
        : null;

      const data = {
        number1C,
        fromAccountId,
        toAccountId,
        cashFlowArticleId,
        amount,
        currency: "UAH",
        amountEur,
        rateEur: effRate,
        status: posted ? "posted" : "draft",
        archived: posted,
        comment,
        ...(transferredAt ? { transferredAt } : {}),
      };

      try {
        if (willWrite(ctx)) {
          await prisma.cashTransfer.upsert({
            where: { code1C },
            create: { code1C, ...data },
            update: data,
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(
      `cashtransfers: processed ${recon.written + recon.skipped + recon.errors}`,
    );
  }

  return recon;
}

// ─── 12. ПродажиСебестоимость → CostMovement ─────────────── _AccumRg5634 ─────
// Регістр оборотів «Продажи себестоимость» (Стоимость = собівартість проданого
// товару, EUR). Це ЄДИНЕ джерело історичної собівартості — без нього неможлива
// маржа/валовий прибуток. Декодовано з метаданих реєстру (uuid
// 32746ef3-...) + docs/1c-mssql-schema/columns.tsv (точний збіг сигнатури:
// 6 вимірів + Количество(15,3) + Стоимость(15,2) + СписаниеПартий(bool)).
//
// Колонки `_AccumRg5634` (columns.tsv):
//   _Period       — дата руху (occurredAt; asDate знімає year-offset);
//   _RecorderRRef — документ-реєстратор (16 байт) = hex реалізації `_Document189`
//                   = Sale.code1C;
//   _LineNo       — № рядка у реєстраторі (унікальність руху разом з recorder);
//   _Active       — прапор активного руху (фільтр 0x01);
//   _Fld5635RRef  — Номенклатура (= Product.code1C hex);
//   _Fld5636RRef  — ХарактеристикаНоменклатуры (не використовуємо);
//   _Fld5637_*    — ЗаказПокупателя (composite, не використовуємо тут);
//   _Fld5638_*    — ДокументОприходования (composite, не використовуємо);
//   _Fld5639RRef  — Подразделение;  _Fld5640RRef — Проект;
//   _Fld5641      — Количество (15,3);
//   _Fld5642      — Стоимость (15,2) = СОБІВАРТІСТЬ (EUR) — ресурс маржі.
//
// На кожен активний рядок пишемо CostMovement:
//   recorderCode1C = hex(_RecorderRRef) = Sale.code1C,
//   lineNo = _LineNo,
//   productCode1C = hex(_Fld5635RRef) = Product.code1C,
//   productId = best-effort резолв через ctx.products (nullable),
//   qty = _Fld5641, costEur = _Fld5642, occurredAt = _Period.
//
// Звіт маржі (`lib/reports/margin-report.ts`) джойнить ці рухи до Sale (через
// recorderCode1C = code1C) → Customer/agent і до Product (через productId або
// productCode1C) → category. Так маржа рахується співставленням Виручка↔Собівартість
// по тих самих документах реалізації.
//
// Ідемпотентність: createMany з upsert-семантикою через унікальний ключ
// (recorderCode1C, lineNo). Реімпорт чисто перестворює таблицю.

const COST_REG_TABLE = "_AccumRg5634";
const COST_REG_COLS = [
  "_Period",
  "_RecorderRRef",
  "_LineNo",
  "_Fld5635RRef", // Номенклатура
  "_Fld5641", // Количество
  "_Fld5642", // Стоимость (собівартість EUR)
];

const COST_OPENING_AS_OF = new Date("2021-01-01T00:00:00Z");
const COST_INSERT_BATCH = 1000;

type CostMovementRow = {
  recorderCode1C: string;
  lineNo: number;
  productCode1C: string | null;
  productId: string | null;
  qty: string;
  costEur: string;
  occurredAt: Date;
};

async function importCostReg(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("cost-reg");
  const sink = new ErrorSink(recon, "cost-reg");
  const { args, src, prisma } = ctx;

  // Резолв-словник номенклатури (для productId). Для маржі він не критичний —
  // звіт уміє джойнити і по productCode1C — але корисний для прямих JOIN.
  await ensureProductLotDicts(ctx);

  const activeWhere = "_Active = 0x01";
  recon.sourceRows = await countTable(src, COST_REG_TABLE, activeWhere);
  log(`cost-reg: active source rows = ${recon.sourceRows}`);

  if (willWrite(ctx)) {
    const deleted = await prisma.costMovement.deleteMany({});
    log(`cost-reg: deleted ${deleted.count} prior cost movements`);

    let processed = 0;
    let buffer: CostMovementRow[] = [];

    const flush = async (): Promise<void> => {
      if (buffer.length === 0) return;
      await prisma.costMovement.createMany({
        data: buffer,
        skipDuplicates: true,
      });
      buffer = [];
    };

    for await (const rows of streamTable(src, COST_REG_TABLE, COST_REG_COLS, {
      batch: args.batch,
      limit: args.limit,
      orderBy: ["_RecorderRRef", "_LineNo"],
      where: activeWhere,
    })) {
      for (const row of rows) {
        processed++;
        try {
          const recorderHex = bufToHex(row["_RecorderRRef"]);
          if (!recorderHex) {
            recon.unresolved++;
            continue;
          }
          const lineNo = asNumber(row["_LineNo"]) ?? 0;
          const productHex = bufToHex(row["_Fld5635RRef"]);
          const product = productHex ? ctx.products.get(productHex) : null;
          const productId =
            product && product.id !== "(pending)" ? product.id : null;
          const qty = asDecimalString(row["_Fld5641"]) ?? "0";
          const costEur = asDecimalString(row["_Fld5642"]) ?? "0";
          const occurredAt = asDate(row["_Period"]) ?? COST_OPENING_AS_OF;

          buffer.push({
            recorderCode1C: recorderHex,
            lineNo,
            productCode1C: productHex,
            productId,
            qty,
            costEur,
            occurredAt,
          });
          recon.written++;

          if (buffer.length >= COST_INSERT_BATCH) await flush();
        } catch (e) {
          sink.record(bufToHex(row["_RecorderRRef"]) ?? `row#${processed}`, e);
        }
      }
      log(
        `cost-reg: ${recon.written} movements written (${recon.unresolved} unresolved, ${processed} rows processed)`,
      );
    }
    await flush();
  } else {
    // dry-run: рахуємо, скільки б записали.
    for await (const rows of streamTable(src, COST_REG_TABLE, COST_REG_COLS, {
      batch: args.batch,
      limit: args.limit,
      orderBy: ["_RecorderRRef", "_LineNo"],
      where: activeWhere,
    })) {
      for (const row of rows) {
        if (!bufToHex(row["_RecorderRRef"])) {
          recon.unresolved++;
          continue;
        }
        recon.written++;
      }
    }
  }

  log(
    `cost-reg: done — written=${recon.written} unresolved=${recon.unresolved} errors=${recon.errors}`,
  );
  return recon;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// Фаза 5 — документи руху товару (історичний імпорт у таблиці документів)
// ════════════════════════════════════════════════════════════════════════════
// Кожен документ читається з відповідної 1С-таблиці `_Document…` (шапка) + однієї
// чи двох табличних частин (VT). Idempotent upsert по code1C=hex(_IDRRef);
// рядки замінюються (deleteMany child → recreate). _Marked=0x01 → пропуск +
// видалення раніше імпортованого. На --dry-run рахуємо рядки, але НЕ пишемо.
//
// ⚠️ КРИТИЧНО: ЦІ ІМПОРТЕРИ НЕ ПИШУТЬ StockMovement. Баланси беруться з регістру
//   _AccumRg5788 (`--entity stock-reg`). Подвоєння регістру зіпсувало б залишки.
//   Тут лише наповнюємо моделі документів — історія для списків/карток.
//
// Коди колонок звірені офлайн з docs/1c-mssql-schema/columns.tsv +
//   docs/STOCK_DOCS_IMPORT_MAP.md. Кілька _Fld (особливо Якість/Сума/Контрагент-
//   поліморф) — best-guess; серверний `--dry-run` має показати розбіжності.
//
// Якість (Reference59) у рядках 1С є, але моделі *Item НЕ мають поля quality —
//   тому quality свідомо НЕ переноситься (лише productId + charHex(=Характеристика)
//   + barcode з lotBarcodeByCharHex). Одиниці виміру так само не зберігаються
//   (поле unitName є лише у ProductReturnFromCustomerItem; решта моделей — без).

// Довідник 1С-таблиць документів (для довідки; кожен імпортер звертається
// до своєї таблиці безпосередньо):
//   returns     → _Document123      (VT _Document123_VT729)
//   repack      → _Document6631     (Распаковка _VT6685 + Упаковка _VT6702)
//   writeoff    → _Document193      (VT _Document193_VT3696)
//   stockadjust → _Document156      (VT _Document156_VT1944)
//   inventory   → _Document140      (VT _Document140_VT1405)
//   transfer    → _Document162      (VT _Document162_VT2221)

// hex(_Reference95 _IDRRef) → Warehouse.id. Склади імпортовані через
// `dictionaries-full` (Warehouse.code1C = hex). Будуємо мапу один раз per ctx.
async function ensureWarehouseDict(ctx: ImportContext): Promise<void> {
  if (ctx.warehouseIdByHex.size > 0) return;
  try {
    const rows = await ctx.prisma.warehouse.findMany({
      select: { id: true, code1C: true },
    });
    for (const w of rows) {
      if (w.code1C) ctx.warehouseIdByHex.set(w.code1C, w.id);
    }
    if (ctx.warehouseIdByHex.size === 0) {
      warn(
        "ensureWarehouseDict: жодного складу у цільовій базі — " +
          "warehouseId лишиться null. Спершу імпортуйте `--entity dictionaries-full`.",
      );
    }
  } catch (e) {
    warn(`ensureWarehouseDict: ${errMsg(e)} — warehouseId=null`);
  }
}

function resolveWarehouseId(
  ctx: ImportContext,
  hex: string | null,
): string | null {
  if (!hex) return null;
  return ctx.warehouseIdByHex.get(hex) ?? null;
}

// Один резолвлений рядок таб.частини стокового документа.
interface StockDocItem {
  productId: string | null;
  charHex: string | null;
  barcode: string | null;
  weight: number;
  quantity: number;
  priceEur: number; // Ціна за одиницю (€)
  amountEur: number; // Сума рядка (€)
  // лише для інвентаризації:
  qtyAccounting: number;
  qtyActual: number;
}

// Конфіг колонок однієї табличної частини (VT).
interface StockVtConfig {
  table: string; // напр. "_Document123_VT729"
  ownerCol: string; // FK на шапку, напр. "_Document123_IDRRef"
  lineNoCol: string; // напр. "_LineNo730"
  productRRef: string; // Номенклатура
  charRRef: string | null; // Характеристика (лот)
  qtyCol: string | null; // Количество
  weightCol: string | null; // Вес (null → 0)
  priceCol: string | null; // Цена
  amountCol: string | null; // Сумма
  // інвентаризація: облік/факт:
  qtyAccountingCol: string | null;
  qtyActualCol: string | null;
}

// Стрімить одну VT-таблицю у Map<headerHex, StockDocItem[]> (упорядковано _LineNo).
async function loadStockVtMap(
  ctx: ImportContext,
  vt: StockVtConfig,
): Promise<Map<string, StockDocItem[]>> {
  const out = new Map<string, StockDocItem[]>();
  const cols = [
    vt.ownerCol,
    vt.lineNoCol,
    vt.productRRef,
    ...(vt.charRRef ? [vt.charRRef] : []),
    ...(vt.qtyCol ? [vt.qtyCol] : []),
    ...(vt.weightCol ? [vt.weightCol] : []),
    ...(vt.priceCol ? [vt.priceCol] : []),
    ...(vt.amountCol ? [vt.amountCol] : []),
    ...(vt.qtyAccountingCol ? [vt.qtyAccountingCol] : []),
    ...(vt.qtyActualCol ? [vt.qtyActualCol] : []),
  ];
  for await (const rows of streamTable(ctx.src, vt.table, cols, {
    batch: 5000,
    limit: null,
    orderBy: [vt.ownerCol, vt.lineNoCol],
  })) {
    for (const row of rows) {
      const ownerHex = bufToHex(row[vt.ownerCol]);
      if (!ownerHex) continue;
      const productHex = bufToHex(row[vt.productRRef]);
      const charHex = vt.charRRef ? bufToHex(row[vt.charRRef]) : null;
      const barcode =
        charHex != null ? (ctx.lotBarcodeByCharHex.get(charHex) ?? null) : null;
      const qty = vt.qtyCol ? asNumberOr(row[vt.qtyCol], 0) : 0;
      const item: StockDocItem = {
        productId: resolveProductId(ctx, productHex),
        charHex,
        barcode,
        weight: vt.weightCol ? asNumberOr(row[vt.weightCol], 0) : 0,
        quantity: Math.round(qty) || (qty > 0 ? 1 : 0),
        priceEur: vt.priceCol ? asNumberOr(row[vt.priceCol], 0) : 0,
        amountEur: vt.amountCol ? asNumberOr(row[vt.amountCol], 0) : 0,
        qtyAccounting: vt.qtyAccountingCol
          ? asNumberOr(row[vt.qtyAccountingCol], 0)
          : 0,
        qtyActual: vt.qtyActualCol ? asNumberOr(row[vt.qtyActualCol], 0) : 0,
      };
      const arr = out.get(ownerHex);
      if (arr) arr.push(item);
      else out.set(ownerHex, [item]);
    }
  }
  return out;
}

// ─── 1. returns — ВозвратТоваровОтПокупателя → _Document123 / _Document123_VT729 ─
// Шапка (декодовано з ВозвратТоваровОтПокупателя.xml + columns.tsv, порядок реквізитів):
//   Организация _Fld705RRef, СкладОрдер _Fld706_* (поліморф), ТипЦен _Fld707RRef,
//   ВалютаДокумента _Fld708RRef, СуммаДокумента _Fld711, **Контрагент _Fld712RRef**,
//   ДоговорКонтрагента _Fld713RRef, Сделка _Fld714_* (поліморф), Коментар _Fld717.
//   ⚠️ _Fld706 — це СкладОрдер (поліморф), НЕ контрагент; клієнт = _Fld712RRef (plain ref).
// Рядки: Номенклатура _Fld731RRef, Кількість _Fld732, Характеристика _Fld741RRef,
//   Ціна _Fld736, Сума _Fld738. (Склад у шапці відсутній → warehouseId=null.)
const RETURNS_HEADER_COLS = [
  "_IDRRef",
  "_Number",
  "_Date_Time",
  "_Posted",
  "_Marked",
  "_Fld712RRef", // Контрагент (plain ref на _Reference66)
  "_Fld717", // Коментар
];

async function importReturns(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("returns");
  const sink = new ErrorSink(recon, "returns");
  const { args, src, prisma } = ctx;

  await ensureProductLotDicts(ctx);
  await ensureCustomerDict(ctx);

  recon.sourceRows = await countTable(src, "_Document123");
  log(`returns: source rows = ${recon.sourceRows}`);

  let itemsByDoc: Map<string, StockDocItem[]>;
  try {
    itemsByDoc = await loadStockVtMap(ctx, {
      table: "_Document123_VT729",
      ownerCol: "_Document123_IDRRef",
      lineNoCol: "_LineNo730",
      productRRef: "_Fld731RRef",
      charRRef: "_Fld741RRef",
      qtyCol: "_Fld732",
      weightCol: null, // returns VT не має окремої колонки ваги (best-guess: 0)
      priceCol: "_Fld736",
      amountCol: "_Fld738",
      qtyAccountingCol: null,
      qtyActualCol: null,
    });
  } catch (e) {
    warn(`returns: VT _Document123_VT729 недоступна (${errMsg(e)}) — пропуск.`);
    return recon;
  }

  for await (const rows of streamTable(
    src,
    "_Document123",
    RETURNS_HEADER_COLS,
    { batch: args.batch, limit: args.limit, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const code1C = hex;
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.productReturnFromCustomer.deleteMany({
            where: { code1C },
          });
        }
        recon.skipped++;
        continue;
      }
      const custHex = bufToHex(row["_Fld712RRef"]);
      const customer = custHex ? ctx.customers.get(custHex) : null;
      const customerId =
        customer && customer.id !== "(pending)" ? customer.id : null;
      if (custHex && !customerId) recon.unresolved++;

      const items = itemsByDoc.get(hex) ?? [];
      const totalWeight = items.reduce((s, it) => s + it.weight, 0);
      const totalQuantity = items.reduce((s, it) => s + it.quantity, 0);
      const totalEur = round2(items.reduce((s, it) => s + it.amountEur, 0));
      const posted = asBool(row["_Posted"]);
      const docDate = asDate(row["_Date_Time"]);

      try {
        if (willWrite(ctx)) {
          await prisma.$transaction(async (tx) => {
            const doc = await tx.productReturnFromCustomer.upsert({
              where: { code1C },
              create: {
                code1C,
                number1C: asString(row["_Number"]),
                docNumber: hex,
                ...(docDate ? { docDate } : {}),
                customerId,
                status: posted ? "posted" : "draft",
                totalWeight,
                totalQuantity,
                totalEur,
                notes: asString(row["_Fld717"]),
                ...(docDate ? { createdAt: docDate } : {}),
              },
              update: {
                number1C: asString(row["_Number"]),
                ...(docDate ? { docDate } : {}),
                customerId,
                status: posted ? "posted" : "draft",
                totalWeight,
                totalQuantity,
                totalEur,
                notes: asString(row["_Fld717"]),
              },
              select: { id: true },
            });
            await tx.productReturnFromCustomerItem.deleteMany({
              where: { returnId: doc.id },
            });
            if (items.length > 0) {
              await tx.productReturnFromCustomerItem.createMany({
                data: items.map((it) => ({
                  returnId: doc.id,
                  productId: it.productId,
                  charHex: it.charHex,
                  barcode: it.barcode,
                  weight: it.weight,
                  quantity: it.quantity,
                  priceEur: it.priceEur,
                  amountEur: it.amountEur,
                })),
              });
            }
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(`returns: processed ${recon.written + recon.skipped + recon.errors}`);
  }
  return recon;
}

// ─── 2. repack — Перепаковка → _Document6631 (Распаковка _VT6685 + Упаковка _VT6702) ─
// Шапка: Склад _Fld6679RRef, Коментар _Fld6684.
// Распаковка (спожито) → role "disassembled"; Упаковка (вироблено) → role "packed".
// inputWeight=Σ(Распаковка.вага); outputWeight=Σ(Упаковка.вага); lossWeight=in−out.
const REPACK_HEADER_COLS = [
  "_IDRRef",
  "_Number",
  "_Date_Time",
  "_Posted",
  "_Marked",
  "_Fld6679RRef", // Склад
  "_Fld6684", // Коментар
];

async function importRepack(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("repack");
  const sink = new ErrorSink(recon, "repack");
  const { args, src, prisma } = ctx;

  await ensureProductLotDicts(ctx);
  await ensureWarehouseDict(ctx);

  recon.sourceRows = await countTable(src, "_Document6631");
  log(`repack: source rows = ${recon.sourceRows}`);

  let disByDoc: Map<string, StockDocItem[]>;
  let packByDoc: Map<string, StockDocItem[]>;
  try {
    disByDoc = await loadStockVtMap(ctx, {
      table: "_Document6631_VT6685", // Распаковка
      ownerCol: "_Document6631_IDRRef",
      lineNoCol: "_LineNo6686",
      productRRef: "_Fld6687RRef",
      charRRef: "_Fld6696RRef",
      qtyCol: "_Fld6692",
      weightCol: "_Fld6693",
      priceCol: "_Fld6695",
      amountCol: "_Fld6699",
      qtyAccountingCol: null,
      qtyActualCol: null,
    });
    packByDoc = await loadStockVtMap(ctx, {
      table: "_Document6631_VT6702", // Упаковка
      ownerCol: "_Document6631_IDRRef",
      lineNoCol: "_LineNo6703",
      productRRef: "_Fld6704RRef",
      charRRef: "_Fld6713RRef",
      qtyCol: "_Fld6709",
      weightCol: "_Fld6710",
      priceCol: "_Fld6712",
      amountCol: "_Fld6716",
      qtyAccountingCol: null,
      qtyActualCol: null,
    });
  } catch (e) {
    warn(`repack: VT-таблиці недоступні (${errMsg(e)}) — пропуск.`);
    return recon;
  }

  for await (const rows of streamTable(
    src,
    "_Document6631",
    REPACK_HEADER_COLS,
    {
      batch: args.batch,
      limit: args.limit,
      orderBy: ["_IDRRef"],
    },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const code1C = hex;
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.repacking.deleteMany({ where: { code1C } });
        }
        recon.skipped++;
        continue;
      }
      const dis = disByDoc.get(hex) ?? [];
      const pack = packByDoc.get(hex) ?? [];
      const inputWeight = dis.reduce((s, it) => s + it.weight, 0);
      const outputWeight = pack.reduce((s, it) => s + it.weight, 0);
      const lossWeight = round2(inputWeight - outputWeight);
      const posted = asBool(row["_Posted"]);
      const docDate = asDate(row["_Date_Time"]);
      const warehouseId = resolveWarehouseId(
        ctx,
        bufToHex(row["_Fld6679RRef"]),
      );

      try {
        if (willWrite(ctx)) {
          await prisma.$transaction(async (tx) => {
            const doc = await tx.repacking.upsert({
              where: { code1C },
              create: {
                code1C,
                number1C: asString(row["_Number"]),
                docNumber: hex,
                ...(docDate ? { docDate } : {}),
                warehouseId,
                status: posted ? "posted" : "draft",
                inputWeight,
                outputWeight,
                lossWeight,
                notes: asString(row["_Fld6684"]),
                ...(docDate ? { createdAt: docDate } : {}),
              },
              update: {
                number1C: asString(row["_Number"]),
                ...(docDate ? { docDate } : {}),
                warehouseId,
                status: posted ? "posted" : "draft",
                inputWeight,
                outputWeight,
                lossWeight,
                notes: asString(row["_Fld6684"]),
              },
              select: { id: true },
            });
            await tx.repackingItem.deleteMany({
              where: { repackingId: doc.id },
            });
            const data = [
              ...dis.map((it) => ({
                repackingId: doc.id,
                role: "disassembled",
                productId: it.productId,
                charHex: it.charHex,
                barcode: it.barcode,
                weight: it.weight,
                quantity: it.quantity,
                priceEur: it.priceEur,
                amountEur: it.amountEur,
              })),
              ...pack.map((it) => ({
                repackingId: doc.id,
                role: "packed",
                productId: it.productId,
                charHex: it.charHex,
                barcode: it.barcode,
                weight: it.weight,
                quantity: it.quantity,
                priceEur: it.priceEur,
                amountEur: it.amountEur,
              })),
            ];
            if (data.length > 0) {
              await tx.repackingItem.createMany({ data });
            }
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(`repack: processed ${recon.written + recon.skipped + recon.errors}`);
  }
  return recon;
}

// ─── 3. writeoff — СписаниеТоваров → _Document193 / _Document193_VT3696 ────────
// Шапка: Склад _Fld3683RRef, Коментар _Fld3688.
// Рядки: Номенклатура _Fld3705RRef, Кількість _Fld3702, Характеристика _Fld3708RRef,
//   Ціна _Fld3709, Сума _Fld3707.
const WRITEOFF_HEADER_COLS = [
  "_IDRRef",
  "_Number",
  "_Date_Time",
  "_Posted",
  "_Marked",
  "_Fld3683RRef", // Склад
  "_Fld3688", // Коментар
];

async function importWriteOff(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("writeoff");
  const sink = new ErrorSink(recon, "writeoff");
  const { args, src, prisma } = ctx;

  await ensureProductLotDicts(ctx);
  await ensureWarehouseDict(ctx);

  recon.sourceRows = await countTable(src, "_Document193");
  log(`writeoff: source rows = ${recon.sourceRows}`);

  let itemsByDoc: Map<string, StockDocItem[]>;
  try {
    itemsByDoc = await loadStockVtMap(ctx, {
      table: "_Document193_VT3696",
      ownerCol: "_Document193_IDRRef",
      lineNoCol: "_LineNo3697",
      productRRef: "_Fld3705RRef",
      charRRef: "_Fld3708RRef",
      qtyCol: "_Fld3702",
      weightCol: null,
      priceCol: "_Fld3709",
      amountCol: "_Fld3707",
      qtyAccountingCol: null,
      qtyActualCol: null,
    });
  } catch (e) {
    warn(
      `writeoff: VT _Document193_VT3696 недоступна (${errMsg(e)}) — пропуск.`,
    );
    return recon;
  }

  for await (const rows of streamTable(
    src,
    "_Document193",
    WRITEOFF_HEADER_COLS,
    { batch: args.batch, limit: args.limit, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const code1C = hex;
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.writeOff.deleteMany({ where: { code1C } });
        }
        recon.skipped++;
        continue;
      }
      const items = itemsByDoc.get(hex) ?? [];
      const totalWeight = items.reduce((s, it) => s + it.weight, 0);
      const totalQuantity = items.reduce((s, it) => s + it.quantity, 0);
      const totalEur = round2(items.reduce((s, it) => s + it.amountEur, 0));
      const posted = asBool(row["_Posted"]);
      const docDate = asDate(row["_Date_Time"]);
      const warehouseId = resolveWarehouseId(
        ctx,
        bufToHex(row["_Fld3683RRef"]),
      );

      try {
        if (willWrite(ctx)) {
          await prisma.$transaction(async (tx) => {
            const doc = await tx.writeOff.upsert({
              where: { code1C },
              create: {
                code1C,
                number1C: asString(row["_Number"]),
                docNumber: hex,
                ...(docDate ? { docDate } : {}),
                warehouseId,
                status: posted ? "posted" : "draft",
                totalWeight,
                totalQuantity,
                totalEur,
                notes: asString(row["_Fld3688"]),
                ...(docDate ? { createdAt: docDate } : {}),
              },
              update: {
                number1C: asString(row["_Number"]),
                ...(docDate ? { docDate } : {}),
                warehouseId,
                status: posted ? "posted" : "draft",
                totalWeight,
                totalQuantity,
                totalEur,
                notes: asString(row["_Fld3688"]),
              },
              select: { id: true },
            });
            await tx.writeOffItem.deleteMany({ where: { writeOffId: doc.id } });
            if (items.length > 0) {
              await tx.writeOffItem.createMany({
                data: items.map((it) => ({
                  writeOffId: doc.id,
                  productId: it.productId,
                  charHex: it.charHex,
                  barcode: it.barcode,
                  weight: it.weight,
                  quantity: it.quantity,
                  priceEur: it.priceEur,
                  amountEur: it.amountEur,
                })),
              });
            }
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(`writeoff: processed ${recon.written + recon.skipped + recon.errors}`);
  }
  return recon;
}

// ─── 4. stockadjust — ОприходованиеТоваров → _Document156 / _Document156_VT1944 ─
// Шапка: Склад _Fld1927RRef, Коментар _Fld1933 (СумаДок _Fld1932 — у шапці, але
//   модель StockAdjustment рахує totalEur з рядків).
// Рядки: Номенклатура _Fld1952RRef, Кількість _Fld1949, Характеристика _Fld1956RRef,
//   Ціна _Fld1957, Сума _Fld1955.
const STOCKADJUST_HEADER_COLS = [
  "_IDRRef",
  "_Number",
  "_Date_Time",
  "_Posted",
  "_Marked",
  "_Fld1927RRef", // Склад
  "_Fld1933", // Коментар
];

async function importStockAdjust(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("stockadjust");
  const sink = new ErrorSink(recon, "stockadjust");
  const { args, src, prisma } = ctx;

  await ensureProductLotDicts(ctx);
  await ensureWarehouseDict(ctx);

  recon.sourceRows = await countTable(src, "_Document156");
  log(`stockadjust: source rows = ${recon.sourceRows}`);

  let itemsByDoc: Map<string, StockDocItem[]>;
  try {
    itemsByDoc = await loadStockVtMap(ctx, {
      table: "_Document156_VT1944",
      ownerCol: "_Document156_IDRRef",
      lineNoCol: "_LineNo1945",
      productRRef: "_Fld1952RRef",
      charRRef: "_Fld1956RRef",
      qtyCol: "_Fld1949",
      weightCol: null,
      priceCol: "_Fld1957",
      amountCol: "_Fld1955",
      qtyAccountingCol: null,
      qtyActualCol: null,
    });
  } catch (e) {
    warn(
      `stockadjust: VT _Document156_VT1944 недоступна (${errMsg(e)}) — пропуск.`,
    );
    return recon;
  }

  for await (const rows of streamTable(
    src,
    "_Document156",
    STOCKADJUST_HEADER_COLS,
    { batch: args.batch, limit: args.limit, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const code1C = hex;
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.stockAdjustment.deleteMany({ where: { code1C } });
        }
        recon.skipped++;
        continue;
      }
      const items = itemsByDoc.get(hex) ?? [];
      const totalWeight = items.reduce((s, it) => s + it.weight, 0);
      const totalQuantity = items.reduce((s, it) => s + it.quantity, 0);
      const totalEur = round2(items.reduce((s, it) => s + it.amountEur, 0));
      const posted = asBool(row["_Posted"]);
      const docDate = asDate(row["_Date_Time"]);
      const warehouseId = resolveWarehouseId(
        ctx,
        bufToHex(row["_Fld1927RRef"]),
      );

      try {
        if (willWrite(ctx)) {
          await prisma.$transaction(async (tx) => {
            const doc = await tx.stockAdjustment.upsert({
              where: { code1C },
              create: {
                code1C,
                number1C: asString(row["_Number"]),
                docNumber: hex,
                ...(docDate ? { docDate } : {}),
                warehouseId,
                status: posted ? "posted" : "draft",
                totalWeight,
                totalQuantity,
                totalEur,
                notes: asString(row["_Fld1933"]),
                ...(docDate ? { createdAt: docDate } : {}),
              },
              update: {
                number1C: asString(row["_Number"]),
                ...(docDate ? { docDate } : {}),
                warehouseId,
                status: posted ? "posted" : "draft",
                totalWeight,
                totalQuantity,
                totalEur,
                notes: asString(row["_Fld1933"]),
              },
              select: { id: true },
            });
            await tx.stockAdjustmentItem.deleteMany({
              where: { adjustmentId: doc.id },
            });
            if (items.length > 0) {
              await tx.stockAdjustmentItem.createMany({
                data: items.map((it) => ({
                  adjustmentId: doc.id,
                  productId: it.productId,
                  charHex: it.charHex,
                  barcode: it.barcode,
                  weight: it.weight,
                  quantity: it.quantity,
                  priceEur: it.priceEur,
                  amountEur: it.amountEur,
                })),
              });
            }
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(
      `stockadjust: processed ${recon.written + recon.skipped + recon.errors}`,
    );
  }
  return recon;
}

// ─── 5. inventory — ИнвентаризацияТоваровНаСкладе → _Document140 / _Document140_VT1405 ─
// Шапка: Коментар _Fld1395, Склад _Fld1396RRef.
// Рядки: Номенклатура _Fld1413RRef, Кількість(облік) _Fld1409, Кількість(факт) _Fld1410,
//   Характеристика _Fld1416RRef, Ціна _Fld1417. qtyDifference=факт−облік.
const INVENTORY_HEADER_COLS = [
  "_IDRRef",
  "_Number",
  "_Date_Time",
  "_Posted",
  "_Marked",
  "_Fld1395", // Коментар
  "_Fld1396RRef", // Склад
];

async function importInventory(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("inventory");
  const sink = new ErrorSink(recon, "inventory");
  const { args, src, prisma } = ctx;

  await ensureProductLotDicts(ctx);
  await ensureWarehouseDict(ctx);

  recon.sourceRows = await countTable(src, "_Document140");
  log(`inventory: source rows = ${recon.sourceRows}`);

  let itemsByDoc: Map<string, StockDocItem[]>;
  try {
    itemsByDoc = await loadStockVtMap(ctx, {
      table: "_Document140_VT1405",
      ownerCol: "_Document140_IDRRef",
      lineNoCol: "_LineNo1406",
      productRRef: "_Fld1413RRef",
      charRRef: "_Fld1416RRef",
      qtyCol: null,
      weightCol: null,
      priceCol: "_Fld1417",
      amountCol: null,
      qtyAccountingCol: "_Fld1409", // Кількість облікова (expected)
      qtyActualCol: "_Fld1410", // Кількість фактична (counted)
    });
  } catch (e) {
    warn(
      `inventory: VT _Document140_VT1405 недоступна (${errMsg(e)}) — пропуск.`,
    );
    return recon;
  }

  for await (const rows of streamTable(
    src,
    "_Document140",
    INVENTORY_HEADER_COLS,
    { batch: args.batch, limit: args.limit, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const code1C = hex;
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.inventory.deleteMany({ where: { code1C } });
        }
        recon.skipped++;
        continue;
      }
      const items = itemsByDoc.get(hex) ?? [];
      const posted = asBool(row["_Posted"]);
      const docDate = asDate(row["_Date_Time"]);
      const warehouseId = resolveWarehouseId(
        ctx,
        bufToHex(row["_Fld1396RRef"]),
      );

      try {
        if (willWrite(ctx)) {
          await prisma.$transaction(async (tx) => {
            const doc = await tx.inventory.upsert({
              where: { code1C },
              create: {
                code1C,
                number1C: asString(row["_Number"]),
                docNumber: hex,
                ...(docDate ? { docDate } : {}),
                warehouseId,
                status: posted ? "posted" : "draft",
                isClosed: posted,
                notes: asString(row["_Fld1395"]),
                ...(docDate ? { createdAt: docDate } : {}),
              },
              update: {
                number1C: asString(row["_Number"]),
                ...(docDate ? { docDate } : {}),
                warehouseId,
                status: posted ? "posted" : "draft",
                isClosed: posted,
                notes: asString(row["_Fld1395"]),
              },
              select: { id: true },
            });
            await tx.inventoryItem.deleteMany({
              where: { inventoryId: doc.id },
            });
            if (items.length > 0) {
              await tx.inventoryItem.createMany({
                data: items.map((it) => ({
                  inventoryId: doc.id,
                  productId: it.productId,
                  charHex: it.charHex,
                  barcode: it.barcode,
                  qtyAccounting: it.qtyAccounting,
                  qtyActual: it.qtyActual,
                  qtyDifference: round2(it.qtyActual - it.qtyAccounting),
                  priceEur: it.priceEur,
                })),
              });
            }
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(`inventory: processed ${recon.written + recon.skipped + recon.errors}`);
  }
  return recon;
}

// ─── 6. transfer — ПеремещениеТоваров → _Document162 / _Document162_VT2221 ─────
// Шапка (декодовано з ПеремещениеТоваров.xml + columns.tsv, anchor: Комментарий=ntext _Fld2212):
//   ВидОперации _Fld2210RRef, ВнутреннийЗаказ _Fld2211RRef, Комментарий _Fld2212,
//   Организация _Fld2213RRef, Ответственный _Fld2214RRef, Подразделение _Fld2218RRef,
//   **СкладОтправитель _Fld2219RRef, СкладПолучатель _Fld2220RRef**.
//   ⚠️ Виправлено: _Fld2211/_Fld2213 були НЕ склади (ВнутреннийЗаказ/Организация).
// Рядки: Номенклатура _Fld2223RRef, Кількість _Fld2228, Характеристика _Fld2230RRef.
//   (StockTransferItem не має priceEur/amountEur → ціну не зберігаємо.)
const TRANSFER_HEADER_COLS = [
  "_IDRRef",
  "_Number",
  "_Date_Time",
  "_Posted",
  "_Marked",
  "_Fld2219RRef", // Склад-відправник (СкладОтправитель)
  "_Fld2220RRef", // Склад-отримувач (СкладПолучатель)
  "_Fld2212", // Коментар
];

async function importTransfer(ctx: ImportContext): Promise<Recon> {
  const recon = newRecon("transfer");
  const sink = new ErrorSink(recon, "transfer");
  const { args, src, prisma } = ctx;

  await ensureProductLotDicts(ctx);
  await ensureWarehouseDict(ctx);

  recon.sourceRows = await countTable(src, "_Document162");
  log(`transfer: source rows = ${recon.sourceRows}`);

  let itemsByDoc: Map<string, StockDocItem[]>;
  try {
    itemsByDoc = await loadStockVtMap(ctx, {
      table: "_Document162_VT2221",
      ownerCol: "_Document162_IDRRef",
      lineNoCol: "_LineNo2222",
      productRRef: "_Fld2223RRef",
      charRRef: "_Fld2230RRef",
      qtyCol: "_Fld2228",
      weightCol: null,
      priceCol: null,
      amountCol: null,
      qtyAccountingCol: null,
      qtyActualCol: null,
    });
  } catch (e) {
    warn(
      `transfer: VT _Document162_VT2221 недоступна (${errMsg(e)}) — пропуск.`,
    );
    return recon;
  }

  for await (const rows of streamTable(
    src,
    "_Document162",
    TRANSFER_HEADER_COLS,
    { batch: args.batch, limit: args.limit, orderBy: ["_IDRRef"] },
  )) {
    for (const row of rows) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) {
        recon.skipped++;
        continue;
      }
      const code1C = hex;
      if (asBool(row["_Marked"])) {
        if (willWrite(ctx)) {
          await prisma.stockTransfer.deleteMany({ where: { code1C } });
        }
        recon.skipped++;
        continue;
      }
      const items = itemsByDoc.get(hex) ?? [];
      const totalWeight = items.reduce((s, it) => s + it.weight, 0);
      const totalQuantity = items.reduce((s, it) => s + it.quantity, 0);
      const posted = asBool(row["_Posted"]);
      const docDate = asDate(row["_Date_Time"]);
      const fromWarehouseId = resolveWarehouseId(
        ctx,
        bufToHex(row["_Fld2219RRef"]),
      );
      const toWarehouseId = resolveWarehouseId(
        ctx,
        bufToHex(row["_Fld2220RRef"]),
      );

      try {
        if (willWrite(ctx)) {
          await prisma.$transaction(async (tx) => {
            const doc = await tx.stockTransfer.upsert({
              where: { code1C },
              create: {
                code1C,
                number1C: asString(row["_Number"]),
                docNumber: hex,
                ...(docDate ? { docDate } : {}),
                fromWarehouseId,
                toWarehouseId,
                status: posted ? "posted" : "draft",
                totalWeight,
                totalQuantity,
                notes: asString(row["_Fld2212"]),
                ...(docDate ? { createdAt: docDate } : {}),
              },
              update: {
                number1C: asString(row["_Number"]),
                ...(docDate ? { docDate } : {}),
                fromWarehouseId,
                toWarehouseId,
                status: posted ? "posted" : "draft",
                totalWeight,
                totalQuantity,
                notes: asString(row["_Fld2212"]),
              },
              select: { id: true },
            });
            await tx.stockTransferItem.deleteMany({
              where: { transferId: doc.id },
            });
            if (items.length > 0) {
              await tx.stockTransferItem.createMany({
                data: items.map((it) => ({
                  transferId: doc.id,
                  productId: it.productId,
                  charHex: it.charHex,
                  barcode: it.barcode,
                  weight: it.weight,
                  quantity: it.quantity,
                })),
              });
            }
          });
        }
        recon.written++;
      } catch (e) {
        sink.record(code1C, e);
      }
    }
    log(`transfer: processed ${recon.written + recon.skipped + recon.errors}`);
  }
  return recon;
}

const ENTITY_RUNNERS: Record<
  EntityName,
  (ctx: ImportContext) => Promise<Recon>
> = {
  customers: importCustomers,
  categories: importCategories,
  products: importProducts,
  lots: importLots,
  barcodes: importBarcodes,
  prices: importPrices,
  dictionaries: importDictionaries,
  "dictionaries-full": importDictionariesFull,
  rates: importRates,
  orders: importOrders,
  sales: importSales,
  cashorders: importCashOrders,
  routesheets: importRouteSheets,
  debt: importDebt,
  returns: importReturns,
  repack: importRepack,
  writeoff: importWriteOff,
  stockadjust: importStockAdjust,
  inventory: importInventory,
  transfer: importTransfer,
  misc: importMisc,
  "sales-reg": importSalesRegister,
  "cashflow-reg": importCashFlowRegister,
  "stock-reg": importStockRegister,
  "orders-reg": importOrderRemainderRegister,
  "cost-reg": importCostReg,
  bankdocs: importBankDocs,
  cashtransfers: importCashTransfers,
  "client-timeline": importClientTimeline,
  "product-receipt-names": importProductReceiptNames,
};

// Порядок за FK-залежностями (план §13).
// `debt` — в кінці: лише оновлює MgrClient.debt, не потребує документів.
// `rates` свідомо НЕ у переліку: курси вже імпортує `dictionaries` (importRates
// викликається у importDictionaries). Окремий `--entity rates` потрібен лише для
// ізольованого реімпорту/довантаження курсів без решти довідників.
const DEFAULT_ORDER: EntityName[] = [
  "customers",
  "categories",
  "products",
  "barcodes",
  "lots",
  "prices",
  "dictionaries",
  "dictionaries-full",
  "orders",
  "sales",
  "cashorders",
  "routesheets",
  "debt",
  "misc",
  // *-reg (Фаза 2) + bankdocs/cashtransfers (Фаза 6) свідомо НЕ в дефолті — їхні
  // коди _Fld/_Document ще не звірені на живому MSSQL; запускати ізольовано
  // `--entity sales-reg|cashflow-reg|stock-reg|orders-reg|bankdocs|cashtransfers`.
];

function printReconTable(recons: Recon[], dryRun: boolean): void {
  const head = dryRun
    ? [
        "entity",
        "source rows",
        "would write",
        "skipped",
        "errors",
        "unresolved",
      ]
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

  // Діагностика: надрукувати колонки _Reference76 (Номенклатура) і вийти. Нічого
  // не пише в цільову базу — допомагає звірити фізичний _Fld для «Название».
  if (args.printColumns) {
    await printReferenceColumns(src, "_Reference76");
    await src.close().catch(() => undefined);
    log("done (print-columns).");
    return;
  }

  YEAR_OFFSET = await loadYearOffset(src);

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
    legalTypeByHex: new Map(),
    cashFlowArticleByHex: new Map(),
    bankAccountByHex: new Map(),
    agentNameByHex: new Map(),
    agentUserIdByHex: new Map(),
    unitNameByHex: new Map(),
    eurRateByDay: new Map(),
    regionIdByHex: new Map(),
    categoryHexToId: new Map(),
    categoryParentHex: new Map(),
    warehouseIdByHex: new Map(),
    mergedCode1C: new Map(),
  };

  // ── Сесія 7.1 — мапа злиттів дублікатів (діє для всіх entity) ──
  ctx.mergedCode1C = await loadProductMergeMap(prisma);
  if (ctx.mergedCode1C.size > 0) {
    log(`product-merge: ${ctx.mergedCode1C.size} злитих code1C → survivor`);
  }

  // Дрібні довідники назв (city/region) — потрібні для Customer.
  const entities = args.entity ? [args.entity] : DEFAULT_ORDER;
  if (entities.includes("customers")) {
    ctx.cityNames = await loadDictNames(src, "_Reference6810", "_Description");
    ctx.regionNames = await loadDictNames(
      src,
      "_Reference6811",
      "_Description",
    );
    ctx.legalTypeByHex = await loadLegalTypeEnum(src);
    log(`dicts: cities=${ctx.cityNames.size} regions=${ctx.regionNames.size}`);
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

// Запускаємо main() лише при прямому виконанні (tsx scripts/...), НЕ під час
// імпорту модуля у юніт-тестах (звідки беруться чисті мапери map*Row).
if (!process.env.VITEST) {
  main().catch((e) => {
    console.error(`${TAG} FATAL:`, e);
    process.exit(1);
  });
}
