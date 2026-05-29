import type { SyncConfig } from "../config";
import {
  buildSoapAction,
  buildSoapEnvelope,
  extractSoapReturn,
} from "./envelope";
import type {
  CashOrderCreateRequest,
  CashOrderCreateResult,
  ClientUpdateRequest,
  ClientUpdateResult,
  OrderCreateRequest,
  OrderCreateResult,
  PaymentCreateRequest,
  PaymentCreateResult,
  RealizationCreateRequest,
  RealizationCreateResult,
  RouteSheetCreateRequest,
  RouteSheetCreateResult,
} from "./types";

// ─── Імена SOAP-операцій узгоджені з BSL (Етап 2.5, Опція А) ────────────────
// Див. `docs/1c-bsl/outbound/Module.bsl.append` — усі 6 функцій з суфіксом
// `JSON`, приймають 2 string-параметри (`ПарольВхода` + `JSONДані`).

const OP_CLIENT_UPDATE = "ОбновитиКлієнтаJSON";
const OP_ORDER_CREATE = "СтворитиЗамовленняJSON";
const OP_PAYMENT_CREATE = "СтворитиОплатуJSON";
const OP_REALIZATION_CREATE = "СтворитиРеалізаціюJSON";
const OP_CASH_ORDER_CREATE = "СтворитиКасовийОрдерJSON";
const OP_ROUTE_SHEET_CREATE = "СтворитиМаршрутнийЛистJSON";

/**
 * Викликає 1С SOAP operation `ОбновитиКлієнтаJSON`.
 *
 * **NOT EXERCISED IN CI** — викликається тільки коли SYNC_MOCK_MODE=false.
 * Тести covering only envelope construction + response parsing (детерміністично);
 * real handshake — separate manual smoke test після того як 1С-розробник
 * розгорне BSL-модулі з `docs/1c-bsl/outbound/`.
 */
export async function updateClientViaSoap(
  req: ClientUpdateRequest,
  config: SyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ClientUpdateResult> {
  if (!config.onecUrl || !config.onecPassword) {
    throw new Error(
      "updateClientViaSoap: ONEC_SOAP_URL / ONEC_SOAP_PASSWORD not configured",
    );
  }

  const envelope = buildSoapEnvelope({
    operation: OP_CLIENT_UPDATE,
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payload: req.payload,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction(OP_CLIENT_UPDATE),
      },
      body: envelope,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `SOAP HTTP ${response.status}: ${await safeReadText(response)}`,
    );
  }

  const bodyText = await response.text();
  const returnText = extractSoapReturn(bodyText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(returnText);
  } catch (err) {
    throw new Error(
      `SOAP response: invalid JSON у <return>: ${(err as Error).message}`,
    );
  }

  return normalizeClientResult(parsed);
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}

/**
 * Витягує (errorCode, errorMessage) з BSL-відповіді АБО з legacy/mock-формату.
 *
 * BSL формат (`docs/1c-bsl/outbound/Module.bsl.append`):
 *   { ok:false, code1C:null, alreadyProcessed:false,
 *     error: { code: "auth_failed", message: "..." } }
 *
 * Legacy/mock формат (досі генерує наш mock.ts):
 *   { ok:false, errorCode: 4, errorMessage: "..." }
 *
 * Підтримуємо обидва, поки не оновимо mock.ts на нову схему окремим раундом.
 */
function extractErrorFields(obj: Record<string, unknown>): {
  errorCode: number;
  errorMessage: string;
} {
  // BSL: error: { code, message }
  if (obj.error && typeof obj.error === "object") {
    const err = obj.error as Record<string, unknown>;
    return {
      // BSL код — рядок (e.g. "auth_failed"); хешуємо у number-slot,
      // лишаємо 4 (generic) як sentinel — caller дивиться на message.
      errorCode: typeof err.code === "string" ? 4 : 4,
      errorMessage:
        typeof err.message === "string" ? err.message : "Unknown error",
    };
  }
  return {
    errorCode: typeof obj.errorCode === "number" ? obj.errorCode : 4,
    errorMessage:
      typeof obj.errorMessage === "string" ? obj.errorMessage : "Unknown error",
  };
}

function normalizeClientResult(parsed: unknown): ClientUpdateResult {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("SOAP response: <return> JSON is not an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.ok === true) {
    return {
      ok: true,
      code1C: typeof obj.code1C === "string" ? obj.code1C : "",
      errors: Array.isArray(obj.errors)
        ? obj.errors.filter((e): e is string => typeof e === "string")
        : [],
    };
  }
  return { ok: false, ...extractErrorFields(obj) };
}

// ─── M1.5b: order + payment SOAP wrappers ───────────────────────────────────

/**
 * Викликає 1С SOAP operation `СтворитиЗамовленняJSON`.
 * Mirror-ить `updateClientViaSoap` pattern — fetch + XML envelope + extract <return>.
 *
 * **NOT EXERCISED IN CI** — викликається тільки коли SYNC_MOCK_MODE=false.
 */
