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
} from "./types";

/**
 * Викликає 1С SOAP operation `ОбновитиКлієнта`.
 *
 * **NOT EXERCISED IN CI** — викликається тільки коли SYNC_MOCK_MODE=false.
 * Тести covering only envelope construction + response parsing (детерміністично);
 * real handshake — separate manual smoke test після того як 1С-розробник
 * реалізує BSL-модулі за `docs/1C_SYNC_MODULES_SPEC.md`.
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

  const payloadJson = JSON.stringify(req.payload);
  const envelope = buildSoapEnvelope({
    operation: "ОбновитиКлієнта",
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payloadJson,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction("ОбновитиКлієнта"),
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

  return normalizeResult(parsed);
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}

function normalizeResult(parsed: unknown): ClientUpdateResult {
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
  return {
    ok: false,
    errorCode: typeof obj.errorCode === "number" ? obj.errorCode : 4,
    errorMessage:
      typeof obj.errorMessage === "string" ? obj.errorMessage : "Unknown error",
  };
}

// ─── M1.5b: order + payment SOAP wrappers ───────────────────────────────────

/**
 * Викликає 1С SOAP operation `СтворитиЗамовлення`.
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

  const payloadJson = JSON.stringify(req.payload);
  const envelope = buildSoapEnvelope({
    operation: "СтворитиЗамовлення",
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payloadJson,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction("СтворитиЗамовлення"),
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
    return {
      ok: true,
      orderCode1C: typeof obj.orderCode1C === "string" ? obj.orderCode1C : "",
      orderNumber:
        typeof obj.orderNumber === "string" ? obj.orderNumber : undefined,
      errors: Array.isArray(obj.errors)
        ? obj.errors.filter((e): e is string => typeof e === "string")
        : [],
    };
  }
  return {
    ok: false,
    errorCode: typeof obj.errorCode === "number" ? obj.errorCode : 4,
    errorMessage:
      typeof obj.errorMessage === "string" ? obj.errorMessage : "Unknown error",
  };
}

/**
 * Викликає 1С SOAP operation `СтворитиОплату`.
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

  const payloadJson = JSON.stringify(req.payload);
  const envelope = buildSoapEnvelope({
    operation: "СтворитиОплату",
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payloadJson,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction("СтворитиОплату"),
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
    return {
      ok: true,
      paymentCode1C:
        typeof obj.paymentCode1C === "string" ? obj.paymentCode1C : "",
      errors: Array.isArray(obj.errors)
        ? obj.errors.filter((e): e is string => typeof e === "string")
        : [],
    };
  }
  return {
    ok: false,
    errorCode: typeof obj.errorCode === "number" ? obj.errorCode : 4,
    errorMessage:
      typeof obj.errorMessage === "string" ? obj.errorMessage : "Unknown error",
  };
}

// ─── M1.6 (Реалізація, Етап 5): realization SOAP wrapper ────────────────────

/**
 * Викликає 1С SOAP operation `СтворитиРеалізацію`.
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

  const payloadJson = JSON.stringify(req.payload);
  const envelope = buildSoapEnvelope({
    operation: "СтворитиРеалізацію",
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payloadJson,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction("СтворитиРеалізацію"),
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
    return {
      ok: true,
      realizationCode1C:
        typeof obj.realizationCode1C === "string" ? obj.realizationCode1C : "",
      realizationNumber:
        typeof obj.realizationNumber === "string"
          ? obj.realizationNumber
          : undefined,
      errors: Array.isArray(obj.errors)
        ? obj.errors.filter((e): e is string => typeof e === "string")
        : [],
    };
  }
  return {
    ok: false,
    errorCode: typeof obj.errorCode === "number" ? obj.errorCode : 4,
    errorMessage:
      typeof obj.errorMessage === "string" ? obj.errorMessage : "Unknown error",
  };
}

// ─── Оплати / Каса (Етап 3): cash order SOAP wrapper ────────────────────────

/**
 * Викликає 1С SOAP operation `СоздатьПКО` (касовий ордер).
 * Mirror-ить `createRealizationViaSoap` pattern — fetch + XML envelope +
 * extract <return>.
 *
 * **NOT EXERCISED IN CI** — викликається тільки коли SYNC_MOCK_MODE=false.
 * Реальний BSL пишеться на загальному етапі обмінів (`docs/1C_SYNC_MODULES_SPEC.md` §3.5).
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

  const payloadJson = JSON.stringify(req.payload);
  const envelope = buildSoapEnvelope({
    operation: "СоздатьПКО",
    password: config.onecPassword,
    idempotencyKey: req.idempotencyKey,
    payloadJson,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction("СоздатьПКО"),
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
    return {
      ok: true,
      cashOrderCode1C:
        typeof obj.cashOrderCode1C === "string" ? obj.cashOrderCode1C : "",
      errors: Array.isArray(obj.errors)
        ? obj.errors.filter((e): e is string => typeof e === "string")
        : [],
    };
  }
  return {
    ok: false,
    errorCode: typeof obj.errorCode === "number" ? obj.errorCode : 4,
    errorMessage:
      typeof obj.errorMessage === "string" ? obj.errorMessage : "Unknown error",
  };
}
