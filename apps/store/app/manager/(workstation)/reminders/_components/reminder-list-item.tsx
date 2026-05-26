"use client";

import { useState } from "react";
import { Check, CheckCircle2, Clock, Pencil, Trash2 } from "lucide-react";
import { Badge, Button, useToast } from "@ltex/ui";
import { PERIOD_BADGE, type ReminderRow } from "./types";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  reminder: ReminderRow;
  currentUserId: string;
  currentUserRole: string;
  onChanged: () => void;
}

export function ReminderListItem({
  reminder,
  currentUserId,
  currentUserRole,
  onChanged,
}: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(reminder.body);

  const canMutate =
    reminder.owner?.id === currentUserId || currentUserRole === "admin";
  const done = reminder.completedAt != null;
  const effectiveAt = reminder.snoozedUntilAt ?? reminder.remindAt;
  const overdue = !done && new Date(effectiveAt).getTime() < Date.now();
  const periodBadge = PERIOD_BADGE[reminder.periodicity];

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/reminders/${reminder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Помилка");
      }
      setEditing(false);
      onChanged();
    } catch (e: unknown) {
      toast({
        description: e instanceof Error ? e.message : "Помилка",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Видалити нагадування?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/reminders/${reminder.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Помилка");
      }
      onChanged();
    } catch (e: unknown) {
      toast({
        description: e instanceof Error ? e.message : "Помилка",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  function snoozeTomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    void patch({ action: "snooze", snoozedUntil: d.toISOString() });
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
        done
          ? "border-gray-200 bg-white"
          : overdue
            ? "border-amber-300 bg-amber-50"
            : "border-amber-200 bg-amber-50/40"
      }`}
    >
      {done && (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
      )}
      <div className="min-w-0 flex-1">
        {editing ? (
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            maxLength={500}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-green-500 focus:outline-none"
            autoFocus
          />
        ) : (
          <p
            className={`whitespace-pre-wrap ${done ? "text-gray-500 line-through" : "text-gray-900"}`}
          >
            {reminder.body}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>📅 {fmtDateTime(effectiveAt)}</span>
          {reminder.snoozedUntilAt && (
            <span title={`Оригінальна дата: ${fmtDateTime(reminder.remindAt)}`}>
              💤 відкладено
            </span>
          )}
          {periodBadge && (
            <Badge variant="secondary" className="font-normal">
              {periodBadge}
            </Badge>
          )}
          {reminder.orderVideo && (
            <Badge variant="outline" className="font-normal">
              Заказ відео
            </Badge>
          )}
          {reminder.client && <span>👤 {reminder.client.name}</span>}
        </div>
      </div>

      {canMutate && (
        <div className="flex shrink-0 gap-1">
          {editing ? (
            <>
              <Button
                size="sm"
                type="button"
                disabled={busy}
                onClick={() => patch({ action: "edit", body: editBody.trim() })}
              >
                Зберегти
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setEditBody(reminder.body);
                }}
              >
                Скасувати
              </Button>
            </>
          ) : done ? (
            <>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => patch({ action: "uncomplete" })}
                title="Поновити"
              >
                <Clock className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={remove}
                title="Видалити"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => patch({ action: "complete" })}
                title="Виконати"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={snoozeTomorrow}
                title="Відкласти на завтра 9:00"
              >
                <Clock className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => setEditing(true)}
                title="Редагувати"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={remove}
                title="Видалити"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
