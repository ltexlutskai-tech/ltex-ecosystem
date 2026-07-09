import { createElement, type ComponentType, type ReactElement } from "react";
import {
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  Database,
  FileText,
  FolderClock,
  FolderTree,
  Gift,
  Home,
  Map,
  MapPin,
  MessageCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  PackagePlus,
  PackageSearch,
  PieChart,
  ScrollText,
  Settings,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
  Wallet,
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

export const CHAT_LINK: SidebarLink = {
  href: "/manager/chat",
  label: "Чат",
  icon: MessageCircle,
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

// ── Тиждень 5 блоку Ролі (Analyst) ──────────────────────────────────────
export const REPORTS_LINK: SidebarLink = {
  href: "/manager/reports",
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
