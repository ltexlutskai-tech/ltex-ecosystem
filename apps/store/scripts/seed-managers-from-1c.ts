/**
 * Сід менеджерських акаунтів `User` з 1С-довідника торгових агентів.
 * Створює/оновлює акаунти на основі `_Reference6628` (ТорговыеАгенты).
 *
 * Дзеркалить патерни безпеки/підключення з `import-1c-historical.ts`:
 *   - Джерело 1С: `LEGACY_1C_DB_URL` (mssql://, read-only логін).
 *   - Ціль запису: ТІЛЬКИ `IMPORT_TARGET_DB_URL`. Якщо не задано → падаємо.
 *     НІКОЛИ не фолбечимо мовчки на `DATABASE_URL`.
 *   - Якщо ціль == `DATABASE_URL` (бойова база) → вимагаємо `--confirm-prod`.
 *   - `--dry-run` НЕ робить жодного запису (тільки читання + резолв зв'язків).
 *
 * ─── ЩО РОБИТЬ ────────────────────────────────────────────────────────────────
 *   A. Active managers — HARDCODED список (нижче). Матчиться до 1С-агента за
 *      нормалізованим іменем (exact > unique-contains). На матч → code1C = hex.
 *   B. Кузенко — НЕ створюється/не редагується, лише лінкується code1C якщо
 *      акаунт існує і code1C ще порожній.
 *   C. Archived — усі інші агенти 1С: створюються неактивними (isActive=false),
 *      ніколи не логіняться.
 *
 *   Idempotent: keyed by code1C / email. UPDATE НІКОЛИ не перетирає email або
 *   passwordHash (зберігаємо креди, які користувач виставив пізніше).
 *
 * ─── ПРАПОРЦІ ─────────────────────────────────────────────────────────────────
 *   --dry-run        читає 1С + резолвить матчі, нічого не пише
 *   --confirm-prod   дозволити запис коли ціль = бойова база (DATABASE_URL)
 *
 * ─── ЗАПУСК (диктує orchestrator) ─────────────────────────────────────────────
 *   # сухий прогон:
 *   IMPORT_TARGET_DB_URL=<DATABASE_URL> \
 *     pnpm --filter @ltex/store exec tsx scripts/seed-managers-from-1c.ts --dry-run
 *   # бойовий запис:
 *   IMPORT_TARGET_DB_URL=<DATABASE_URL> \
 *     pnpm --filter @ltex/store exec tsx scripts/seed-managers-from-1c.ts --confirm-prod
 *
 * Скрипт у пісочниці НЕ запускався (немає БД) — лише компілюється/перевіряється.
 */

import { randomBytes } from "crypto";

import bcrypt from "bcryptjs";
import * as mssql from "mssql";

import { PrismaClient, type UserRole } from "@ltex/db";

// ─── Парсинг аргументів ───────────────────────────────────────────────────────

interface CliArgs {
  dryRun: boolean;
  confirmProd: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, confirmProd: false };
  for (const a of argv) {
    switch (a) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--confirm-prod":
        args.confirmProd = true;
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ─── Логування ────────────────────────────────────────────────────────────────

const TAG = "[seed-managers]";
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
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 120000,
  };
}

// ─── Hex-ключі для _IDRRef (binary(16)) ───────────────────────────────────────
// mssql повертає binary(16) як Node Buffer. Ключ = lower-case hex 16 байт.

function bufToHex(v: unknown): string | null {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) {
    // Порожнє посилання у 1С = 16 нульових байт.
    if (v.length === 0 || v.every((b) => b === 0)) return null;
    return v.toString("hex").toLowerCase();
  }
  // mssql інколи віддає binary як hex-рядок.
  if (typeof v === "string") {
    const s = v.startsWith("0x") ? v.slice(2) : v;
    const norm = s.toLowerCase();
    if (/^0+$/.test(norm)) return null;
    return norm;
  }
  return null;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  return String(v);
}

