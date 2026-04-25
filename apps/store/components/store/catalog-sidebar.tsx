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
import { CatalogFilters, type SubcategoryOption } from "./catalog-filters";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export function CatalogSidebar({
  subcategories,
}: {
  subcategories?: SubcategoryOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile trigger + drawer */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="mb-4 inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
              aria-label={dict.catalog.openFilters}
            >
              <Filter className="h-4 w-4" />
              {dict.catalog.filters}
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[85vh] overflow-y-auto rounded-t-2xl"
          >
            <SheetHeader>
              <SheetTitle>{dict.catalog.filters}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <CatalogFilters subcategories={subcategories} />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
            >
              {dict.catalog.applyFilters}
            </button>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block lg:w-72 lg:flex-shrink-0">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-white p-4">
          <CatalogFilters subcategories={subcategories} />
        </div>
      </aside>
    </>
  );
}
