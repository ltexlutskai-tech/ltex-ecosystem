import { uk, type Dictionary } from "./uk";

const dictionaries: Record<string, Dictionary> = {
  uk,
};

const DEFAULT_LOCALE = "uk";

let currentLocale = DEFAULT_LOCALE;

export function setLocale(locale: string) {
  if (dictionaries[locale]) {
    currentLocale = locale;
  }
}

export function getLocale(): string {
  return currentLocale;
}

export function getDictionary(locale?: string): Dictionary {
  return dictionaries[locale ?? currentLocale] ?? uk;
}

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? `${K}.${NestedKeyOf<T[K]>}`
        : K;
    }[keyof T & string]
  : never;

type DictKey = NestedKeyOf<Dictionary>;

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

export function t(
  key: DictKey | (string & {}),
  params?: Record<string, string | number>,
): string {
  const dict = getDictionary();
  const value = getNestedValue(dict as unknown as Record<string, unknown>, key);

  if (typeof value !== "string") {
    return key;
  }

  if (!params) return value;

  return value.replace(/\{(\w+)\}/g, (_, name) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

export type { Dictionary };
