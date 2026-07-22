import type { ManagerRole } from "@/lib/auth/jwt";

/**
 * Реєстр віджетів робочого столу («Робочий стіл» — /manager). Користувач сам
 * складає свою панель: додає/прибирає/змінює ширину/переставляє віджети. Розклад
 * зберігається per-user у `MgrUserViewPrefs` (viewKey `dashboard`).
 *
 * Це ЄДИНЕ джерело правди дозволених типів віджетів — сервер санітизує
 * збережений розклад по цьому списку (як bulk-edit registry для полів).
 */

export type DashboardWidgetType =
  | "greeting"
  | "my-clients"
  | "total-debt"
  | "currency"
  | "tiles"
  | "quick-links"
  | "reminders"
  | "tasks"
  | "pending-docs"
  | "note"
  | "fin-revenue"
  | "fin-margin"
  | "fin-debts"
  | "fin-active"
  | "fin-chart"
  | "fin-top-clients";

export interface DashboardWidgetDef {
  type: DashboardWidgetType;
  /** Назва у палітрі «Додати віджет». */
  title: string;
  /** Короткий опис для палітри. */
  hint: string;
  defaultW: number; // 1..4
  minW: number;
  maxW: number;
  /** Потребує фінансової статистики (owner/admin) — інакше недоступний. */
  finance?: boolean;
}

export const MAX_WIDGET_W = 4;

export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  {
    type: "greeting",
    title: "Вітання",
    hint: "Привітання з іменем користувача",
    defaultW: 4,
    minW: 2,
    maxW: 4,
  },
  {
    type: "my-clients",
    title: "Мої клієнти",
    hint: "Кількість закріплених клієнтів",
    defaultW: 1,
    minW: 1,
    maxW: 2,
  },
  {
    type: "total-debt",
    title: "Загальний борг",
    hint: "Сумарний борг моїх клієнтів (€)",
    defaultW: 1,
    minW: 1,
    maxW: 2,
  },
  {
    type: "currency",
    title: "Курси валют",
    hint: "EUR / USD (можна редагувати)",
    defaultW: 2,
    minW: 1,
    maxW: 4,
  },
  {
    type: "tiles",
    title: "Швидкі документи",
    hint: "Плитки: Замовлення / Реалізація / Оплати / Маршрути",
    defaultW: 4,
    minW: 2,
    maxW: 4,
  },
  {
    type: "quick-links",
    title: "Швидкі посилання",
    hint: "Кнопки переходу до основних розділів",
    defaultW: 2,
    minW: 1,
    maxW: 4,
  },
  {
    type: "reminders",
    title: "Нагадування",
    hint: "Скільки відкритих нагадувань",
    defaultW: 1,
    minW: 1,
    maxW: 2,
  },
  {
    type: "tasks",
    title: "Завдання",
    hint: "Скільки відкритих завдань на мене",
    defaultW: 1,
    minW: 1,
    maxW: 2,
  },
  {
    type: "pending-docs",
    title: "Сайтові документи",
    hint: "Замовлення/реалізації з сайту, що очікують",
    defaultW: 2,
    minW: 1,
    maxW: 4,
  },
  {
    type: "note",
    title: "Нотатка",
    hint: "Особиста текстова нотатка",
    defaultW: 2,
    minW: 1,
    maxW: 4,
  },
  {
    type: "fin-revenue",
    title: "Виручка",
    hint: "Виручка за період (€)",
    defaultW: 1,
    minW: 1,
    maxW: 2,
    finance: true,
  },
  {
    type: "fin-margin",
    title: "Маржа",
    hint: "Валова маржа за період (€)",
    defaultW: 1,
    minW: 1,
    maxW: 2,
    finance: true,
  },
  {
    type: "fin-debts",
    title: "Борги клієнтів",
    hint: "Сумарний борг по базі (€)",
    defaultW: 1,
    minW: 1,
    maxW: 2,
    finance: true,
  },
  {
    type: "fin-active",
    title: "Активні клієнти",
    hint: "Кількість активних клієнтів",
    defaultW: 1,
    minW: 1,
    maxW: 2,
    finance: true,
  },
  {
    type: "fin-chart",
    title: "Графік виручки",
    hint: "Виручка за 12 місяців (стовпчики)",
    defaultW: 4,
    minW: 2,
    maxW: 4,
    finance: true,
  },
  {
    type: "fin-top-clients",
    title: "Топ клієнтів",
    hint: "Топ-10 клієнтів за виручкою",
    defaultW: 2,
    minW: 2,
    maxW: 4,
    finance: true,
  },
];

