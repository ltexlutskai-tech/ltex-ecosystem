// Ukrainian phone number utilities — E.164 normalization, display formatting,
// and external-app deep links (tel:/viber:/wa.me).
//
// Inputs may come from 1С у будь-якому форматі: "+380 (50) 123-45-67",
// "0501234567", "+38 050 1234567", тощо. Усе нормалізуємо до E.164 `+380XXXXXXXXX`.

const UA_COUNTRY_CODE = "380";
const UA_NUMBER_LENGTH = 9; // після country code

/**
 * Витягує лише цифри з рядка.
 */
function digitsOnly(raw: string): string {
  return raw.replace(/\D+/g, "");
}

/**
 * Нормалізує номер до E.164 формату `+380XXXXXXXXX`.
 * Повертає `null` якщо рядок не виглядає як український номер.
 *
 * Підтримує: "0501234567", "+380501234567", "380501234567", "+38 050 123 45 67".
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = digitsOnly(raw);
  if (digits.length === 0) return null;

  // Випадок 1: вже починається з 380 + 9 цифр = 12 total
  if (
    digits.startsWith(UA_COUNTRY_CODE) &&
    digits.length === UA_COUNTRY_CODE.length + UA_NUMBER_LENGTH
  ) {
    return `+${digits}`;
  }

  // Випадок 2: 0XXXXXXXXX (10 digits, починається з 0)
  if (digits.length === UA_NUMBER_LENGTH + 1 && digits.startsWith("0")) {
    return `+${UA_COUNTRY_CODE}${digits.substring(1)}`;
  }

  // Випадок 3: 9 цифр без префіксу (рідко але буває з 1С)
  if (digits.length === UA_NUMBER_LENGTH) {
    return `+${UA_COUNTRY_CODE}${digits}`;
  }

  return null;
}

/**
 * Форматує номер для display у вигляді `+380 50 123 45 67`.
 * Якщо нормалізація не вдалася — повертає оригінальний рядок.
 */
export function formatPhoneUkr(raw: string | null | undefined): string {
  if (!raw) return "";
  const normalized = normalizePhone(raw);
  if (!normalized) return raw;
  // normalized = +380XXXXXXXXX, len = 13
  const cc = normalized.substring(0, 4); // +380
  const op = normalized.substring(4, 6); // XX
  const a = normalized.substring(6, 9); // XXX
  const b = normalized.substring(9, 11); // XX
  const c = normalized.substring(11, 13); // XX
  return `${cc} ${op} ${a} ${b} ${c}`;
}

/**
 * Будує `tel:` URL для phone-call deeplink.
 */
export function phoneToTelUrl(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  return n ? `tel:${n}` : null;
}

/**
 * Будує `viber://chat?number=...` deeplink. Number — URL-encoded E.164.
 */
export function phoneToViberUrl(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  return `viber://chat?number=${encodeURIComponent(n)}`;
}

/**
 * Будує `https://wa.me/...` deeplink. Без `+`, без пробілів.
 */
export function phoneToWhatsAppUrl(
  raw: string | null | undefined,
): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  return `https://wa.me/${n.substring(1)}`;
}

/**
 * Маскує номер телефону, лишаючи лише три останні цифри.
 * Формат: `*** *** *** 567`.
 *
 * Використовується у foreign-view картки клієнта (менеджер дивиться на
 * чужого клієнта — контакти приховано). Invalid вхід → `null`.
 */
export function maskPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = normalizePhone(raw);
  if (!normalized) return null;
  // normalized = +380XXXXXXXXX (13 chars з "+")
  const last3 = normalized.slice(-3);
  return `*** *** *** ${last3}`;
}