// ─── Нормалізація імен для матчингу ───────────────────────────────────────────
// trim → lowercase → стиснути внутрішні пробіли в один.

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ─── Креди ────────────────────────────────────────────────────────────────────

const BCRYPT_COST = 12;

// Непридатний для входу хеш: хешуємо випадкові 32 байти — пароль ніхто не знає,
// поки користувач не виставить справжній.
async function unusableHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_COST);
}

// ─── HARDCODED список активних менеджерів ─────────────────────────────────────

interface ActiveEntry {
  fullName: string;
  role: UserRole;
  email?: string;
}

const ACTIVE: ActiveEntry[] = [
  {
    fullName: "Бойко Катерина",
    role: "manager",
    email: "ltex.kateboyko@gmail.com",
  },
  { fullName: "Володимир", role: "owner" },
  { fullName: "Гуменюк Євген", role: "manager" },
  { fullName: "Дунас Богдан", role: "manager" },
  { fullName: "Експедитор Вітя", role: "expeditor" },
  { fullName: "Експедитор Ярослав", role: "expeditor" },
  { fullName: "Експедитор LTEX", role: "expeditor" },
  { fullName: "Захарчук Олександра", role: "manager" },
  { fullName: "Офіс Галина", role: "analyst" },
  {
    fullName: "Савчук Павло",
    role: "manager",
    email: "ltex.savchuk@gmail.com",
  },
  { fullName: "Склад 1 (Андрій)", role: "warehouse" },
  { fullName: "Склад 2 (Антон)", role: "warehouse" },
  { fullName: "Володимир (склад)", role: "warehouse" },
];

// ─── Плейсхолдери email ───────────────────────────────────────────────────────
// key = hex (для archived/matched, унікальний) АБО slug fullName (для
// unmatched-active). Детерміновано + унікально (slug-колізії → суфікс індексу).

function slugify(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яґіїє]+/giu, "-")
      .replace(/^-+|-+$/g, "") || "agent"
  );
}

function placeholder(key: string): string {
  return `agent-${key}@imported.local`;
}

// ─── Матчинг активного запису до 1С-агента ────────────────────────────────────
// Повертає hex агента або null. Exact normalized match виграє; інакше — унікальний
// "contains". Якщо кілька non-exact кандидатів → WARN + null.

interface AgentRow {
  hex: string;
  name: string;
  norm: string;
}

function matchAgent(
  entry: ActiveEntry,
  agents: AgentRow[],
): { hex: string | null; ambiguous: boolean } {
  const target = normalizeName(entry.fullName);

  // 1) exact normalized
  const exact = agents.filter((a) => a.norm === target);
  if (exact.length === 1) return { hex: exact[0]!.hex, ambiguous: false };
  if (exact.length > 1) {
    // Кілька агентів з однаковою назвою — беремо перший, але попереджаємо.
    warn(
      `"${entry.fullName}": кілька 1С-агентів з точною назвою (${exact.length}) — беру перший`,
    );
    return { hex: exact[0]!.hex, ambiguous: false };
  }

  // 2) unique contains (exact уже не знайдено)
  const contains = agents.filter(
    (a) => a.norm.includes(target) || target.includes(a.norm),
  );
  if (contains.length === 1) return { hex: contains[0]!.hex, ambiguous: false };
  if (contains.length > 1) {
    warn(
      `"${entry.fullName}": неоднозначний "contains"-матч (${contains.length} кандидатів: ${contains
        .map((c) => c.name)
        .join(", ")}) — лишаю code1C null`,
    );
    return { hex: null, ambiguous: true };
  }

  return { hex: null, ambiguous: false };
}

// ─── Звіт ─────────────────────────────────────────────────────────────────────

interface Summary {
  activeCreated: string[];
  activeUpdated: string[];
  activeMatched: { name: string; agent: string; hex: string }[];
  activeNoMatch: string[];
  kuzenkoLink: string;
  archivedCount: number;
}

