"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@ltex/ui";

/**
 * Пошук у списку відеозавдань — фільтрує по всьому, що є в завданні (товар /
 * артикул / клієнт / менеджер / штрихкоди). Веде URL-параметр `q` (debounce
 * 350мс), який читає серверна сторінка; вкладка Активні/Виконані зберігається.
 */
export function VideoTasksSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const urlValue = searchParams.get("q") ?? "";
    if (q.trim() === urlValue) return;
    const handle = window.setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (q.trim()) sp.set("q", q.trim());
      else sp.delete("q");
      startTransition(() => router.replace(`${pathname}?${sp.toString()}`));
    }, 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, searchParams]);

  return (
    <div className="relative min-w-[220px] max-w-md flex-1">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Пошук у завданнях (товар, артикул, клієнт, ШК)…"
        className="pl-8"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label="Очистити пошук"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
