/**
 * Прості довідники CRM (7.2) — редаговані власником/адміном. Значення звідси
 * обираються у картках клієнта тощо (єдині для всіх користувачів).
 */
export const SIMPLE_DICTS = {
  "client-statuses": {
    title: "Статуси клієнтів",
    kind: "labeled",
    hasColor: true,
    desc: "Операційні статуси контрагента.",
  },
  "search-channels": {
    title: "Канали пошуку",
    kind: "labeled",
    hasColor: false,
    desc: "Звідки клієнт дізнався про L-TEX.",
  },
  "categories-tt": {
    title: "Категорії ТТ",
    kind: "labeled",
    hasColor: false,
    desc: "Категорії торгових точок клієнтів.",
  },
  "delivery-methods": {
    title: "Способи доставки",
    kind: "labeled",
    hasColor: false,
    desc: "Нова Пошта, самовивіз тощо.",
  },
  routes: {
    title: "Маршрути",
    kind: "route",
    hasColor: false,
    desc: "Маршрути виїздів торгових агентів.",
  },
} as const;

export type SimpleDictType = keyof typeof SIMPLE_DICTS;

export function isSimpleDictType(v: string): v is SimpleDictType {
  return Object.prototype.hasOwnProperty.call(SIMPLE_DICTS, v);
}

/** Нормалізований рядок для UI. */
export interface DictRow {
  id: string;
  label: string;
  color?: string | null;
  active?: boolean;
}
