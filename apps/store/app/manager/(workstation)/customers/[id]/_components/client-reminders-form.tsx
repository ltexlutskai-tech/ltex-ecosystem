"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, useToast } from "@ltex/ui";

function isoLocalNowPlus(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  d.setSeconds(0, 0);
  // datetime-local input wants "YYYY-MM-DDTHH:mm" without seconds, у local tz
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ClientRemindersForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState(isoLocalNowPlus(1));
  const [busy, setBusy] = useState(false);

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
      const remindIso = new Date(remindAt).toISOString();
      const r = await fetch(`/api/v1/manager/clients/${clientId}/reminders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: body.trim(), remindAt: remindIso }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Помилка");
      }
      setBody("");
      setRemindAt(isoLocalNowPlus(1));
      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      toast({
        description: e instanceof Error ? e.message : "Помилка",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Створити
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border bg-white p-4 shadow-sm"
    >
      <div>
        <label htmlFor="rm-body" className="text-xs font-medium text-gray-600">
          Текст нагадування
        </label>
        <textarea
          id="rm-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={3}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Передзвонити завтра щодо нового лоту..."
          autoFocus
        />
      </div>
      <div>
        <label htmlFor="rm-at" className="text-xs font-medium text-gray-600">
          Нагадати о
        </label>
        <input
          id="rm-at"
          type="datetime-local"
          value={remindAt}
          onChange={(e) => setRemindAt(e.target.value)}
          className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Скасувати
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Збереження..." : "Зберегти"}
        </Button>
      </div>
    </form>
  );
}
