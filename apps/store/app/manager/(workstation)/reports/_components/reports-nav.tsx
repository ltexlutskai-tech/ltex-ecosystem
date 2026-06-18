"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { REPORTS } from "@/lib/manager/registry-catalog";

// Вкладки виводяться з каталогу звітів — новий звіт з'являється автоматично.
const TABS: { href: string; label: string }[] = REPORTS.map((r) => ({
  href: r.href,
  label: r.label,
}));

export function ReportsNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
