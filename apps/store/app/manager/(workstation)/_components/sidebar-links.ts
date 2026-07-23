import { createElement, type ComponentType, type ReactElement } from "react";
import type { ManagerRole } from "@/lib/auth/jwt";
import {
  BadgeCheck,
  BarChart3,
  Bell,
  Boxes,
  Clapperboard,
  ClipboardList,
  Database,
  FileStack,
  FileText,
  FolderClock,
  FolderTree,
  Gift,
  Home,
  Map,
  MapPin,
  MessageCircle,
  MessagesSquare,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ClipboardCheck,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  PackageSearch,
  PieChart,
  ScrollText,
  Settings,
  ShieldCheck,
  Trash2,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";

export interface SidebarLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export const PRIMARY_LINKS: readonly SidebarLink[] = [
  { href: "/manager", label: "Робочий стіл", icon: Home },
  { href: "/manager/orders", label: "Замовлення", icon: ClipboardList },
  { href: "/manager/sales", label: "Реалізація", icon: Truck },
  { href: "/manager/payments", label: "Оплати", icon: Wallet },
  { href: "/manager/routes", label: "Маршрут", icon: Map },
];

export const SECONDARY_LINKS: readonly SidebarLink[] = [
  { href: "/manager/customers", label: "Клієнти", icon: Users },
  {
    href: "/manager/presentations",
    label: "Презентації / Завдання",
    icon: Gift,
  },
  { href: "/manager/prices", label: "Прайс", icon: BarChart3 },
  { href: "/manager/categories", label: "Категорії", icon: FolderTree },
  {
    href: "/manager/message-templates",
    label: "Шаблони повідомлень",
    icon: FileText,
  },
  { href: "/manager/reminders", label: "Нагадування", icon: Bell },
  { href: "/manager/needs", label: "Потреби", icon: PackageSearch },
  {
    href: "/manager/closures",
    label: "Закриття старих замовлень",
    icon: FolderClock,
  },
];

// Вхідні звернення клієнтів із зовнішніх месенджерів (Viber/Telegram тощо).
export const CHAT_LINK: SidebarLink = {
  href: "/manager/chat",
  label: "Месенджери",
  icon: MessageCircle,
};

// ── Внутрішній корпоративний месенджер (2026-07-11) ──────────────────────
// Спілкування співробітників між собою. Доступний усім ролям.
export const MESSENGER_LINK: SidebarLink = {
  href: "/manager/messenger",
  label: "Чат LTEX",
  icon: MessagesSquare,
};

export const ADMIN_USERS_LINK: SidebarLink = {
  href: "/manager/admin/users",
  label: "Користувачі",
  icon: UserCog,
};

export const ADMIN_REGION_AGENTS_LINK: SidebarLink = {
  href: "/manager/admin/region-agents",
  label: "Регіони менеджерів",
  icon: MapPin,
};

// ── Фаза 0 «Довідники та регістри» (2026-06-17) ─────────────────────────
export const REGISTRY_LINK: SidebarLink = {
  href: "/manager/registry",
  label: "Довідники та регістри",
  icon: Database,
};

// ── Фаза 6 «Фінансові документи: банк/каса» (2026-06-17) ────────────────
// Безготівкові платіжні доручення + переміщення готівки.
// Доступ — bookkeeper | admin | owner (гейтиться у sidebar.tsx).
export const FINANCE_LINKS: readonly SidebarLink[] = [
  {
    href: "/manager/bank-payments-incoming",
    label: "Платіжки вхідні",
    icon: ArrowDownToLine,
  },
  {
    href: "/manager/bank-payments-outgoing",
    label: "Платіжки вихідні",
    icon: ArrowUpFromLine,
  },
  {
    href: "/manager/cash-transfers",
    label: "Переміщення готівки",
    icon: ArrowLeftRight,
  },
];

// ── Звірка NovaPay (2026-07-21) — офіс: bookkeeper | admin | owner ────────
// Щоденна звірка авто-оплат післяплати NovaPay з тим, що надійшло на рахунок.
export const NP_CHECK_LINK: SidebarLink = {
  href: "/manager/novapay-check",
  label: "Звірка NovaPay",
  icon: BadgeCheck,
};

// ── Тиждень 5 блоку Ролі (Analyst) ──────────────────────────────────────
export const REPORTS_LINK: SidebarLink = {
  href: "/manager/reports",
  label: "Звіти",
  icon: PieChart,
};

// ── Звіт менеджера (ТЗ 2026-07-17) ──────────────────────────────────────
// Окремий пункт для ролі `manager` (веде прямо на його звіт, а не на хаб
// аналітичних звітів). Дозволений у middleware як виняток.
export const MANAGER_REPORT_LINK: SidebarLink = {
  href: "/manager/reports/manager",
  label: "Звіти",
  icon: PieChart,
};

// ── Тиждень 2 блоку Поступлення (2026-06-04) ─────────────────────────────
export const WAREHOUSE_RECEIVINGS_LINK: SidebarLink = {
  href: "/manager/receivings",
  label: "Поступлення",
  icon: PackagePlus,
};

// ── Зміна стану мішка (2026-07-14) — склад + адмін/власник ────────────────
export const BAG_STATE_LINK: SidebarLink = {
  href: "/manager/bag-state-changes",
  label: "Зміна стану мішка",
  icon: Boxes,
};

// ── Відеозавдання (2026-07-23) — відеозона/склад/адмін/власник ─────────────
// Завдання на відеоогляд товару: склад несе мішок → відеозона знімає й описує.
export const VIDEO_TASKS_LINK: SidebarLink = {
  href: "/manager/video-tasks",
  label: "Відеозона",
  icon: Clapperboard,
};

// ── Реєстри Нової Пошти (2026-07-21) — склад + адмін/власник ──────────────
// Групування ТТН у реєстр відправлень (передавальна відомість для кур'єра).
export const NP_REGISTERS_LINK: SidebarLink = {
  href: "/manager/np-registers",
  label: "Реєстри НП",
  icon: FileStack,
};

// ── Складські документи окремими пунктами (2026-07-22) ────────────────────
// Кабінет «Склад» показує ці два документи прямими пунктами меню (замість
// хабу «Документи руху товару», який складу недоступний). Ведуть на ті самі
// сторінки stock-documents з фільтром по виду.
export const REPACKINGS_LINK: SidebarLink = {
  href: "/manager/stock-documents/repackings",
  label: "Перепаковка",
  icon: PackageOpen,
};

export const INVENTORIES_LINK: SidebarLink = {
  href: "/manager/stock-documents/inventories",
  label: "Інвентаризація",
  icon: ClipboardCheck,
};

// Звіт «Залишки складу» окремим пунктом для складу (прямо на звіт, а не хаб).
export const STOCK_BALANCE_LINK: SidebarLink = {
  href: "/manager/reports/stock-balance",
  label: "Залишки складу",
  icon: Warehouse,
};

// ── Завдання складу (2026-07-14) — підготувати відправлення + ТТН ──────────
// Детальна сторінка складського завдання (пакування/ТТН). У меню більше не
// показується окремо — доступна через блок «Завдання» (deep-link на картці).
export const WAREHOUSE_TASKS_LINK: SidebarLink = {
  href: "/manager/warehouse-tasks",
  label: "Завдання складу",
  icon: PackageCheck,
};

// ── Блок «Завдання» (2026-07-18) — доручення між користувачами + складські.
// Доступний УСІМ ролям. Об'єднує ручні доручення й авто-завдання складу.
export const TASKS_LINK: SidebarLink = {
  href: "/manager/tasks",
  label: "Завдання",
  icon: PackageCheck,
};

// ── Тиждень 1 блоку Ролі (2026-06-03) ────────────────────────────────────
export const ADMIN_AUDIT_LINK: SidebarLink = {
  href: "/manager/admin/audit",
  label: "Журнал дій",
  icon: ScrollText,
};

export const ADMIN_PERMISSIONS_LINK: SidebarLink = {
  href: "/manager/admin/permissions",
  label: "Матриця прав",
  icon: ShieldCheck,
};

// ── ТЗ 8.0 «Позначка на вилучення» (2026-07-09) ─────────────────────────
// Черга завдань на вилучення. Доступ — admin | owner (гейтиться у sidebar).
export const ADMIN_DELETIONS_LINK: SidebarLink = {
  href: "/manager/admin/deletions",
  label: "Запити на вилучення",
  icon: Trash2,
};

// Кошик — власні позначені на вилучення документи (менеджер може повернути).
export const TRASH_LINK: SidebarLink = {
  href: "/manager/trash",
  label: "Кошик",
  icon: Trash2,
};

export const SETTINGS_LINK: SidebarLink = {
  href: "/manager/settings",
  label: "Налаштування",
  icon: Settings,
};

// Pre-render link icon у server scope щоб не передавати ComponentType reference
// через RSC boundary у SidebarNavLink (client). Передаємо готовий ReactElement
// через `children`-style prop — серіалізується RSC normally.
export function renderLinkIcon(link: SidebarLink): ReactElement {
  return createElement(link.icon, { className: "h-4 w-4" });
}

// ─── Єдине джерело правди: видимість пунктів меню за роллю ────────────────
// І десктопне (`sidebar.tsx`), і мобільне (`sidebar-mobile-trigger.tsx`) меню
// беруть структуру звідси — щоб гейти не розходились. Раніше логіка ролей була
// продубльована в обох файлах і мобільне меню помилково не показувало частину
// пунктів (бейджі, Завдання, Фінанси, Кошик).
//
// ⚠️ Правило: змінюючи доступ ролі, редагуй ТІЛЬКИ цю функцію.

/** Ключ бейджа-лічильника біля пункту (рендериться у самих компонентах меню). */
export type SidebarBadge =
  | "orders-pending"
  | "sales-pending"
  | "chat"
  | "messenger"
  | "tasks"
  | "warehouse-tasks"
  | "video-tasks"
  | "reminders"
  | "deletions";

export interface SidebarItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Опційний бейдж-лічильник (ключ → нода у рендерері меню). */
  badge?: SidebarBadge;
}

