"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@ltex/ui";
import { LogOut, User as UserIcon } from "lucide-react";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export interface UserMenuProps {
  customer: { id: string; name: string } | null;
}

export function UserMenu({ customer }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!customer) {
    return (
      <Button
        variant="ghost"
        size="sm"
        asChild
        data-analytics="header-login-cta"
      >
        <Link href="/login" className="inline-flex items-center gap-1.5">
          <UserIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{dict.auth.login}</span>
        </Link>
      </Button>
    );
  }

  const firstName = customer.name.split(/\s+/)[0] ?? customer.name;

  async function handleLogout() {
    try {
      await fetch("/api/auth/customer/logout", { method: "POST" });
    } catch {
      // Even if the request fails, the cookie max-age is short enough that
      // we still want to clear local state and refresh.
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        data-analytics="header-user-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5"
      >
        <UserIcon className="h-4 w-4" />
        <span className="hidden max-w-[8rem] truncate sm:inline">
          {firstName}
        </span>
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border bg-background shadow-lg"
        >
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-muted"
          >
            {dict.auth.account}
          </Link>
          <Link
            href="/wishlist"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-muted"
          >
            {dict.nav.wishlist}
          </Link>
          <Link
            href="/cart"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-muted"
          >
            {dict.nav.cart}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 border-t px-4 py-2 text-left text-sm hover:bg-muted"
          >
            <LogOut className="h-4 w-4" />
            {dict.auth.logout}
          </button>
        </div>
      )}
    </div>
  );
}
