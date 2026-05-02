"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@ltex/ui";
import { LotsFiltersForm, type LotCategoryOption } from "./lots-filters-form";

interface LotsFiltersProps {
  categories: LotCategoryOption[];
}

export function LotsFilters({ categories }: LotsFiltersProps) {
  return (
    <aside className="hidden h-fit max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-white p-5 lg:sticky lg:top-20 lg:block">
      <LotsFiltersForm categories={categories} />
    </aside>
  );
}

export function LotsFilterSheet({ categories }: LotsFiltersProps) {
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
        <SheetHeader>
          <SheetTitle>Фільтри</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <LotsFiltersForm categories={categories} />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-4 w-full rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
        >
          Застосувати
        </button>
      </SheetContent>
    </Sheet>
  );
}
