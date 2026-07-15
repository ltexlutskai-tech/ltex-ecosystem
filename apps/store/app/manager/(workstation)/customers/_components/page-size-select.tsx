"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const OPTIONS = [20, 50, 100];

/** Вибір кількості контрагентів на сторінці (20/50/100). */
export function PageSizeSelect({ pageSize }: { pageSize: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function change(value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("pageSize", value);
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-gray-500">
      На сторінці
      <select
        value={String(pageSize)}
        onChange={(e) => change(e.target.value)}
        className="rounded border bg-white px-2 py-1 text-sm text-gray-700"
      >
        {OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
