"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@ltex/ui";
import { useTabsOptional } from "./tabs/tabs-context";

export interface SidebarNavLinkProps {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  /** Опціональний живий бейдж (client-side polling) — має пріоритет над `badge`. */
  badgeSlot?: ReactNode;
  onNavigate?: () => void;
  /** Згорнутий сайдбар: лише іконка + тултип, бейдж — у куті. */
  collapsed?: boolean;
}

export function SidebarNavLink({
  href,
  label,
  icon,
  badge,
  badgeSlot,
  onNavigate,
  collapsed = false,
}: SidebarNavLinkProps) {
  const pathname = usePathname();
  const tabs = useTabsOptional();

  const isActiveHref = (current: string | null) => {
    if (!current) return false;
    return href === "/manager"
      ? current === "/manager"
      : current === href || current.startsWith(`${href}/`);
  };

  // У top-shell активність визначається активною вкладкою; у fallback —
  // поточним pathname (embedded / поза провайдером).
  const active = tabs
    ? isActiveHref(tabs.activeTab?.url ?? null)
    : isActiveHref(pathname);

  const className = cn(
    "relative flex items-center rounded-md py-2 text-sm transition-colors",
    collapsed ? "justify-center px-2" : "gap-3 px-3",
    active
      ? "bg-green-50 font-medium text-green-700"
      : "text-gray-700 hover:bg-gray-100",
  );

  const defaultBadge =
    badgeSlot !== undefined
      ? badgeSlot
      : badge !== undefined &&
        badge > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        );

  const inner = (
    <>
      {icon}
      {!collapsed && <span className="flex-1">{label}</span>}
      {collapsed
        ? badgeSlot !== undefined && (
            <span className="absolute -top-0.5 right-0 scale-90">
              {badgeSlot}
            </span>
          )
        : defaultBadge}
    </>
  );

  // У top-shell — відкриваємо вкладку (iframe) замість навігації. Якщо
  // вкладка блоку вже є — фокусуємо її і повертаємо на головну сторінку
  // блоку (7.3). Кілька вкладок одного блоку — через ПКМ «Дублювати».
  if (tabs) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          tabs.openTab(href, label);
        }}
        title={collapsed ? label : undefined}
        className={cn(className, "w-full text-left")}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={className}
    >
      {inner}
    </Link>
  );
}
