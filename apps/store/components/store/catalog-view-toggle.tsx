"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, ArrowDownWideNarrow } from "lucide-react";

interface CatalogViewToggleProps {
  currentView: string;
}

export function CatalogViewToggle({ currentView }: CatalogViewToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggle = (view: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "pagination") {
      params.delete("view");
    } else {
      params.set("view", view);
    }
    // Reset to page 1 when switching view
    params.delete("page");
    const qs = params.toString();
    router.push(`/catalog${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border p-1">
      <button
        onClick={() => toggle("pagination")}
        className={`rounded-md p-1.5 transition-colors ${
          currentView !== "infinite"
            ? "bg-green-100 text-green-700"
            : "text-gray-400 hover:text-gray-600"
        }`}
        aria-label="Сторінками"
        title="Сторінками"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        onClick={() => toggle("infinite")}
        className={`rounded-md p-1.5 transition-colors ${
          currentView === "infinite"
            ? "bg-green-100 text-green-700"
            : "text-gray-400 hover:text-gray-600"
        }`}
        aria-label="Нескінченна прокрутка"
        title="Нескінченна прокрутка"
      >
        <ArrowDownWideNarrow className="h-4 w-4" />
      </button>
    </div>
  );
}
