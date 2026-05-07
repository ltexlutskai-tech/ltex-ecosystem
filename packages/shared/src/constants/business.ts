export const APP_NAME = "L-TEX" as const;
export const MIN_ORDER_KG = 10 as const;

export const COUNTRIES = [
  "england",
  "germany",
  "canada",
  "poland",
  "scotland",
  "usa",
] as const;
export type Country = (typeof COUNTRIES)[number];

export const COUNTRY_LABELS: Record<Country, string> = {
  england: "Англія",
  germany: "Німеччина",
  canada: "Канада",
  poland: "Польща",
  scotland: "Шотландія",
  usa: "США",
};

// Gender labels are stored on Product as raw Ukrainian strings (see
// `parseDescription` in utils/import-catalog.ts). Keep the union mirroring
// the values produced there so the catalog/lots filter UI can iterate.
export const GENDER_OPTIONS = [
  "Жіноча",
  "Чоловіча",
  "Дитяча",
  "Унісекс",
  "Дорослий",
] as const;
export type Gender = (typeof GENDER_OPTIONS)[number];

export const CONTACTS = {
  telegram: "@L_TEX",
  telegramGroup: "https://t.me/LTEX_Second",
  viberGroup:
    "https://invite.viber.com/?g2=AQA%2Fxgye6%2BDx3El3Qybx4jkoK8aeVPb7x8On05U2OUZu92jUbrIS16QpCXAnJXHq",
  phones: ["+380 67 671 05 15", "+380 99 358 49 92"],
  email: "ltex.lutsk.ai@gmail.com",
  location: "Піддубці, Луцький район, Волинська область",
} as const;