export async function createOrderViaSoap(
  req: OrderCreateRequest,
  config: SyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<OrderCreateResult> {
  if (!config.onecUrl || !config.onecPassword) {
    throw new Error(
      "createOrderViaSoap: ONEC_SOAP_URL / ONEC_SOAP_PASSWORD not configured",
    );
  }

  const envelope = buildSoapEnvelope({
    operation: OP_ORDER_CREATE,
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payload: req.payload,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction(OP_ORDER_CREATE),
      },
      body: envelope,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `SOAP HTTP ${response.status}: ${await safeReadText(response)}`,
    );
  }

  const bodyText = await response.text();
  const returnText = extractSoapReturn(bodyText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(returnText);
  } catch (err) {
    throw new Error(
      `SOAP response: invalid JSON у <return>: ${(err as Error).message}`,
    );
  }
  return normalizeOrderResult(parsed);
}

function normalizeOrderResult(parsed: unknown): OrderCreateResult {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("SOAP response: <return> JSON is not an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.ok === true) {
    // BSL шле uniform `code1C` (= Документ.Номер для документів); legacy/mock
    // шле entity-specific `orderCode1C`. Підтримуємо обидва: спочатку BSL, потім fallback.
    const code =
      typeof obj.code1C === "string"
        ? obj.code1C
        : typeof obj.orderCode1C === "string"
          ? obj.orderCode1C
          : "";
    return {
      ok: true,
      orderCode1C: code,
      orderNumber:
        typeof obj.orderNumber === "string" ? obj.orderNumber : undefined,
      errors: Array.isArray(obj.errors)
        ? obj.errors.filter((e): e is string => typeof e === "string")
        : [],
    };
  }
  return { ok: false, ...extractErrorFields(obj) };
}

/**
 * Викликає 1С SOAP operation `СтворитиОплатуJSON`.
 */
export async function createPaymentViaSoap(
  req: PaymentCreateRequest,
  config: SyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<PaymentCreateResult> {
  if (!config.onecUrl || !config.onecPassword) {
    throw new Error(
      "createPaymentViaSoap: ONEC_SOAP_URL / ONEC_SOAP_PASSWORD not configured",
    );
  }

  const envelope = buildSoapEnvelope({
    operation: OP_PAYMENT_CREATE,
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payload: req.payload,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction(OP_PAYMENT_CREATE),
      },
      body: envelope,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `SOAP HTTP ${response.status}: ${await safeReadText(response)}`,
    );
  }

  const bodyText = await response.text();
  const returnText = extractSoapReturn(bodyText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(returnText);
  } catch (err) {
    throw new Error(
      `SOAP response: invalid JSON у <return>: ${(err as Error).message}`,
    );
  }
  return normalizePaymentResult(parsed);
}

function normalizePaymentResult(parsed: unknown): PaymentCreateResult {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("SOAP response: <return> JSON is not an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.ok === true) {
    const code =
      typeof obj.code1C === "string"
        ? obj.code1C
        : typeof obj.paymentCode1C === "string"
          ? obj.paymentCode1C
          : "";
    return {
      ok: true,
      paymentCode1C: code,
      errors: Array.isArray(obj.errors)
        ? obj.errors.filter((e): e is string => typeof e === "string")
        : [],
    };
  }
  return { ok: false, ...extractErrorFields(obj) };
}

// ─── M1.6 (Реалізація, Етап 5): realization SOAP wrapper ────────────────────

/**
 * Викликає 1С SOAP operation `СтворитиРеалізаціюJSON`.
 * Mirror-ить `createOrderViaSoap` pattern — fetch + XML envelope + extract <return>.
 *
 * **NOT EXERCISED IN CI** — викликається тільки коли SYNC_MOCK_MODE=false.
 */
export async function createRealizationViaSoap(
  req: RealizationCreateRequest,
  config: SyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<RealizationCreateResult> {
  if (!config.onecUrl || !config.onecPassword) {
    throw new Error(
      "createRealizationViaSoap: ONEC_SOAP_URL / ONEC_SOAP_PASSWORD not configured",
    );
  }

  const envelope = buildSoapEnvelope({
    operation: OP_REALIZATION_CREATE,
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payload: req.payload,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction(OP_REALIZATION_CREATE),
      },
      body: envelope,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `SOAP HTTP ${response.status}: ${await safeReadText(response)}`,
    );
  }

  const bodyText = await response.text();
  const returnText = extractSoapReturn(bodyText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(returnText);
  } catch (err) {
    throw new Error(
      `SOAP response: invalid JSON у <return>: ${(err as Error).message}`,
    );
  }
  return normalizeRealizationResult(parsed);
}

