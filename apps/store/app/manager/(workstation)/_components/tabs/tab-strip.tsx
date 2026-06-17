"use client";

import { Copy, Plus, X } from "lucide-react";
import { cn } from "@ltex/ui";
import { useTabs } from "./tabs-context";

export function TabStrip() {
  const { tabs, activeId, activeTab, openTab, focusTab, closeTab } = useTabs();

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b bg-gray-100">
      <div className="flex flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              title={tab.label}
              onClick={() => focusTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  focusTab(tab.id);
                }
              }}
              onDoubleClick={() =>
                openTab(tab.url, tab.label, { duplicate: true })
              }
              className={cn(
                "group flex max-w-[160px] min-w-[110px] shrink-0 cursor-pointer items-center gap-1.5 border-r px-3 text-sm transition-colors select-none",
                active
                  ? "border-b-2 border-b-green-600 bg-white font-medium text-green-700"
                  : "text-gray-600 hover:bg-gray-200",
              )}
            >
              <span className="flex-1 truncate">{tab.label}</span>
              <button
                type="button"
                aria-label="Закрити вкладку"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-300 hover:text-gray-700"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 items-stretch">
        {activeTab && (
          <button
            type="button"
            aria-label="Дублювати вкладку"
            title="Дублювати вкладку"
            onClick={() =>
              openTab(activeTab.url, activeTab.label, { duplicate: true })
            }
            className="flex w-9 items-center justify-center border-l text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          >
            <Copy className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="Нова вкладка"
          title="Нова вкладка"
          onClick={() => openTab("/manager", "Робочий стіл")}
          className="flex w-9 items-center justify-center border-l text-gray-500 hover:bg-gray-200 hover:text-gray-700"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
