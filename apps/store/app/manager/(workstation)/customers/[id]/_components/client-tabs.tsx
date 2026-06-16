"use client";

import { useEffect, useMemo, useState } from "react";

interface TabDef {
  id:
    | "requisites"
    | "assortment"
    | "presentations"
    | "history"
    | "sales-history"
    | "orders"
    | "reminders"
    | "viber"
    | "presentation-history"
    | "social"
    | "keywords"
    | "debt-movements";
  label: string;
  foreignVisible: boolean;
}

/**
 * Усі tabs у точному 1С порядку. Поле `foreignVisible` — чи показати tab
 * коли поточний user дивиться на чужого клієнта (M1.3f).
 *
 * У foreign view приховуються tabs з sensitive contact data:
 * Презентації, Історія, Нагадування, Viber, Іст. презентацій, Соц мережі
 * (6 з 10). Лишається: Реквізити (з masked полями), Асортимент, Історія
 * продаж, Замовлення. Розрахунковий рахунок тепер показується read-only
 * усередині вкладки «Реквізити» (окремої вкладки «Банк. рахунки» немає).
 */
const TABS: TabDef[] = [
  { id: "requisites", label: "Реквізити", foreignVisible: true },
  { id: "assortment", label: "Асортимент", foreignVisible: true },
  { id: "presentations", label: "Презентації", foreignVisible: false },
  { id: "history", label: "Історія", foreignVisible: false },
  { id: "sales-history", label: "Історія продаж", foreignVisible: true },
  { id: "orders", label: "Замовлення", foreignVisible: true },
  { id: "reminders", label: "Нагадування", foreignVisible: false },
  { id: "viber", label: "Viber", foreignVisible: false },
  {
    id: "presentation-history",
    label: "Іст. презентацій",
    foreignVisible: false,
  },
  { id: "social", label: "Соцмережі та месенджери", foreignVisible: false },
  { id: "keywords", label: "Ключові слова", foreignVisible: false },
  { id: "debt-movements", label: "Рухи боргу", foreignVisible: false },
];

type TabId = TabDef["id"];

export function ClientTabs({
  requisites,
  assortment,
  presentations,
  history,
  salesHistory,
  orders,
  reminders,
  viber,
  presentationHistory,
  social,
  keywords,
  debtMovements,
  overdueRemindersCount = 0,
  isForeign = false,
}: {
  requisites: React.ReactNode;
  assortment: React.ReactNode;
  presentations: React.ReactNode;
  history: React.ReactNode;
  salesHistory: React.ReactNode;
  orders: React.ReactNode;
  reminders: React.ReactNode;
  viber: React.ReactNode;
  presentationHistory: React.ReactNode;
  social: React.ReactNode;
  keywords: React.ReactNode;
  debtMovements: React.ReactNode;
  overdueRemindersCount?: number;
  isForeign?: boolean;
}) {
  const visibleTabs = useMemo(
    () => (isForeign ? TABS.filter((t) => t.foreignVisible) : TABS),
    [isForeign],
  );
  const visibleIds = useMemo(
    () => new Set<string>(visibleTabs.map((t) => t.id)),
    [visibleTabs],
  );

  const [tab, setTab] = useState<TabId>("requisites");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && visibleIds.has(hash)) {
      setTab(hash as TabId);
    } else if (hash && !visibleIds.has(hash)) {
      // Deeplink на hidden tab (наприклад #viber для foreign view) →
      // fallback на 'requisites' + очистити anchor щоб не reset-нути назад.
      setTab("requisites");
      window.history.replaceState(null, "", "#requisites");
    }
  }, [visibleIds]);

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
    "presentation-history": presentationHistory,
    social,
    keywords,
    "debt-movements": debtMovements,
  };

  return (
    <div>
      <div
        role="tablist"
        className="flex flex-wrap gap-1 border-b border-gray-200"
      >
        {visibleTabs.map((t) => (
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
