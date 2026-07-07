"use client";

import { useState } from "react";
import { Columns2, Copy, Plus, X } from "lucide-react";
import { cn } from "@ltex/ui";
import { ListContextMenu, type ContextMenuItem } from "../list-context-menu";
import { useTabs } from "./tabs-context";

interface MenuState {
  tabId: string;
  x: number;
  y: number;
}

export function TabStrip() {
  const {
    tabs,
    activeId,
    splitId,
    openTab,
    focusTab,
    closeTab,
    closeOtherTabs,
    setSplitTab,
    detachTab,
  } = useTabs();

  // Контекстне меню вкладки (ПКМ) — 1С-стиль, реюз ListContextMenu.
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuTab = menu ? (tabs.find((t) => t.id === menu.tabId) ?? null) : null;

  const menuItems: ContextMenuItem[] = menuTab
    ? [
        {
          type: "action",
          label: "Дублювати вкладку",
          onSelect: () =>
            openTab(menuTab.url, menuTab.label, { duplicate: true }),
        },
        {
          type: "action",
          label: "Відкрити в окремому вікні",
          onSelect: () => detachTab(menuTab.id),
        },
        { type: "separator" },
        splitId === menuTab.id
          ? {
              type: "action",
              label: "Прибрати з правої половини",
              onSelect: () => setSplitTab(null),
            }
          : {
              type: "action",
              label: "Показати у правій половині",
              onSelect: () => setSplitTab(menuTab.id),
            },
        { type: "separator" },
        {
          type: "action",
          label: "Закрити вкладку",
          onSelect: () => closeTab(menuTab.id),
        },
        {
          type: "action",
          label: "Закрити інші вкладки",
          disabled: tabs.length < 2,
          onSelect: () => closeOtherTabs(menuTab.id),
        },
      ]
    : [];

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
              title={`${tab.label} — ПКМ: дублювати / окреме вікно / поруч`}
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
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
              }}
              onAuxClick={(e) => {
                // Середня кнопка миші — закрити вкладку (як у браузері).
                if (e.button === 1) {
                  e.preventDefault();
                  closeTab(tab.id);
                }
              }}
              className={cn(
                "group flex max-w-[180px] min-w-[110px] shrink-0 cursor-pointer items-center gap-1 border-r px-2.5 text-sm transition-colors select-none",
                active
                  ? "border-b-2 border-b-green-600 bg-white font-medium text-green-700"
                  : "text-gray-600 hover:bg-gray-200",
              )}
            >
              {splitId === tab.id && (
                <Columns2
                  className="h-3.5 w-3.5 shrink-0 text-green-600"
                  aria-label="У правій половині"
                />
              )}
              <span className="flex-1 truncate">{tab.label}</span>
              <button
                type="button"
                aria-label="Дублювати вкладку"
                title="Дублювати вкладку"
                onClick={(e) => {
                  e.stopPropagation();
                  openTab(tab.url, tab.label, { duplicate: true });
                }}
                className="hidden h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 group-hover:flex hover:bg-gray-300 hover:text-gray-700"
              >
                <Copy className="h-3 w-3" />
              </button>
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
        <button
          type="button"
          aria-label="Нова вкладка"
          title="Нова вкладка (Робочий стіл)"
          onClick={() =>
            openTab("/manager", "Робочий стіл", { duplicate: true })
          }
          className="flex w-9 items-center justify-center border-l text-gray-500 hover:bg-gray-200 hover:text-gray-700"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <ListContextMenu
        open={menu !== null && menuTab !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menuItems}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}
