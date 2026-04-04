import type { Currency } from "../constants/currency";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  EUR: "€",
  UAH: "₴",
  USD: "$",
};

export function formatPrice(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const formatted = amount.toFixed(2);
  if (currency === "UAH") {
    return `${formatted} ${symbol}`;
  }
  return `${symbol}${formatted}`;
}

export function convertCurrency(
  amount: number,
  from: Currency,
  to: Currency,
  rate: number,
): number {
  if (from === to) return amount;
  return Math.round(amount * rate * 100) / 100;
}
