/**
 * Інжест банківського фіда у БД: рахунки (BankFeedAccount) + незмінний архів
 * транзакцій (BankTransaction, дедуп по банківському id) + оркестратор
 * фонового синку обох банків.
 *
 * Канали даних:
 *  1) Monobank webhook (реальний час) — app/api/monobank/webhook →
 *     ingestMonoStatementItems() з одним StatementItem.
 *  2) Фоновий крон (app/api/cron/bank-sync → runBankSync()):
 *     • Monobank — резерв вебхука; через ліміт банку 1 запит/60с робимо НЕ
 *       БІЛЬШЕ ОДНОГО виклику API за прогін (client-info раз на ≥30 хв,
 *       інакше виписка одного рахунку по колу);
 *     • PrivatBank — вебхуків не має, тому кожен прогін: залишки (раз на
 *       ≥30 хв) + interim-транзакції поточного опердня (жорсткого ліміту
 *       немає); перший запуск — дозбір за 7 діб.
 *  3) Після інжесту — авто-рознесення платежів (lib/bank/reconcile.ts).
 */

import { Prisma, prisma } from "@ltex/db";
import {
  getClientInfo,
  getStatement,
  isMonoConfigured,
  type MonoStatementItem,
} from "./monobank";
import {
  getInterimBalances,
  getInterimTransactions,
  getTransactions,
  isPrivatConfigured,
} from "./privatbank";
import {
  MONO_PROVIDER,
  PRIVAT_PROVIDER,
  normalizeMonoAccount,
  normalizeMonoStatementItem,
  normalizePrivatBalance,
  normalizePrivatTransaction,
  type NormalizedBankTxn,
  type NormalizedFeedAccount,
} from "./normalize";

/** Ключі MgrSetting — курсори фонового синку. */
export const MONO_CLIENT_INFO_AT_KEY = "bank:mono:client_info_at";
export const PRIVAT_BALANCES_AT_KEY = "bank:privat:balances_at";
export const PRIVAT_BACKFILL_KEY = "bank:privat:backfill_done";

/** Як часто оновлювати рахунки/залишки. */
const ACCOUNTS_EVERY_MS = 30 * 60 * 1000; // 30 хв
/** Мінімальна пауза між дозборами виписки одного mono-рахунку. */
const STATEMENT_EVERY_MS = 15 * 60 * 1000; // 15 хв
/** Перекриття mono-дозбору (ловить «шов» між прогонами). */
const STATEMENT_OVERLAP_MS = 2 * 60 * 60 * 1000; // 2 год
/** Глибина першого дозбору нового рахунку. */
const INITIAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // 7 діб
/** Жорсткий ліміт вікна виписки Monobank — 31 доба + 1 год. Із запасом. */
const STATEMENT_MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Спільні хелпери ─────────────────────────────────────────────────────────

