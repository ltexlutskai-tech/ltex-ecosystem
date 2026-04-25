"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";

interface CatalogLayoutToggleProps {
  currentLayout: "grid" | "list";
}

export function CatalogLayoutToggle({
  currentLayout,
}: CatalogLayoutToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setLayout = (layout: "grid" | "list") => {
    const params = new URLSearchParams(searchParams.toString());
    if (layout === "grid") {
      params.delete("layout");
    } else {
      params.set("layout", layout);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border p-1">
      <button
        onClick={() => setLayout("grid")}
        className={`rounded-md p-1.5 transition-colors ${
          currentLayout === "grid"
            ? "bg-green-100 text-green-700"
            : "text-gray-400 hover:text-gray-600"
        }`}
        aria-label="Сітка"
        title="Сітка"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        onClick={() => setLayout("list")}
        className={`rounded-md p-1.5 transition-colors ${
          currentLayout === "list"
            ? "bg-green-100 text-green-700"
            : "text-gray-400 hover:text-gray-600"
        }`}
        aria-label="Список"
        title="Список"
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