function normalizeRealizationResult(parsed: unknown): RealizationCreateResult {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("SOAP response: <return> JSON is not an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.ok === true) {
    const code =
      typeof obj.code1C === "string"
        ? obj.code1C
        : typeof obj.realizationCode1C === "string"
          ? obj.realizationCode1C
          : "";
    return {
      ok: true,
      realizationCode1C: code,
      realizationNumber:
        typeof obj.realizationNumber === "string"
          ? obj.realizationNumber
          : undefined,
      errors: Array.isArray(obj.errors)
        ? obj.errors.filter((e): e is string => typeof e === "string")
        : [],
    };
  }
  return { ok: false, ...extractErrorFields(obj) };
}

// ─── Оплати / Каса (Етап 3): cash order SOAP wrapper ────────────────────────

/**
 * Викликає 1С SOAP operation `СтворитиКасовийОрдерJSON` (касовий ордер).
 * Mirror-ить `createRealizationViaSoap` pattern — fetch + XML envelope +
 * extract <return>.
 *
 * **NOT EXERCISED IN CI** — викликається тільки коли SYNC_MOCK_MODE=false.
 * BSL реалізує лише ПКО UAH (см. README §5.2). Мульти-валютний сценарій
 * (3 ордери + здача) — TODO для наступного раунду.
 */
export async function createCashOrderViaSoap(
  req: CashOrderCreateRequest,
  config: SyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CashOrderCreateResult> {
  if (!config.onecUrl || !config.onecPassword) {
    throw new Error(
      "createCashOrderViaSoap: ONEC_SOAP_URL / ONEC_SOAP_PASSWORD not configured",
    );
  }

  const envelope = buildSoapEnvelope({
    operation: OP_CASH_ORDER_CREATE,
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payload: req.payload,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction(OP_CASH_ORDER_CREATE),
      },
      body: envelope,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `SOAP HTTP ${response.status}: ${await safeReadText(response)}`,
    );
  }

  const bodyText = await response.text();
  const returnText = extractSoapReturn(bodyText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(returnText);
  } catch (err) {
    throw new Error(
      `SOAP response: invalid JSON у <return>: ${(err as Error).message}`,
    );
  }
  return normalizeCashOrderResult(parsed);
}

function normalizeCashOrderResult(parsed: unknown): CashOrderCreateResult {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("SOAP response: <return> JSON is not an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.ok === true) {
    const code =
      typeof obj.code1C === "string"
        ? obj.code1C
        : typeof obj.cashOrderCode1C === "string"
          ? obj.cashOrderCode1C
          : "";
    return {
      ok: true,
      cashOrderCode1C: code,
      errors: Array.isArray(obj.errors)
        ? obj.errors.filter((e): e is string => typeof e === "string")
        : [],
    };
  }
  return { ok: false, ...extractErrorFields(obj) };
}

// ─── Маршрутний лист (M1.9, Етап 5): route sheet SOAP wrapper ───────────────

/**
 * Викликає 1С SOAP operation `СтворитиМаршрутнийЛистJSON` (двофазний контракт,
 * `docs/1C_SYNC_MODULES_SPEC.md` §3.6). Mirror-ить `createCashOrderViaSoap`
 * pattern — fetch + XML envelope + extract <return>.
 *
 * **NOT EXERCISED IN CI** — викликається тільки коли SYNC_MOCK_MODE=false.
 */
export async function createRouteSheetViaSoap(
  req: RouteSheetCreateRequest,
  config: SyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<RouteSheetCreateResult> {
  if (!config.onecUrl || !config.onecPassword) {
    throw new Error(
      "createRouteSheetViaSoap: ONEC_SOAP_URL / ONEC_SOAP_PASSWORD not configured",
    );
  }

  const envelope = buildSoapEnvelope({
    operation: OP_ROUTE_SHEET_CREATE,
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payload: req.payload,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction(OP_ROUTE_SHEET_CREATE),
      },
      body: envelope,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `SOAP HTTP ${response.status}: ${await safeReadText(response)}`,
    );
  }

  const bodyText = await response.text();
  const returnText = extractSoapReturn(bodyText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(returnText);
  } catch (err) {
    throw new Error(
      `SOAP response: invalid JSON у <return>: ${(err as Error).message}`,
    );
  }
  return normalizeRouteSheetResult(parsed);
}

function normalizeRouteSheetResult(parsed: unknown): RouteSheetCreateResult {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("SOAP response: <return> JSON is not an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.ok === true) {
    const code =
      typeof obj.code1C === "string"
        ? obj.code1C
        : typeof obj.routeSheetCode1C === "string"
          ? obj.routeSheetCode1C
          : "";
    return {
      ok: true,
      routeSheetCode1C: code,
      routeSheetNumber:
        typeof obj.routeSheetNumber === "string"
          ? obj.routeSheetNumber
          : undefined,
      errors: Array.isArray(obj.errors)
        ? obj.errors.filter((e): e is string => typeof e === "string")
        : [],
    };
  }
  return { ok: false, ...extractErrorFields(obj) };
}
