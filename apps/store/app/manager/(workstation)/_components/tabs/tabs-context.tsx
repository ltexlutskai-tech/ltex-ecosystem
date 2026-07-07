"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { tabLabelForPath } from "./tab-label";

export interface WorkTab {
  id: string;
  /** Внутрішній шлях `/manager/...`, який завантажується в iframe. */
  url: string;
  label: string;
  /**
   * Лічильник «повернення на головну» (7.3): повторний клік по блоку в
   * сайдбарі фокусує наявну вкладку і збільшує nav → iframe перезавантажується
   * на головну сторінку блоку (ключ iframe містить nav).
   */
  nav?: number;
}

export interface TabsState {
  tabs: WorkTab[];
  activeId: string | null;
  /**
   * Вкладка, закріплена у правій половині робочої області («Показати поруч»,
   * 7.3). null/undefined — розділення вимкнене.
   */
  splitId?: string | null;
}

export type TabsAction =
  | {
      type: "open";
      url: string;
      label?: string;
      duplicate?: boolean;
      id: string;
    }
  | { type: "focus"; id: string }
  | { type: "close"; id: string; dashboardId: string }
  | { type: "closeOthers"; id: string }
  | { type: "rename"; id: string; label: string }
  | { type: "setSplit"; id: string | null }
  | { type: "hydrate"; state: TabsState };

const DASHBOARD_URL = "/manager";

/** Префікс `window.name` відкріпленого вікна (контент без shell, як у 1С). */
export const DETACHED_WINDOW_PREFIX = "ltex-mgr-detached";

function makeTab(id: string, url: string, label?: string): WorkTab {
  return { id, url, label: label ?? tabLabelForPath(url) };
}

/**
 * Чистий reducer — уся логіка вкладок (тестується без DOM).
 * `id`/`dashboardId` передаються ззовні (бо `crypto.randomUUID()` —
 * сайд-ефект, який не має жити всередині reducer).
 */
export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "hydrate":
      return action.state;

    case "open": {
      if (!action.duplicate) {
        const existing = state.tabs.find((t) => t.url === action.url);
        if (existing) {
          // Фокус наявної вкладки блоку + повернення її на головну сторінку
          // блоку (nav++ → iframe перезавантажиться на existing.url).
          const tabs = state.tabs.map((t) =>
            t.id === existing.id
              ? {
                  ...t,
                  nav: (t.nav ?? 0) + 1,
                  label: action.label ?? tabLabelForPath(t.url),
                }
              : t,
          );
          return { ...state, tabs, activeId: existing.id };
        }
      }
      const tab = makeTab(action.id, action.url, action.label);
      return { ...state, tabs: [...state.tabs, tab], activeId: tab.id };
    }

    case "focus": {
      if (!state.tabs.some((t) => t.id === action.id)) return state;
      return { ...state, activeId: action.id };
    }

    case "close": {
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      if (idx === -1) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      const splitId = state.splitId === action.id ? null : state.splitId;

      // Якщо вкладок не лишилось — відкрити дашборд.
      if (tabs.length === 0) {
        const tab = makeTab(action.dashboardId, DASHBOARD_URL);
        return { tabs: [tab], activeId: tab.id, splitId: null };
      }

      let activeId = state.activeId;
      if (state.activeId === action.id) {
        // Активувати сусідню: праву (той самий idx у новому масиві),
        // інакше ліву. tabs гарантовано непорожній (length > 0 вище).
        const neighbour = tabs[idx] ?? tabs[idx - 1] ?? tabs[tabs.length - 1];
        activeId = neighbour ? neighbour.id : state.activeId;
      }
      return { tabs, activeId, splitId };
    }

    case "closeOthers": {
      const keep = state.tabs.find((t) => t.id === action.id);
      if (!keep) return state;
      return {
        tabs: [keep],
        activeId: keep.id,
        splitId: state.splitId === keep.id ? state.splitId : null,
      };
    }

    case "rename": {
      const tabs = state.tabs.map((t) =>
        t.id === action.id ? { ...t, label: action.label } : t,
      );
      return { ...state, tabs };
    }

    case "setSplit": {
      if (action.id !== null && !state.tabs.some((t) => t.id === action.id)) {
        return state;
      }
      return { ...state, splitId: action.id };
    }

    default:
      return state;
  }
}

