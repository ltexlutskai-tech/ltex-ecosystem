"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const OPTIONS: { value: string; label: string }[] = [
  { value: "newest", label: "Спочатку нові" },
  { value: "priceAsc", label: "Спочатку дешеві" },
  { value: "priceDesc", label: "Спочатку дорогі" },
  { value: "weightDesc", label: "Найбільша вага" },
];

export function LotsSortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get("sort") ?? "newest";

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next && next !== "newest") params.set("sort", next);
    else params.delete("sort");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-md border px-3 py-2 text-sm"
      aria-label="Сортування"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
