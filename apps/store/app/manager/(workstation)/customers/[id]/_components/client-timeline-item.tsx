"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea, useToast } from "@ltex/ui";
import { formatRelativeShort } from "../../../_components/format-relative";
import type { ClientTimelineEntry } from "./types";

/**
 * Метадані типів записів історії. `auto: true` — авто-запис по нашій події
 * (read-only); `comment` — ручний запис менеджера (редагований власником/admin).
 * `lot_booking` — застаріле зняття броні (unbook).
 */
const KIND_META: Record<
  string,
  { icon: string; label: string; color: string; auto: boolean }
> = {
  order: {
    icon: "📦",
    label: "Замовлення",
    color: "text-blue-700",
    auto: true,
  },
  sale: {
    icon: "🛒",
    label: "Реалізація",
    color: "text-indigo-700",
    auto: true,
  },
  payment: { icon: "💵", label: "Оплата", color: "text-green-700", auto: true },
  bron: { icon: "🔖", label: "Бронь", color: "text-amber-700", auto: true },
  reminder: {
    icon: "⏰",
    label: "Нагадування",
    color: "text-orange-700",
    auto: true,
  },
  lot_booking: {
    icon: "🔖",
    label: "Бронь",
    color: "text-amber-700",
    auto: true,
  },
  comment: {
    icon: "💬",
    label: "Коментар",
    color: "text-gray-700",
    auto: false,
  },
  viber: { icon: "📱", label: "Viber", color: "text-purple-700", auto: true },
  sync: {
    icon: "🔄",
    label: "Оновлення",
    color: "text-gray-500",
    auto: true,
  },
  debt_correction: {
    icon: "⚖️",
    label: "Корекція боргу",
    color: "text-amber-700",
    auto: true,
  },
};

export function ClientTimelineItem({
  clientId,
  entry,
  canEdit,
  currentUserId,
  currentUserRole,
}: {
  clientId: string;
  entry: ClientTimelineEntry;
  canEdit: boolean;
  currentUserId: string;
  currentUserRole: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.body);
  const [busy, setBusy] = useState(false);

  const meta = KIND_META[entry.kind] ?? {
    icon: "•",
    label: entry.kind,
    color: "text-gray-700",
    auto: true,
  };

  // Редагувати/видалити можна лише ручний коментар, власником (або admin).
  const isManual = entry.kind === "comment";
  const isOwner =
    currentUserRole === "admin" || entry.author?.id === currentUserId;
  const canMutate = isManual && canEdit && isOwner;

  async function saveEdit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/timeline/${entry.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ body: trimmed }),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка збереження",
          variant: "destructive",
        });
        return;
      }
      setEditing(false);
      toast({ description: "Коментар оновлено" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Видалити цей коментар?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/timeline/${entry.id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка видалення",
          variant: "destructive",
        });
        return;
      }
      toast({ description: "Коментар видалено" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`flex gap-3 py-3 ${meta.auto ? "rounded bg-gray-50/60 px-2" : ""}`}
    >
      <span className="mt-0.5 text-xl" aria-hidden title={meta.label}>
        {meta.icon}
      </span>
      <div className="flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={`text-xs font-medium uppercase ${meta.color}`}>
            {meta.label}
          </span>
          {meta.auto && (
            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-500">
              авто
            </span>
          )}
          <span className="text-xs text-gray-500">
            {formatRelativeShort(entry.occurredAt)}
          </span>
          {entry.author && (
            <span className="text-xs text-gray-500">
              · {entry.author.fullName}
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-2 flex flex-col gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={2000}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={saveEdit}
                disabled={busy || draft.trim().length === 0}
              >
                {busy ? "Зберігаю…" : "Зберегти"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setDraft(entry.body);
                }}
                disabled={busy}
              >
                Скасувати
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
              {entry.body}
            </p>
            {canMutate && (
              <div className="mt-1 flex gap-3">
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-gray-800"
                  onClick={() => setEditing(true)}
                  disabled={busy}
                >
                  Редагувати
                </button>
                <button
                  type="button"
                  className="text-xs text-red-500 hover:text-red-700"
                  onClick={remove}
                  disabled={busy}
                >
                  Видалити
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
