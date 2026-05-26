"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";
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

type ReminderKind = "regular" | "product";

interface ProductPick {
  id: string;
  name: string;
  articleCode: string | null;
  code1C: string | null;
}

interface ProductRow {
  productId: string;
  name: string;
  articleCode: string | null;
  quantity: number;
}

/** Інлайн-пошук товару для додавання у чек-лист (реюз products/search). */
function ProductSearchAdd({
  onPick,
  disabledIds,
}: {
  onPick: (p: ProductPick) => void;
  disabledIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ProductPick[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open || debounced.length < 2) {
      setResults([]);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetch(
      `/api/v1/manager/products/search?q=${encodeURIComponent(debounced)}`,
      {
        signal: controller.signal,
      },
    )
      .then((r) => r.json())
      .then((json: { items: ProductPick[] }) => setResults(json.items ?? []))
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") {
          console.warn("[ProductSearchAdd] search failed", e);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debounced, open]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          type="search"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Додати товар за назвою, артикулом або кодом…"
          className="pl-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Очистити"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="max-h-64 overflow-y-auto rounded-md border bg-white shadow-sm">
          {loading && <div className="p-3 text-sm text-gray-500">Пошук…</div>}
          {!loading && debounced.length < 2 && (
            <div className="p-3 text-xs text-gray-400">
              Введіть мінімум 2 символи
            </div>
          )}
          {!loading && debounced.length >= 2 && results.length === 0 && (
            <div className="p-3 text-sm text-gray-500">Нічого не знайдено</div>
          )}
          <ul>
            {results.map((p) => {
              const already = disabledIds.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => {
                      onPick(p);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="text-sm font-medium text-gray-900">
                      {p.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {p.articleCode ?? "—"}
                      {p.code1C ? ` · ${p.code1C}` : ""}
                      {already ? " · вже додано" : ""}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ReminderCreateForm({
  onCreated,
  onCancel,
  fixedClientId,
  fixedClientName,
}: {
  onCreated: () => void;
  onCancel: () => void;
  /**
   * Режим вкладки картки клієнта — контрагент прив'язаний наперед: пікер
   * приховано, обидва типи нагадувань POST-ять цей `clientId`.
   */
  fixedClientId?: string;
  fixedClientName?: string;
}) {
  const { toast } = useToast();
  const [kind, setKind] = useState<ReminderKind>("regular");
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState(isoLocalNowPlus(1));
  const [periodicity, setPeriodicity] = useState<ReminderPeriod>("none");
  const fixedClient: ReminderClientPickItem | null = fixedClientId
    ? {
        id: fixedClientId,
        name: fixedClientName ?? "",
        tradePointName: null,
        city: null,
        code1C: null,
        isOwned: true,
        agent: null,
      }
    : null;
  const [client, setClient] = useState<ReminderClientPickItem | null>(
    fixedClient,
  );
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [busy, setBusy] = useState(false);

  const hint = useMemo(() => {
    const d = new Date(remindAt);
    if (Number.isNaN(d.getTime())) return null;
    return recurrenceHint(d, periodicity);
  }, [remindAt, periodicity]);

  const rowIds = useMemo(() => new Set(rows.map((r) => r.productId)), [rows]);

  function addProduct(p: ProductPick) {
    setRows((prev) =>
      prev.some((r) => r.productId === p.id)
        ? prev
        : [
            ...prev,
            {
              productId: p.id,
              name: p.name,
              articleCode: p.articleCode,
              quantity: 1,
            },
          ],
    );
  }

  function setRowQty(productId: string, qty: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.productId === productId
          ? { ...r, quantity: Number.isFinite(qty) && qty >= 1 ? qty : 1 }
          : r,
      ),
    );
  }

  function removeRow(productId: string) {
    setRows((prev) => prev.filter((r) => r.productId !== productId));
  }

  async function submitRegular() {
    if (!body.trim()) {
      toast({
        description: "Текст не може бути порожнім",
        variant: "destructive",
      });
      return;
    }
    await post({
      body: body.trim(),
      remindAt: new Date(remindAt).toISOString(),
      periodicity,
      clientId: client?.id ?? null,
    });
  }

  async function submitProduct() {
    if (!client) {
      toast({ description: "Оберіть клієнта", variant: "destructive" });
      return;
    }
    if (rows.length === 0) {
      toast({
        description: "Додайте хоча б один товар",
        variant: "destructive",
      });
      return;
    }
    await post({
      isProductReminder: true,
      clientId: client.id,
      body: body.trim() || undefined,
      items: rows.map((r) => ({
        productId: r.productId,
        quantity: r.quantity,
      })),
    });
  }

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/manager/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Помилка");
      }
      const data = (await res.json().catch(() => ({}))) as {
        skippedProductIds?: string[];
      };
      if (data.skippedProductIds && data.skippedProductIds.length > 0) {
        toast({
          description: `Деякі товари вже були в активних нагадуваннях і пропущені (${data.skippedProductIds.length})`,
        });
      }
      setBody("");
      setRemindAt(isoLocalNowPlus(1));
      setPeriodicity("none");
      setClient(fixedClient);
      setRows([]);
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "product") void submitProduct();
    else void submitRegular();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border bg-white p-4 shadow-sm"
    >
      {/* Перемикач типу */}
      <div className="grid grid-cols-2 gap-1 rounded-md border border-gray-200 p-1">
        {(
          [
            { value: "regular", label: "Звичайне" },
            { value: "product", label: "Для товарів" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setKind(opt.value)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              kind === opt.value
                ? "bg-green-600 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="rm-body" className="text-xs font-medium text-gray-600">
          Опис{kind === "product" ? " (необов'язково)" : ""}
        </label>
        <textarea
          id="rm-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={kind === "product" ? 2 : 3}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          placeholder={
            kind === "product"
              ? "Напр.: нагадати про надходження…"
              : "Передзвонити завтра щодо нового лоту…"
          }
        />
      </div>

      {kind === "regular" && (
        <>
          <div>
            <label
              htmlFor="rm-at"
              className="text-xs font-medium text-gray-600"
            >
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
            <span className="text-xs font-medium text-gray-600">
              Періодичність
            </span>
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
        </>
      )}

      {fixedClientId ? (
        <div className="space-y-1">
          <span className="text-xs font-medium text-gray-600">Контрагент</span>
          <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">
            {fixedClientName ?? "—"}
          </div>
        </div>
      ) : (
        <ReminderClientPicker
          value={client}
          onChange={setClient}
          required={kind === "product"}
        />
      )}

      {kind === "product" && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-600">Товари</span>
          <ProductSearchAdd onPick={addProduct} disabledIds={rowIds} />
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">
              Поки товарів не додано. Скористайтеся пошуком вище.
            </p>
          ) : (
            <div className="divide-y rounded-md border bg-white">
              {rows.map((r) => (
                <div
                  key={r.productId}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {r.name}
                    </div>
                    {r.articleCode && (
                      <div className="truncate text-xs text-gray-500">
                        {r.articleCode}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="sr-only" htmlFor={`qty-${r.productId}`}>
                      Кількість
                    </label>
                    <Input
                      id={`qty-${r.productId}`}
                      type="number"
                      min="1"
                      step="1"
                      value={String(r.quantity)}
                      onChange={(e) =>
                        setRowQty(
                          r.productId,
                          Number.parseInt(e.target.value, 10),
                        )
                      }
                      className="h-8 w-16 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(r.productId)}
                    className="text-gray-400 hover:text-red-600"
                    aria-label="Прибрати товар"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          {busy ? (
            "Збереження…"
          ) : (
            <>
              <Plus className="mr-1 h-4 w-4" />
              {kind === "product"
                ? "Створити нагадування"
                : "Встановити нагадування"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