// ─── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // ── Env-гарди (дзеркало import-1c-historical.ts) ──────────────────────────
  const legacyUrl = process.env.LEGACY_1C_DB_URL;
  if (!legacyUrl) {
    throw new Error("LEGACY_1C_DB_URL is required (mssql:// read-only до 1С).");
  }
  const targetUrl = process.env.IMPORT_TARGET_DB_URL;
  if (!targetUrl) {
    throw new Error(
      "IMPORT_TARGET_DB_URL is required (ціль запису). НЕ фолбечимо на DATABASE_URL.",
    );
  }
  const isProdTarget =
    !!process.env.DATABASE_URL && targetUrl === process.env.DATABASE_URL;
  if (isProdTarget && !args.confirmProd && !args.dryRun) {
    throw new Error(
      "Ціль == DATABASE_URL (бойова база). Додай --confirm-prod (або --dry-run).",
    );
  }

  log(`dry-run=${args.dryRun} prod-target=${isProdTarget}`);

  // ── Читаємо торгових агентів з 1С ─────────────────────────────────────────
  const mssqlConfig = parseMssqlUrl(legacyUrl);
  const pool = await new mssql.ConnectionPool(mssqlConfig).connect();

  let agents: AgentRow[];
  try {
    const result = await pool
      .request()
      .query<
        Record<string, unknown>
      >("SELECT _IDRRef, _Description FROM _Reference6628");
    agents = [];
    for (const row of result.recordset) {
      const hex = bufToHex(row["_IDRRef"]);
      if (!hex) continue;
      const name = asString(row["_Description"]) ?? "";
      agents.push({ hex, name, norm: normalizeName(name) });
    }
    log(`зчитано ${agents.length} торгових агентів з _Reference6628`);
  } finally {
    await pool.close();
  }

  const agentByHex = new Map<string, string>();
  for (const a of agents) agentByHex.set(a.hex, a.name);

  // ── Prisma до ЦІЛІ (IMPORT_TARGET_DB_URL) ────────────────────────────────
  const prisma = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  const summary: Summary = {
    activeCreated: [],
    activeUpdated: [],
    activeMatched: [],
    activeNoMatch: [],
    kuzenkoLink: "не знайдено агента",
    archivedCount: 0,
  };

  // Множина hex, які «забрані» (A або B) — їх НЕ архівуємо у C.
  const claimed = new Set<string>();
  // Лічильник для унікалізації slug-плейсхолдерів (unmatched-active).
  const slugSeen = new Map<string, number>();

  try {
    // ── A. Активні менеджери ────────────────────────────────────────────────
    for (const entry of ACTIVE) {
      const { hex } = matchAgent(entry, agents);

      if (hex) {
        claimed.add(hex);
        summary.activeMatched.push({
          name: entry.fullName,
          agent: agentByHex.get(hex) ?? hex,
          hex,
        });
      } else {
        summary.activeNoMatch.push(entry.fullName);
        warn(
          `"${entry.fullName}": не зматчено жодного 1С-агента — створюю БЕЗ code1C`,
        );
      }

      // email: явний → плейсхолдер (hex або унікальний slug).
      let email: string;
      if (entry.email) {
        email = entry.email;
      } else if (hex) {
        email = placeholder(hex);
      } else {
        let slug = slugify(entry.fullName);
        const seen = slugSeen.get(slug) ?? 0;
        slugSeen.set(slug, seen + 1);
        if (seen > 0) slug = `${slug}-${seen}`;
        email = placeholder(slug);
      }

      if (args.dryRun) {
        log(
          `[A dry] ${entry.fullName} role=${entry.role} email=${email} code1C=${hex ?? "—"}`,
        );
        continue;
      }

      const passwordHash = await unusableHash();

      if (hex) {
        // Keyed by code1C.
        const existing = await prisma.user.findUnique({
          where: { code1C: hex },
        });
        await prisma.user.upsert({
          where: { code1C: hex },
          create: {
            email,
            passwordHash,
            fullName: entry.fullName,
            role: entry.role,
            isActive: true,
            code1C: hex,
          },
          // UPDATE НЕ чіпає email/passwordHash.
          update: {
            fullName: entry.fullName,
            role: entry.role,
            isActive: true,
            code1C: hex,
          },
        });
        (existing ? summary.activeUpdated : summary.activeCreated).push(
          entry.fullName,
        );
      } else {
        // Keyed by email.
        const existing = await prisma.user.findUnique({ where: { email } });
        await prisma.user.upsert({
          where: { email },
          create: {
            email,
            passwordHash,
            fullName: entry.fullName,
            role: entry.role,
            isActive: true,
            code1C: null,
          },
          update: {
            fullName: entry.fullName,
            role: entry.role,
            isActive: true,
            // code1C лишаємо як є (нема hex для лінку).
          },
        });
        (existing ? summary.activeUpdated : summary.activeCreated).push(
          entry.fullName,
        );
      }
    }

    // ── B. Кузенко — skip-but-link ──────────────────────────────────────────
    const kuzenkoAgent = agents.find((a) => a.norm.includes("кузенко"));
    if (kuzenkoAgent) {
      claimed.add(kuzenkoAgent.hex);
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            { email: "kuzenko.t.k@gmail.com" },
            { fullName: { contains: "Кузенко" } },
          ],
        },
      });
      if (!existing) {
        summary.kuzenkoLink = `агент знайдено (${kuzenkoAgent.name}), але User не існує — пропускаю`;
      } else if (existing.code1C) {
        summary.kuzenkoLink = `вже залінковано (code1C=${existing.code1C})`;
      } else if (args.dryRun) {
        summary.kuzenkoLink = `[dry] залінкував би ${existing.email} → code1C=${kuzenkoAgent.hex}`;
      } else {
        await prisma.user.updateMany({
          where: { id: existing.id, code1C: null },
          data: { code1C: kuzenkoAgent.hex },
        });
        summary.kuzenkoLink = `залінковано ${existing.email} → code1C=${kuzenkoAgent.hex}`;
      }
      log(`[B] Кузенко: ${summary.kuzenkoLink}`);
    } else {
      log("[B] Кузенко: 1С-агента не знайдено — нічого не робимо");
    }

    // ── C. Архівні (усі решта агентів) ──────────────────────────────────────
    for (const a of agents) {
      if (claimed.has(a.hex)) continue;
      summary.archivedCount++;

      if (args.dryRun) continue;

      const passwordHash = await unusableHash();
      await prisma.user.upsert({
        where: { code1C: a.hex },
        create: {
          code1C: a.hex,
          fullName: a.name || a.hex,
          role: "manager",
          isActive: false,
          email: placeholder(a.hex),
          passwordHash,
        },
        update: {
          fullName: a.name || a.hex,
          isActive: false,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  // ── Звіт ──────────────────────────────────────────────────────────────────
  log("─────────────── SUMMARY ───────────────");
  log(`Активні створено: ${summary.activeCreated.length}`);
  if (summary.activeCreated.length)
    log(`  ${summary.activeCreated.join(", ")}`);
  log(`Активні оновлено: ${summary.activeUpdated.length}`);
  if (summary.activeUpdated.length)
    log(`  ${summary.activeUpdated.join(", ")}`);
  log(`Активні зматчені з 1С-агентом: ${summary.activeMatched.length}`);
  for (const m of summary.activeMatched)
    log(`  ${m.name} → агент "${m.agent}" (code1C=${m.hex})`);
  if (summary.activeNoMatch.length) {
    warn(
      `Активні БЕЗ матчу 1С-агента (створені без code1C): ${summary.activeNoMatch.join(", ")}`,
    );
  }
  log(`Кузенко-лінк: ${summary.kuzenkoLink}`);
  log(`Архівних агентів: ${summary.archivedCount}`);
  log(args.dryRun ? "DRY-RUN — нічого не записано." : "Готово.");
}

main().catch((e) => {
  console.error(`${TAG} FATAL: ${errMsg(e)}`);
  process.exit(1);
});
