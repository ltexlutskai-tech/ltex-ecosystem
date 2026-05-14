"use client";

import { useEffect, useState } from "react";

const TABS = [
  { id: "requisites", label: "Реквізити" },
  { id: "assortment", label: "Асортимент" },
  { id: "presentations", label: "Презентації" },
  { id: "history", label: "Історія" },
  { id: "sales-history", label: "Історія продаж" },
  { id: "orders", label: "Замовлення" },
  { id: "reminders", label: "Нагадування" },
  { id: "viber", label: "Viber" },
  { id: "banks", label: "Банк. рахунки" },
  { id: "presentation-history", label: "Іст. презентацій" },
  { id: "social", label: "Соц мережі" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const VALID_TAB_IDS = new Set<string>(TABS.map((t) => t.id));

export function ClientTabs({
  requisites,
  assortment,
  presentations,
  history,
  salesHistory,
  orders,
  reminders,
  viber,
  banks,
  presentationHistory,
  social,
  overdueRemindersCount = 0,
}: {
  requisites: React.ReactNode;
  assortment: React.ReactNode;
  presentations: React.ReactNode;
  history: React.ReactNode;
  salesHistory: React.ReactNode;
  orders: React.ReactNode;
  reminders: React.ReactNode;
  viber: React.ReactNode;
  banks: React.ReactNode;
  presentationHistory: React.ReactNode;
  social: React.ReactNode;
  overdueRemindersCount?: number;
}) {
  const [tab, setTab] = useState<TabId>("requisites");

  // URL anchor `#tabname` → initial selection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && VALID_TAB_IDS.has(hash)) {
      setTab(hash as TabId);
    }
  }, []);

  function selectTab(id: TabId) {
    setTab(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  }

  const panels: Record<TabId, React.ReactNode> = {
    requisites,
    assortment,
    presentations,
    history,
    "sales-history": salesHistory,
    orders,
    reminders,
    viber,
    banks,
    "presentation-history": presentationHistory,
    social,
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
            onClick={() => selectTab(t.id)}
            className={
              tab === t.id
                ? "inline-flex items-center gap-1 border-b-2 border-blue-600 px-3 py-2 text-sm font-medium text-blue-700"
                : "inline-flex items-center gap-1 border-b-2 border-transparent px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
            }
          >
            {t.label}
            {t.id === "reminders" && overdueRemindersCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                {overdueRemindersCount > 9 ? "9+" : overdueRemindersCount}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="pt-4">{panels[tab]}</div>
    </div>
  );
}
