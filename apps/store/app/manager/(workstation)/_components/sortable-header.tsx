"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface SortableHeaderProps {
  sortKey: string;
  label: string;
  align?: "left" | "center" | "right";
}

/** Default sort direction when activating a column for the first time. */
function defaultDir(sortKey: string): "asc" | "desc" {
  return sortKey === "date" || sortKey === "sum" || sortKey === "positions"
    ? "desc"
    : "asc";
}

export function SortableHeader({
  sortKey,
  label,
  align = "left",
}: SortableHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSort = searchParams.get("sort") ?? "date";
  const currentDir = (searchParams.get("dir") ?? "desc") as "asc" | "desc";
  const isActive = currentSort === sortKey;

  function handleClick() {
    const sp = new URLSearchParams(searchParams.toString());
    // Always reset to page 1 when sorting changes.
    sp.delete("page");

    if (isActive) {
      // Toggle direction.
      const newDir: "asc" | "desc" = currentDir === "asc" ? "desc" : "asc";
      if (sortKey === "date" && newDir === "desc") {
        // Default state — remove params to keep URLs clean.
        sp.delete("sort");
        sp.delete("dir");
      } else {
        sp.set("sort", sortKey);
        sp.set("dir", newDir);
      }
    } else {
      // Activate this column with sensible default direction.
      const newDir = defaultDir(sortKey);
      if (sortKey === "date" && newDir === "desc") {
        sp.delete("sort");
        sp.delete("dir");
      } else {
        sp.set("sort", sortKey);
        sp.set("dir", newDir);
      }
    }

    router.push(`${pathname}?${sp.toString()}`);
  }

  const justifyClass =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex cursor-pointer items-center gap-1 font-medium hover:text-gray-700 ${justifyClass} ${isActive ? "text-gray-800" : ""}`}
    >
      {label}
      {isActive && (
        <span aria-hidden="true">{currentDir === "asc" ? "▲" : "▼"}</span>
      )}
    </button>
  );
}
