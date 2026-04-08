"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

export function PriceRangeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [min, setMin] = useState(searchParams.get("priceMin") ?? "");
  const [max, setMax] = useState(searchParams.get("priceMax") ?? "");

  function apply() {
    const sp = new URLSearchParams(searchParams.toString());
    if (min) sp.set("priceMin", min);
    else sp.delete("priceMin");
    if (max) sp.set("priceMax", max);
    else sp.delete("priceMax");
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={min}
        onChange={(e) => setMin(e.target.value)}
        placeholder="Від €"
        className="w-20 rounded-md border px-2 py-2 text-sm"
        min={0}
        step={0.01}
      />
      <span className="text-gray-400">—</span>
      <input
        type="number"
        value={max}
        onChange={(e) => setMax(e.target.value)}
        placeholder="До €"
        className="w-20 rounded-md border px-2 py-2 text-sm"
        min={0}
        step={0.01}
      />
      <button
        type="button"
        onClick={apply}
        className="rounded-md border bg-gray-100 px-2 py-2 text-sm hover:bg-gray-200"
      >
        OK
      </button>
    </div>
  );
}
