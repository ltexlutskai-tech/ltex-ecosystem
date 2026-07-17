"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@ltex/ui";

interface CategoryOption {
  id: string;
  name: string;
  /** Глибина у дереві (0 = корінь) — для відступів у select. */
  depth?: number;
}

/** Префікс-відступ для ієрархічного select (·· на кожен рівень). */
function indent(depth: number | undefined): string {
  return depth && depth > 0 ? `${"  ".repeat(depth)}` : "";
}

interface Props {
  categories: CategoryOption[];
  totalCount: number;
}

const BOOL_FILTERS: { key: string; label: string }[] = [
  { key: "inStock", label: "Наявні" },
  { key: "target", label: "Цільові" },
  { key: "onSale", label: "Акційні" },
  { key: "isNew", label: "Нові (14 днів)" },
  { key: "hasVideo", label: "З відео" },
  { key: "noVideo", label: "Без відео" },
];

export function PricesToolbar({ categories, totalCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  function setParams(updates: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [name, value] of Object.entries(updates)) {
      if (value === null || value === "") sp.delete(name);
      else sp.set(name, value);
    }
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  // Динамічний пошук: пушимо `?q=` через 350мс після останнього натискання
  // клавіші. Пропускаємо, коли значення вже збігається з URL (уникаємо циклу
  // з ефектом-синхронізацією вище).
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (search.trim() === current) return;
    const t = setTimeout(() => {
      setParams({ q: search.trim() || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setParams({ q: search.trim() || null });
  }

  function resetAllFilters() {
    setSearch("");
    startTransition(() => router.push(pathname));
  }

  const activeBoolCount = BOOL_FILTERS.filter(
    (f) => searchParams.get(f.key) === "true",
  ).length;
  const categoryActive = searchParams.get("categoryId") !== null;
  const rangeActive =
    searchParams.get("priceFrom") !== null ||
    searchParams.get("priceTo") !== null ||
    searchParams.get("arrivalFrom") !== null ||
    searchParams.get("arrivalTo") !== null;
  const filterCount =
    activeBoolCount + (categoryActive ? 1 : 0) + (rangeActive ? 1 : 0);

  const sort = searchParams.get("sort") ?? "name";
  const dir = searchParams.get("dir") ?? "asc";

  // Чи є що скидати (пошук / фільтри / нестандартне сортування).
  const anyFilterActive =
    filterCount > 0 ||
    (searchParams.get("q") ?? "") !== "" ||
    search.trim() !== "" ||
    sort !== "name" ||
    dir !== "asc";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={submitSearch}
          className="flex min-w-[240px] flex-1 gap-2"
        >
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за назвою або артикулом…"
            className="flex-1"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <PriceFiltersSheet categories={categories} setParams={setParams} />

          {anyFilterActive && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetAllFilters}
              title="Скинути пошук і всі фільтри"
            >
              Скинути фільтри
            </Button>
          )}

          <label className="inline-flex items-center gap-1 text-sm">
            <span className="hidden sm:inline text-gray-500">Сортувати:</span>
            <select
              value={sort}
              onChange={(e) => setParams({ sort: e.target.value })}
              className="rounded-md border bg-white px-2 py-1.5 text-sm"
            >
              <option value="name">За назвою</option>
              <option value="arrival">За приходом</option>
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setParams({ dir: dir === "asc" ? "desc" : "asc" })}
            title={dir === "asc" ? "За зростанням" : "За спаданням"}
          >
            {dir === "asc" ? "↑" : "↓"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {BOOL_FILTERS.map((f) => {
          const active = searchParams.get(f.key) === "true";
          return (
            <Chip
              key={f.key}
              active={active}
              onClick={() => setParams({ [f.key]: active ? null : "true" })}
            >
              {f.label}
            </Chip>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => router.refresh())}
            title="Оновити дані (зазвичай оновлюється автоматично)"
          >
            {isPending ? "Оновлення…" : "↻ Оновити"}
          </Button>
          <Link href="/manager/prices/lots">
            <Button type="button" variant="outline" size="sm">
              Деталі по мішках
            </Button>
          </Link>
          {filterCount > 0 && (
            <span className="text-gray-500">Фільтрів: {filterCount}</span>
          )}
        </div>
        <span>{isPending ? "Оновлюємо…" : `Знайдено: ${totalCount}`}</span>
      </div>
    </div>
  );
}

function PriceFiltersSheet({
  categories,
  setParams,
}: {
  categories: CategoryOption[];
  setParams: (updates: Record<string, string | null>) => void;
}) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const [categoryId, setCategoryId] = useState(
    searchParams.get("categoryId") ?? "",
  );
  const [priceFrom, setPriceFrom] = useState(
    searchParams.get("priceFrom") ?? "",
  );
  const [priceTo, setPriceTo] = useState(searchParams.get("priceTo") ?? "");
  const [arrivalFrom, setArrivalFrom] = useState(
    searchParams.get("arrivalFrom") ?? "",
  );
  const [arrivalTo, setArrivalTo] = useState(
    searchParams.get("arrivalTo") ?? "",
  );

  useEffect(() => {
    if (open) {
      setCategoryId(searchParams.get("categoryId") ?? "");
      setPriceFrom(searchParams.get("priceFrom") ?? "");
      setPriceTo(searchParams.get("priceTo") ?? "");
      setArrivalFrom(searchParams.get("arrivalFrom") ?? "");
      setArrivalTo(searchParams.get("arrivalTo") ?? "");
    }
  }, [open, searchParams]);

  function apply() {
    setParams({
      categoryId: categoryId || null,
      priceFrom: priceFrom || null,
      priceTo: priceTo || null,
      arrivalFrom: arrivalFrom || null,
      arrivalTo: arrivalTo || null,
    });
    setOpen(false);
  }

  function reset() {
    setCategoryId("");
    setPriceFrom("");
    setPriceTo("");
    setArrivalFrom("");
    setArrivalTo("");
    setParams({
      categoryId: null,
      priceFrom: null,
      priceTo: null,
      arrivalFrom: null,
      arrivalTo: null,
    });
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Фільтри
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Фільтри прайсу</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-gray-700">Категорія</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border bg-white px-2 py-2 text-sm"
            >
              <option value="">Усі категорії</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {indent(c.depth)}
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Ціна, € (від/до)</span>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={priceFrom}
                onChange={(e) => setPriceFrom(e.target.value)}
                placeholder="від"
              />
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={priceTo}
                onChange={(e) => setPriceTo(e.target.value)}
                placeholder="до"
              />
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">
              Поступлення (період)
            </span>
            <div className="flex gap-2">
              <Input
                type="date"
                value={arrivalFrom}
                onChange={(e) => setArrivalFrom(e.target.value)}
              />
              <Input
                type="date"
                value={arrivalTo}
                onChange={(e) => setArrivalTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" onClick={apply} className="flex-1">
              Застосувати
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              Скинути
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
          : "rounded-full border bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
      }
    >
      {children}
    </button>
  );
}
