"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfigItem, ViewKey } from "@/lib/manager/view-defaults";

interface State {
  items: ConfigItem[];
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  error: string | null;
}

export function useViewPrefs(viewKey: ViewKey, initialItems?: ConfigItem[]) {
  const router = useRouter();
  const [state, setState] = useState<State>({
    items: initialItems ?? [],
    loading: initialItems ? false : true,
    saving: false,
    dirty: false,
    error: null,
  });

  useEffect(() => {
    if (initialItems) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(`/api/v1/manager/me/view-prefs/${viewKey}`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ items: ConfigItem[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setState({
          items: data.items,
          loading: false,
          saving: false,
          dirty: false,
          error: null,
        });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: e.message ?? "Помилка завантаження",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [viewKey, initialItems]);

  const update = useCallback((items: ConfigItem[]) => {
    setState((s) => ({ ...s, items, dirty: true }));
  }, []);

  const save = useCallback(async () => {
    setState((s) => ({ ...s, saving: true, error: null }));
    try {
      const res = await fetch(`/api/v1/manager/me/view-prefs/${viewKey}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: state.items }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: ConfigItem[] };
      setState({
        items: data.items,
        loading: false,
        saving: false,
        dirty: false,
        error: null,
      });
      router.refresh();
      return true;
    } catch (e) {
      setState((s) => ({
        ...s,
        saving: false,
        error: (e as Error).message ?? "Помилка збереження",
      }));
      return false;
    }
  }, [viewKey, state.items, router]);

  const reset = useCallback(async () => {
    setState((s) => ({ ...s, saving: true, error: null }));
    try {
      const res = await fetch(`/api/v1/manager/me/view-prefs/${viewKey}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: ConfigItem[] };
      setState({
        items: data.items,
        loading: false,
        saving: false,
        dirty: false,
        error: null,
      });
      router.refresh();
      return true;
    } catch (e) {
      setState((s) => ({
        ...s,
        saving: false,
        error: (e as Error).message ?? "Помилка скидання",
      }));
      return false;
    }
  }, [viewKey, router]);

  return {
    items: state.items,
    loading: state.loading,
    saving: state.saving,
    dirty: state.dirty,
    error: state.error,
    update,
    save,
    reset,
  };
}
