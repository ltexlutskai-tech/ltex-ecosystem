/**
 * Клієнт Monobank Personal API (ФОП) — читання рахунків/виписок + webhook.
 *
 * Банкінг Крок 1 (2026-07-24, docs/BANKING_INTEGRATION_ANALYSIS.md §2):
 *  - auth: статичний токен у заголовку `X-Token` (env MONOBANK_TOKEN,
 *    генерується власником на api.monobank.ua);
 *  - READ-ONLY по грошах: client-info (рахунки+залишки), statement (виписка),
 *    POST /personal/webhook (єдиний "запис" — URL для пуш-повідомлень);
 *  - ліміт: client-info + statement сумарно 1 запит/60с (429 при перевищенні) —
 *    тому фонове опитування робить НЕ БІЛЬШЕ ОДНОГО виклику за прогін крону
 *    (див. lib/bank/ingest.ts), а реальний час дає webhook;
 *  - суми — цілі в мінорних одиницях (копійки/центи), валюта — числовий ISO.
 *
 * Усі функції best-effort: повертають {ok:false, error} і не кидають (патерн
 * lib/fiscal/checkbox.ts) — збій банку не має валити крон чи вебхук.
 */

const DEFAULT_BASE_URL = "https://api.monobank.ua";
const REQUEST_TIMEOUT_MS = 20_000;

export interface MonoAccount {
  id: string;
  sendId?: string;
  balance: number; // мінорні одиниці
  creditLimit?: number; // мінорні одиниці
  type?: string; // "fop" | "black" | ...
  currencyCode: number; // 980 UAH / 978 EUR / 840 USD
  maskedPan?: string[];
  iban?: string;
}

export interface MonoClientInfo {
  clientId?: string;
  name?: string;
  webHookUrl?: string;
  accounts?: MonoAccount[];
}

export interface MonoStatementItem {
  id: string;
  time: number; // unix seconds
  description?: string;
  mcc?: number;
  originalMcc?: number;
  hold?: boolean;
  amount: number; // мінорні одиниці, зі знаком (− = розхід)
  operationAmount?: number;
  currencyCode: number;
  commissionRate?: number;
  cashbackAmount?: number;
  balance?: number; // залишок ПІСЛЯ операції, мінорні одиниці
  comment?: string; // коментар платника (призначення)
  receiptId?: string;
  invoiceId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
}

export type MonoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function monoToken(): string | null {
  const token = process.env.MONOBANK_TOKEN?.trim();
  return token ? token : null;
}

function monoBaseUrl(): string {
  return process.env.MONOBANK_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

/** Чи налаштовано інтеграцію (є токен). */
export function isMonoConfigured(): boolean {
  return monoToken() !== null;
}

async function monoRequest<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<MonoResult<T>> {
  const token = monoToken();
  if (!token) return { ok: false, error: "MONOBANK_TOKEN не налаштовано" };
  try {
    const res = await fetch(`${monoBaseUrl()}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "X-Token": token,
        ...(init?.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Monobank HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      };
    }
    // POST /personal/webhook відповідає порожнім тілом — толерантний парс.
    const text = await res.text();
    const data = (text ? JSON.parse(text) : {}) as T;
    return { ok: true, data };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: `Monobank запит не вдався: ${message}` };
  }
}

/** Рахунки клієнта + залишки (+ поточний webHookUrl). Ліміт 1/60с! */
export async function getClientInfo(): Promise<MonoResult<MonoClientInfo>> {
  return monoRequest<MonoClientInfo>("/personal/client-info");
}

/**
 * Виписка по рахунку за період (unix-секунди; максимум 31 доба + 1 година).
 * Ліміт 1/60с (спільний з client-info).
 */
export async function getStatement(
  accountId: string,
  fromSec: number,
  toSec: number,
): Promise<MonoResult<MonoStatementItem[]>> {
  const path = `/personal/statement/${encodeURIComponent(accountId)}/${Math.floor(fromSec)}/${Math.floor(toSec)}`;
  return monoRequest<MonoStatementItem[]>(path);
}

/**
 * Реєструє URL для пуш-повідомлень про нові транзакції. Monobank одразу
 * робить GET-перевірку на цей URL (роут мусить відповісти 200).
 */
export async function setWebhook(url: string): Promise<MonoResult<unknown>> {
  return monoRequest<unknown>("/personal/webhook", {
    method: "POST",
    body: { webHookUrl: url },
  });
}
