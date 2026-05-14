"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, RotateCcw, Trash2 } from "lucide-react";
import { Button, useToast } from "@ltex/ui";
import type { ClientReminder } from "./types";

interface Props {
  clientId: string;
  reminder: ClientReminder;
  currentUserId: string;
  currentUserRole: string;
  bucket: "overdue" | "today" | "upcoming" | "done";
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ClientReminderItem({
  clientId,
  reminder,
  currentUserId,
  currentUserRole,
  bucket,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const canMutate =
    reminder.owner?.id === currentUserId || currentUserRole === "admin";

  async function patch(
    action: "complete" | "uncomplete" | "snooze",
    snoozedUntil?: string,
  ) {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/manager/clients/${clientId}/reminders/${reminder.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, snoozedUntil }),
        },
      );
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Помилка");
      }
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

  async function remove() {
    if (!window.confirm("Видалити нагадування?")) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/manager/clients/${clientId}/reminders/${reminder.id}`,
        { method: "DELETE" },
      );
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Помилка");
      }
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

  function snoozeTomorrow() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    void patch("snooze", tomorrow.toISOString());
  }

  const effectiveDate = reminder.snoozedUntilAt ?? reminder.remindAt;

  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
        bucket === "overdue"
          ? "border-red-200 bg-red-50"
          : bucket === "today"
            ? "border-blue-200 bg-blue-50"
            : "border-gray-200 bg-white"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`whitespace-pre-wrap ${reminder.completedAt ? "text-gray-500 line-through" : "text-gray-900"}`}
        >
          {reminder.body}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
          <span>📅 {fmtDateTime(effectiveDate)}</span>
          {reminder.snoozedUntilAt && (
            <span title={`Оригінальна дата: ${fmtDateTime(reminder.remindAt)}`}>
              💤 відкладено
            </span>
          )}
          {reminder.owner && <span>👤 {reminder.owner.fullName}</span>}
        </div>
      </div>
      {canMutate && (
        <div className="flex shrink-0 gap-1">
          {bucket === "done" ? (
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => patch("uncomplete")}
              title="Поновити"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => patch("complete")}
                title="Виконано"
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
            </>
          )}
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
        </div>
      )}
    </div>
  );
}
