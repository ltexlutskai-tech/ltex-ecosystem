"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  cn,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@ltex/ui";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  FolderTree,
  ArrowLeftRight,
  RefreshCw,
  FileText,
  LogOut,
  Menu,
} from "lucide-react";
import { signOut } from "@/app/admin/actions";
import { NotificationBell } from "./notification-bell";
import { OrdersBadge } from "./orders-badge";

const navItems = [
  { href: "/admin", label: "Дашборд", icon: LayoutDashboard },
  {
    href: "/admin/orders",
    label: "Замовлення",
    icon: ShoppingCart,
    badge: true,
  },
  { href: "/admin/products", label: "Товари", icon: Package },
  { href: "/admin/lots", label: "Лоти", icon: Boxes },
  { href: "/admin/customers", label: "Клієнти", icon: Users },
  { href: "/admin/categories", label: "Категорії", icon: FolderTree },
  { href: "/admin/rates", label: "Курси валют", icon: ArrowLeftRight },
  { href: "/admin/sync-log", label: "Журнал синхр.", icon: FileText },
];

function NavContent() {
  const pathname = usePathname();

  return (
    <>
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
                <span className="flex-1">{item.label}</span>
                {item.badge && <OrdersBadge />}
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
          {[
            { label: "Синхр. товари" },
            { label: "Синхр. лоти" },
            { label: "Синхр. курси" },
          ].map((item) => (
            <li key={item.label}>
              <span className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-500">
                <RefreshCw className="h-4 w-4" />
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function AdminSidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden h-screen w-64 flex-col border-r bg-white md:flex">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <Link href="/admin" className="text-xl font-bold text-green-700">
              L-TEX
            </Link>
            <p className="text-xs text-gray-500">Адмін-панель</p>
          </div>
          <NotificationBell />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavContent />
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

      {/* Mobile header + sheet */}
      <div className="flex h-14 items-center justify-between border-b bg-white px-4 md:hidden">
        <Link href="/admin" className="text-lg font-bold text-green-700">
          L-TEX
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Sheet>
            <SheetTrigger asChild>
              <button
                className="rounded-md p-2 hover:bg-gray-100"
                aria-label="Меню"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-b px-6 py-4">
                <SheetTitle className="text-left text-xl font-bold text-green-700">
                  L-TEX
                </SheetTitle>
              </SheetHeader>
              <nav className="px-3 py-4">
                <NavContent />
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
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </>
  );
}
