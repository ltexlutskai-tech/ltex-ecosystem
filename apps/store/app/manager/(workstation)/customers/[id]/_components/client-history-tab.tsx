"use client";

import { useEffect, useState } from "react";
import { Input } from "@ltex/ui";
import { ClientHistoryCommentForm } from "./client-history-comment-form";
import { ClientTimelineItem } from "./client-timeline-item";
import type { ClientTimelineEntry } from "./types";

/** Типи подій для фільтра «Тип» (порядок — від найчастіших). */
const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Усі типи" },
  { value: "comment", label: "💬 Коментар" },
  { value: "order", label: "📦 Замовлення" },
  { value: "sale", label: "🛒 Реалізація" },
  { value: "payment", label: "💵 Оплата" },
  { value: "bron", label: "🔖 Бронь" },
  { value: "reminder", label: "⏰ Нагадування" },
  { value: "debt_correction", label: "⚖️ Корекція боргу" },
  { value: "note_1c", label: "📝 Запис (1С)" },
];

export function ClientHistoryTab({
  clientId,
  timeline,
  canEdit,
  currentUserId,
  currentUserRole,
}: {
  clientId: string;
  timeline: ClientTimelineEntry[];
  canEdit: boolean;
  currentUserId: string;
  currentUserRole: string;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entries, setEntries] = useState<ClientTimelineEntry[]>(timeline);
  const [loading, setLoading] = useState(false);
  const [filtered, setFiltered] = useState(false);

  const hasFilter =
    search.trim() !== "" || kind !== "" || from !== "" || to !== "";

  // Без фільтра — тримаємо синхронізацію з серверним списком (router.refresh
  // після додавання коментаря оновлює prop).
  useEffect(() => {
    if (!hasFilter) setEntries(timeline);
  }, [timeline, hasFilter]);

  // З фільтром — тягнемо з API (шукає по ВСІЙ історії, не лише перших 50).
  useEffect(() => {
    if (!hasFilter) {
      setFiltered(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams();
        if (search.trim()) sp.set("search", search.trim());
        if (kind) sp.set("kind", kind);
        if (from) sp.set("from", from);
        if (to) sp.set("to", to);
        sp.set("pageSize", "100");
        const res = await fetch(
          `/api/v1/manager/clients/${clientId}/timeline?${sp.toString()}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            entries?: ClientTimelineEntry[];
          };
          setEntries(data.entries ?? []);
          setFiltered(true);
        }
      } catch {
        // мовчазна деградація — лишаємо попередній список
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, kind, from, to, hasFilter, clientId]);

  function clearFilters() {
    setSearch("");
    setKind("");
    setFrom("");
    setTo("");
  }

  return (
    <div className="space-y-4 rounded-lg border bg-white p-5 shadow-sm">
      <ClientHistoryCommentForm clientId={clientId} />

      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs text-gray-500">
            Пошук у історії
          </label>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Текст запису…"
            className="h-8"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Тип</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-8 rounded-md border px-2 text-sm"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Від</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 rounded-md border px-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">До</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 rounded-md border px-2 text-sm"
          />
        </div>
        {hasFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="h-8 rounded-md border px-3 text-sm text-gray-600 hover:bg-gray-50"
          >
            Скинути
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Завантаження…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">
          {hasFilter
            ? "Нічого не знайдено за цим фільтром."
            : "Жодного запису в історії взаємодій ще немає. Додайте перший коментар вище."}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <ClientTimelineItem
              key={entry.id}
              clientId={clientId}
              entry={entry}
              canEdit={canEdit}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          ))}
        </ul>
      )}

      {filtered && !loading && entries.length > 0 && (
        <p className="text-xs text-gray-400">
          Показано за фільтром (до 100 записів).
        </p>
      )}
    </div>
  );
}
