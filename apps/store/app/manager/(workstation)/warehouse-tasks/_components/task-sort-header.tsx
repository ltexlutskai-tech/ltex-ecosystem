"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { WarehouseTaskSortKey } from "@/lib/manager/warehouse-tasks-list";

/**
 * Клікабельний заголовок сортовної колонки списку складських завдань.
 * Веде URL-параметри `sort`/`dir`; перший клік по даті — `desc`, по решті — `asc`.
 */
export function TaskSortHeader({
  sortKey,
  label,
}: {
  sortKey: WarehouseTaskSortKey;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSort = searchParams.get("sort") ?? "";
  const currentDir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const isActive = currentSort === sortKey;

  function handleClick() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("page");

    let nextDir: "asc" | "desc";
    if (isActive) {
      nextDir = currentDir === "asc" ? "desc" : "asc";
    } else {
      nextDir = sortKey === "createdAt" ? "desc" : "asc";
    }
    sp.set("sort", sortKey);
    sp.set("dir", nextDir);

    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex cursor-pointer items-center gap-1 font-medium uppercase tracking-wide hover:text-gray-700 ${
        isActive ? "text-gray-700" : ""
      }`}
    >
      {label}
      {isActive && (
        <span aria-hidden="true">{currentDir === "asc" ? "▲" : "▼"}</span>
      )}
    </button>
  );
}
