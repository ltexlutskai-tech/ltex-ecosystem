/**
 * M3.4 Closures — real SOAP client (used коли SYNC_MOCK_MODE=false).
 *
 * Викликає 1С через `MobileExchange.1cws`:
 *  - `ОтриматиДаниЗакриттяЗамовленьJSON(ПарольВхода, JSONДани)`
 *  - `ЗакритиСтариЗамовленняJSON(ПарольВхода, JSONДани)`
 *
 * **NOT EXERCISED IN CI** — викликається тільки після того як 1С-розробник
 * розгорне BSL з `docs/1c-bsl/outbound/Module.bsl.append` §7-8. До того
 * `SYNC_MOCK_MODE=true` (default) маршрутить у `closures-mock.ts`.
 *
 * Контракт SOAP-envelope узгоджено з BSL Етап 2.5 (Опція А): 2 string-параметри
 * `<ms:ПарольВхода>` + `<ms:JSONДани>`, де JSONДани = JSON.stringify({
 *   idempotencyKey, data: payload}).
 *
 * Через те що `services/manager-sync/src/soap/envelope.ts` зараз ще може бути
 * у старому 3-парам режимі (паралельна сесія m3.2 робить вирівнювання), цей
 * client локально будує envelope БЕЗ використання `buildSoapEnvelope`, щоб
 * НЕ зачіпати спільний модуль.
 */

import type { SyncConfig } from "../config";
import type {
  ClosuresCloseRequest,
  ClosuresCloseResult,
  ClosuresGetRequest,
  ClosuresGetResult,
} from "./closures-types";

const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const ARM_NS = "http://arm_mobile";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildClosuresEnvelope(
  operation: string,
  password: string,
  jsonData: string,
): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="${SOAP_NS}">` +
    `<soap:Body>` +
    `<ms:${operation} xmlns:ms="${ARM_NS}">` +
    `<ms:ПарольВхода>${escapeXml(password)}</ms:ПарольВхода>` +
    `<ms:JSONДани>${escapeXml(jsonData)}</ms:JSONДани>` +
    `</ms:${operation}>` +
    `</soap:Body>` +
    `</soap:Envelope>`
  );
}

function extractReturn(responseBody: string): string {
  const match = responseBody.match(
    /<(?:[a-zA-Z0-9]+:)?return[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?return>/,
  );
  if (!match || typeof match[1] !== "string") {
    throw new Error("SOAP response: <return> not found");
  }
  let value = match[1].trim();
  if (value.charCodeAt(0) === 0xfeff) value = value.slice(1);
  value = value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  return value;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}

async function callJsonOperation(
  operation: string,
  jsonData: string,
  config: SyncConfig,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  if (!config.onecUrl || !config.onecPassword) {
    throw new Error(
      `${operation}: ONEC_SOAP_URL / ONEC_SOAP_PASSWORD not configured`,
    );
  }
  const envelope = buildClosuresEnvelope(
    operation,
    config.onecPassword,
    jsonData,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${ARM_NS}#MobileExchange:${operation}"`,
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
  const returnText = extractReturn(bodyText);
  try {
    return JSON.parse(returnText);
  } catch (err) {
    throw new Error(
      `SOAP response: invalid JSON у <return>: ${(err as Error).message}`,
    );
  }
}

interface BslErrorShape {
  code?: string;
  message?: string;
}

interface BslResponseShape {
  ok?: boolean;
  code1C?: string | null;
  alreadyProcessed?: boolean;
  data?: unknown;
  error?: BslErrorShape | null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

export async function getClosuresViaSoap(
  req: ClosuresGetRequest,
  config: SyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ClosuresGetResult> {
  const jsonData = JSON.stringify({
    idempotencyKey: req.idempotencyKey,
    data: { clientCode1C: req.clientCode1C },
  });
  const parsed = await callJsonOperation(
    "ОтриматиДаниЗакриттяЗамовленьJSON",
    jsonData,
    config,
    fetchImpl,
  );
  if (!isObject(parsed)) {
    throw new Error("SOAP response: <return> JSON не є об'єктом");
  }
  const body = parsed as BslResponseShape;
  if (body.ok === true) {
    const data = isObject(body.data) ? body.data : {};
    const itemsRaw = Array.isArray((data as Record<string, unknown>).items)
      ? ((data as Record<string, unknown>).items as unknown[])
      : [];
    const items = itemsRaw.filter(isObject).map((row) => ({
      orderUid: String(row.orderUid ?? ""),
      orderNumber: String(row.orderNumber ?? ""),
      orderDate: String(row.orderDate ?? ""),
      productUid: String(row.productUid ?? ""),
      productName: String(row.productName ?? ""),
      quantity: Number(row.quantity ?? 0),
      sum: Number(row.sum ?? 0),
      sold: Number(row.sold ?? 0),
      status: String(row.status ?? ""),
    }));
    return { ok: true, items };
  }
  return {
    ok: false,
    errorCode: 4,
    errorMessage: body.error?.message ?? "Unknown 1C error",
  };
}

export async function closeClosuresViaSoap(
  req: ClosuresCloseRequest,
  config: SyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ClosuresCloseResult> {
  const jsonData = JSON.stringify({
    idempotencyKey: req.idempotencyKey,
    data: {
      clientCode1C: req.clientCode1C,
      items: req.items,
    },
  });
  const parsed = await callJsonOperation(
    "ЗакритиСтариЗамовленняJSON",
    jsonData,
    config,
    fetchImpl,
  );
  if (!isObject(parsed)) {
    throw new Error("SOAP response: <return> JSON не є об'єктом");
  }
  const body = parsed as BslResponseShape;
  if (body.ok === true) {
    const data = isObject(body.data) ? body.data : {};
    return {
      ok: true,
      alreadyProcessed: body.alreadyProcessed === true,
      closedCount: Number(
        (data as Record<string, unknown>).closedCount ?? req.items.length,
      ),
      newOrderUid:
        typeof (data as Record<string, unknown>).newOrderUid === "string"
          ? ((data as Record<string, unknown>).newOrderUid as string)
          : null,
      newOrderNumber:
        typeof (data as Record<string, unknown>).newOrderNumber === "string"
          ? ((data as Record<string, unknown>).newOrderNumber as string)
          : null,
    };
  }
  return {
    ok: false,
    errorCode: 4,
    errorMessage: body.error?.message ?? "Unknown 1C error",
  };
}
