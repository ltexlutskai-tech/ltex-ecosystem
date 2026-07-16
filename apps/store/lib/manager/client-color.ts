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

// Кольори точно як у 1С («Условное оформление» форми списку контрагентів):
//   green — PaleGreen, today — Yellow, week — білий (свіжий), fortnight —
//   MistyRose, stale — Tomato, never — #FF8DAD («немає роботи з клієнтом»).
// Крапки-індикатори — насичені, щоб було видно на будь-якому чипі/рядку.
export const CLIENT_COLOR_META: Record<ClientColor, ClientColorMeta> = {
  green: {
    label: "В роботі",
    dotClass: "bg-green-500",
    rowClass: "bg-green-100",
    description: "Є активне замовлення",
  },
  today: {
    label: "Сьогодні",
    dotClass: "bg-yellow-400",
    rowClass: "bg-yellow-100",
    description: "Взаємодія сьогодні",
  },
  week: {
    label: "Цього тижня",
    dotClass: "bg-white ring-1 ring-gray-400",
    rowClass: "",
    description: "Взаємодія за останні 7 днів",
  },
  fortnight: {
    label: "1–2 тижні тому",
    dotClass: "bg-pink-300",
    rowClass: "bg-pink-50",
    description: "Взаємодія 7–14 днів тому",
  },
  stale: {
    label: "Давно не працювали",
    dotClass: "bg-red-500",
    rowClass: "bg-red-100",
    description: "Остання взаємодія понад 14 днів тому",
  },
  never: {
    label: "Без взаємодій",
    dotClass: "bg-pink-500",
    rowClass: "bg-pink-100",
    description: "Жодного запису в історії роботи з клієнтом",
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
 *
 * Логіка ТОЧНО як у 1С: колір рахується від давності останньої взаємодії в
 * історії роботи з клієнтом (`РаботаСКлиентом` → наш `timeline`, max
 * `occurredAt`). «Без взаємодій» = взагалі немає записів історії (1С #FF8DAD).
 * green — окрема вісь: клієнти з активними замовленнями (`activeOrderCodes`,
 * резолвиться лише коли обрано green).
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

  const clauses: Prisma.MgrClientWhereInput[] = [];
  for (const c of colors) {
    switch (c) {
      case "green":
        clauses.push({ code1C: { in: activeOrderCodes } });
        break;
      case "today":
        clauses.push({
          timeline: { some: { occurredAt: { gte: startToday } } },
        });
        break;
      case "week":
        clauses.push({
          AND: [
            { timeline: { some: { occurredAt: { gte: d7 } } } },
            { timeline: { none: { occurredAt: { gte: startToday } } } },
          ],
        });
        break;
      case "fortnight":
        clauses.push({
          AND: [
            { timeline: { some: { occurredAt: { gte: d14 } } } },
            { timeline: { none: { occurredAt: { gte: d7 } } } },
          ],
        });
        break;
      case "stale":
        clauses.push({
          AND: [
            { timeline: { some: {} } },
            { timeline: { none: { occurredAt: { gte: d14 } } } },
          ],
        });
        break;
      case "never":
        clauses.push({ timeline: { none: {} } });
        break;
    }
  }

  if (clauses.length === 0) return null;
  return { OR: clauses };
}
