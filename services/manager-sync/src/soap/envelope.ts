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
 * Узгоджено з `docs/1c-bsl/outbound/Module.bsl.append` (Етап 2, rework під
 * Molenari OU constraint):
 *
 *   - Усі 8 операцій (ОбновитиКлиентаJSON / СтворитиЗамовленняJSON /
 *     СтворитиОплатуJSON / СтворитиКасовийОрдерJSON / СтворитиРеализациюJSON /
 *     СтворитиМаршрутнийЛистJSON / ОтриматиДаниЗакриттяЗамовленьJSON /
 *     ЗакритиСтариЗамовленняJSON) приймають **2 string-параметри**:
 *       <ms:ПарольВхода>...</ms:ПарольВхода>           ← лишений порожнім
 *                                                          для backward compat
 *       <ms:JSONДани>{"idempotencyKey":"...",
 *                    "password":"...",                 ← auth ВСЕРЕДИНІ JSON
 *                    "data":{...}}</ms:JSONДани>
 *   - Назва operation у XML обов'язково з суфіксом `JSON`.
 *   - Назва другого параметра — `JSONДани` (з російською «и», як у BSL після
 *     Russification commit d9ac790 для 8.2.13 compat).
 *   - Пароль читається з `services/manager-sync/.env::ONEC_SOAP_PASSWORD`
 *     (інжектиться у `buildSoapEnvelope` через `params.password`) — постачальник
 *     1С (Molenari OU) блокує `Константа.СинкСистемнийПароль`, тому пароль
 *     зашитий у BSL `_LTEX_ПеревиритиПароль` як локальний рядок.
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
  /** Назва SOAP-операції з суфіксом `JSON`, напр. `ОбновитиКлиентаJSON`. */
  operation: string;
  /**
   * Пароль з `ONEC_SOAP_PASSWORD` (.env). Йде ВСЕРЕДИНУ JSONДани як поле
   * `password` (зовнішній XML-параметр `<ms:ПарольВхода>` лишається порожнім —
   * BSL після rework Molenari OU читає auth тільки з JSON).
   */
  password: string;
  /** Унікальний ключ ідемпотентності (UUID v4). Уходить ВСЕРЕДИНУ JSONДани. */
  idempotencyKey: string;
  /** Payload-об'єкт; буде serialize-ний як `{"idempotencyKey","password","data":payload}`. */
  payload: Record<string, unknown>;
}

/**
 * Серіалізує payload у форматі, який очікує BSL:
 *   {"idempotencyKey":"<uuid>","password":"<пароль>","data":{...payload}}
 *
 * Винесено окремо щоб тести могли перевірити структуру без розбирання XML.
 *
 * Пароль інжектиться сюди бо BSL після rework під Molenari OU читає auth
 * з JSON-поля `password`, а не з зовнішнього `<ms:ПарольВхода>` (постачальник
 * не дозволяє додати нову `Константа.СинкСистемнийПароль`).
 */
export function buildJsonDataEnvelope(
  idempotencyKey: string,
  password: string,
  payload: Record<string, unknown>,
): string {
  return JSON.stringify({ idempotencyKey, password, data: payload });
}

export function buildSoapEnvelope(params: BuildEnvelopeParams): string {
  const { operation, password, idempotencyKey, payload } = params;
  const jsonData = buildJsonDataEnvelope(idempotencyKey, password, payload);
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="${SOAP_NS}">` +
    `<soap:Body>` +
    `<ms:${operation} xmlns:ms="${ARM_NS}">` +
    `<ms:ПарольВхода></ms:ПарольВхода>` +
    `<ms:JSONДани>${escapeXml(jsonData)}</ms:JSONДани>` +
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
