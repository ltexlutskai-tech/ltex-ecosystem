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

/** Тематична група звіту (для хабу/навігації). */
export type ReportTheme = "sales" | "finance" | "stock" | "debt";

/** Людські назви тем звітів (порядок = порядок секцій у хабі). */
export const REPORT_THEMES: { key: ReportTheme; label: string }[] = [
  { key: "sales", label: "Продажі" },
  { key: "finance", label: "Фінанси" },
  { key: "stock", label: "Склад" },
  { key: "debt", label: "Борги" },
];

export interface ReportEntry {
  key: string;
  label: string;
  description: string;
  href: string;
  /** Тема, до якої належить звіт (для групування у хабі). */
  theme: ReportTheme;
}

/** Документи руху товару (1С Documents, Фаза 5). */
export interface DocumentEntry {
  key: string;
  label: string;
  description: string;
  href: string;
  status: RegistryStatus;
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
    description:
      "Довідкова характеристика клієнта; не впливає на ціни документів (опт/акція — з прайсу).",
    href: "/manager/price-types",
    status: "ready",
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
    href: "/manager/dictionaries/routes",
    status: "ready",
  },
  {
    key: "client_statuses",
    label: "Статуси клієнтів",
    description: "Операційні статуси контрагента.",
    href: "/manager/dictionaries/client-statuses",
    status: "ready",
  },
  {
    key: "search_channels",
    label: "Канали пошуку",
    description: "Звідки клієнт дізнався про L-TEX.",
    href: "/manager/dictionaries/search-channels",
    status: "ready",
  },
  {
    key: "categories_tt",
    label: "Категорії ТТ",
    description: "Категорії торгових точок клієнтів.",
    href: "/manager/dictionaries/categories-tt",
    status: "ready",
  },
  {
    key: "delivery_methods",
    label: "Способи доставки",
    description: "Нова Пошта, самовивіз тощо.",
    href: "/manager/dictionaries/delivery-methods",
    status: "ready",
  },
  {
    key: "producers",
    label: "Виробники",
    description: "Виробники товарів (VIVE, SOEX…).",
    href: "/manager/dictionaries/producers",
    status: "ready",
  },
  {
    key: "quality",
    label: "Якість (сорт)",
    description: "Екстра, Крем, 1й/2й сорт, Сток, Мікс…",
    href: "/manager/dictionaries/quality",
    status: "ready",
  },
  {
    key: "countries",
    label: "Країни",
    description: "Країна походження товару.",
    href: "/manager/dictionaries/countries",
    status: "ready",
  },
  {
    key: "genders",
    label: "Стать",
    description: "Чоловіча, Жіноча, Дитяча, Унісекс…",
    href: "/manager/dictionaries/genders",
    status: "ready",
  },
  {
    key: "seasons",
    label: "Сезон",
    description: "Зима, Літо, Демісезон, Всесезонне.",
    href: "/manager/dictionaries/seasons",
    status: "ready",
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
    href: "/manager/units",
    status: "ready",
    phase: 1,
  },
  {
    key: "cities",
    label: "Міста",
    description: "Довідник міст (належать областям).",
    href: "/manager/cities",
    status: "ready",
    phase: 1,
  },
  {
    key: "regions",
    label: "Області",
    description: "Довідник областей України.",
    href: "/manager/regions",
    status: "ready",
    phase: 1,
  },
  {
    key: "trade_agents",
    label: "Торгові агенти",
    description: "Продавці / агенти (зв'язок з користувачами системи).",
    href: "/manager/trade-agents",
    status: "ready",
    phase: 1,
  },
  {
    key: "viber_contacts",
    label: "Контакти Viber",
    description: "Підписники Viber-бота (← 1С Контакти Viber).",
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
    description:
      "Собівартість продажів (← 1С ПродажиСебестоимость). База звіту маржі.",
    href: "/manager/reports/margin",
    status: "ready",
    phase: 3,
    type: "turnover",
  },
  {
    key: "exchange_rates",
    label: "Курси валют",
    description: "Історичні курси EUR / USD по датах.",
    href: "/manager/registry/rates",
    status: "ready",
    phase: 4,
    type: "turnover",
  },
  {
    key: "stock_norms",
    label: "Норми запасів",
    description: "Норма запасу по номенклатурі / складу (НормыЗапасов).",
    href: "/manager/registry/stock-norms",
    status: "ready",
    phase: 8,
    type: "balance",
  },
  {
    key: "client_status_history",
    label: "Історія статусів клієнтів",
    description: "Зміни статусу контрагента в часі (ИсторияСтатусов).",
    href: "/manager/registry/client-status-history",
    status: "ready",
    phase: 8,
    type: "turnover",
  },
  {
    key: "agent_day_log",
    label: "Статус дня агента",
    description: "Тайм-трекінг: початок / кінець робочого дня (СтатусДня).",
    href: "/manager/registry/agent-day-log",
    status: "ready",
    phase: 8,
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
    theme: "sales",
  },
  {
    key: "cashflow",
    label: "Рух коштів (ДДС)",
    description: "Прихід / розхід / сальдо по статтях руху коштів.",
    href: "/manager/reports/cashflow",
    theme: "finance",
  },
  {
    key: "stock-balance",
    label: "Залишки складу",
    description: "Залишки шт + кг × товар / якість на дату.",
    href: "/manager/reports/stock-balance",
    theme: "stock",
  },
  {
    key: "sales-by-supplier",
    label: "Продажі по постачальниках",
    description: "Обсяги продажів у розрізі постачальників.",
    href: "/manager/reports/sales-by-supplier",
    theme: "sales",
  },
  {
    key: "debts",
    label: "Прострочені борги",
    description: "Дебіторка з FIFO-старінням по клієнтах.",
    href: "/manager/reports/debts",
    theme: "debt",
  },
  {
    key: "reconciliation",
    label: "Акт звірки взаєморозрахунків",
    description: "Дебет / кредит / сальдо по контрагенту за період.",
    href: "/manager/reports/reconciliation",
    theme: "finance",
  },
  {
    key: "doc-counts",
    label: "Кількості документів",
    description:
      "К-сть замовлень / реалізацій / касових ордерів / маршрутів за період + клієнтів.",
    href: "/manager/reports/doc-counts",
    theme: "finance",
  },
  {
    key: "margin",
    label: "Маржа / Валовий прибуток",
    description:
      "Виручка − Собівартість по товарах / клієнтах / агентах / категоріях.",
    href: "/manager/reports/margin",
    theme: "sales",
  },
];

