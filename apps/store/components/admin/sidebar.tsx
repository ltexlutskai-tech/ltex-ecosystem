"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@ltex/ui";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  FolderTree,
  ArrowLeftRight,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { signOut } from "@/app/admin/actions";

const navItems = [
  { href: "/admin", label: "Дашборд", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Замовлення", icon: ShoppingCart },
  { href: "/admin/products", label: "Товари", icon: Package },
  { href: "/admin/lots", label: "Лоти", icon: Boxes },
  { href: "/admin/customers", label: "Клієнти", icon: Users },
  { href: "/admin/categories", label: "Категорії", icon: FolderTree },
  { href: "/admin/rates", label: "Курси валют", icon: ArrowLeftRight },
];

const syncItems = [
  { href: "/api/sync/products", label: "Синхр. товари" },
  { href: "/api/sync/lots", label: "Синхр. лоти" },
  { href: "/api/sync/rates", label: "Синхр. курси" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white">
      <div className="border-b px-6 py-4">
        <Link href="/admin" className="text-xl font-bold text-green-700">
          L-TEX
        </Link>
        <p className="text-xs text-gray-500">Адмін-панель</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-green-50 text-green-700"
                      : "text-gray-700 hover:bg-gray-100",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 border-t pt-4">
          <p className="mb-2 px-3 text-xs font-semibold uppercase text-gray-400">
            1C Синхронізація
          </p>
          <ul className="space-y-1">
            {syncItems.map((item) => (
              <li key={item.href}>
                <span className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-500">
                  <RefreshCw className="h-4 w-4" />
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="border-t p-3">
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            <LogOut className="h-4 w-4" />
            Вийти
          </button>
        </form>
      </div>
    </aside>
  );
}