const WIDGET_BY_TYPE = new Map<DashboardWidgetType, DashboardWidgetDef>(
  DASHBOARD_WIDGETS.map((w) => [w.type, w]),
);

export function getWidgetDef(type: string): DashboardWidgetDef | undefined {
  return WIDGET_BY_TYPE.get(type as DashboardWidgetType);
}

/** Один віджет у збереженому розкладі. */
export interface DashboardWidget {
  /** Унікальний id інстансу (для React key + drag). */
  id: string;
  type: DashboardWidgetType;
  /** Ширина у колонках (1..4). */
  w: number;
  /** Текст для віджета-нотатки. */
  text?: string;
}

export interface DashboardConfig {
  widgets: DashboardWidget[];
}

/** Чи доступні фінансові віджети для ролі (мають getFinanceStats). */
export function financeAvailableFor(role: ManagerRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Будує розклад з пар [тип, ширина], присвоюючи детерміновані id `тип-індекс`.
 * Детермінізм важливий: два виклики дають ідентичний результат (без Math.random
 * / глобальних лічильників), тож дефолт стабільний і порівнюваний.
 */
function buildLayout(rows: [DashboardWidgetType, number][]): DashboardConfig {
  return {
    widgets: rows.map(([type, w], i) => ({ id: `${type}-${i}`, type, w })),
  };
}

/** Дефолтний розклад робочого столу за роллю. */
export function getDefaultDashboard(role: ManagerRole): DashboardConfig {
  if (financeAvailableFor(role)) {
    return buildLayout([
      ["greeting", 4],
      ["fin-revenue", 1],
      ["fin-margin", 1],
      ["fin-debts", 1],
      ["fin-active", 1],
      ["fin-chart", 4],
      ["fin-top-clients", 2],
      ["tiles", 2],
      ["currency", 2],
    ]);
  }
  return buildLayout([
    ["greeting", 4],
    ["my-clients", 1],
    ["total-debt", 1],
    ["currency", 2],
    ["tiles", 4],
    ["reminders", 1],
    ["tasks", 1],
    ["pending-docs", 2],
  ]);
}

const NOTE_MAX = 2000;

/**
 * Санітизує довільний збережений розклад: лишає лише відомі типи, обрізає id,
 * клампить ширину у [minW, maxW], нормалізує текст нотатки. Порожній/битий вхід
 * → дефолт за роллю. Використовується і на сервері (PUT), і на GET (merge).
 */
export function sanitizeDashboardConfig(
  raw: unknown,
  role: ManagerRole,
): DashboardConfig {
  const widgetsRaw =
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { widgets?: unknown }).widgets)
      ? (raw as { widgets: unknown[] }).widgets
      : null;
  if (!widgetsRaw) return getDefaultDashboard(role);

  const seen = new Set<string>();
  const financeOk = financeAvailableFor(role);
  const widgets: DashboardWidget[] = [];
  for (const item of widgetsRaw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const type = typeof rec.type === "string" ? rec.type : "";
    const def = getWidgetDef(type);
    if (!def) continue;
    if (def.finance && !financeOk) continue; // недоступний фін-віджет — прибираємо
    const id =
      typeof rec.id === "string" && rec.id.length > 0 && rec.id.length <= 64
        ? rec.id
        : `${def.type}-${widgets.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    let w =
      typeof rec.w === "number" && Number.isFinite(rec.w)
        ? Math.floor(rec.w)
        : def.defaultW;
    w = Math.min(def.maxW, Math.max(def.minW, w));
    const widget: DashboardWidget = { id, type: def.type, w };
    if (def.type === "note" && typeof rec.text === "string") {
      widget.text = rec.text.slice(0, NOTE_MAX);
    }
    widgets.push(widget);
  }

  if (widgets.length === 0) return getDefaultDashboard(role);
  return { widgets };
}
