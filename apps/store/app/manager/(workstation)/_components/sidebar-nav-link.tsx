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
}

export function SidebarNavLink({
  href,
  label,
  icon,
  badge,
  badgeSlot,
  onNavigate,
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
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
    active
      ? "bg-green-50 font-medium text-green-700"
      : "text-gray-700 hover:bg-gray-100",
  );

  const inner = (
    <>
      {icon}
      <span className="flex-1">{label}</span>
      {badgeSlot !== undefined
        ? badgeSlot
        : badge !== undefined &&
          badge > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
    </>
  );

  // У top-shell — відкриваємо НОВУ вкладку (iframe) замість навігації.
  // duplicate:true — кожен клік по блоку дає окрему вкладку (7.3, як у 1С);
  // тому можна тримати кілька вкладок Клієнтів/Замовлень одночасно.
  if (tabs) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          tabs.openTab(href, label, { duplicate: true });
        }}
        className={cn(className, "w-full text-left")}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link href={href} onClick={onNavigate} className={className}>
      {inner}
    </Link>
  );
}
