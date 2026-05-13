"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, Input } from "@ltex/ui";
import { ClientListFilterSheet } from "./client-list-filter-sheet";
import type { DictionaryOption } from "./types";

interface Props {
  statuses: Array<{ code: string; label: string; colorHex: string }>;
  channels: DictionaryOption[];
  deliveries: DictionaryOption[];
}

export function ClientListToolbar({ statuses, channels, deliveries }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  function updateParam(name: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") sp.delete(name);
    else sp.set(name, value);
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    updateParam("search", search.trim() || null);
  }

  const hasDebt = searchParams.get("hasDebt") === "true";
  const hasOverpayment = searchParams.get("hasOverpayment") === "true";
  const onlyMine = searchParams.get("onlyMine") === "true";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={submitSearch} className="flex flex-1 min-w-[240px] gap-2">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук за іменем, телефоном або містом…"
          className="flex-1"
        />
        <Button type="submit" variant="outline" size="sm">
          Шукати
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          active={!hasDebt && !hasOverpayment}
          onClick={() => {
            const sp = new URLSearchParams(searchParams.toString());
            sp.delete("hasDebt");
            sp.delete("hasOverpayment");
            sp.delete("page");
            startTransition(() => router.push(`${pathname}?${sp.toString()}`));
          }}
        >
          Усі
        </Chip>
        <Chip
          active={hasDebt}
          onClick={() => {
            const sp = new URLSearchParams(searchParams.toString());
            sp.delete("hasOverpayment");
            if (hasDebt) sp.delete("hasDebt");
            else sp.set("hasDebt", "true");
            sp.delete("page");
            startTransition(() => router.push(`${pathname}?${sp.toString()}`));
          }}
        >
          Борг
        </Chip>
        <Chip
          active={hasOverpayment}
          onClick={() => {
            const sp = new URLSearchParams(searchParams.toString());
            sp.delete("hasDebt");
            if (hasOverpayment) sp.delete("hasOverpayment");
            else sp.set("hasOverpayment", "true");
            sp.delete("page");
            startTransition(() => router.push(`${pathname}?${sp.toString()}`));
          }}
        >
          Переплата
        </Chip>
        <Chip
          active={onlyMine}
          onClick={() => {
            const sp = new URLSearchParams(searchParams.toString());
            if (onlyMine) sp.delete("onlyMine");
            else sp.set("onlyMine", "true");
            sp.delete("page");
            startTransition(() => router.push(`${pathname}?${sp.toString()}`));
          }}
        >
          Тільки мої
        </Chip>
        <ClientListFilterSheet
          statuses={statuses}
          channels={channels}
          deliveries={deliveries}
        />
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
          ? "rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white"
          : "rounded-full border bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
      }
    >
      {children}
    </button>
  );
}
