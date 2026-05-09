/**
 * Normalizes input to canonical UA phone format `+380 XX XXX XX XX`.
 * - Accepts any digits/spaces/dashes/parens/+ — strips junk.
 * - Auto-prepends "38" if user typed `0XXX...` (10 digits starting with 0).
 * - Auto-prepends "38" if user typed any 10-digit number not starting with "38".
 * - Truncates to max length (12 digits including country code).
 * - Inserts spaces at positions: +380 XX XXX XX XX
 */
export function formatPhone(input: string): string {
  let digits = input.replace(/[^\d]/g, "");

  if (digits.startsWith("0") && digits.length === 10) digits = "38" + digits;
  if (digits.length >= 10 && !digits.startsWith("38"))
    digits = "38" + digits.slice(-10);

  digits = digits.slice(0, 12);

  if (digits.length === 0) return "";
  if (digits.length <= 3) return "+" + digits;
  if (digits.length <= 5) return `+${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 8)
    return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
  if (digits.length <= 10)
    return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
}

/**
 * Returns digits only (e.g. "+380 67 671 05 15" → "380676710515").
 * For sending to API.
 */
export function phoneDigitsOnly(formatted: string): string {
  return formatted.replace(/[^\d]/g, "");
}

/**
 * Validates UA phone — must be exactly +380 + 9 digits = 12 digits total.
 */
export function isValidUaPhone(formatted: string): boolean {
  const d = phoneDigitsOnly(formatted);
  return d.startsWith("380") && d.length === 12;
}
