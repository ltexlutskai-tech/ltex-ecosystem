/**
 * Спільні чисті хелпери для фінансових документів Фази 6
 * (банк-платіжки вхідні/вихідні + переміщення готівки).
 *
 * DB-agnostic: форматування статусу, валюти, способу оплати. UI-сторінки
 * імпортують ці хелпери замість дублювання.
 */

export type DocStatus = "draft" | "posted" | "cancelled";

export const DOC_STATUS_LABEL: Record<string, string> = {
  draft: "Чернетка",
  posted: "Проведено",
  cancelled: "Скасовано",
};

export const DOC_STATUS_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  posted: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

export function docStatusLabel(status: string): string {
  return DOC_STATUS_LABEL[status] ?? status;
}

export function docStatusClass(status: string): string {
  return DOC_STATUS_CLASS[status] ?? "bg-gray-100 text-gray-700";
}

/** Спосіб оплати каси (Фаза 6): готівка / картка / банк. */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Готівка",
  card: "Картка",
  bank: "Банк (безнал)",
};

export function paymentMethodLabel(method: string | null): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABEL[method] ?? method;
}

/** Форматування суми у валюті документа. */
export function fmtAmount(amount: number, currency: string): string {
  const n = amount.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n} ${currency}`;
}

export function fmtEur(amount: number): string {
  return `${amount.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

/** Формат № документа: number1C ?? №docNumber. */
export function formatDocNo(
  number1C: string | null,
  docNumber: number,
): string {
  return number1C && number1C.trim() ? number1C : `№${docNumber}`;
}
