import { createElement, type ComponentType, type ReactElement } from "react";
import {
  BarChart3,
  Bell,
  ClipboardList,
  FileText,
  FolderClock,
  Gift,
  Home,
  Map,
  MessageCircle,
  Settings,
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
  {
    href: "/manager/message-templates",
    label: "Шаблони повідомлень",
    icon: FileText,
  },
  { href: "/manager/reminders", label: "Нагадування", icon: Bell },
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