// Блоки вторинного розділу, які бачить роль `manager` (за ТЗ 2026-07-17).
// Свідомо приховані від менеджера: Презентації, Категорії, Потреби.
const MANAGER_SECONDARY_HREFS = new Set<string>([
  "/manager/customers", // Клієнти
  "/manager/prices", // Прайс
  "/manager/message-templates", // Шаблони повідомлень
  "/manager/reminders", // Нагадування
  "/manager/closures", // Закриття старих замовлень
]);

/**
 * Повертає впорядковані секції меню для ролі. Кожна секція — масив пунктів;
 * між секціями рендериться роздільник. Порожні секції відкидаються.
 *
 * Поведінка ролей, крім `manager`, збережена без змін (буде уточнюватись
 * пізніше окремо). Для `manager` набір звужено до дозволеного списку.
 */
export function getSidebarSections(role: ManagerRole): SidebarItem[][] {
  const isAdmin = role === "admin";
  const isOwner = role === "owner";
  const adminOrOwner = isAdmin || isOwner;
  const isWarehouse = role === "warehouse";
  const isManager = role === "manager";

  // ── Кабінет «Склад» (2026-07-22) — вузько-обмежений набір блоків, згрупований
  // за контекстом. Доступи узгоджено з allow-list у `middleware-manager.ts`
  // (справжній RBAC: приховане в меню недоступне й за прямим URL).
  if (isWarehouse) return getWarehouseSections();

  // ── Кабінет «Відеозона» (2026-07-23) — лише свій вузький набір блоків.
  if (role === "videozone") return getVideozoneSections();

  const sections: SidebarItem[][] = [];

  // Секція A — основні документи (бейджі pending для сайтових).
  sections.push(
    PRIMARY_LINKS.map((l) => ({
      ...l,
      badge:
        l.href === "/manager/orders"
          ? ("orders-pending" as const)
          : l.href === "/manager/sales"
            ? ("sales-pending" as const)
            : undefined,
    })),
  );

  // Секція B — вторинні блоки (для менеджера — звужений набір).
  const secondary = isManager
    ? SECONDARY_LINKS.filter((l) => MANAGER_SECONDARY_HREFS.has(l.href))
    : [...SECONDARY_LINKS];
  sections.push(
    secondary.map((l) =>
      l.href === "/manager/reminders"
        ? { ...l, badge: "reminders" as const }
        : { ...l },
    ),
  );

  // Секція C — комунікації + рольові блоки.
  const sectionC: SidebarItem[] = [
    { ...CHAT_LINK, badge: "chat" },
    { ...MESSENGER_LINK, badge: "messenger" },
  ];
  // Завдання — доступні УСІМ ролям (доручення + складські в одному блоці).
  sectionC.push({ ...TASKS_LINK, badge: "tasks" });
  // Поступлення + Зміна стану мішка — лише склад/admin/owner.
  if (isWarehouse || adminOrOwner) {
    sectionC.push({ ...WAREHOUSE_RECEIVINGS_LINK });
    sectionC.push({ ...BAG_STATE_LINK });
    sectionC.push({ ...NP_REGISTERS_LINK });
  }
  // «Відеозона» окремим пунктом більше не показується — вона вкладка всередині
  // блоку «Завдання» (TaskTypeTabs). Власний пункт лишився лише в кабінеті
  // відеозони (getVideozoneSections).
  // Довідники та регістри — усі, крім складу, експедитора і менеджера.
  if (!isWarehouse && role !== "expeditor" && !isManager) {
    sectionC.push({ ...REGISTRY_LINK });
  }
  // Звіти — analyst/admin/owner/supervisor/bookkeeper → хаб звітів.
  if (
    role === "analyst" ||
    adminOrOwner ||
    role === "supervisor" ||
    role === "bookkeeper"
  ) {
    sectionC.push({ ...REPORTS_LINK });
  }
  // Менеджер — прямий пункт «Звіти» на власний звіт менеджера.
  if (isManager) {
    sectionC.push({ ...MANAGER_REPORT_LINK });
  }
  sections.push(sectionC);

  // Секція D — фінансові документи + звірка NovaPay (bookkeeper/admin/owner).
  if (role === "bookkeeper" || adminOrOwner) {
    sections.push([
      ...FINANCE_LINKS.map((l) => ({ ...l })),
      { ...NP_CHECK_LINK },
    ]);
  }

  // Секція E — адмінка + Кошик + Налаштування.
  const sectionE: SidebarItem[] = [];
  if (isAdmin) {
    sectionE.push({ ...ADMIN_USERS_LINK }, { ...ADMIN_REGION_AGENTS_LINK });
  }
  if (adminOrOwner) {
    sectionE.push(
      { ...ADMIN_PERMISSIONS_LINK },
      { ...ADMIN_AUDIT_LINK },
      { ...ADMIN_DELETIONS_LINK, badge: "deletions" },
    );
  }
  if (isManager || role === "senior_manager" || adminOrOwner) {
    sectionE.push({ ...TRASH_LINK });
  }
  sectionE.push({ ...SETTINGS_LINK });
  sections.push(sectionE);

  return sections.filter((s) => s.length > 0);
}

