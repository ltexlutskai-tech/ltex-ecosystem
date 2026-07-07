"use client";

import type { SyntheticEvent } from "react";
import { X } from "lucide-react";
import { useTabs } from "./tabs-context";

/** Прибрати суфікс заголовка « | L-TEX Manager» / «L-TEX Manager». */
function cleanTitle(raw: string): string {
  let title = raw.trim();
  title = title.replace(/\s*[|•·-]\s*L-?TEX Manager\s*$/i, "");
  if (title === "L-TEX Manager") return "";
  return title.trim();
}

/**
 * Робоча область. Кожна вкладка — постійно змонтований iframe (стан сторінок
 * не втрачається при перемиканні). Режим «поруч» (7.3): вкладка `splitId`
 * закріплена у правій половині, активна — у лівій; якщо активна = закріплена,
 * показується одна на всю ширину.
 */
export function IframeHost() {
  const { tabs, activeId, splitId, renameTab, setSplitTab } = useTabs();

  if (tabs.length === 0) return null;

  const splitActive =
    splitId !== null &&
    splitId !== activeId &&
    tabs.some((t) => t.id === splitId);

  return (
    <div className="absolute inset-0">
      {tabs.map((tab) => {
        const isSplitPane = splitActive && tab.id === splitId;
        const isMain = tab.id === activeId;
        const visible = isMain || isSplitPane;
        return (
          <div
            // nav у ключі: повторний клік по блоку в сайдбарі перезавантажує
            // iframe на головну сторінку блоку (7.3).
            key={`${tab.id}:${tab.nav ?? 0}`}
            className="absolute inset-y-0 flex flex-col"
            style={{
              display: visible ? "flex" : "none",
              left: isSplitPane ? "50%" : 0,
              width: splitActive && visible ? "50%" : "100%",
              borderLeft: isSplitPane ? "1px solid #d1d5db" : undefined,
            }}
          >
            {isSplitPane && (
              <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b bg-gray-100 px-2 text-xs text-gray-600">
                <span className="truncate font-medium">{tab.label}</span>
                <button
                  type="button"
                  aria-label="Прибрати з правої половини"
                  title="Прибрати з правої половини"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSplitTab(null);
                  }}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-300 hover:text-gray-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <iframe
              src={tab.url}
              title={tab.label}
              className="w-full flex-1 border-0"
              onLoad={(e: SyntheticEvent<HTMLIFrameElement>) => {
                // Best-effort уточнення назви вкладки з <title> embedded-сторінки.
                // same-origin → доступно; обгортаємо у try/catch на випадок
                // cross-origin навігації всередині iframe.
                try {
                  const doc = e.currentTarget.contentDocument;
                  const raw = doc?.title;
                  if (raw) {
                    const cleaned = cleanTitle(raw);
                    if (cleaned) renameTab(tab.id, cleaned);
                  }
                } catch {
                  // ignore — cross-origin / недоступний документ
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
