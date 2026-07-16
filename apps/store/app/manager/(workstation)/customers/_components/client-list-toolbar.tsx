"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@ltex/ui";
import { ClientListFilterSheet } from "./client-list-filter-sheet";
import { ClientAdvancedFilters } from "./client-advanced-filters";
import { ClientFilterPresets } from "./client-filter-presets";
import { ViewCustomizerSheet } from "../../_components/view-customizer-sheet";
import { COLUMN_LABELS, FILTER_LABELS } from "../_lib/filter-labels";
import {
  CLIENT_COLOR_META,
  CLIENT_COLOR_ORDER,
} from "@/lib/manager/client-color";
import { Bell } from "lucide-react";
import type { ConfigItem, DictionariesSnapshot } from "./types";

interface Props {
  dictionaries: DictionariesSnapshot;
  filtersPrefs: ConfigItem[];
  columnsPrefs: ConfigItem[];
  totalCount: number;
  /**
   * Чи показувати toggle «Тільки мої». M1.3f — для менеджера ownership
   * scope enforced серверно, тому toggle не має сенсу (завжди тільки свої).
   * Адмін бачить toggle щоб опційно зафільтрувати на власних клієнтів.
   */
  showOnlyMineToggle?: boolean;
  /** Усі теги в системі — для автокомпліту поля «Ключові слова». */
  allTags?: string[];
  /** Кількість активних (незавершених) нагадувань — бейдж на кнопці. */
  openReminderCount?: number;
}

export function ClientListToolbar({
  dictionaries,
  filtersPrefs,
  columnsPrefs,
  totalCount,
  showOnlyMineToggle = true,
  allTags = [],
  openReminderCount = 0,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  function setParam(name: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") sp.delete(name);
    else sp.set(name, value);
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  // Динамічний пошук — оновлює URL за 350 мс після останнього символу.
  useEffect(() => {
    const current = searchParams.get("search") ?? "";
    const next = search.trim();
    if (next === current) return;
    const t = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next) sp.set("search", next);
      else sp.delete("search");
      sp.delete("page");
      startTransition(() => router.push(`${pathname}?${sp.toString()}`));
    }, 350);
    return () => clearTimeout(t);
  }, [search, searchParams, pathname, router, startTransition]);

  const onlyMine = searchParams.get("onlyMine") === "true";
  const hideTrashOff = searchParams.get("hideTrash") === "false";
  const hasReminder = searchParams.get("hasReminder") === "true";

  const activeColors = (searchParams.get("colors") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function toggleColor(color: string) {
    const next = activeColors.includes(color)
      ? activeColors.filter((c) => c !== color)
      : [...activeColors, color];
    setParam("colors", next.length > 0 ? next.join(",") : null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 gap-2">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за іменем, телефоном або містом…"
            className="flex-1"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ClientListFilterSheet
            dictionaries={dictionaries}
            filtersPrefs={filtersPrefs}
          />
          {showOnlyMineToggle && (
            <Chip
              active={onlyMine}
              onClick={() => setParam("onlyMine", onlyMine ? null : "true")}
            >
              Тільки мої
            </Chip>
          )}
          <ViewCustomizerSheet
            initialColumns={columnsPrefs}
            initialFilters={filtersPrefs}
            columnLabels={COLUMN_LABELS}
            filterLabels={FILTER_LABELS}
          />
        </div>
      </div>

      <ClientAdvancedFilters allTags={allTags} />

      <ClientFilterPresets />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-gray-400">Пріоритет:</span>
        {CLIENT_COLOR_ORDER.map((color) => {
          const meta = CLIENT_COLOR_META[color];
          const active = activeColors.includes(color);
          return (
            <button
              key={color}
              type="button"
              onClick={() => toggleColor(color)}
              title={meta.description}
              className={
                active
                  ? "inline-flex items-center gap-1.5 rounded-full border border-gray-900 bg-gray-900 px-2.5 py-1 text-xs text-white"
                  : "inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
              }
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dotClass}`}
              />
              {meta.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setParam("hasReminder", hasReminder ? null : "true")}
          title="Клієнти з активними нагадуваннями"
          className={
            hasReminder
              ? "ml-1 inline-flex items-center gap-1.5 rounded-full border border-gray-900 bg-gray-900 px-2.5 py-1 text-xs text-white"
              : "ml-1 inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
          }
        >
          <Bell
            className={
              hasReminder ? "h-3.5 w-3.5" : "h-3.5 w-3.5 text-amber-500"
            }
          />
          Є нагадування
          {openReminderCount > 0 && (
            <span
              className={
                hasReminder
                  ? "rounded-full bg-white px-1.5 text-[11px] font-bold text-gray-900"
                  : "rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white"
              }
            >
              {openReminderCount > 99 ? "99+" : openReminderCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={!hideTrashOff}
            onChange={(e) =>
              setParam("hideTrash", e.target.checked ? null : "false")
            }
          />
          Прибрати приховані (1111…/9999…)
        </label>
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
