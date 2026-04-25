"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";

interface Stats {
  pendingOrders: number;
  unreadMessages: number;
  newSubscribersToday?: number;
}

export function NotificationBell() {
  const [stats, setStats] = useState<Stats>({
    pendingOrders: 0,
    unreadMessages: 0,
    newSubscribersToday: 0,
  });
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [prevPending, setPrevPending] = useState(0);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data: Stats = await res.json();
        if (soundEnabled && data.pendingOrders > prevPending) {
          try {
            const audio = new Audio(
              "data:audio/wav;base64,UklGRl9vT19teleXRlZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==",
            );
            audio.play().catch(() => {});
          } catch {}
        }
        setPrevPending(data.pendingOrders);
        setStats(data);
      }
    } catch {}
  }, [soundEnabled, prevPending]);

  useEffect(() => {
    fetchStats();
    const timer = setInterval(fetchStats, 30_000);
    return () => clearInterval(timer);
  }, [fetchStats]);

  const newSubscribers = stats.newSubscribersToday ?? 0;
  const total = stats.pendingOrders + stats.unreadMessages + newSubscribers;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative rounded-md p-2 text-gray-700 hover:bg-gray-100"
        aria-label="Сповіщення"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {total > 99 ? "99" : total}
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border bg-white shadow-lg">
            <div className="border-b px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Сповіщення</h3>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={soundEnabled ? "Вимкнути звук" : "Увімкнути звук"}
                >
                  {soundEnabled ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="py-1">
              <Link
                href="/admin/orders?status=pending"
                onClick={() => setShowDropdown(false)}
                className="flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50"
              >
                <span>Нові замовлення</span>
                {stats.pendingOrders > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    {stats.pendingOrders}
                  </span>
                )}
              </Link>
              <Link
                href="/admin/orders"
                onClick={() => setShowDropdown(false)}
                className="flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50"
              >
                <span>Непрочитані повідомлення</span>
                {stats.unreadMessages > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {stats.unreadMessages}
                  </span>
                )}
              </Link>
              <div className="flex items-center justify-between px-4 py-2 text-sm">
                <span>Нові підписники (24г)</span>
                {newSubscribers > 0 && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {newSubscribers}
                  </span>
                )}
              </div>
            </div>
            {total === 0 && (
              <p className="px-4 py-3 text-center text-xs text-gray-400">
                Все спокійно
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
