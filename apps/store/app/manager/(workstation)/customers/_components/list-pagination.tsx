"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@ltex/ui";

export function ListPagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [inputValue, setInputValue] = useState(String(page));

  useEffect(() => {
    setInputValue(String(page));
  }, [page]);

  function goTo(p: number) {
    const sp = new URLSearchParams(searchParams.toString());
    if (p <= 1) sp.delete("page");
    else sp.set("page", String(p));
    router.push(`${pathname}?${sp.toString()}`);
  }

  function commitInput() {
    const parsed = Number.parseInt(inputValue, 10);
    const clamped = Number.isFinite(parsed)
      ? Math.max(1, Math.min(totalPages, parsed))
      : page;
    setInputValue(String(clamped));
    if (clamped !== page) goTo(clamped);
  }

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => goTo(1)}
      >
        « Перша
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => goTo(page - 1)}
      >
        ‹ Назад
      </Button>
      <span className="flex items-center gap-1 px-1 text-gray-600">
        Сторінка
        <input
          type="number"
          min={1}
          max={totalPages}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={commitInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitInput();
          }}
          className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        з {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => goTo(page + 1)}
      >
        Далі ›
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => goTo(totalPages)}
      >
        Остання »
      </Button>
    </div>
  );
}
