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
import { Bell, ChevronDown, MessageCircle } from "lucide-react";
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
  // Шторка з розширеними фільтрами — згорнута за замовчуванням (більше місця).
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  // При прокручуванні шторка одразу закривається (звільняє місце для роботи).
  // Capture-фаза ловить скрол і у вкладених контейнерах (таблиця має свій скрол).
  useEffect(() => {
    if (!filtersOpen) return;
    const close = () => setFiltersOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [filtersOpen]);

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
  const hasMessage = searchParams.get("hasMessage") === "true";

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

  // Чи є активні фільтри у шторці — щоб позначити кнопку навіть коли згорнуто.
  const activeDrawerCount =
    (searchParams.get("historySearch") ? 1 : 0) +
    (searchParams.get("keywords") ? 1 : 0) +
    (searchParams.get("assortmentSearch") ? 1 : 0) +
    activeColors.length +
    (hasReminder ? 1 : 0) +
    (hasMessage ? 1 : 0) +
    (hideTrashOff ? 1 : 0);

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
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={
              filtersOpen || activeDrawerCount > 0
                ? "inline-flex items-center gap-1.5 rounded-full border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
                : "inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            }
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                filtersOpen ? "rotate-180" : ""
              }`}
            />
            Більше
            {activeDrawerCount > 0 && (
              <span
                className={
                  filtersOpen
                    ? "rounded-full bg-white px-1.5 text-[11px] font-bold text-gray-900"
                    : "rounded-full bg-gray-900 px-1.5 text-[11px] font-bold text-white"
                }
              >
                {activeDrawerCount}
              </span>
            )}
          </button>
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
          <span className="ml-auto text-xs text-gray-500">
            Знайдено: {totalCount}
          </span>
        </div>
      </div>

      {/* Шторка з розширеними фільтрами — розгортається кнопкою «Фільтри»,
          закривається при прокручуванні. */}
      {filtersOpen && (
        <div className="space-y-2 rounded-lg border bg-white p-3 shadow-sm">
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
              onClick={() =>
                setParam("hasReminder", hasReminder ? null : "true")
              }
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

            <button
              type="button"
              onClick={() => setParam("hasMessage", hasMessage ? null : "true")}
              title="Клієнти з непрочитаними повідомленнями в месенджері"
              className={
                hasMessage
                  ? "inline-flex items-center gap-1.5 rounded-full border border-gray-900 bg-gray-900 px-2.5 py-1 text-xs text-white"
                  : "inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
              }
            >
              <MessageCircle
                className={
                  hasMessage ? "h-3.5 w-3.5" : "h-3.5 w-3.5 text-blue-600"
                }
              />
              Є повідомлення
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={!hideTrashOff}
              onChange={(e) =>
                setParam("hideTrash", e.target.checked ? null : "false")
              }
            />
            Прибрати приховані (1111…/9999…)
          </label>
        </div>
      )}
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