export interface TabsContextValue {
  tabs: WorkTab[];
  activeId: string | null;
  activeTab: WorkTab | null;
  /** Вкладка у правій половині (розділення робочої області) або null. */
  splitId: string | null;
  openTab: (
    url: string,
    label?: string,
    opts?: { duplicate?: boolean },
  ) => void;
  focusTab: (id: string) => void;
  closeTab: (id: string) => void;
  /** Закрити всі вкладки, крім вказаної. */
  closeOtherTabs: (id: string) => void;
  renameTab: (id: string, label: string) => void;
  /** Закріпити вкладку праворуч (null — прибрати розділення). */
  setSplitTab: (id: string | null) => void;
  /** Винести вкладку в окреме вікно браузера (як у 1С) і закрити її тут. */
  detachTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

const STORAGE_KEY = "ltex:mgr-tabs:v1";

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function readStoredState(): TabsState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as TabsState).tabs)
    ) {
      const candidate = parsed as TabsState;
      const tabs = candidate.tabs.filter(
        (t): t is WorkTab =>
          !!t &&
          typeof t.id === "string" &&
          typeof t.url === "string" &&
          typeof t.label === "string",
      );
      const first = tabs[0];
      if (!first) return null;
      const activeId =
        candidate.activeId && tabs.some((t) => t.id === candidate.activeId)
          ? candidate.activeId
          : first.id;
      const splitId =
        typeof candidate.splitId === "string" &&
        tabs.some((t) => t.id === candidate.splitId)
          ? candidate.splitId
          : null;
      return { tabs, activeId, splitId };
    }
  } catch {
    // ignore corrupt / unavailable storage
  }
  return null;
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const initializedRef = useRef(false);

  const [state, dispatch] = useReducer(tabsReducer, {
    tabs: [],
    activeId: null,
    splitId: null,
  });

  // Гідрація зі сховища (один раз, на mount, у браузері).
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const stored = readStoredState();
    if (stored) {
      dispatch({ type: "hydrate", state: stored });
      return;
    }
    // Порожньо — відкрити поточний маршрут як першу вкладку.
    const url = pathname || DASHBOARD_URL;
    dispatch({
      type: "open",
      url,
      label: tabLabelForPath(url),
      id: newId(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Персистентність (debounce).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.tabs.length === 0) return;
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // ignore (private mode / quota)
      }
    }, 200);
    return () => window.clearTimeout(handle);
  }, [state]);

  // Повідомлення від embedded-сторінок (iframe): «відкрий нову вкладку».
  // Використовується плитками дашборда та іншими block-лінками (7.3).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as {
        type?: unknown;
        url?: unknown;
        label?: unknown;
      } | null;
      if (
        data &&
        data.type === "ltex:open-tab" &&
        typeof data.url === "string" &&
        data.url.startsWith("/manager")
      ) {
        dispatch({
          type: "open",
          url: data.url,
          label: typeof data.label === "string" ? data.label : undefined,
          id: newId(),
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const openTab = useCallback(
    (url: string, label?: string, opts?: { duplicate?: boolean }) => {
      dispatch({
        type: "open",
        url,
        label,
        duplicate: opts?.duplicate,
        id: newId(),
      });
    },
    [],
  );

  const focusTab = useCallback((id: string) => {
    dispatch({ type: "focus", id });
  }, []);

  const closeTab = useCallback((id: string) => {
    dispatch({ type: "close", id, dashboardId: newId() });
  }, []);

  const closeOtherTabs = useCallback((id: string) => {
    dispatch({ type: "closeOthers", id });
  }, []);

  const renameTab = useCallback((id: string, label: string) => {
    dispatch({ type: "rename", id, label });
  }, []);

  const setSplitTab = useCallback((id: string | null) => {
    dispatch({ type: "setSplit", id });
  }, []);

  const detachTab = useCallback(
    (id: string) => {
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab) return;
      // Іменоване вікно: window.name зберігається при навігації всередині
      // нього — WorkstationShell бачить префікс і рендерить контент без shell.
      const win = window.open(
        tab.url,
        `${DETACHED_WINDOW_PREFIX}-${id}`,
        "popup=yes,width=1280,height=820",
      );
      // Якщо браузер заблокував popup — вкладку не чіпаємо.
      if (win) dispatch({ type: "close", id, dashboardId: newId() });
    },
    [state.tabs],
  );

  const value = useMemo<TabsContextValue>(() => {
    const activeTab = state.tabs.find((t) => t.id === state.activeId) ?? null;
    return {
      tabs: state.tabs,
      activeId: state.activeId,
      activeTab,
      splitId: state.splitId ?? null,
      openTab,
      focusTab,
      closeTab,
      closeOtherTabs,
      renameTab,
      setSplitTab,
      detachTab,
    };
  }, [
    state,
    openTab,
    focusTab,
    closeTab,
    closeOtherTabs,
    renameTab,
    setSplitTab,
    detachTab,
  ]);

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

/** Кидає помилку поза провайдером — для компонентів, що завжди в top-shell. */
export function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error("useTabs must be used within <TabsProvider>");
  }
  return ctx;
}

/**
 * Null-safe варіант — для компонентів (напр. SidebarNavLink), які можуть
 * рендеритись і в embedded-режимі (поза провайдером).
 */
export function useTabsOptional(): TabsContextValue | null {
  return useContext(TabsContext);
}
