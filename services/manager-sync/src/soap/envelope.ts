/**
 * SOAP 1.1 envelope builder + parser для 1С `MobileExchange.1cws` operations.
 *
 * 1С повертає `text/xml` SOAP 1.1, не SOAP 1.2. Усі payload-и обернені
 * у JSON-string (наша side serialize-ить, 1С parse-ить через ЧтениеJSON).
 *
 * NAMESPACE — `http://arm_mobile` як у existing
 * `docs/1c-export-mobile/Central/WebServices/MobileExchange.xml`.
 *
 * Не використовуємо external SOAP library (`soap`/`strong-soap`) — раз ми
 * викликаємо одну-дві operations з простим контрактом, raw fetch + manual
 * envelope build тримає surface малим і не додає ще одного maintenance burden.
 *
 * ─── Контракт з BSL ─────────────────────────────────────────────────────────
 *
 * Узгоджено з `docs/1c-bsl/outbound/Module.bsl.append` (Етап 2.5, Опція А):
 *
 *   - Усі 6 операцій (ОбновитиКлієнтаJSON / СтворитиЗамовленняJSON /
 *     СтворитиОплатуJSON / СтворитиКасовийОрдерJSON / СтворитиРеалізаціюJSON /
 *     СтворитиМаршрутнийЛистJSON) приймають **2 string-параметри**:
 *       <ms:ПарольВхода>...</ms:ПарольВхода>
 *       <ms:JSONДані>{"idempotencyKey":"...","data":{...}}</ms:JSONДані>
 *   - Назва operation у XML обов'язково з суфіксом `JSON`.
 *   - Назва другого параметра — `JSONДані` (з українською «і», як у BSL).
 */

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

export interface BuildEnvelopeParams {
  /** Назва SOAP-операції з суфіксом `JSON`, напр. `ОбновитиКлієнтаJSON`. */
  operation: string;
  /** Спільний пароль з 1С (`Константа.СинкСистемнийПароль`). */
  password: string;
  /** Унікальний ключ ідемпотентності (UUID v4). Уходить ВСЕРЕДИНУ JSONДані. */
  idempotencyKey: string;
  /** Payload-об'єкт; буде serialize-ний як `{"idempotencyKey","data":payload}`. */
  payload: Record<string, unknown>;
}

/**
 * Серіалізує payload у форматі, який очікує BSL:
 *   {"idempotencyKey":"<uuid>","data":{...payload}}
 *
 * Винесено окремо щоб тести могли перевірити структуру без розбирання XML.
 */
export function buildJsonDataEnvelope(
  idempotencyKey: string,
  payload: Record<string, unknown>,
): string {
  return JSON.stringify({ idempotencyKey, data: payload });
}

export function buildSoapEnvelope(params: BuildEnvelopeParams): string {
  const { operation, password, idempotencyKey, payload } = params;
  const jsonData = buildJsonDataEnvelope(idempotencyKey, payload);
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="${SOAP_NS}">` +
    `<soap:Body>` +
    `<ms:${operation} xmlns:ms="${ARM_NS}">` +
    `<ms:ПарольВхода>${escapeXml(password)}</ms:ПарольВхода>` +
    `<ms:JSONДані>${escapeXml(jsonData)}</ms:JSONДані>` +
    `</ms:${operation}>` +
    `</soap:Body>` +
    `</soap:Envelope>`
  );
}

export function buildSoapAction(operation: string): string {
  return `"${ARM_NS}#MobileExchange:${operation}"`;
}

/**
 * Extracts `<ms:return>...</ms:return>` text content із SOAP response.
 * Returns raw string; caller сам parse-ить JSON. Strip-ить optional BOM
 * (1С іноді префіксує).
 */
export function extractSoapReturn(responseBody: string): string {
  const match = responseBody.match(
    /<(?:[a-zA-Z0-9]+:)?return[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?return>/,
  );
  if (!match || typeof match[1] !== "string") {
    throw new Error("SOAP response: <return> not found");
  }
  let value = match[1].trim();
  // strip BOM if present
  if (value.charCodeAt(0) === 0xfeff) value = value.slice(1);
  // unescape XML entities inside <return>
  value = value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  return value;
}
