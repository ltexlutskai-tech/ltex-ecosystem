"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@ltex/ui";
import { SlidersHorizontal } from "lucide-react";
import { SelectMulti } from "./filter-controls/select-multi";
import { BoolFilter } from "./filter-controls/bool-filter";
import { RangeNumeric } from "./filter-controls/range-numeric";
import { RangeDate } from "./filter-controls/range-date";
import { TextFilter } from "./filter-controls/text-filter";
import { ColorFilter } from "./filter-controls/color-filter";
import { KeywordFilter } from "./filter-controls/keyword-filter";
import {
  countActiveFilters,
  stateToUrl,
  urlToState,
  type FilterState,
} from "./clients-filter-state";
import { FILTER_LABELS } from "../_lib/filter-labels";
import type { ConfigItem, DictionariesSnapshot } from "./types";

interface Props {
  dictionaries: DictionariesSnapshot;
  filtersPrefs: ConfigItem[];
}

export function ClientListFilterSheet({ dictionaries, filtersPrefs }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const initialState = useMemo(
    () => urlToState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const [draft, setDraft] = useState<FilterState>(initialState);

  // При відкритті — синхронізуємо draft з URL
  useEffect(() => {
    if (open) setDraft(initialState);
  }, [open, initialState]);

  const activeUrlCount = countActiveFilters(initialState);

  function apply() {
    const sp = stateToUrl(draft, new URLSearchParams(searchParams.toString()));
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
    setOpen(false);
  }

  function reset() {
    setDraft({});
    const sp = stateToUrl({}, new URLSearchParams(searchParams.toString()));
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  const orderedFilters = useMemo(
    () =>
      filtersPrefs
        .filter((p) => p.visible)
        .sort((a, b) => a.order - b.order)
        // Search / onlyMine / hideTrash рендеряться на toolbar окремо,
        // не дублюємо у sheet.
        .filter(
          (p) =>
            p.key !== "search" && p.key !== "onlyMine" && p.key !== "hideTrash",
        ),
    [filtersPrefs],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" type="button" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Фільтри
          {activeUrlCount > 0 && (
            <span className="rounded-full bg-blue-500 px-1.5 py-0 text-xs text-white">
              {activeUrlCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Фільтри клієнтів</SheetTitle>
          <SheetDescription>
            Виставте критерії і натисніть "Застосувати".
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {orderedFilters.map((p) =>
            renderFilter(p.key, draft, setDraft, dictionaries),
          )}
        </div>

        <div className="mt-8 flex justify-between gap-2">
          <Button variant="outline" type="button" onClick={reset}>
            Скинути все
          </Button>
          <Button type="button" onClick={apply}>
            Застосувати
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function renderFilter(
  key: string,
  draft: FilterState,
  setDraft: React.Dispatch<React.SetStateAction<FilterState>>,
  d: DictionariesSnapshot,
) {
  const update = (patch: Partial<FilterState>) =>
    setDraft((prev) => ({ ...prev, ...patch }));
  const label = FILTER_LABELS[key] ?? key;

  switch (key) {
    case "color":
      return (
        <ColorFilter
          key={key}
          label={label}
          value={draft.colors ?? []}
          onChange={(v) => update({ colors: v.length > 0 ? v : undefined })}
        />
      );
    case "keywords":
      return (
        <KeywordFilter
          key={key}
          label={label}
          value={draft.keywords ?? []}
          orMode={draft.keywordsOr}
          onChange={(v) => update({ keywords: v.length > 0 ? v : undefined })}
          onModeChange={(orMode) =>
            update({ keywordsOr: orMode ? true : undefined })
          }
        />
      );
    case "historySearch":
      return (
        <TextFilter
          key={key}
          label={label}
          value={draft.historySearch ?? ""}
          placeholder="Текст із запису історії…"
          onChange={(v) => update({ historySearch: v || undefined })}
        />
      );
    case "assortmentSearch":
      return (
        <TextFilter
          key={key}
          label={label}
          value={draft.assortmentSearch ?? ""}
          placeholder="Артикул або назва товару…"
          onChange={(v) => update({ assortmentSearch: v || undefined })}
        />
      );
    case "statusGeneralId":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.statuses.map((s) => ({ id: s.id, label: s.label }))}
          value={draft.statusGeneralIds ?? []}
          onChange={(v) => update({ statusGeneralIds: v })}
        />
      );
    case "statusOperationalId":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.statusesOperational.map((s) => ({
            id: s.id,
            label: s.label,
          }))}
          value={draft.statusOperationalIds ?? []}
          onChange={(v) => update({ statusOperationalIds: v })}
        />
      );
    case "searchChannelId":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.channels.map((c) => ({ id: c.id, label: c.label }))}
          value={draft.searchChannelIds ?? []}
          onChange={(v) => update({ searchChannelIds: v })}
        />
      );
    case "deliveryMethodId":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.deliveries.map((x) => ({ id: x.id, label: x.label }))}
          value={draft.deliveryMethodIds ?? []}
          onChange={(v) => update({ deliveryMethodIds: v })}
        />
      );
    case "categoryTTId":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.categoriesTT.map((x) => ({ id: x.id, label: x.label }))}
          value={draft.categoryTTIds ?? []}
          onChange={(v) => update({ categoryTTIds: v })}
        />
      );
    case "priceTypeId":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.priceTypes.map((x) => ({ id: x.id, label: x.label }))}
          value={draft.priceTypeIds ?? []}
          onChange={(v) => update({ priceTypeIds: v })}
        />
      );
    case "primaryAssortmentId":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.assortmentCodes.map((x) => ({
            id: x.id,
            label: x.label,
          }))}
          value={draft.primaryAssortmentIds ?? []}
          onChange={(v) => update({ primaryAssortmentIds: v })}
        />
      );
    case "primaryRouteId":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.routes.map((x) => ({ id: x.id, label: x.name }))}
          value={draft.primaryRouteIds ?? []}
          onChange={(v) => update({ primaryRouteIds: v })}
        />
      );
    case "agentUserId":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.agents.map((u) => ({ id: u.id, label: u.fullName }))}
          value={draft.agentUserIds ?? []}
          onChange={(v) => update({ agentUserIds: v })}
        />
      );
    case "region":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.regions.map((r) => ({ id: r, label: r }))}
          value={draft.regionValues ?? []}
          onChange={(v) => update({ regionValues: v })}
        />
      );
    case "city":
      return (
        <SelectMulti
          key={key}
          label={label}
          options={d.cities.map((c) => ({ id: c, label: c }))}
          value={draft.cityValues ?? []}
          onChange={(v) => update({ cityValues: v })}
        />
      );
    case "daysSinceRange":
      return (
        <RangeNumeric
          key={key}
          label={label}
          integer
          min={draft.daysSinceMin}
          max={draft.daysSinceMax}
          onChange={({ min, max }) =>
            update({ daysSinceMin: min, daysSinceMax: max })
          }
        />
      );
    case "createdRange":
      return (
        <RangeDate
          key={key}
          label={label}
          from={draft.createdFrom}
          to={draft.createdTo}
          onChange={({ from, to }) =>
            update({ createdFrom: from, createdTo: to })
          }
        />
      );
    case "hasDebt":
      return (
        <BoolFilter
          key={key}
          label={label}
          value={draft.hasDebt}
          onChange={(v) => update({ hasDebt: v })}
        />
      );
    case "hasOverpayment":
      return (
        <BoolFilter
          key={key}
          label={label}
          value={draft.hasOverpayment}
          onChange={(v) => update({ hasOverpayment: v })}
        />
      );
    default:
      return null;
  }
}
