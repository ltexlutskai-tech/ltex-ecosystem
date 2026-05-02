"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

export interface LotCategoryPillsProps {
  categories: { id: string; name: string; count: number }[];
}

export function LotsCategoryPills({ categories }: LotCategoryPillsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selected = (searchParams.get("categoryId") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const toggle = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === null) {
        params.delete("categoryId");
      } else if (selected.includes(id)) {
        const next = selected.filter((s) => s !== id);
        if (next.length > 0) params.set("categoryId", next.join(","));
        else params.delete("categoryId");
      } else {
        params.set("categoryId", [...selected, id].join(","));
      }
      params.delete("page");
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    },
    [router, pathname, searchParams, selected],
  );

  if (categories.length === 0) return null;

  const allActive = selected.length === 0;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => toggle(null)}
        className={`rounded-full border px-3 py-1 text-sm transition-colors ${
          allActive
            ? "border-green-500 bg-green-50 text-green-700"
            : "hover:border-green-500 hover:text-green-700"
        }`}
      >
        Усі категорії
      </button>
      {categories.map((c) => {
        const active = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              active
                ? "border-green-500 bg-green-50 text-green-700"
                : "hover:border-green-500 hover:text-green-700"
            }`}
          >
            {c.name}{" "}
            <span className="ml-0.5 text-xs text-gray-400">({c.count})</span>
          </button>
        );
      })}
    </div>
  );
}