async function readSetting(key: string): Promise<string | null> {
  const row = await prisma.mgrSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await prisma.mgrSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

async function settingOlderThan(key: string, ms: number): Promise<boolean> {
  const raw = await readSetting(key);
  const at = raw ? Date.parse(raw) : NaN;
  return !Number.isFinite(at) || Date.now() - at > ms;
}

/** Upsert рахунку фіда з нормалізованої форми + свіжий залишок. */
async function upsertFeedAccount(
  n: NormalizedFeedAccount,
  balanceAt: Date,
): Promise<void> {
  await prisma.bankFeedAccount.upsert({
    where: {
      provider_externalId: { provider: n.provider, externalId: n.externalId },
    },
    create: {
      provider: n.provider,
      externalId: n.externalId,
      iban: n.iban,
      title: n.title,
      currencyCode: n.currencyCode,
      balance: n.balance,
      creditLimit: n.creditLimit,
      balanceAt,
    },
    update: {
      iban: n.iban,
      title: n.title,
      currencyCode: n.currencyCode,
      balance: n.balance,
      creditLimit: n.creditLimit,
      balanceAt,
      archived: false,
    },
  });
}

function toCreateRow(
  feedAccountId: string,
  n: NormalizedBankTxn,
): Prisma.BankTransactionCreateManyInput {
  return {
    provider: n.provider,
    externalId: n.externalId,
    feedAccountId,
    occurredAt: n.occurredAt,
    amount: n.amount,
    currencyCode: n.currencyCode,
    counterName: n.counterName,
    counterIban: n.counterIban,
    counterEdrpou: n.counterEdrpou,
    description: n.description,
    comment: n.comment,
    balanceAfter: n.balanceAfter,
    hold: n.hold,
    raw: n.raw as Prisma.InputJsonValue,
  };
}

export interface IngestResult {
  inserted: number;
  total: number;
}

/**
 * Пише нормалізовані транзакції в архів (дедуп по (provider, externalId)).
 * Рахунок фіда створюється мінімальним, якщо транзакція прийшла раніше, ніж
 * його відкрив синк рахунків. Залишок рахунку оновлюється з найсвіжішої
 * операції з balanceAfter (Monobank; Приват залишки веде окремим синком).
 */
export async function ingestNormalizedTransactions(
  txns: NormalizedBankTxn[],
): Promise<IngestResult> {
  if (txns.length === 0) return { inserted: 0, total: 0 };

  const byAccount = new Map<string, NormalizedBankTxn[]>();
  for (const t of txns) {
    const key = `${t.provider}|${t.accountExternalId}`;
    const list = byAccount.get(key);
    if (list) list.push(t);
    else byAccount.set(key, [t]);
  }

  let inserted = 0;
  for (const group of byAccount.values()) {
    const first = group[0];
    if (!first) continue;

    let feedAccount = await prisma.bankFeedAccount.findUnique({
      where: {
        provider_externalId: {
          provider: first.provider,
          externalId: first.accountExternalId,
        },
      },
      select: { id: true, balanceAt: true },
    });
    if (!feedAccount) {
      feedAccount = await prisma.bankFeedAccount.create({
        data: {
          provider: first.provider,
          externalId: first.accountExternalId,
          iban: first.accountExternalId.startsWith("UA")
            ? first.accountExternalId
            : null,
          title:
            first.provider === PRIVAT_PROVIDER
              ? `Приват …${first.accountExternalId.slice(-6)}`
              : "Monobank (новий рахунок)",
          currencyCode: first.currencyCode,
        },
        select: { id: true, balanceAt: true },
      });
    }

    const result = await prisma.bankTransaction.createMany({
      data: group.map((n) => toCreateRow(feedAccount.id, n)),
      skipDuplicates: true,
    });
    inserted += result.count;

    // Залишок після найсвіжішої операції — якщо новіший за відомий.
    const latest = [...group]
      .filter((n) => n.balanceAfter !== null)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    if (
      latest &&
      (!feedAccount.balanceAt ||
        latest.occurredAt.getTime() >= feedAccount.balanceAt.getTime())
    ) {
      await prisma.bankFeedAccount.update({
        where: { id: feedAccount.id },
        data: { balance: latest.balanceAfter, balanceAt: latest.occurredAt },
      });
    }
  }

  return { inserted, total: txns.length };
}

// ─── Monobank ────────────────────────────────────────────────────────────────

export interface SyncAccountsResult {
  ok: boolean;
  accounts: number;
  error?: string;
}

/** client-info → upsert рахунків фіда + свіжі залишки. 1 виклик API. */
export async function syncMonoAccounts(): Promise<SyncAccountsResult> {
  const res = await getClientInfo();
  if (!res.ok) return { ok: false, accounts: 0, error: res.error };

  const accounts = res.data.accounts ?? [];
  const now = new Date();
  for (const acc of accounts) {
    await upsertFeedAccount(normalizeMonoAccount(acc), now);
  }
  await writeSetting(MONO_CLIENT_INFO_AT_KEY, now.toISOString());
  return { ok: true, accounts: accounts.length };
}

/** Транзакції Monobank (вебхук або виписка) → архів. */
export async function ingestMonoStatementItems(
  accountExternalId: string,
  items: MonoStatementItem[],
): Promise<IngestResult> {
  return ingestNormalizedTransactions(
    items.map((i) => normalizeMonoStatementItem(accountExternalId, i)),
  );
}

export interface ProviderSyncResult {
  mode: string;
  detail?: string;
  accounts?: number;
  inserted?: number;
}

/** Прогін Monobank: МАКСИМУМ один виклик API (ліміт 1 запит/60с). */
export async function runMonoSync(): Promise<ProviderSyncResult> {
  if (!isMonoConfigured()) {
    return { mode: "skipped", detail: "MONOBANK_TOKEN не налаштовано" };
  }

  if (await settingOlderThan(MONO_CLIENT_INFO_AT_KEY, ACCOUNTS_EVERY_MS)) {
    const res = await syncMonoAccounts();
    if (!res.ok) return { mode: "error", detail: res.error };
    return { mode: "client-info", accounts: res.accounts };
  }

  const now = Date.now();
  const candidate = await prisma.bankFeedAccount.findFirst({
    where: {
      provider: MONO_PROVIDER,
      archived: false,
      OR: [
        { lastStatementSyncAt: null },
        { lastStatementSyncAt: { lt: new Date(now - STATEMENT_EVERY_MS) } },
      ],
    },
    orderBy: { lastStatementSyncAt: { sort: "asc", nulls: "first" } },
    select: { id: true, externalId: true, lastStatementSyncAt: true },
  });
  if (!candidate) return { mode: "idle" };

  const fromMs = candidate.lastStatementSyncAt
    ? Math.max(
        candidate.lastStatementSyncAt.getTime() - STATEMENT_OVERLAP_MS,
        now - STATEMENT_MAX_WINDOW_MS,
      )
    : now - INITIAL_LOOKBACK_MS;

  const res = await getStatement(
    candidate.externalId,
    Math.floor(fromMs / 1000),
    Math.floor(now / 1000),
  );
  if (!res.ok) return { mode: "error", detail: res.error };

  const ingest = await ingestMonoStatementItems(candidate.externalId, res.data);
  await prisma.bankFeedAccount.update({
    where: { id: candidate.id },
    data: { lastStatementSyncAt: new Date(now) },
  });

  return { mode: "statement", inserted: ingest.inserted };
}

// ─── PrivatBank ──────────────────────────────────────────────────────────────

/** Залишки Автоклієнта → upsert рахунків фіда. */
export async function syncPrivatAccounts(): Promise<SyncAccountsResult> {
  const res = await getInterimBalances();
  if (!res.ok) return { ok: false, accounts: 0, error: res.error };

  const now = new Date();
  let count = 0;
  for (const b of res.data) {
    const n = normalizePrivatBalance(b);
    if (!n) continue;
    await upsertFeedAccount(n, now);
    count++;
  }
  await writeSetting(PRIVAT_BALANCES_AT_KEY, now.toISOString());
  return { ok: true, accounts: count };
}

/**
 * Прогін PrivatBank: залишки (раз на ≥30 хв) + interim-транзакції поточного
 * опердня кожен прогін; перший запуск — дозбір виписки за 7 діб.
 */
export async function runPrivatSync(): Promise<ProviderSyncResult> {
  if (!isPrivatConfigured()) {
    return { mode: "skipped", detail: "PRIVATBANK_TOKEN не налаштовано" };
  }

  let accounts: number | undefined;
  if (await settingOlderThan(PRIVAT_BALANCES_AT_KEY, ACCOUNTS_EVERY_MS)) {
    const res = await syncPrivatAccounts();
    if (!res.ok) return { mode: "error", detail: res.error };
    accounts = res.accounts;
  }

  const backfillDone = (await readSetting(PRIVAT_BACKFILL_KEY)) === "1";
  const txRes = backfillDone
    ? await getInterimTransactions()
    : await getTransactions(
        new Date(Date.now() - INITIAL_LOOKBACK_MS),
        new Date(),
      );
  if (!txRes.ok) return { mode: "error", detail: txRes.error, accounts };

  const normalized = txRes.data
    .map(normalizePrivatTransaction)
    .filter((n): n is NormalizedBankTxn => n !== null);
  const ingest = await ingestNormalizedTransactions(normalized);
  if (!backfillDone) await writeSetting(PRIVAT_BACKFILL_KEY, "1");

  return {
    mode: backfillDone ? "interim" : "backfill",
    accounts,
    inserted: ingest.inserted,
  };
}

// ─── Оркестратор крону ───────────────────────────────────────────────────────

export interface BankSyncResult {
  mono: ProviderSyncResult;
  privat: ProviderSyncResult;
  reconciled?: unknown;
}

/**
 * Один прогін фонового синку (крон кожні ~5 хв): Monobank + PrivatBank, потім
 * авто-рознесення нових транзакцій (динамічний імпорт розриває цикл модулів
 * ingest ↔ reconcile).
 */
export async function runBankSync(): Promise<BankSyncResult> {
  const mono = await runMonoSync();
  const privat = await runPrivatSync();

  let reconciled: unknown;
  try {
    const { reconcileBankTransactions } = await import("./reconcile");
    reconciled = await reconcileBankTransactions();
  } catch (e: unknown) {
    reconciled = { error: e instanceof Error ? e.message : String(e) };
  }

  return { mono, privat, reconciled };
}