/** Документи руху товару (1С Documents, Фаза 5). */
export const DOCUMENTS: readonly DocumentEntry[] = [
  {
    key: "product-returns",
    label: "Повернення від покупця",
    description: "Клієнт повертає товар (прямо коригує борг).",
    href: "/manager/stock-documents/product-returns",
    status: "ready",
  },
  {
    key: "warehouse-returns",
    label: "Повернення на склад",
    description: "Повернення товару на склад.",
    href: "/manager/stock-documents/warehouse-returns",
    status: "ready",
  },
  {
    key: "supplier-returns",
    label: "Повернення постачальнику",
    description: "Повернення товару постачальнику.",
    href: "/manager/stock-documents/supplier-returns",
    status: "ready",
  },
  {
    key: "repackings",
    label: "Перепаковка",
    description: "Розбір / комплектація мішків з нормою втрат.",
    href: "/manager/stock-documents/repackings",
    status: "ready",
  },
  {
    key: "write-offs",
    label: "Списання товарів",
    description: "Списання некондиції / нестачі.",
    href: "/manager/stock-documents/write-offs",
    status: "ready",
  },
  {
    key: "stock-adjustments",
    label: "Оприбуткування товарів",
    description: "Оприбуткування надлишків на склад.",
    href: "/manager/stock-documents/stock-adjustments",
    status: "ready",
  },
  {
    key: "inventories",
    label: "Інвентаризація",
    description: "Звірка облікових та фактичних залишків.",
    href: "/manager/stock-documents/inventories",
    status: "ready",
  },
  {
    key: "stock-transfers",
    label: "Переміщення між складами",
    description: "Переміщення товару між складами.",
    href: "/manager/stock-documents/stock-transfers",
    status: "ready",
  },
];
