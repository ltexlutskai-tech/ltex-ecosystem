export const CURRENCIES = ["EUR", "UAH", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "EUR";
export const DISPLAY_CURRENCY: Currency = "UAH";
