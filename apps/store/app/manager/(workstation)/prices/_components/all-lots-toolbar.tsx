"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, Input } from "@ltex/ui";

interface ProductLabel {
  id: string;
  name: string;
  articleCode: string | null;
}

interface Props {
  totalCount: number;
  /** Активний префільтр по товару (з картки товару, Етап 2) — для чипа-скидання. */
  productLabel: ProductLabel | null;
}

const BOOL_FILTERS: { key: string; label: string }[] = [
  { key: "target", label: "Цільові" },
  { key: "hasVideo", label: "Відео" },
  { key: "onlyInStock", label: "На складі" },
];

export function AllLotsToolbar({ totalCount, productLabel }: Props) {
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

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setParams({ q: search.trim() || null });
  }

  const status = searchParams.get("status") ?? "all";
  const sort = searchParams.get("sort") ?? "product";
  const dir = searchParams.get("dir") ?? "asc";

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
            placeholder="Пошук за артикулом, назвою, штрихкодом або менеджером…"
            className="flex-1"
          />
          <Button type="submit" variant="outline" size="sm">
            Шукати
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1 text-sm">
            <span className="hidden text-gray-500 sm:inline">Бронь:</span>
            <select
              value={status}
              onChange={(e) => setParams({ status: e.target.value })}
              className="rounded-md border bg-white px-2 py-1.5 text-sm"
            >
              <option value="all">Усі</option>
              <option value="free">Вільні</option>
              <option value="reserved">Заброньовані</option>
              <option value="my">Моя бронь</option>
              <option value="expired">Протермінована</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-1 text-sm">
            <span className="hidden text-gray-500 sm:inline">Сортувати:</span>
            <select
              value={sort}
              onChange={(e) => setParams({ sort: e.target.value })}
              className="rounded-md border bg-white px-2 py-1.5 text-sm"
            >
              <option value="product">За товаром</option>
              <option value="arrival">За приходом</option>
              <option value="weight">За вагою</option>
              <option value="manager">За менеджером</option>
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

        {productLabel && (
          <Chip active onClick={() => setParams({ productId: null })}>
            Товар: {productLabel.articleCode ?? productLabel.name} ✕
          </Chip>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => router.refresh())}
        >
          Оновити залишки та ціни
        </Button>
        <span>Знайдено: {totalCount}</span>
      </div>
    </div>
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
