"use client";

import { useState } from "react";

const TABS = [
  { id: "requisites", label: "Реквізити" },
  { id: "history", label: "Історія" },
  { id: "routes", label: "Маршрути" },
  { id: "assortment", label: "Асортимент" },
  { id: "orders", label: "Замовлення" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ClientTabs({
  requisites,
  history,
  routes,
  assortment,
  orders,
}: {
  requisites: React.ReactNode;
  history: React.ReactNode;
  routes: React.ReactNode;
  assortment: React.ReactNode;
  orders: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("requisites");
  const panels: Record<TabId, React.ReactNode> = {
    requisites,
    history,
    routes,
    assortment,
    orders,
  };
  return (
    <div>
      <div
        role="tablist"
        className="flex flex-wrap gap-1 border-b border-gray-200"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "border-b-2 border-blue-600 px-3 py-2 text-sm font-medium text-blue-700"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{panels[tab]}</div>
    </div>
  );
}
