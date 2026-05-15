import type { SyncConfig } from "../config";
import {
  buildSoapAction,
  buildSoapEnvelope,
  extractSoapReturn,
} from "./envelope";
import type { ClientUpdateRequest, ClientUpdateResult } from "./types";

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
