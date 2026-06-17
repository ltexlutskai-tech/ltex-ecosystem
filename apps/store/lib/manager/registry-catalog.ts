/**
 * Каталог об'єктів менеджерки — єдине джерело правди для розділу
 * «Довідники та регістри» (аналог 1С «Все функції»).
 *
 * Тут перелічені всі довідники, регістри та звіти, які ми відтворюємо з 1С,
 * разом зі статусом готовності. Хаб `/manager/registry` рендериться з цих
 * масивів; у Фазах 2-4 нові об'єкти підключаються лише дописуванням сюди.
 *
 * Джерело інвентарю: `docs/1C_REGISTRY_INVENTORY.md`.
 * БЕЗ міграцій БД — лише метадані для навігації.
 */

/** Статус готовності об'єкта у нашій системі. */
export type RegistryStatus = "ready" | "partial" | "todo";

/** Тип регістру накопичення. */
export type RegisterType = "balance" | "turnover";

export interface DictionaryEntry {
  /** Унікальний ключ (для React key + тестів). */
  key: string;
  /** Людська назва (укр). */
  label: string;
  /** Короткий опис призначення. */
  description: string;
  /** Маршрут до сторінки-довідника або null, якщо ще немає. */
  href: string | null;
  /** Статус готовності. */
  status: RegistryStatus;
  /** Фаза, у якій планується (для todo/partial). */
  phase?: number;
}

export interface RegisterEntry {
  key: string;
  label: string;
  description: string;
  href: string | null;
  status: RegistryStatus;
  phase: number;
  type: RegisterType;
}

export interface ReportEntry {
  key: string;
  label: string;
  description: string;
  href: string;
}

/** Довідники (1С Catalogs). */
export const DICTIONARIES: readonly DictionaryEntry[] = [
  {
    key: "clients",
    label: "Клієнти",
    description: "Головний довідник контрагентів (борг, статуси, контакти).",
    href: "/manager/customers",
    status: "ready",
  },
  {
    key: "products",
    label: "Прайс / товари",
    description: "Номенклатура з ієрархією категорій та лотами.",
    href: "/manager/prices",
    status: "ready",
  },
  {
    key: "price_types",
    label: "Типи цін",
    description: "Опт / акція та інші типи цін номенклатури.",
    href: null,
    status: "partial",
  },
  {
    key: "cash_flow_articles",
    label: "Статті руху коштів",
    description: "Класифікація надходжень та витрат (ДДС).",
    href: "/manager/cash-flow-articles",
    status: "ready",
  },
  {
    key: "bank_accounts",
    label: "Банк-рахунки",
    description: "Рахунки організації для безготівкових оплат.",
    href: "/manager/bank-accounts",
    status: "ready",
  },
  {
    key: "routes",
    label: "Маршрути",
    description: "Маршрути виїздів торгових агентів.",
    href: null,
    status: "partial",
  },
  {
    key: "client_statuses",
    label: "Статуси клієнтів",
    description: "Операційні статуси контрагента.",
    href: null,
    status: "partial",
  },
  {
    key: "search_channels",
    label: "Канали пошуку",
    description: "Звідки клієнт дізнався про L-TEX.",
    href: null,
    status: "partial",
  },
  {
    key: "categories_tt",
    label: "Категорії ТТ",
    description: "Категорії торгових точок клієнтів.",
    href: null,
    status: "partial",
  },
  {
    key: "delivery_methods",
    label: "Способи доставки",
    description: "Нова Пошта, самовивіз тощо.",
    href: null,
    status: "partial",
  },
  {
    key: "message_templates",
    label: "Шаблони повідомлень",
    description: "Готові тексти для Viber / Telegram.",
    href: "/manager/message-templates",
    status: "ready",
  },
  {
    key: "reminders",
    label: "Нагадування",
    description: "Заплановані нагадування менеджерів.",
    href: "/manager/reminders",
    status: "ready",
  },
  {
    key: "units",
    label: "Одиниці виміру",
    description: "Кг / шт / пара для номенклатури.",
    href: null,
    status: "todo",
    phase: 1,
  },
  {
    key: "cities",
    label: "Міста",
    description: "Довідник міст (належать областям).",
    href: null,
    status: "todo",
    phase: 1,
  },
  {
    key: "regions",
    label: "Області",
    description: "Довідник областей України.",
    href: null,
    status: "todo",
    phase: 1,
  },
  {
    key: "trade_agents",
    label: "Торгові агенти",
    description: "Продавці / агенти (зараз — мапа на користувачів).",
    href: null,
    status: "todo",
    phase: 1,
  },
];

/** Регістри накопичення (1С AccumulationRegisters). */
export const REGISTERS: readonly RegisterEntry[] = [
  {
    key: "debt",
    label: "Борг (рухи взаєморозрахунків)",
    description: "Рухи боргу клієнтів: реалізації, оплати, корекції.",
    href: "/manager/registry/debt",
    status: "ready",
    phase: 0,
    type: "balance",
  },
  {
    key: "sales",
    label: "Продажі",
    description: "Обороти продажів по товарах, клієнтах, агентах.",
    href: "/manager/registry/sales",
    status: "ready",
    phase: 2,
    type: "turnover",
  },
  {
    key: "cash_flow",
    label: "Рух коштів (ДДС)",
    description: "Надходження та витрати по статтях і рахунках.",
    href: "/manager/registry/cashflow",
    status: "ready",
    phase: 2,
    type: "turnover",
  },
  {
    key: "stock",
    label: "Залишки товарів",
    description: "Залишки номенклатури по складах (кг / шт).",
    href: "/manager/registry/stock",
    status: "ready",
    phase: 2,
    type: "balance",
  },
  {
    key: "order_balances",
    label: "Залишки замовлень",
    description: "Незакриті замовлення до відвантаження.",
    href: "/manager/registry/orders",
    status: "ready",
    phase: 2,
    type: "balance",
  },
  {
    key: "cost",
    label: "Собівартість",
    description: "Собівартість продажів (база для маржі).",
    href: null,
    status: "todo",
    phase: 3,
    type: "turnover",
  },
  {
    key: "exchange_rates",
    label: "Курси валют",
    description: "Історичні курси EUR / USD по датах.",
    href: null,
    status: "todo",
    phase: 4,
    type: "turnover",
  },
];

/** Звіти (1С Reports). */
export const REPORTS: readonly ReportEntry[] = [
  {
    key: "sales-summary",
    label: "Підсумок продажів",
    description:
      "Виручка / кг у розрізі клієнтів · товарів · агентів за період.",
    href: "/manager/reports/sales-summary",
  },
  {
    key: "cashflow",
    label: "Рух коштів (ДДС)",
    description: "Прихід / розхід / сальдо по статтях руху коштів.",
    href: "/manager/reports/cashflow",
  },
  {
    key: "stock-balance",
    label: "Залишки складу",
    description: "Залишки шт + кг × товар / якість на дату.",
    href: "/manager/reports/stock-balance",
  },
  {
    key: "sales-by-client",
    label: "Продажі по клієнтах",
    description: "Виручка та кг у розрізі контрагентів за період.",
    href: "/manager/reports/sales-by-client",
  },
  {
    key: "sales-by-supplier",
    label: "Продажі по постачальниках",
    description: "Обсяги продажів у розрізі постачальників.",
    href: "/manager/reports/sales-by-supplier",
  },
  {
    key: "debts",
    label: "Прострочені борги",
    description: "Дебіторка з FIFO-старінням по клієнтах.",
    href: "/manager/reports/debts",
  },
];
