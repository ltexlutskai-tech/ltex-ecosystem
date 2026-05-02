"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@ltex/ui";
import { LotsFiltersForm } from "./lots-filters-form";

export function LotsFilters() {
  return (
    <aside className="hidden h-fit max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-white p-5 lg:sticky lg:top-20 lg:block">
      <LotsFiltersForm />
    </aside>
  );
}

export function LotsFilterSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 lg:hidden"
          aria-label="Відкрити фільтри"
        >
          <Filter className="h-4 w-4" aria-hidden />
          Фільтри
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>Фільтри</SheetTitle>
          <SheetClose
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Закрити"
          >
            <X className="h-5 w-5" aria-hidden />
          </SheetClose>
        </SheetHeader>
        <div className="mt-4">
          <LotsFiltersForm />
        </div>
      </SheetContent>
    </Sheet>
  );
}
