"use client";

import { useRouter } from "next/navigation";
import { cn } from "@ltex/ui";

type StatusFilter = "pending" | "resolved" | "all";

const TABS: { value: StatusFilter; label: string }[] = [
  { value: "pending", label: "Очікують" },
  { value: "resolved", label: "Оброблені" },
  { value: "all", label: "Усі" },
];

export function DeletionsStatusFilter({ status }: { status: StatusFilter }) {
  const router = useRouter();
  return (
    <div className="inline-flex rounded-md border bg-white p-1">
      {TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() =>
            router.push(`/manager/admin/deletions?status=${t.value}`)
          }
          className={cn(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors",
            status === t.value
              ? "bg-green-600 text-white"
              : "text-gray-600 hover:bg-gray-100",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
