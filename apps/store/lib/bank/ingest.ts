/**
 * Інжест банківського фіда у БД: рахунки (BankFeedAccount) + незмінний архів
 * транзакцій (BankTransaction, дедуп по banку-id) + оркестратор фонового синку.
 *
 * Канали даних Monobank:
 *  1) Webhook (основний, реальний час) — app/api/monobank/webhook →
 *     ingestMonoStatementItems() з одним StatementItem.
 *  2) Фонове опитування (резерв на випадок пропущеного вебхука + відкриття
 *     рахунків) — app/api/cron/bank-sync → runBankSync(). Через ліміт банку
 *     1 запит/60с робимо НЕ БІЛЬШЕ ОДНОГО виклику API за прогін крону:
 *     спершу client-info (рахунки+залишки, раз на ≥30 хв), інакше — виписка
 *     одного рахунку по колу (курсор lastStatementSyncAt).
 */

import { Prisma, prisma } from "@ltex/db";
import {
  getClientInfo,
  getStatement,
  isMonoConfigured,
  type MonoStatementItem,
} from "./monobank";
import {
  MONO_PROVIDER,
  normalizeMonoAccount,
  normalizeMonoStatementItem,
  type NormalizedBankTxn,
} from "./normalize";

/** Ключ MgrSetting з часом останнього client-info (курсор крону). */
export const MONO_CLIENT_INFO_AT_KEY = "bank:mono:client_info_at";

/** Як часто оновлювати рахунки/залишки через client-info. */
const CLIENT_INFO_EVERY_MS = 30 * 60 * 1000; // 30 хв
/** Мінімальна пауза між дозборами виписки одного рахунку. */
const STATEMENT_EVERY_MS = 15 * 60 * 1000; // 15 хв
/** Перекриття при дозборі (ловить те, що прийшло у «шві» між прогонами). */
const STATEMENT_OVERLAP_MS = 2 * 60 * 60 * 1000; // 2 год
/** Глибина першого дозбору нового рахунку. */
const STATEMENT_INITIAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // 7 діб
/** Жорсткий ліміт вікна виписки Monobank — 31 доба + 1 год. Беремо із запасом. */
const STATEMENT_MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface SyncAccountsResult {
  ok: boolean;
  accounts: number;
  error?: string;
}

/**
 * client-info → upsert рахунків фіда + свіжі залишки. 1 виклик API.
 */
export async function syncMonoAccounts(): Promise<SyncAccountsResult> {
  const res = await getClientInfo();
  if (!res.ok) return { ok: false, accounts: 0, error: res.error };

  const accounts = res.data.accounts ?? [];
  const now = new Date();
  for (const acc of accounts) {
    const n = normalizeMonoAccount(acc);
    await prisma.bankFeedAccount.upsert({
      where: {
        provider_externalId: {
          provider: n.provider,
          externalId: n.externalId,
        },
      },
      create: {
        provider: n.provider,
        externalId: n.externalId,
        iban: n.iban,
        title: n.title,
        currencyCode: n.currencyCode,
        balance: n.balance,
        creditLimit: n.creditLimit,
        balanceAt: now,
      },
      update: {
        iban: n.iban,
        title: n.title,
        currencyCode: n.currencyCode,
        balance: n.balance,
        creditLimit: n.creditLimit,
        balanceAt: now,
        archived: false,
      },
    });
  }

  await prisma.mgrSetting.upsert({
    where: { key: MONO_CLIENT_INFO_AT_KEY },
    create: { key: MONO_CLIENT_INFO_AT_KEY, value: now.toISOString() },
    update: { value: now.toISOString() },
  });

  return { ok: true, accounts: accounts.length };
}

export interface IngestResult {
  inserted: number;
  total: number;
}

/**
 * Пише транзакції Monobank у архів (дедуп по (provider, externalId)) і
 * оновлює залишок рахунку з найсвіжішої операції (balanceAfter).
 * Працює і для вебхука (1 item), і для виписки (масив).
 */
export async function ingestMonoStatementItems(
  accountExternalId: string,
  items: MonoStatementItem[],
): Promise<IngestResult> {
  if (items.length === 0) return { inserted: 0, total: 0 };

  const normalized = items.map((i) =>
    normalizeMonoStatementItem(accountExternalId, i),
  );

  // Рахунок фіда: якщо вебхук приніс рух раніше, ніж client-info відкрив
  // рахунок — створюємо мінімальний запис (client-info потім збагатить).
  let feedAccount = await prisma.bankFeedAccount.findUnique({
    where: {
      provider_externalId: {
        provider: MONO_PROVIDER,
        externalId: accountExternalId,
      },
    },
    select: { id: true, balanceAt: true },
  });
  if (!feedAccount) {
    feedAccount = await prisma.bankFeedAccount.create({
      data: {
        provider: MONO_PROVIDER,
        externalId: accountExternalId,
        title: "Monobank (новий рахунок)",
        currencyCode: normalized[0]?.currencyCode ?? "UAH",
      },
      select: { id: true, balanceAt: true },
    });
  }

  const result = await prisma.bankTransaction.createMany({
    data: normalized.map((n) => toCreateRow(feedAccount.id, n)),
    skipDuplicates: true,
  });

  // Залишок після найсвіжішої операції — оновлюємо, якщо новіший за відомий.
  const latest = [...normalized]
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

  return { inserted: result.count, total: items.length };
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

export interface BankSyncResult {
  mode: "skipped" | "client-info" | "statement" | "idle" | "error";
  detail?: string;
  accounts?: number;
  inserted?: number;
}

/**
 * Один прогін фонового синку (крон кожні ~5 хв). МАКСИМУМ один виклик API
 * Monobank за прогін (ліміт банку 1/60с):
 *  - client-info застаріло (>30 хв) → оновлюємо рахунки й залишки;
 *  - інакше → дозбір виписки найдавніше синхронізованого рахунку.
 */
export async function runBankSync(): Promise<BankSyncResult> {
  if (!isMonoConfigured()) {
    return { mode: "skipped", detail: "MONOBANK_TOKEN не налаштовано" };
  }

  const now = Date.now();

  const setting = await prisma.mgrSetting.findUnique({
    where: { key: MONO_CLIENT_INFO_AT_KEY },
  });
  const lastClientInfoAt = setting ? Date.parse(setting.value) : NaN;
  const clientInfoStale =
    !Number.isFinite(lastClientInfoAt) ||
    now - lastClientInfoAt > CLIENT_INFO_EVERY_MS;

  if (clientInfoStale) {
    const res = await syncMonoAccounts();
    if (!res.ok) return { mode: "error", detail: res.error };
    return { mode: "client-info", accounts: res.accounts };
  }

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
    : now - STATEMENT_INITIAL_LOOKBACK_MS;

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
