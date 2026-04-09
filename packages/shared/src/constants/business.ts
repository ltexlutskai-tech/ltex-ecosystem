export const APP_NAME = "L-TEX" as const;
export const MIN_ORDER_KG = 10 as const;

export const COUNTRIES = ["england", "germany", "canada", "poland"] as const;
export type Country = (typeof COUNTRIES)[number];

export const COUNTRY_LABELS: Record<Country, string> = {
  england: "Англія",
  germany: "Німеччина",
  canada: "Канада",
  poland: "Польща",
};

export const CONTACTS = {
  telegram: "@L_TEX",
  telegramGroup: "https://t.me/LTEX_Second",
  viberGroup:
    "https://invite.viber.com/?g2=AQA%2Fxgye6%2BDx3El3Qybx4jkoK8aeVPb7x8On05U2OUZu92jUbrIS16QpCXAnJXHq",
  phones: ["+380 67 671 05 15", "+380 99 358 49 92"],
  email: "ltex.lutsk.ai@gmail.com",
  location: "Піддубці, Луцький район, Волинська область",
} as const;
