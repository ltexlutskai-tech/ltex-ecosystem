"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@ltex/ui";

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
  const active =
    href === "/manager"
      ? pathname === "/manager"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-green-50 font-medium text-green-700"
          : "text-gray-700 hover:bg-gray-100",
      )}
    >
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
    </Link>
  );
}
