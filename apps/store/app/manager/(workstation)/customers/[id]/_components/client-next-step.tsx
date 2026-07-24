"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, Check, ChevronDown } from "lucide-react";
import { useToast } from "@ltex/ui";
import type { ClientReminder } from "./types";

/**
 * «Наступний крок» — патерн Pipedrive/Salesforce: у картці завжди видно найближчу
 * дію по клієнту. Беремо найтерміновіше НЕзавершене нагадування (найраніша
 * `snoozedUntilAt ?? remindAt`), показуємо його зверху лівої «візитки» з
 * кнопками «Виконано» / «Відкласти». Якщо активних нагадувань нема — підказуємо
 * створити (перехід на вкладку «Нагадування»).
 */

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Людський опис дати нагадування відносно сьогодні. */
function describeWhen(effective: Date): { text: string; overdue: boolean } {
  const today = startOfToday();
  const day = new Date(effective);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return {
      text: n === 1 ? "прострочено на 1 день" : `прострочено на ${n} дн.`,
      overdue: true,
    };
  }
  if (diffDays === 0) return { text: "сьогодні", overdue: true };
  if (diffDays === 1) return { text: "завтра", overdue: false };
  return {
    text: `через ${diffDays} дн. · ${effective.toLocaleDateString("uk-UA")}`,
    overdue: false,
  };
}

function goToRemindersTab() {
  if (typeof window === "undefined") return;
  window.location.hash = "reminders";
}

export function ClientNextStep({ reminders }: { reminders: ClientReminder[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  // Найтерміновіше активне нагадування = найраніша ефективна дата.
  const next = useMemo(() => {
    const active = reminders.filter((r) => !r.completedAt);
    if (active.length === 0) return null;
    return active
      .map((r) => ({
        reminder: r,
        effective: new Date(r.snoozedUntilAt ?? r.remindAt),
      }))
      .sort((a, b) => a.effective.getTime() - b.effective.getTime())[0];
  }, [reminders]);

  async function patch(body: Record<string, unknown>) {
    if (!next || busy) return;
    setBusy(true);
    setSnoozeOpen(false);
    try {
      const res = await fetch(`/api/v1/manager/reminders/${next.reminder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Не вдалося оновити",
          variant: "destructive",
        });
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function snoozeDays(days: number) {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    d.setDate(d.getDate() + days);
    void patch({ action: "snooze", snoozedUntil: d.toISOString() });
  }

  if (!next) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
          <AlarmClock className="h-3.5 w-3.5" /> Наступний крок
        </div>
        <p className="text-sm text-gray-500">Немає активних нагадувань.</p>
        <button
          type="button"
          onClick={goToRemindersTab}
          className="mt-1.5 text-sm font-medium text-blue-600 hover:underline"
        >
          + Створити нагадування
        </button>
      </div>
    );
  }

  const when = describeWhen(next.effective);

  return (
    <div
      className={
        when.overdue
          ? "rounded-xl border border-amber-200 bg-amber-50 p-3"
          : "rounded-xl border border-gray-200 bg-white p-3"
      }
    >
      <div
        className={
          when.overdue
            ? "mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-amber-700 uppercase"
            : "mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-400 uppercase"
        }
      >
        <AlarmClock className="h-3.5 w-3.5" /> Наступний крок
      </div>
      <p className="text-sm leading-snug font-medium text-gray-900">
        {next.reminder.body}
      </p>
      <p
        className={
          when.overdue
            ? "mt-0.5 text-xs font-medium text-amber-700"
            : "mt-0.5 text-xs text-gray-500"
        }
      >
        {when.text}
      </p>
      <div className="relative mt-2 flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void patch({ action: "complete" })}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Виконано
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setSnoozeOpen((v) => !v)}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Відкласти <ChevronDown className="h-3 w-3" />
        </button>
        {snoozeOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setSnoozeOpen(false)}
              role="presentation"
            />
            <div className="absolute top-8 left-16 z-20 w-36 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {[
                { label: "На завтра", days: 1 },
                { label: "На 3 дні", days: 3 },
                { label: "На тиждень", days: 7 },
              ].map((o) => (
                <button
                  key={o.days}
                  type="button"
                  onClick={() => snoozeDays(o.days)}
                  className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
