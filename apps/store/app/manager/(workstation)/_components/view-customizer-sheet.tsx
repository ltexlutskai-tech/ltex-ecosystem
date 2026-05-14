"use client";

import { useState } from "react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@ltex/ui";
import { Settings2 } from "lucide-react";
import { useViewPrefs } from "../_hooks/use-view-prefs";
import { ViewCustomizerList } from "./view-customizer-list";
import type { ConfigItem } from "@/lib/manager/view-defaults";

interface Props {
  initialColumns: ConfigItem[];
  initialFilters: ConfigItem[];
  columnLabels: Record<string, string>;
  filterLabels: Record<string, string>;
  triggerLabel?: string;
}

type TabKey = "columns" | "filters";

export function ViewCustomizerSheet({
  initialColumns,
  initialFilters,
  columnLabels,
  filterLabels,
  triggerLabel = "Налаштувати",
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("columns");
  const columns = useViewPrefs("clients_table", initialColumns);
  const filters = useViewPrefs("clients_filters", initialFilters);

  const active = tab === "columns" ? columns : filters;
  const labels = tab === "columns" ? columnLabels : filterLabels;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" type="button" className="gap-2">
          <Settings2 className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Налаштування</SheetTitle>
          <SheetDescription>
            Оберіть видимість і порядок колонок таблиці та полів фільтра.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex border-b">
          <TabBtn active={tab === "columns"} onClick={() => setTab("columns")}>
            Колонки
          </TabBtn>
          <TabBtn active={tab === "filters"} onClick={() => setTab("filters")}>
            Фільтри
          </TabBtn>
        </div>

        <div className="mt-4">
          {active.loading ? (
            <p className="text-sm text-gray-500">Завантаження…</p>
          ) : (
            <ViewCustomizerList
              items={active.items}
              labels={labels}
              onChange={active.update}
              disabled={active.saving}
            />
          )}
          {active.error && (
            <p className="mt-2 text-xs text-red-600">{active.error}</p>
          )}
        </div>

        <div className="mt-6 flex justify-between gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={() => void active.reset()}
            disabled={active.saving || active.loading}
          >
            Скинути до дефолту
          </Button>
          <Button
            type="button"
            onClick={() => {
              void active.save().then((ok) => {
                if (ok) setOpen(false);
              });
            }}
            disabled={active.saving || active.loading || !active.dirty}
          >
            {active.saving ? "Збереження…" : "Зберегти"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "border-b-2 border-blue-600 px-4 py-2 text-sm font-medium text-blue-700"
          : "px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
      }
    >
      {children}
    </button>
  );
}
