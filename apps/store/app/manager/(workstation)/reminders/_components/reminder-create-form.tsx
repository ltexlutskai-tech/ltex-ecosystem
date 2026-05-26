"use client";

import { useMemo, useState } from "react";
import { Button, useToast } from "@ltex/ui";
import { recurrenceHint } from "@/lib/manager/reminder-recurrence";
import { ReminderClientPicker } from "./reminder-client-picker";
import {
  PERIOD_OPTIONS,
  type ReminderClientPickItem,
  type ReminderPeriod,
} from "./types";

function isoLocalNowPlus(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReminderCreateForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState(isoLocalNowPlus(1));
  const [periodicity, setPeriodicity] = useState<ReminderPeriod>("none");
  const [client, setClient] = useState<ReminderClientPickItem | null>(null);
  const [busy, setBusy] = useState(false);

  const hint = useMemo(() => {
    const d = new Date(remindAt);
    if (Number.isNaN(d.getTime())) return null;
    return recurrenceHint(d, periodicity);
  }, [remindAt, periodicity]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      toast({
        description: "Текст не може бути порожнім",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/manager/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          remindAt: new Date(remindAt).toISOString(),
          periodicity,
          clientId: client?.id ?? null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Помилка");
      }
      setBody("");
      setRemindAt(isoLocalNowPlus(1));
      setPeriodicity("none");
      setClient(null);
      onCreated();
    } catch (e: unknown) {
      toast({
        description: e instanceof Error ? e.message : "Помилка",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border bg-white p-4 shadow-sm"
    >
      <div>
        <label htmlFor="rm-body" className="text-xs font-medium text-gray-600">
          Опис
        </label>
        <textarea
          id="rm-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={3}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          placeholder="Передзвонити завтра щодо нового лоту…"
        />
      </div>

      <div>
        <label htmlFor="rm-at" className="text-xs font-medium text-gray-600">
          Дата нагадування
        </label>
        <input
          id="rm-at"
          type="datetime-local"
          value={remindAt}
          onChange={(e) => setRemindAt(e.target.value)}
          className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
        />
      </div>

      <div>
        <span className="text-xs font-medium text-gray-600">Періодичність</span>
        <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
          {PERIOD_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                periodicity === opt.value
                  ? "border-green-500 bg-green-50 text-green-800"
                  : "border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="periodicity"
                value={opt.value}
                checked={periodicity === opt.value}
                onChange={() => setPeriodicity(opt.value)}
                className="accent-green-600"
              />
              {opt.label}
            </label>
          ))}
        </div>
        {hint && <p className="mt-1.5 text-xs text-green-700">{hint}</p>}
      </div>

      <ReminderClientPicker value={client} onChange={setClient} />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={busy}
        >
          Скасувати
        </Button>
        <Button
          type="submit"
          disabled={busy}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {busy ? "Збереження…" : "Встановити нагадування"}
        </Button>
      </div>
    </form>
  );
}
