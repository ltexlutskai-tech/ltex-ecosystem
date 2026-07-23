"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * Єдиний блок «Завдання» — вкладки типів завдань зверху сторінок:
 *  • «Доручення»    → /manager/tasks            (ручні + складські «мені/від мене»)
 *  • «Відправлення» → /manager/warehouse-tasks  (підготовка відправлень, склад)
 *  • «Відеозона»    → /manager/video-tasks      (віднести мішок → зйомка)
 *
 * Набір вкладок залежить від ролі; на кожній — індикатор невиконаних завдань
 * цього типу (polling 30с + visibilitychange). Рендериться на всіх трьох
 * сторінках, тож перемикання типів — «в одному місці», як в 1С.
 */

export type TaskTabKey = "assignments" | "warehouse" | "video";

interface TabDef {
  key: TaskTabKey;
  label: string;
  href: string;
  countUrl: string;
  /** Дістає число з відповіді ендпоінта (у них різні поля). */
  pick: (json: Record<string, unknown>) => number;
}

const ALL_TABS: TabDef[] = [
  {
    key: "assignments",
    label: "Доручення",
    href: "/manager/tasks",
    countUrl: "/api/v1/manager/tasks/count",
    pick: (j) => (typeof j.total === "number" ? j.total : 0),
  },
  {
    key: "warehouse",
    label: "Відправлення",
    href: "/manager/warehouse-tasks",
    countUrl: "/api/v1/manager/warehouse-tasks/count",
    pick: (j) => (typeof j.open === "number" ? j.open : 0),
  },
  {
    key: "video",
    label: "Відеозона",
    href: "/manager/video-tasks",
    countUrl: "/api/v1/manager/video-tasks/count",
    pick: (j) => (typeof j.total === "number" ? j.total : 0),
  },
];

/** Які вкладки бачить роль. Відеозона має власний кабінет — без панелі. */
function tabsForRole(role: string): TabDef[] {
  if (role === "videozone") return [];
  if (role === "warehouse") return ALL_TABS;
  if (role === "admin" || role === "owner") return ALL_TABS;
  // Менеджер/інші ролі: доручення + відеозона (складські «відправлення»
  // менеджер бачить всередині «Доручень» — свої реалізації).
  return ALL_TABS.filter((t) => t.key !== "warehouse");
}

/**
 * Чи показувати лічильник на вкладці. Менеджеру відеозона — лише ЗАПИСИ зі
 * статусами (він не виконавець цих завдань, індикатор йому не потрібен);
 * рахують виконавці — склад/відеозона/адмін.
 */
function showCount(role: string, key: TaskTabKey): boolean {
  if (key !== "video") return true;
  return ["warehouse", "admin", "owner"].includes(role);
}

const POLL_INTERVAL_MS = 30_000;

export function TaskTypeTabs({
  role,
  active,
}: {
  role: string;
  active: TaskTabKey;
}) {
  const tabs = tabsForRole(role);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refetch = useCallback(async () => {
    const next: Record<string, number> = {};
    await Promise.all(
      tabs
        .filter((t) => showCount(role, t.key))
        .map(async (t) => {
          try {
            const r = await fetch(t.countUrl, { cache: "no-store" });
            if (!r.ok) return;
            const j = (await r.json()) as Record<string, unknown>;
            next[t.key] = t.pick(j);
          } catch {
            // silent
          }
        }),
    );
    setCounts((prev) => ({ ...prev, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    void refetch();
    const id = window.setInterval(() => void refetch(), POLL_INTERVAL_MS);
    function onVis() {
      if (document.visibilityState === "visible") void refetch();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refetch]);

  if (tabs.length < 2) return null;

  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
      {tabs.map((t) => {
        const isActive = t.key === active;
        const count = counts[t.key] ?? 0;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
              isActive
                ? "bg-white font-medium text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
            {count > 0 ? (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-medium leading-none text-white">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
