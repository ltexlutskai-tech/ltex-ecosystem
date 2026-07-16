import type { Prisma } from "@ltex/db";

/**
 * «Світлофор пріоритету» клієнта — порт 1С-механізму `СтатусКлиента`
 * (Условное оформление у формі списку контрагентів). Колір НЕ зберігається у БД,
 * а рахується на льоту з:
 *   • наявності активного замовлення (є → 🟢 «в роботі»);
 *   • давності останньої взаємодії в історії (timeline) — будь-яка подія:
 *     замовлення / оплата / коментар / бронь / нагадування.
 *
 * Пороги 1С (перевірка згори вниз):
 *   >14 днів тому  → 🔴 stale   (давно не працювали — терміново дзвонити)
 *   7–14 днів тому → 🌸 fortnight
 *   ≤7 днів (до початку сьогодні) → ⚪ week
 *   сьогодні       → 🟡 today
 *   немає жодної події → ⚫ never
 *   є активне замовлення → 🟢 green (найвищий пріоритет, перекриває решту)
 *
 * Рішення user (2026-07-16): «контакт» = будь-яка подія timeline; ручний колір
 * не потрібен — лише авто.
 */

export type ClientColor =
  | "green"
  | "today"
  | "week"
  | "fortnight"
  | "stale"
  | "never";

/** Порядок відображення бейджів/чипів у легенді та тулбарі. */
export const CLIENT_COLOR_ORDER: readonly ClientColor[] = [
  "green",
  "today",
  "week",
  "fortnight",
  "stale",
  "never",
] as const;

export function isClientColor(v: string): v is ClientColor {
  return (CLIENT_COLOR_ORDER as readonly string[]).includes(v);
}

export interface ClientColorMeta {
  /** Короткий підпис для чипа/легенди. */
  label: string;
  /** Tailwind-клас фону для крапки-індикатора. */
  dotClass: string;
  /** Tailwind-клас тонованого фону рядка (для підсвітки). */
  rowClass: string;
  /** Пояснення правила (tooltip / легенда). */
  description: string;
}

export const CLIENT_COLOR_META: Record<ClientColor, ClientColorMeta> = {
  green: {
    label: "В роботі",
    dotClass: "bg-green-500",
    rowClass: "bg-green-50",
    description: "Є активне замовлення",
  },
  today: {
    label: "Сьогодні",
    dotClass: "bg-yellow-400",
    rowClass: "bg-yellow-50",
    description: "Контакт сьогодні",
  },
  week: {
    label: "Цього тижня",
    dotClass: "bg-slate-300",
    rowClass: "",
    description: "Контакт за останні 7 днів",
  },
  fortnight: {
    label: "1–2 тижні тому",
    dotClass: "bg-pink-300",
    rowClass: "bg-pink-50",
    description: "Контакт 7–14 днів тому",
  },
  stale: {
    label: "Давно не працювали",
    dotClass: "bg-red-500",
    rowClass: "bg-red-50",
    description: "Останній контакт понад 14 днів тому",
  },
  never: {
    label: "Без історії",
    dotClass: "bg-gray-300",
    rowClass: "",
    description: "Немає жодної взаємодії",
  },
};

/** Початок доби (00:00) переданого моменту. */
export function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_MS = 86_400_000;

/**
 * Чистий обчислювач кольору клієнта. Порядок перевірок дзеркалить 1С.
 */
export function computeClientColor(args: {
  hasActiveOrder: boolean;
  lastContactAt: Date | null;
  now: Date;
}): ClientColor {
  if (args.hasActiveOrder) return "green";
  if (!args.lastContactAt) return "never";

  const last = args.lastContactAt.getTime();
  const startToday = startOfDay(args.now).getTime();
  if (last >= startToday) return "today";
  if (last >= args.now.getTime() - 7 * DAY_MS) return "week";
  if (last >= args.now.getTime() - 14 * DAY_MS) return "fortnight";
  return "stale";
}

/**
 * Будує Prisma-`where` для фільтра списку по кольорах (мультивибір → OR).
 * «Активність» = найсвіжіше з {остання покупка (`daysSinceLastPurchase`),
 * остання подія історії (`timeline.occurredAt`)}. Це дзеркалить дисплейний
 * `computeClientColor` (там max(lastPurchaseAt, timeline max)), тому фільтр і
 * підсвітка рядків узгоджені. Бакети рахуються на боці БД.
 *
 * green — через список `code1C` клієнтів з активними замовленнями
 * (`activeOrderCodes`, резолвиться окремим запитом лише коли обрано green).
 *
 * Повертає `null`, якщо кольори не задані.
 */
export function buildColorWhere(
  colors: ClientColor[],
  activeOrderCodes: string[],
  now: Date,
): Prisma.MgrClientWhereInput | null {
  if (!colors || colors.length === 0) return null;

  const startToday = startOfDay(now);
  const d7 = new Date(now.getTime() - 7 * DAY_MS);
  const d14 = new Date(now.getTime() - 14 * DAY_MS);

  // «Активність не давніше вікна» = покупка ≤N днів тому АБО подія історії
  // пізніше відповідної дати.
  const activityToday: Prisma.MgrClientWhereInput = {
    OR: [
      { daysSinceLastPurchase: { lte: 0 } },
      { timeline: { some: { occurredAt: { gte: startToday } } } },
    ],
  };
  const within7: Prisma.MgrClientWhereInput = {
    OR: [
      { daysSinceLastPurchase: { gte: 0, lte: 7 } },
      { timeline: { some: { occurredAt: { gte: d7 } } } },
    ],
  };
  const within14: Prisma.MgrClientWhereInput = {
    OR: [
      { daysSinceLastPurchase: { gte: 0, lte: 14 } },
      { timeline: { some: { occurredAt: { gte: d14 } } } },
    ],
  };
  const anyActivity: Prisma.MgrClientWhereInput = {
    OR: [{ daysSinceLastPurchase: { not: null } }, { timeline: { some: {} } }],
  };

  const clauses: Prisma.MgrClientWhereInput[] = [];
  for (const c of colors) {
    switch (c) {
      case "green":
        clauses.push({ code1C: { in: activeOrderCodes } });
        break;
      case "today":
        clauses.push(activityToday);
        break;
      case "week":
        clauses.push({ AND: [within7, { NOT: activityToday }] });
        break;
      case "fortnight":
        clauses.push({ AND: [within14, { NOT: within7 }] });
        break;
      case "stale":
        clauses.push({ AND: [anyActivity, { NOT: within14 }] });
        break;
      case "never":
        clauses.push({
          AND: [{ daysSinceLastPurchase: null }, { timeline: { none: {} } }],
        });
        break;
    }
  }

  if (clauses.length === 0) return null;
  return { OR: clauses };
}
