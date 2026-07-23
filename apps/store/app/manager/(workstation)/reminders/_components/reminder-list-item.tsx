"use client";

import { useState } from "react";
import { Check, CheckCircle2, Clock, Pencil, Trash2 } from "lucide-react";
import { Badge, Button, useToast } from "@ltex/ui";
import { ShareSheet } from "../../prices/_components/share-sheet";
import { openManagerTab } from "../../_components/open-manager-tab";
import { buildReminderActions } from "@/lib/manager/reminder-actions";
import { broadcastRemindersChanged } from "@/lib/manager/reminders-broadcast";
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");

  const canMutate =
    reminder.owner?.id === currentUserId || currentUserRole === "admin";
  const done = reminder.completedAt != null;
  const effectiveAt = reminder.snoozedUntilAt ?? reminder.remindAt;
  const isProduct = reminder.isProductReminder;
  const overdue =
    !done && !isProduct && new Date(effectiveAt).getTime() < Date.now();
  const periodBadge = PERIOD_BADGE[reminder.periodicity];
  const items = reminder.items ?? [];
  const actions = buildReminderActions(reminder);

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
      broadcastRemindersChanged(); // бейдж у сайдбарі оновлюється миттєво
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
      broadcastRemindersChanged();
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

  /** Фіксує в історії клієнта, що йому надіслано відеоогляд (артикул/назва/
   *  посилання/ШК/вага резолвляться на сервері). Fire-and-forget. */
  function logVideoSent() {
    void fetch(`/api/v1/manager/reminders/${reminder.id}/video-sent`, {
      method: "POST",
    }).catch(() => {});
  }

  /** Виконати контекстну дію (крім video-share, що має власний fetch).
   *  Внутрішні маршрути відкриваємо в НОВІЙ вкладці менеджерки (вкладка з
   *  нагадуваннями лишається окремо); зовнішні протоколи (tel:/viber:) — у
   *  новій вкладці браузера, щоб не затирати shell. */
  function runAction(
    kind: string,
    href: string | undefined,
    internal: boolean,
  ) {
    if (!href) return;
    // «Написати у Viber» на відео-нагадуванні = надіслали огляд → в історію.
    if (kind === "client-viber" && reminder.actionType === "viber_video") {
      logVideoSent();
    }
    if (internal) {
      openManagerTab(href);
    } else {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  /** Менеджер відкрив месенджер клієнта з вікна «Поділитися» → фіксуємо в
   *  історії клієнта «надіслано відеоогляд» + авто-закриваємо нагадування. */
  function completeAfterShare() {
    setShareOpen(false);
    logVideoSent();
    void patch({ action: "complete" });
  }

  /** Дія «Надіслати відео» — будує текст на сервері й відкриває ShareSheet. */
  async function sendViber() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/reminders/${reminder.id}/viber-message`,
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Не вдалося сформувати повідомлення");
      }
      const data = (await res.json()) as { text: string };
      setShareText(data.text);
      setShareOpen(true);
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
    <>
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
            {isProduct ? (
              <Badge variant="secondary" className="font-normal">
                Для товарів
              </Badge>
            ) : (
              <span>📅 {fmtDateTime(effectiveAt)}</span>
            )}
            {!isProduct && reminder.snoozedUntilAt && (
              <span
                title={`Оригінальна дата: ${fmtDateTime(reminder.remindAt)}`}
              >
                💤 відкладено
              </span>
            )}
            {!isProduct && periodBadge && (
              <Badge variant="secondary" className="font-normal">
                {periodBadge}
              </Badge>
            )}
            {isProduct && reminder.periodicity === "event" && (
              <Badge variant="outline" className="font-normal">
                По події
              </Badge>
            )}
            {reminder.orderVideo && (
              <Badge variant="outline" className="font-normal">
                Заказ відео
              </Badge>
            )}
            {reminder.client && <span>👤 {reminder.client.name}</span>}
          </div>

          {isProduct && items.length > 0 && (
            <ul className="mt-2 space-y-1">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={it.done}
                    disabled={!canMutate || busy}
                    onChange={() =>
                      patch({
                        action: it.done ? "uncompleteItem" : "completeItem",
                        itemId: it.id,
                      })
                    }
                    className="accent-green-600"
                    aria-label={`Виконано: ${it.productName}`}
                  />
                  <span
                    className={
                      it.done ? "text-gray-400 line-through" : "text-gray-800"
                    }
                  >
                    {it.productName}
                    <span className="text-gray-400"> ×{it.quantity}</span>
                    {it.articleCode ? (
                      <span className="ml-1 text-xs text-gray-400">
                        ({it.articleCode})
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Контекстні швидкі дії: бронь / відео / замовлення / клієнт. */}
          {!done && actions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {actions.map((a) =>
                a.kind === "video-share" ? (
                  <Button
                    key={a.kind}
                    size="sm"
                    type="button"
                    disabled={busy}
                    onClick={sendViber}
                  >
                    {a.label}
                  </Button>
                ) : (
                  <Button
                    key={a.kind}
                    size="sm"
                    type="button"
                    variant={a.kind === "open-order" ? "default" : "outline"}
                    disabled={busy}
                    onClick={() => runAction(a.kind, a.href, a.internal)}
                  >
                    {a.label}
                  </Button>
                ),
              )}
            </div>
          )}
        </div>

        {canMutate && (
          <div className="flex shrink-0 gap-1">
            {editing ? (
              <>
                <Button
                  size="sm"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    patch({ action: "edit", body: editBody.trim() })
                  }
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
                  title={isProduct ? "Виконати всі" : "Виконати"}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                {!isProduct && (
                  <>
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
              </>
            )}
          </div>
        )}
      </div>

      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Надіслати відео клієнту"
        text={shareText}
        clientPhone={reminder.client?.phone}
        onOpenedClientMessenger={completeAfterShare}
      />
    </>
  );
}
