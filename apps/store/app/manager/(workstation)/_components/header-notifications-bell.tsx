"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";

interface NotificationItem {
  id: string;
  body: string;
  remindAt: string;
  snoozedUntilAt: string | null;
  actionType: string;
  source: string;
  client: { id: string; name: string } | null;
}

interface NotificationsResponse {
  overdueCount: number;
  items: NotificationItem[];
}

const POLL_INTERVAL_MS = 60_000;

function fmtRelative(iso: string): string {
  const past = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(past)) return "—";
  if (past < 0) return "скоро";
  const min = Math.floor(past / 60_000);
  if (min < 60) return `${min} хв тому`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} год тому`;
  return `${Math.floor(hr / 24)} дн тому`;
}

export function HeaderNotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationsResponse>({
    overdueCount: 0,
    items: [],
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/notifications", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as NotificationsResponse;
      setData(json);
    } catch {
      // silent — bell is best-effort
    }
  }, []);

  useEffect(() => {
    void refetch();
    const id = window.setInterval(() => void refetch(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refetch]);

  useEffect(() => {
    if (!open) return;
    void refetch();
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, refetch]);

  function goTo(item: NotificationItem) {
    setOpen(false);
    // Клієнтські → картка клієнта; standalone (без клієнта) → екран нагадувань.
    router.push(
      item.client
        ? `/manager/customers/${item.client.id}#reminders`
        : "/manager/reminders",
    );
  }

  /** Дія прямо з дзвіночка: «Виконано» / «Відкласти на годину». */
  const act = useCallback(
    async (id: string, action: "complete" | "snooze") => {
      const payload =
        action === "snooze"
          ? {
              action,
              snoozedUntil: new Date(Date.now() + 3_600_000).toISOString(),
            }
          : { action };
      try {
        await fetch(`/api/v1/manager/reminders/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // best-effort
      }
      void refetch();
    },
    [refetch],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Сповіщення"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
      >
        <Bell className="h-5 w-5" />
        {data.overdueCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {data.overdueCount > 9 ? "9+" : data.overdueCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-80 rounded-md border bg-white text-sm shadow-lg"
        >
          <div className="border-b px-3 py-2">
            <p className="font-medium text-gray-800">Прострочені нагадування</p>
            <p className="text-xs text-gray-500">
              {data.overdueCount > 0
                ? `Усього прострочено: ${data.overdueCount}`
                : "Усе під контролем"}
            </p>
          </div>
          {data.items.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-gray-400">
              Прострочених нагадувань нема.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {data.items.map((it) => (
                <li key={it.id} className="px-3 py-2 hover:bg-gray-50">
                  <button
                    type="button"
                    onClick={() => goTo(it)}
                    className="block w-full text-left"
                  >
                    <p className="line-clamp-2 text-xs text-gray-800">
                      {it.body}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {it.client ? `${it.client.name} · ` : ""}
                      {fmtRelative(it.snoozedUntilAt ?? it.remindAt)}
                    </p>
                  </button>
                  <div className="mt-1.5 flex gap-3">
                    <button
                      type="button"
                      onClick={() => void act(it.id, "complete")}
                      className="text-[11px] font-medium text-green-700 hover:underline"
                    >
                      Виконано
                    </button>
                    <button
                      type="button"
                      onClick={() => void act(it.id, "snooze")}
                      className="text-[11px] font-medium text-gray-500 hover:underline"
                    >
                      Відкласти на годину
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
