"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

type TabId =
  | "requisites"
  | "assortment"
  | "presentations"
  | "history"
  | "messages"
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
  /** true → у головній горизонтальній стрічці; false → у меню «Ще ▾». */
  primary: boolean;
}

/**
 * Картка клієнта у стилі CRM (HubSpot/Pipedrive/Kommo): ліва «візитка» з
 * контактами (окремо) + основна колонка з ГОРИЗОНТАЛЬНИМИ вкладками. Часті
 * вкладки — у стрічці, рідші (Презентації/Іст. презентацій/Ключові слова) —
 * у випадайці «Ще ▾». `foreignVisible` — чи показати вкладку для чужого клієнта
 * (M1.3f). Порядок збережено так, щоб для чужого клієнта лишались саме
 * Реквізити · Історія продаж · Асортимент · Замовлення.
 *
 * Вкладку «Соцмережі та месенджери» / «Viber» прибрано — контакти живуть у
 * лівій «візитці» та шапці картки.
 */
const TABS: TabDef[] = [
  { id: "history", label: "Історія", foreignVisible: false, primary: true },
  {
    id: "messages",
    label: "Повідомлення",
    foreignVisible: false,
    primary: true,
  },
  {
    id: "reminders",
    label: "Нагадування",
    foreignVisible: false,
    primary: true,
  },
  { id: "requisites", label: "Реквізити", foreignVisible: true, primary: true },
  {
    id: "sales-history",
    label: "Історія продаж",
    foreignVisible: true,
    primary: true,
  },
  {
    id: "assortment",
    label: "Асортимент",
    foreignVisible: true,
    primary: true,
  },
  { id: "orders", label: "Замовлення", foreignVisible: true, primary: true },
  {
    id: "debt-movements",
    label: "Рухи боргу",
    foreignVisible: false,
    primary: true,
  },
  {
    id: "presentations",
    label: "Презентації",
    foreignVisible: false,
    primary: false,
  },
  {
    id: "presentation-history",
    label: "Іст. презентацій",
    foreignVisible: false,
    primary: false,
  },
  {
    id: "keywords",
    label: "Ключові слова",
    foreignVisible: false,
    primary: false,
  },
];

export function ClientTabs({
  requisites,
  assortment,
  presentations,
  history,
  messages,
  salesHistory,
  orders,
  reminders,
  presentationHistory,
  keywords,
  debtMovements,
  overdueRemindersCount = 0,
  unreadMessagesCount = 0,
  isForeign = false,
}: {
  requisites: React.ReactNode;
  assortment: React.ReactNode;
  presentations: React.ReactNode;
  history: React.ReactNode;
  messages: React.ReactNode;
  salesHistory: React.ReactNode;
  orders: React.ReactNode;
  reminders: React.ReactNode;
  presentationHistory: React.ReactNode;
  keywords: React.ReactNode;
  debtMovements: React.ReactNode;
  overdueRemindersCount?: number;
  /** Непрочитані повідомлення клієнта — синій бейдж на вкладці «Повідомлення». */
  unreadMessagesCount?: number;
  isForeign?: boolean;
}) {
  const visibleTabs = useMemo(
    () => (isForeign ? TABS.filter((t) => t.foreignVisible) : TABS),
    [isForeign],
  );
  const primaryTabs = useMemo(
    () => visibleTabs.filter((t) => t.primary),
    [visibleTabs],
  );
  const overflowTabs = useMemo(
    () => visibleTabs.filter((t) => !t.primary),
    [visibleTabs],
  );

  const visibleIds = useMemo(
    () => new Set<string>(visibleTabs.map((t) => t.id)),
    [visibleTabs],
  );

  const firstId = visibleTabs[0]?.id ?? "requisites";
  const [tab, setTab] = useState<TabId>(firstId);
  const [moreOpen, setMoreOpen] = useState(false);

  // Ініціалізація з hash + реакція на зміну hash (напр. лінки з лівої «візитки»
  // «Усі реквізити →» / «Редагувати →» ключові слова).
  useEffect(() => {
    if (typeof window === "undefined") return;
    function applyHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && visibleIds.has(hash)) {
        setTab(hash as TabId);
      }
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [visibleIds]);

  // Якщо активна вкладка стала невидимою (перемикання foreign) — впасти на першу.
  useEffect(() => {
    if (!visibleIds.has(tab)) setTab(firstId);
  }, [visibleIds, tab, firstId]);

  function selectTab(id: TabId) {
    setTab(id);
    setMoreOpen(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  }

  const panels: Record<TabId, React.ReactNode> = {
    requisites,
    assortment,
    presentations,
    history,
    messages,
    "sales-history": salesHistory,
    orders,
    reminders,
    "presentation-history": presentationHistory,
    keywords,
    "debt-movements": debtMovements,
  };

  const activeInOverflow = overflowTabs.some((t) => t.id === tab);

  function tabClass(active: boolean): string {
    return active
      ? "flex items-center gap-1 whitespace-nowrap border-b-2 border-blue-600 px-3 py-2 text-sm font-medium text-blue-700"
      : "flex items-center gap-1 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-gray-600 hover:text-gray-900";
  }

  return (
    <div>
      <div
        // Стрічка вкладок закріплюється під шапкою картки (її висота — у CSS-
        // змінній `--ccard-header-h`, яку виставляє StickyHeader).
        style={{ top: "var(--ccard-header-h)" }}
        className="sticky z-10 flex items-center gap-0.5 overflow-x-auto border-b border-gray-200 bg-gray-50"
      >
        {primaryTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => selectTab(t.id)}
            className={tabClass(tab === t.id)}
          >
            <span>{t.label}</span>
            {t.id === "reminders" && overdueRemindersCount > 0 && (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                {overdueRemindersCount > 9 ? "9+" : overdueRemindersCount}
              </span>
            )}
            {t.id === "messages" && unreadMessagesCount > 0 && (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
                {unreadMessagesCount > 9 ? "9+" : unreadMessagesCount}
              </span>
            )}
          </button>
        ))}

        {overflowTabs.length > 0 && (
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={tabClass(activeInOverflow)}
            >
              Ще <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {moreOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMoreOpen(false)}
                  role="presentation"
                />
                <div className="absolute top-full right-0 z-20 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  {overflowTabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => selectTab(t.id)}
                      className={
                        tab === t.id
                          ? "block w-full px-3 py-1.5 text-left text-sm font-medium text-blue-700"
                          : "block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 pt-4">{panels[tab]}</div>
    </div>
  );
}
