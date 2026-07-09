"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Archive, Link2, Trash2, X } from "lucide-react";
import type { DeletionRequestListItem } from "@/lib/manager/deletion-queue";
import { entityHref, entityTypeLabel } from "./entity-labels";

interface Blocker {
  label: string;
  count: number;
}
interface ReferencesResult {
  found: boolean;
  canHardDelete: boolean;
  isHistorical1C: boolean;
  blockers: Blocker[];
}

const PAGE_SIZE = 50;

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA");
}

export function DeletionsClient({
  items,
  total,
  page,
}: {
  items: DeletionRequestListItem[];
  total: number;
  page: number;
}) {
  const [active, setActive] = useState<DeletionRequestListItem | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-white p-8 text-center text-sm text-gray-500">
        Немає запитів на вилучення.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2 font-medium">Тип</th>
              <th className="px-3 py-2 font-medium">Обʼєкт</th>
              <th className="px-3 py-2 font-medium">Хто</th>
              <th className="px-3 py-2 font-medium">Коли</th>
              <th className="px-3 py-2 font-medium">Причина</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const href = entityHref(r.entityType, r.entityId);
              return (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {entityTypeLabel(r.entityType)}
                    {r.dictType ? (
                      <span className="text-gray-400"> · {r.dictType}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {href ? (
                      <Link
                        href={href}
                        className="font-medium text-green-700 hover:underline"
                      >
                        {r.entityLabel}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-800">
                        {r.entityLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {r.requestedByName ?? "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                    {fmtDateTime(r.requestedAt)}
                  </td>
                  <td className="px-3 py-2 max-w-xs text-gray-700">
                    {r.reason}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusBadge status={r.status} outcome={r.outcome} />
                    {r.resolutionNote && (
                      <div className="mt-1 max-w-xs text-xs text-gray-400">
                        {r.resolutionNote}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => setActive(r)}
                        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Розглянути
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {fmtDateTime(r.resolvedAt)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} />}

      {active && <ReviewDialog item={active} onClose={() => setActive(null)} />}
    </>
  );
}

function StatusBadge({
  status,
  outcome,
}: {
  status: string;
  outcome: string | null;
}) {
  if (status === "pending") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Очікує
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        Відхилено
      </span>
    );
  }
  // approved
  return (
    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      {outcome === "archived" ? "Архів" : "Видалено"}
    </span>
  );
}

function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const go = (p: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(p));
    router.push(`/manager/admin/deletions?${params.toString()}`);
  };
  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 disabled:opacity-40"
      >
        Назад
      </button>
      <span className="text-gray-500">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 disabled:opacity-40"
      >
        Далі
      </button>
    </div>
  );
}

// ── Модалка розгляду запиту ───────────────────────────────────────────────

type Mode = "review" | "confirm-approve" | "reject";

function ReviewDialog({
  item,
  onClose,
}: {
  item: DeletionRequestListItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<Mode>("review");
  const [refs, setRefs] = useState<ReferencesResult | null>(null);
  const [refsLoading, setRefsLoading] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    outcome: "deleted" | "archived";
    blockers: Blocker[];
  } | null>(null);

  useEffect(() => setMounted(true), []);

  // Завантажити прев'ю звʼязків одразу.
  useEffect(() => {
    let cancelled = false;
    setRefsLoading(true);
    fetch(`/api/v1/manager/deletions/${item.id}/references`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ReferencesResult | null) => {
        if (!cancelled) setRefs(data);
      })
      .catch(() => {
        if (!cancelled) setRefs(null);
      })
      .finally(() => {
        if (!cancelled) setRefsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const close = useCallback(() => {
    if (busy) return;
    if (done) router.refresh();
    onClose();
  }, [busy, done, onClose, router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  const approve = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/deletions/${item.id}/approve`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        outcome?: "deleted" | "archived";
        blockers?: Blocker[];
        error?: string;
      } | null;
      if (res.ok && data?.ok) {
        setDone({
          outcome: data.outcome ?? "deleted",
          blockers: data.blockers ?? [],
        });
        setBusy(false);
        return;
      }
      setError(data?.error ?? "Не вдалося виконати");
      setBusy(false);
    } catch {
      setError("Помилка мережі");
      setBusy(false);
    }
  }, [item.id]);

  const reject = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/deletions/${item.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (res.ok && data?.ok) {
        setBusy(false);
        router.refresh();
        onClose();
        return;
      }
      setError(data?.error ?? "Не вдалося відхилити");
      setBusy(false);
    } catch {
      setError("Помилка мережі");
      setBusy(false);
    }
  }, [item.id, note, router, onClose]);

  if (!mounted) return null;

  const canHardDelete = refs?.canHardDelete ?? false;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={close}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {entityTypeLabel(item.entityType)}: {item.entityLabel}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Позначив: {item.requestedByName ?? "—"} ·{" "}
              {fmtDateTime(item.requestedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Закрити"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <span className="text-gray-500">Причина:</span> {item.reason}
        </div>

        {/* Результат виконаної дії */}
        {done ? (
          <div className="mt-4">
            <div
              className={
                done.outcome === "archived"
                  ? "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  : "rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
              }
            >
              {done.outcome === "archived" ? (
                <>
                  <Archive className="mr-1 inline h-4 w-4" />
                  Перенесено в архів, бо є посилання
                  {done.blockers.length > 0 && (
                    <span>
                      {": "}
                      {done.blockers
                        .map((b) => `${b.label} (${b.count})`)
                        .join(", ")}
                    </span>
                  )}
                  . Дані збережено.
                </>
              ) : (
                <>
                  <Trash2 className="mr-1 inline h-4 w-4" />
                  Видалено остаточно.
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={close}
                className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900"
              >
                Готово
              </button>
            </div>
          </div>
        ) : mode === "reject" ? (
          <div className="mt-4">
            <label className="text-sm text-gray-700">
              Коментар (необовʼязково):
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Чому повертаємо обʼєкт користувачу…"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
            {error && (
              <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode("review")}
                disabled={busy}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Назад
              </button>
              <button
                type="button"
                onClick={() => void reject()}
                disabled={busy}
                className="rounded-md bg-gray-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {busy ? "Відхилення…" : "Відхилити"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Прев'ю звʼязків */}
            <div className="mt-4">
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <Link2 className="h-4 w-4" />
                Звʼязки обʼєкта
              </div>
              {refsLoading ? (
                <p className="mt-2 text-sm text-gray-400">Перевірка…</p>
              ) : !refs ? (
                <p className="mt-2 text-sm text-gray-400">
                  Не вдалося перевірити звʼязки.
                </p>
              ) : canHardDelete ? (
                <p className="mt-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  Посилань немає. Обʼєкт можна видалити остаточно.
                </p>
              ) : (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Не можна видалити остаточно — буде перенесено в архів.
                  </div>
                  {refs.isHistorical1C && (
                    <p className="mt-1 text-xs">Історичний запис 1С.</p>
                  )}
                  {refs.blockers.length > 0 && (
                    <ul className="mt-1 list-inside list-disc text-xs">
                      {refs.blockers.map((b) => (
                        <li key={b.label}>
                          {b.label}: {b.count}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {mode === "confirm-approve" && canHardDelete && (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Це остаточне видалення. Скасувати неможливо. Підтвердити?
              </p>
            )}
            {error && (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode("reject")}
                disabled={busy}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Відхилити
              </button>
              {mode === "confirm-approve" || !canHardDelete ? (
                <button
                  type="button"
                  onClick={() => void approve()}
                  disabled={busy || refsLoading}
                  className={
                    canHardDelete
                      ? "rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      : "rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  }
                >
                  {busy
                    ? "Виконання…"
                    : canHardDelete
                      ? "Так, видалити остаточно"
                      : "Перенести в архів"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode("confirm-approve")}
                  disabled={busy || refsLoading}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Видалити остаточно
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
