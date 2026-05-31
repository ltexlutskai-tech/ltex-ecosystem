import type { SyncConfig } from "../config";
import {
  buildBasicAuthHeader,
  buildSoapAction,
  extractSoapReturn,
} from "./envelope";
import type { PullSnapshotRequest, PullSnapshotResult } from "./pull-types";

/**
 * Викликає 1С SOAP operation `СформуватиПакетДаннихJSON` (Етап 3 — pull-mode).
 *
 * Контракт відрізняється від outbound-операцій: тут передаємо лише
 * **2 параметри**:
 *
 *   <ms:ПарольВхода>...</ms:ПарольВхода>
 *   <ms:ОстаннійКодСинхронізації>ISO-timestamp або порожнє</ms:ОстаннійКодСинхронізації>
 *
 * BSL — `docs/1c-bsl/inbound/Module.bsl.append`.
 *
 * **NOT EXERCISED IN CI** — викликається тільки коли SYNC_MOCK_MODE=false.
 * Тести covering only envelope construction + response parsing; real handshake
 * — окремий manual smoke (`docs/1c-bsl/inbound/README.md` §4).
 */
export async function pullSnapshotViaSoap(
  req: PullSnapshotRequest,
  config: SyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<PullSnapshotResult> {
  if (!config.onecUrl || !config.onecPassword) {
    throw new Error(
      "pullSnapshotViaSoap: ONEC_SOAP_URL / ONEC_SOAP_PASSWORD not configured",
    );
  }

  const envelope = buildPullEnvelope({
    password: config.onecPassword,
    cursor: req.cursor ?? "",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.onecTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.onecUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: buildSoapAction("СформуватиПакетДаннихJSON"),
        ...buildBasicAuthHeader(config.onecHttpUser, config.onecHttpPassword),
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

  return normalizePullResult(parsed);
}

// ─── Внутрішні хелпери ────────────────────────────────────────────────────────

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

interface BuildPullEnvelopeParams {
  password: string;
  cursor: string;
}

/**
 * Окремий envelope-builder для pull-mode — інакша signature ніж outbound
 * (2 параметри замість 3, без `JSONДани`). Експортовано для тестів.
 */
export function buildPullEnvelope(params: BuildPullEnvelopeParams): string {
  const { password, cursor } = params;
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="${SOAP_NS}">` +
    `<soap:Body>` +
    `<ms:СформуватиПакетДаннихJSON xmlns:ms="${ARM_NS}">` +
    `<ms:ПарольВхода>${escapeXml(password)}</ms:ПарольВхода>` +
    `<ms:ОстаннійКодСинхронізації>${escapeXml(cursor)}</ms:ОстаннійКодСинхронізації>` +
    `</ms:СформуватиПакетДаннихJSON>` +
    `</soap:Body>` +
    `</soap:Envelope>`
  );
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}

function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizePullResult(parsed: unknown): PullSnapshotResult {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("SOAP response: <return> JSON is not an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.ok === true) {
    const syncCursor = typeof obj.syncCursor === "string" ? obj.syncCursor : "";
    if (!syncCursor) {
      throw new Error("SOAP response: missing syncCursor у успішній відповіді");
    }
    const dataRaw =
      obj.data && typeof obj.data === "object"
        ? (obj.data as Record<string, unknown>)
        : {};
    return {
      ok: true,
      syncCursor,
      data: {
        categories: asUnknownArray(dataRaw.categories),
        products: asUnknownArray(dataRaw.products),
        prices: asUnknownArray(dataRaw.prices),
        orders: asUnknownArray(dataRaw.orders),
      },
      error: null,
    };
  }

  // Error branch
  const errorObj =
    obj.error && typeof obj.error === "object"
      ? (obj.error as Record<string, unknown>)
      : {};
  return {
    ok: false,
    syncCursor: null,
    data: null,
    error: {
      code: typeof errorObj.code === "string" ? errorObj.code : "unknown",
      message:
        typeof errorObj.message === "string"
          ? errorObj.message
          : "Unknown error",
    },
  };
}