/**
 * Меню кабінету «Склад» — окремі блоки, згруповані за контекстом:
 *  1. Основне       — Робочий стіл, Маршрут, Завдання, Нагадування
 *  2. Склад         — Поступлення, Перепаковка, Інвентаризація, Зміна стану
 *                     мішка, Реєстри НП, Залишки складу
 *  3. Прайс і чат   — Прайс, Чат L-TEX
 *  4. Система       — Кошик, Налаштування
 *
 * ⚠️ Набір href має збігатися з allow-list у `middleware-manager.ts` — інакше
 * пункт видно в меню, але прямий перехід редіректить на робочий стіл.
 */
function getWarehouseSections(): SidebarItem[][] {
  return [
    // 1. Основне
    [
      { href: "/manager", label: "Робочий стіл", icon: Home },
      { href: "/manager/routes", label: "Маршрут", icon: Map },
      { ...TASKS_LINK, badge: "tasks" },
      {
        href: "/manager/reminders",
        label: "Нагадування",
        icon: Bell,
        badge: "reminders",
      },
    ],
    // 2. Склад
    [
      { ...WAREHOUSE_RECEIVINGS_LINK },
      { ...REPACKINGS_LINK },
      { ...INVENTORIES_LINK },
      { ...BAG_STATE_LINK },
      { ...NP_REGISTERS_LINK },
      { ...STOCK_BALANCE_LINK },
    ],
    // 3. Прайс і чат
    [
      { href: "/manager/prices", label: "Прайс", icon: BarChart3 },
      { ...MESSENGER_LINK, badge: "messenger" },
    ],
    // 4. Система
    [{ ...TRASH_LINK }, { ...SETTINGS_LINK }],
  ];
}

/**
 * Меню кабінету «Відеозона» — зйомка відеооглядів:
 *  1. Основне — Робочий стіл, Відеозавдання, Зміна стану мішка, Нагадування
 *  2. Прайс і чат — Прайс, Чат LTEX
 *  3. Система — Налаштування
 *
 * ⚠️ Набір href має збігатися з allow-list у `middleware-manager.ts`.
 */
function getVideozoneSections(): SidebarItem[][] {
  return [
    [
      { href: "/manager", label: "Робочий стіл", icon: Home },
      { ...VIDEO_TASKS_LINK, badge: "video-tasks" },
      { ...BAG_STATE_LINK },
      {
        href: "/manager/reminders",
        label: "Нагадування",
        icon: Bell,
        badge: "reminders",
      },
    ],
    [
      { href: "/manager/prices", label: "Прайс", icon: BarChart3 },
      { ...MESSENGER_LINK, badge: "messenger" },
    ],
    [{ ...SETTINGS_LINK }],
  ];
}
