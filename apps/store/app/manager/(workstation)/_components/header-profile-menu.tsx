"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Settings, UserCircle } from "lucide-react";
import { useToast } from "@ltex/ui";

const ROLE_LABEL: Record<string, string> = {
  admin: "Адмін",
  senior_manager: "Старший менеджер",
  manager: "Менеджер",
  videozone: "Відеозона",
};

export function HeaderProfileMenu({
  fullName,
  role,
}: {
  fullName: string;
  role: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/auth/logout", {
        method: "POST",
      });
      if (!res.ok) {
        toast({
          title: "Не вдалося вийти",
          variant: "destructive",
        });
        return;
      }
      router.push("/manager/login");
      router.refresh();
    } catch {
      toast({ title: "Помилка з'єднання", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
      >
        <UserCircle className="h-6 w-6 text-gray-400" />
        <span className="hidden flex-col items-start sm:flex">
          <span className="font-medium leading-tight">{fullName}</span>
          <span className="text-xs leading-tight text-gray-500">
            {ROLE_LABEL[role] ?? role}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-md border bg-white text-sm shadow-lg"
        >
          <div className="border-b px-3 py-2 sm:hidden">
            <p className="font-medium text-gray-800">{fullName}</p>
            <p className="text-xs text-gray-500">{ROLE_LABEL[role] ?? role}</p>
          </div>
          <Link
            href="/manager/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100"
          >
            <Settings className="h-4 w-4" />
            Налаштування
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loading}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {loading ? "Вихід..." : "Вийти"}
          </button>
        </div>
      )}
    </div>
  );
}
