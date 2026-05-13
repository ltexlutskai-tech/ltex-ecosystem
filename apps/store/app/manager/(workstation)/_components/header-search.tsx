"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { useToast } from "@ltex/ui";

export function HeaderSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    toast({
      title: "Пошук буде у M1.3",
      description:
        "Глобальний пошук клієнтів і товарів додамо у наступних оновленнях.",
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative hidden flex-1 lg:block"
      role="search"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="search"
        placeholder="Пошук...  (Ctrl+K)"
        aria-label="Глобальний пошук"
        className="h-9 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </form>
  );
}
