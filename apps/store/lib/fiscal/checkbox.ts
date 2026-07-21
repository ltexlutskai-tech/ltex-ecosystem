import type { EttnRequest } from "./ettn-payload";

/**
 * Клієнт Checkbox (ПРРО) для чеків NovaPay-накладки (ETTN).
 *
 * Порт 1С: авторизація за ПІН-кодом (`/cashier/signinPinCode`) + чек
 * (`/np/ettn`). Усі доступи — з env (НЕ в коді):
 *   CHECKBOX_BASE_URL (default https://api.checkbox.ua/api/v1)
 *   CHECKBOX_PIN_CODE, CHECKBOX_LICENSE_KEY
 *   CHECKBOX_CLIENT_NAME (default «Експрес-накладна (API)»), CHECKBOX_CLIENT_VERSION (default 1.0)
 *
 * Best-effort: функції НЕ кидають на мережевих/HTTP-помилках — повертають
 * `{ error }` (щоб «Готово» не падало через фіскалізацію).
 */

const REQUEST_TIMEOUT_MS = 20_000;
const TOKEN_TTL_MS = 50 * 60 * 1000; // ~50 хв

function baseUrl(): string {
  return (
    process.env.CHECKBOX_BASE_URL?.replace(/\/$/, "") ??
    "https://api.checkbox.ua/api/v1"
  );
}

function clientHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "X-Client-Name":
      process.env.CHECKBOX_CLIENT_NAME ?? "Експрес-накладна (API)",
    "X-Client-Version": process.env.CHECKBOX_CLIENT_VERSION ?? "1.0",
    "X-License-Key": process.env.CHECKBOX_LICENSE_KEY ?? "",
    "Content-Type": "application/json",
  };
}

/** Витягує людяне повідомлення помилки з відповіді Checkbox. */
function extractError(json: unknown, status: number): string {
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message) return obj.message;
    // Checkbox інколи повертає { detail: [...] } / { detail: "..." }.
    if (typeof obj.detail === "string" && obj.detail) return obj.detail;
  }
  return `Checkbox HTTP ${status}`;
}

async function post<T>(
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { ...clientHeaders(), ...extraHeaders },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      return { ok: false, error: extractError(json, res.status) };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Авторизація (кеш токена) ────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function signinPinCode(): Promise<
  { token: string } | { error: string }
> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) {
    return { token: tokenCache.token };
  }
  const pin = process.env.CHECKBOX_PIN_CODE;
  if (!pin) return { error: "CHECKBOX_PIN_CODE не заданий" };
  if (!process.env.CHECKBOX_LICENSE_KEY) {
    return { error: "CHECKBOX_LICENSE_KEY не заданий" };
  }

  const res = await post<{ access_token?: string }>("/cashier/signinPinCode", {
    pin_code: pin,
  });
  if (!res.ok) return { error: res.error };
  const token = res.data.access_token;
  if (!token) return { error: "Checkbox не повернув access_token" };

  tokenCache = { token, expiresAt: now + TOKEN_TTL_MS };
  return { token };
}

// ─── Чек ETTN ────────────────────────────────────────────────────────────────

export interface EttnReceiptResult {
  id?: string;
  fiscalCode?: string;
  status?: string;
}

export async function createEttnReceipt(
  request: EttnRequest,
): Promise<
  { ok: true; receipt: EttnReceiptResult } | { ok: false; error: string }
> {
  const auth = await signinPinCode();
  if ("error" in auth) return { ok: false, error: auth.error };

  const res = await post<{
    id?: string;
    fiscal_code?: string;
    status?: string;
  }>("/np/ettn", request, { Authorization: `Bearer ${auth.token}` });
  if (!res.ok) return { ok: false, error: res.error };

  return {
    ok: true,
    receipt: {
      id: res.data.id,
      fiscalCode: res.data.fiscal_code,
      status: res.data.status,
    },
  };
}

/** Тест-хук: скидає кеш токена. */
export function __resetCheckboxToken(): void {
  tokenCache = null;
}
