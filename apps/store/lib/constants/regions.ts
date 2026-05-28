/**
 * Список 24 областей України (БЕЗ окремого м. Київ / Севастополь / АР Крим).
 * Використовується для:
 *   - бот-реєстрації нового клієнта (Phase 2) — кнопки вибору області
 *   - адмін-мапи `MgrRegionAgent` (`/manager/admin/region-agents`)
 *
 * Це окремо від `@ltex/shared` `UA_REGIONS` (тамтешній — масив labels для UI
 * dropdown у магазині). Тут — slug+label з тим самим набором, щоб slug міг
 * стабільно зберігатись у DB (`MgrRegionAgent.region` / `MgrClient.region`).
 *
 * Рішення user: 24 області (БЕЗ м.Київ як окремого пункту — Київська область
 * включає Київ); fallback при відсутності агента — `unassigned` стан розмови.
 */
export const UA_REGIONS = [
  { slug: "vinnytska", label: "Вінницька" },
  { slug: "volynska", label: "Волинська" },
  { slug: "dnipropetrovska", label: "Дніпропетровська" },
  { slug: "donetska", label: "Донецька" },
  { slug: "zhytomyrska", label: "Житомирська" },
  { slug: "zakarpatska", label: "Закарпатська" },
  { slug: "zaporizka", label: "Запорізька" },
  { slug: "ivano-frankivska", label: "Івано-Франківська" },
  { slug: "kyivska", label: "Київська" },
  { slug: "kirovohradska", label: "Кіровоградська" },
  { slug: "luhanska", label: "Луганська" },
  { slug: "lvivska", label: "Львівська" },
  { slug: "mykolaivska", label: "Миколаївська" },
  { slug: "odeska", label: "Одеська" },
  { slug: "poltavska", label: "Полтавська" },
  { slug: "rivnenska", label: "Рівненська" },
  { slug: "sumska", label: "Сумська" },
  { slug: "ternopilska", label: "Тернопільська" },
  { slug: "kharkivska", label: "Харківська" },
  { slug: "khersonska", label: "Херсонська" },
  { slug: "khmelnytska", label: "Хмельницька" },
  { slug: "cherkaska", label: "Черкаська" },
  { slug: "chernivetska", label: "Чернівецька" },
  { slug: "chernihivska", label: "Чернігівська" },
] as const;

export type UaRegionSlug = (typeof UA_REGIONS)[number]["slug"];

/** Список slugs (для Zod enum / валідації). */
export const UA_REGION_SLUGS: readonly string[] = UA_REGIONS.map((r) => r.slug);

/** Set для O(1) перевірки `isValidRegionSlug`. */
const REGION_SLUG_SET = new Set<string>(UA_REGION_SLUGS);

/** Повертає label області за slug-ом, або `null` якщо slug невалідний. */
export function getRegionLabel(slug: string): string | null {
  return UA_REGIONS.find((r) => r.slug === slug)?.label ?? null;
}

/** Перевіряє чи slug — валідна українська область з нашого списку. */
export function isValidRegionSlug(slug: string): slug is UaRegionSlug {
  return REGION_SLUG_SET.has(slug);
}
