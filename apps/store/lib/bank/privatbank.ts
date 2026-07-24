/**
 * Клієнт PrivatBank «Автоклієнт» (Приват24 для бізнесу) — читання виписок і
 * залишків. Банкінг Крок 2 (docs/BANKING_INTEGRATION_ANALYSIS.md §1).
 *
 *  - база: https://acp.privatbank.ua/api (env PRIVATBANK_BASE_URL);
 *  - auth: токен кабінету у заголовку `token` (env PRIVATBANK_TOKEN;
 *    генерується у Приват24 бізнес → Бухгалтерія → Інтеграція → Автоклієнт);
 *    токен покриває ВСІ IBAN кабінету;
 *  - вебхуків НЕМАЄ — лише опитування; `interim` = поточний операційний день
 *    (провізорні рядки), `final`/діапазон дат = закриті дні (авторитетно);
 *  - пагінація курсором: `exist_next_page` + `next_page_id` → `followId`;
 *  - дати у форматі DD-MM-YYYY; ліміт 100 рядків на сторінку.
 *
 * Best-effort (патерн lib/bank/monobank.ts): {ok:false, error}, не кидає.
 *
 * ⚠️ Точну назву auth-заголовка (`token` vs `id`+`token`) звірити зі сніпетом
 * у кабінеті user при першому підключенні — див. аналіз §1.
 */

const DEFAULT_BASE_URL = "https://acp.privatbank.ua/api";
const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_LIMIT = 100;
/** Стеля сторінок за один виклик — захист від нескінченного циклу пагінації. */
const MAX_PAGES = 20;

/** Рядок транзакції виписки Автоклієнта (поля 1С-стилю, значення — рядки). */
export interface PrivatTransaction {
  AUT_MY_ACC?: string; // наш IBAN
  AUT_MY_CRF?: string; // наш ЄДРПОУ
  AUT_CNTR_ACC?: string; // рахунок/IBAN контрагента
  AUT_CNTR_NAM?: string; // назва контрагента
  AUT_CNTR_CRF?: string; // ЄДРПОУ контрагента
  CCY?: string; // валюта ("UAH"|"EUR"|"USD")
  SUM?: string; // сума у валюті транзакції
  SUM_E?: string; // еквівалент UAH
  TRANTYPE?: string; // "C" = прихід / "D" = розхід
  OSND?: string; // призначення платежу
  NUM_DOC?: string;
  DAT_OD?: string; // DD-MM-YYYY (опердень)
  TIM_P?: string; // HH:MM
  DATE_TIME_DAT_OD_TIM_P?: string; // "DD-MM-YYYY HH:MM:SS"
  REF?: string;
  REFN?: string;
  ID?: string;
  TECHNICAL_TRANSACTION_ID?: string; // стабільний id (ключ дедупу)
  PR_PR?: string; // "r" = real/фінальна
  FL_REAL?: string;
}

/** Рядок залишку по рахунку. */
export interface PrivatBalance {
  acc?: string; // IBAN
  nameACC?: string;
  currency?: string;
  balanceIn?: string; // вхідний
  balanceOut?: string; // вихідний/поточний
  balanceOutEq?: string; // еквівалент UAH
  is_final_bal?: boolean;
  dpd?: string;
}

interface PrivatEnvelope {
  status?: string; // "SUCCESS" | "ERROR"
  exist_next_page?: boolean;
  next_page_id?: string;
  transactions?: PrivatTransaction[];
  balances?: PrivatBalance[];
  message?: string;
}

export type PrivatResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function privatToken(): string | null {
  const token = process.env.PRIVATBANK_TOKEN?.trim();
  return token ? token : null;
}

function privatBaseUrl(): string {
  return process.env.PRIVATBANK_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

/** Чи налаштовано інтеграцію (є токен Автоклієнта). */
export function isPrivatConfigured(): boolean {
  return privatToken() !== null;
}

async function privatPage(
  path: string,
  params: Record<string, string>,
): Promise<PrivatResult<PrivatEnvelope>> {
  const token = privatToken();
  if (!token) return { ok: false, error: "PRIVATBANK_TOKEN не налаштовано" };
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`${privatBaseUrl()}${path}?${qs}`, {
      headers: {
        token,
        "Content-Type": "application/json;charset=utf8",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `PrivatBank HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      };
    }
    const data = (await res.json()) as PrivatEnvelope;
    if (data.status && data.status !== "SUCCESS") {
      return {
        ok: false,
        error: `PrivatBank status=${data.status}${data.message ? `: ${data.message}` : ""}`,
      };
    }
    return { ok: true, data };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: `PrivatBank запит не вдався: ${message}` };
  }
}

/** Пагінований збір усіх сторінок (followId → next_page_id). */
async function privatCollect<T>(
  path: string,
  baseParams: Record<string, string>,
  pick: (env: PrivatEnvelope) => T[] | undefined,
): Promise<PrivatResult<T[]>> {
  const rows: T[] = [];
  let followId = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await privatPage(path, {
      ...baseParams,
      limit: String(PAGE_LIMIT),
      ...(followId ? { followId } : {}),
    });
    if (!res.ok) return res;
    rows.push(...(pick(res.data) ?? []));
    if (!res.data.exist_next_page || !res.data.next_page_id) break;
    followId = res.data.next_page_id;
  }
  return { ok: true, data: rows };
}

/**
 * Залишки по всіх рахунках кабінету на поточний момент (interim — включно з
 * незакритим операційним днем). Заразом слугує «відкривачем» рахунків.
 */
export async function getInterimBalances(): Promise<
  PrivatResult<PrivatBalance[]>
> {
  return privatCollect("/statements/balance/interim", {}, (e) => e.balances);
}

/** Транзакції поточного операційного дня (interim) по всіх рахунках. */
export async function getInterimTransactions(): Promise<
  PrivatResult<PrivatTransaction[]>
> {
  return privatCollect(
    "/statements/transactions/interim",
    {},
    (e) => e.transactions,
  );
}

/** DD-MM-YYYY для параметрів дат Автоклієнта. */
export function toPrivatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Транзакції за діапазон дат (закриті дні — авторитетні дані). */
export async function getTransactions(
  startDate: Date,
  endDate: Date,
): Promise<PrivatResult<PrivatTransaction[]>> {
  return privatCollect(
    "/statements/transactions",
    {
      startDate: toPrivatDate(startDate),
      endDate: toPrivatDate(endDate),
    },
    (e) => e.transactions,
  );
}
