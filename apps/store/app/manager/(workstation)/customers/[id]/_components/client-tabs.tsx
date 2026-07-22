"use client";

import { useEffect, useMemo, useState } from "react";

type TabId =
  | "requisites"
  | "assortment"
  | "presentations"
  | "history"
  | "sales-history"
  | "orders"
  | "reminders"
  | "presentation-history"
  | "keywords"
  | "debt-movements";

interface TabDef {
  id: TabId;
  label: string;
  foreignVisible: boolean;
}

interface GroupDef {
  id: string;
  label: string;
  tabs: TabDef[];
}

/**
 * Картка клієнта у стилі CRM: 10 вкладок згруповано у 4 логічні розділи з
 * бічним меню (Огляд · Продажі й замовлення · Комунікація · Фінанси). Поле
 * `foreignVisible` — чи показати вкладку коли поточний user дивиться на чужого
 * клієнта (M1.3f): у foreign-режимі ховаються розділи з чутливими контактами;
 * розділ без жодної видимої вкладки не показується взагалі.
 *
 * Вкладку «Viber» прибрано — цей функціонал живе в окремому місці (Месенджер /
 * чат-inbox). Блок «Соцмережі та месенджери» винесено у шапку картки (разом із
 * телефонами), тож окремої вкладки більше немає.
 */
const GROUPS: GroupDef[] = [
  {
    // Комунікація — перший розділ; головна вкладка картки = «Історія» (робота
    // з клієнтом). Для чужого клієнта весь розділ приховано → дефолт впаде на
    // перший видимий («Реквізити»).
    id: "communication",
    label: "Комунікація",
    tabs: [
      { id: "history", label: "Історія", foreignVisible: false },
      { id: "reminders", label: "Нагадування", foreignVisible: false },
    ],
  },
  {
    id: "overview",
    label: "Огляд",
    tabs: [
      { id: "requisites", label: "Реквізити", foreignVisible: true },
      { id: "keywords", label: "Ключові слова", foreignVisible: false },
    ],
  },
  {
    id: "sales",
    label: "Продажі й замовлення",
    tabs: [
      { id: "sales-history", label: "Історія продаж", foreignVisible: true },
      { id: "assortment", label: "Асортимент", foreignVisible: true },
      { id: "orders", label: "Замовлення", foreignVisible: true },
      { id: "presentations", label: "Презентації", foreignVisible: false },
      {
        id: "presentation-history",
        label: "Іст. презентацій",
        foreignVisible: false,
      },
    ],
  },
  {
    id: "finance",
    label: "Фінанси",
    tabs: [
      { id: "debt-movements", label: "Рухи боргу", foreignVisible: false },
    ],
  },
];

export function ClientTabs({
  requisites,
  assortment,
  presentations,
  history,
  salesHistory,
  orders,
  reminders,
  presentationHistory,
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
  presentationHistory: React.ReactNode;
  keywords: React.ReactNode;
  debtMovements: React.ReactNode;
  overdueRemindersCount?: number;
  isForeign?: boolean;
}) {
  // Групи з відфільтрованими за foreign-режимом вкладками; порожні групи геть.
  const visibleGroups = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        tabs: isForeign ? g.tabs.filter((t) => t.foreignVisible) : g.tabs,
      })).filter((g) => g.tabs.length > 0),
    [isForeign],
  );

  const visibleIds = useMemo(
    () =>
      new Set<string>(visibleGroups.flatMap((g) => g.tabs.map((t) => t.id))),
    [visibleGroups],
  );

  const firstId = visibleGroups[0]?.tabs[0]?.id ?? "requisites";
  const [tab, setTab] = useState<TabId>(firstId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && visibleIds.has(hash)) {
      setTab(hash as TabId);
    } else if (hash && !visibleIds.has(hash)) {
      setTab(firstId);
      window.history.replaceState(null, "", `#${firstId}`);
    }
  }, [visibleIds, firstId]);

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
    "presentation-history": presentationHistory,
    keywords,
    "debt-movements": debtMovements,
  };

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <nav
        aria-label="Розділи картки клієнта"
        className="space-y-3 md:self-start"
      >
        {visibleGroups.map((g) => (
          <div key={g.id}>
            <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
              {g.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {g.tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => selectTab(t.id)}
                  className={
                    tab === t.id
                      ? "flex items-center justify-between gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-left text-sm font-medium text-blue-700"
                      : "flex items-center justify-between gap-1 rounded-md px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }
                >
                  <span>{t.label}</span>
                  {t.id === "reminders" && overdueRemindersCount > 0 && (
                    <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                      {overdueRemindersCount > 9 ? "9+" : overdueRemindersCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="min-w-0">{panels[tab]}</div>
    </div>
  );
}
