"use client";

import type { SyntheticEvent } from "react";
import { useTabs } from "./tabs-context";

/** Прибрати суфікс заголовка « | L-TEX Manager» / «L-TEX Manager». */
function cleanTitle(raw: string): string {
  let title = raw.trim();
  title = title.replace(/\s*[|•·-]\s*L-?TEX Manager\s*$/i, "");
  if (title === "L-TEX Manager") return "";
  return title.trim();
}

export function IframeHost() {
  const { tabs, activeId, renameTab } = useTabs();

  if (tabs.length === 0) return null;

  return (
    <div className="absolute inset-0">
      {tabs.map((tab) => (
        <iframe
          key={tab.id}
          src={tab.url}
          title={tab.label}
          className="h-full w-full border-0"
          style={{ display: tab.id === activeId ? "block" : "none" }}
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
      ))}
    </div>
  );
}
