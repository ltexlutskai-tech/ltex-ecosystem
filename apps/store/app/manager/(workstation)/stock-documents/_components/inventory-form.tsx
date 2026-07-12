"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDocumentAutosave } from "@/lib/autosave/use-document-autosave";
import { AutosaveStatus } from "../../_components/autosave-status";
import { BarcodeInput } from "../../sales/new/_components/barcode-input";
import {
  findRowIndexByBarcode,
  rowStatus,
  summarizeInventory,
  unitLabel,
  warehouseLotToRow,
  type InvRow,
  type RowStatus,
  type WarehouseLot,
} from "@/lib/manager/inventory";

/**
 * Інвентаризація товарів на складі — щільна таблична форма (по мішках).
 *
 * Три способи набрати документ (комбінуються):
 *  1. «Заповнити зі складу» — підтягує ВСІ мішки на складі (Облік=1, Факт=0);
 *  2. «Додати позицію» — додає мішки конкретного товару (часткова звірка);
 *  3. Скан ШК — позначає мішок знайденим (Факт=1), а якщо його нема в списку —
 *     додає як надлишок.
 *
 * Документ лише ЗВІРЯЄ облік↔факт (залишків не рухає). Нестачу списують і
 * надлишок оприбутковують окремими документами «на підставі інвентаризації».
 */

interface ProductHit {
  id: string;
  name: string;
  articleCode: string | null;
}

export interface InventoryFormInitialRow {
  lotId: string | null;
  productId: string | null;
  productName: string;
  articleCode: string;
  barcode: string;
  sector: string;
  quality: string;
  weight: number;
  unitName: string;
  priceEur: number;
  qtyAccounting: number;
  qtyActual: number;
}

export interface InventoryFormInitial {
  id: string;
  docDate: string;
  notes: string;
  rows: InventoryFormInitialRow[];
}

let rowSeq = 0;
function nextKey(): string {
  rowSeq += 1;
  return `iv${rowSeq}`;
}

function initialToRow(r: InventoryFormInitialRow): InvRow {
  return { ...r, key: nextKey() };
}

type Filter = "all" | "found" | "missing" | "surplus" | "diff";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Усі" },
  { key: "found", label: "Знайдені" },
  { key: "missing", label: "Не знайдені" },
  { key: "surplus", label: "Надлишки" },
  { key: "diff", label: "Розбіжності" },
];

/** Чи рядок проходить активний фільтр. */
function passesFilter(row: InvRow, filter: Filter): boolean {
  const st = rowStatus(row);
  switch (filter) {
    case "all":
      return true;
    case "found":
      return row.qtyActual > 0;
    case "missing":
      return st === "missing";
    case "surplus":
      return st === "surplus";
    case "diff":
      return st === "missing" || st === "surplus";
  }
}

const STATUS_ROW_CLASS: Record<RowStatus, string> = {
  matched: "bg-emerald-50/70",
  surplus: "bg-sky-50",
  missing: "",
  empty: "",
};

export function InventoryForm({ initial }: { initial?: InventoryFormInitial }) {
  const router = useRouter();
  const [docDate, setDocDate] = useState(
    initial ? initial.docDate : new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [rows, setRows] = useState<InvRow[]>(
    initial ? initial.rows.map(initialToRow) : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: string; text: string } | null>(
    null,
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loadingStock, setLoadingStock] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);

  // Пошук товару для «Додати позицію».
  const [prodQuery, setProdQuery] = useState("");
  const [prodHits, setProdHits] = useState<ProductHit[]>([]);
  const [prodOpen, setProdOpen] = useState(false);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showFlash(tone: string, text: string) {
    setFlash({ tone, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }

  const summary = useMemo(() => summarizeInventory(rows), [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!passesFilter(r, filter)) return false;
      if (!q) return true;
      return (
        r.barcode.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.articleCode.toLowerCase().includes(q) ||
        r.sector.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search]);

  // ─── Autosave (чернетка, банер відновлення вимкнено глобально) ───
  const draftData = useMemo(
    () => ({ docDate, notes, rows }),
    [docDate, notes, rows],
  );
  type DraftData = typeof draftData;

  const hasContent = rows.length > 0 || notes.trim() !== "";

  function buildPayload(d: DraftData): Record<string, unknown> {
    const items = d.rows
      .filter(
        (r) =>
          r.qtyAccounting > 0 || r.qtyActual > 0 || r.barcode || r.productId,
      )
      .map((r) => ({
        productId: r.productId,
        barcode: r.barcode || null,
        lotId: r.lotId,
        productName: r.productName || null,
        articleCode: r.articleCode || null,
        weight: r.weight || 0,
        sector: r.sector || null,
        unitName: r.unitName || null,
        quality: r.quality || null,
        priceEur: r.priceEur || 0,
        qtyAccounting: r.qtyAccounting,
        qtyActual: r.qtyActual,
      }));
    return { docDate: d.docDate, notes: d.notes || null, items };
  }

  const createDraftServer = useCallback(
    async (d: DraftData): Promise<string> => {
      const res = await fetch(`/api/v1/manager/stock-documents/inventories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(d), draft: true }),
      });
      if (!res.ok) throw new Error(`draft create ${res.status}`);
      const j = (await res.json()) as { id: string };
      return j.id;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const updateDraftServer = useCallback(
    async (id: string, d: DraftData): Promise<void> => {
      const res = await fetch(
        `/api/v1/manager/stock-documents/inventories/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...buildPayload(d), draft: true }),
        },
      );
      if (!res.ok) throw new Error(`draft update ${res.status}`);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const autosave = useDocumentAutosave<DraftData>({
    docType: "stock-inventories",
    existingId: initial?.id ?? null,
    data: draftData,
    canCreateDraft: hasContent,
    // Велика таблиця (сотні мішків) → рідший запис у БД, щоб не смикати мережу.
    serverDebounceMs: 3500,
    createDraft: createDraftServer,
    updateDraft: updateDraftServer,
    onIdAssigned: (id) => {
      setSavedId(id);
      window.history.replaceState(
        null,
        "",
        `/manager/stock-documents/inventories/${id}`,
      );
    },
  });

  // ─── Мутатори рядків ───
  function markFoundByIndex(idx: number) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, qtyActual: 1 } : r)));
  }

  function toggleActual(key: string) {
    setRows((rs) =>
      rs.map((r) =>
        r.key === key ? { ...r, qtyActual: r.qtyActual > 0 ? 0 : 1 } : r,
      ),
    );
  }

  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  function updateRow(key: string, patch: Partial<InvRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function fillFromWarehouse() {
    setLoadingStock(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/manager/stock-documents/inventories/warehouse-stock`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        rows: WarehouseLot[];
        truncated: boolean;
      };
      applyWarehouseLots(data.rows);
      showFlash(
        "emerald",
        `Підтягнуто мішків зі складу: ${data.rows.length}${
          data.truncated ? " (показано перші 5000)" : ""
        }`,
      );
    } catch {
      setError("Не вдалося завантажити залишки складу");
    } finally {
      setLoadingStock(false);
    }
  }

  /** Спільне застосування набору мішків (fill / add-position). */
  function applyWarehouseLots(lots: WarehouseLot[]) {
    setRows((prev) => {
      const byCode = new Map<string, number>();
      prev.forEach((r, i) => {
        const c = r.barcode.trim();
        if (c) byCode.set(c, i);
      });
      const next = prev.map((r) => ({ ...r }));
      for (const lot of lots) {
        const code = lot.barcode.trim();
        const idx = code ? byCode.get(code) : undefined;
        if (idx != null) {
          const r = next[idx];
          if (r) {
            r.qtyAccounting = 1;
            if (!r.productName) r.productName = lot.productName;
            if (!r.articleCode) r.articleCode = lot.articleCode ?? "";
            if (!r.sector) r.sector = lot.sector ?? "";
            if (!r.quality) r.quality = lot.quality ?? "";
            if (!r.weight) r.weight = lot.weight;
            if (!r.unitName) r.unitName = lot.unitName;
            if (!r.priceEur) r.priceEur = lot.priceEur;
            if (!r.lotId) r.lotId = lot.lotId;
            if (!r.productId) r.productId = lot.productId;
          }
        } else {
          const row = warehouseLotToRow(lot, nextKey());
          next.push(row);
          if (code) byCode.set(code, next.length - 1);
        }
      }
      return next;
    });
  }

  // ─── Скан ШК ───
  async function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setError(null);
    const idx = findRowIndexByBarcode(rows, trimmed);
    if (idx >= 0) {
      const existing = rows[idx];
      if (existing && existing.qtyActual > 0) {
        showFlash(
          "amber",
          `Вже відскановано: ${existing.productName || trimmed}`,
        );
      } else {
        markFoundByIndex(idx);
        showFlash("emerald", `✓ Знайдено: ${existing?.productName || trimmed}`);
      }
      return;
    }
    // Немає в списку — резолвимо лот, додаємо як надлишок (Облік=0, Факт=1).
    try {
      const res = await fetch(
        `/api/v1/manager/lots/by-barcode?code=${encodeURIComponent(trimmed)}`,
      );
      if (res.ok) {
        const data = await res.json();
        const surplus: InvRow = {
          key: nextKey(),
          lotId: data.lot?.id ?? null,
          productId: data.product?.id ?? null,
          productName: data.product?.name ?? "",
          articleCode: data.product?.articleCode ?? "",
          barcode: trimmed,
          sector: "",
          quality: "",
          weight: data.lot?.weight ?? 0,
          unitName: unitLabel(data.product?.priceUnit),
          priceEur: data.lot?.priceEur ?? 0,
          qtyAccounting: 0,
          qtyActual: 1,
        };
        setRows((rs) => [surplus, ...rs]);
        showFlash("sky", `➕ Надлишок: ${surplus.productName || trimmed}`);
      } else {
        const unknown: InvRow = {
          key: nextKey(),
          lotId: null,
          productId: null,
          productName: "",
          articleCode: "",
          barcode: trimmed,
          sector: "",
          quality: "",
          weight: 0,
          unitName: "шт",
          priceEur: 0,
          qtyAccounting: 0,
          qtyActual: 1,
        };
        setRows((rs) => [unknown, ...rs]);
        showFlash("sky", `➕ Невідомий ШК додано: ${trimmed}`);
      }
    } catch {
      setError("Помилка пошуку мішка за ШК");
    }
  }

  // ─── Пошук товару (Додати позицію) ───
  async function searchProducts(q: string) {
    setProdQuery(q);
    if (q.trim().length < 2) {
      setProdHits([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/manager/products/search?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      setProdHits(Array.isArray(data.items) ? data.items.slice(0, 10) : []);
    } catch {
      setProdHits([]);
    }
  }

  async function addProductBags(hit: ProductHit) {
    setProdOpen(false);
    setProdQuery("");
    setProdHits([]);
    try {
      const res = await fetch(
        `/api/v1/manager/stock-documents/inventories/warehouse-stock?productId=${encodeURIComponent(hit.id)}`,
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { rows: WarehouseLot[] };
      if (data.rows.length === 0) {
        showFlash("amber", `У «${hit.name}» немає мішків на складі`);
        return;
      }
      applyWarehouseLots(data.rows);
      showFlash("emerald", `Додано мішків «${hit.name}»: ${data.rows.length}`);
    } catch {
      setError("Не вдалося додати мішки товару");
    }
  }

  function clearRows() {
    setRows([]);
    setFilter("all");
    setSearch("");
  }

  // ─── Збереження / проведення ───
  async function save(thenPost: boolean) {
    setBusy(true);
    setError(null);
    try {
      autosave.clearAll();
      const usePatch = savedId != null;
      const url = usePatch
        ? `/api/v1/manager/stock-documents/inventories/${savedId}`
        : `/api/v1/manager/stock-documents/inventories`;
      const res = await fetch(url, {
        method: usePatch ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(draftData)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      const { id } = (await res.json()) as { id: string };
      setSavedId(id);
      if (thenPost) {
        const postRes = await fetch(
          `/api/v1/manager/stock-documents/inventories/${id}/post`,
          { method: "POST" },
        );
        if (!postRes.ok) {
          const data = await postRes.json().catch(() => ({}));
          setError(
            `Збережено, але не проведено: ${data.error ?? postRes.status}`,
          );
        }
      }
      router.push(`/manager/stock-documents/inventories/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setBusy(false);
    }
  }

  const flashTone =
    flash?.tone === "emerald"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : flash?.tone === "sky"
        ? "border-sky-300 bg-sky-50 text-sky-800"
        : "border-amber-300 bg-amber-50 text-amber-800";

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Шапка */}
      <div className="rounded-md border bg-white p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Дата</span>
            <input
              type="date"
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block sm:col-span-1 lg:col-span-2">
            <span className="mb-1 block text-xs text-gray-500">Коментар</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="напр. Інвентаризація 2025/2026"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>

      {/* Панель дій */}
      <div className="rounded-md border bg-white p-3">
        <div className="mb-2">
          <BarcodeInput onCode={(c) => void handleScan(c)} />
        </div>
        {flash && (
          <div
            className={`mb-2 rounded-md border px-3 py-1.5 text-sm ${flashTone}`}
          >
            {flash.text}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void fillFromWarehouse()}
            disabled={loadingStock}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          >
            {loadingStock ? "Завантаження…" : "⭳ Заповнити зі складу"}
          </button>

          {/* Додати позицію (мішки товару) */}
          <div className="relative">
            <input
              value={prodQuery}
              onFocus={() => setProdOpen(true)}
              onChange={(e) => {
                setProdOpen(true);
                void searchProducts(e.target.value);
              }}
              placeholder="+ Додати позицію (товар)…"
              className="w-56 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            {prodOpen && prodHits.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-56 w-72 overflow-auto rounded-md border bg-white shadow">
                {prodHits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => void addProductBags(h)}
                    className="block w-full px-2 py-1.5 text-left text-sm hover:bg-emerald-50"
                  >
                    {h.name}
                    {h.articleCode ? (
                      <span className="ml-1 text-xs text-gray-400">
                        {h.articleCode}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <button
              type="button"
              onClick={clearRows}
              className="ml-auto rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Очистити список
            </button>
          )}
        </div>
      </div>

      {/* Фільтри + пошук */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === f.key
                  ? "bg-gray-800 text-white"
                  : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук у списку (ШК / назва / артикул / сектор)…"
          className="ml-auto w-64 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      {/* Таблиця */}
      <div className="rounded-md border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-100 text-left uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-8 px-2 py-1.5">№</th>
                <th className="px-2 py-1.5">Артикул</th>
                <th className="px-2 py-1.5">Номенклатура</th>
                <th className="px-2 py-1.5">ШК</th>
                <th className="px-2 py-1.5">Сектор</th>
                <th className="px-2 py-1.5">Якість</th>
                <th className="px-2 py-1.5 text-right">Вага</th>
                <th className="px-2 py-1.5">Ед</th>
                <th className="px-2 py-1.5 text-right">Облік</th>
                <th className="px-2 py-1.5 text-center">Факт</th>
                <th className="px-2 py-1.5 text-right">Відхил.</th>
                <th className="px-2 py-1.5 text-right">Ціна €</th>
                <th className="px-2 py-1.5 text-right">Сума €</th>
                <th className="w-8 px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.length === 0 && (
                <tr>
                  <td
                    colSpan={14}
                    className="px-3 py-8 text-center text-gray-400"
                  >
                    {rows.length === 0
                      ? "Порожньо. Натисніть «Заповнити зі складу», додайте позицію або скануйте ШК."
                      : "Немає рядків за фільтром."}
                  </td>
                </tr>
              )}
              {visibleRows.map((r, idx) => {
                const st = rowStatus(r);
                const diff = r.qtyActual - r.qtyAccounting;
                const found = r.qtyActual > 0;
                return (
                  <tr key={r.key} className={STATUS_ROW_CLASS[st]}>
                    <td className="px-2 py-1 text-gray-400">{idx + 1}</td>
                    <td className="px-2 py-1 font-mono text-gray-700">
                      {r.articleCode || "—"}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-2 py-1"
                      title={r.productName}
                    >
                      {r.productName || (
                        <span className="text-gray-400">Невідомий товар</span>
                      )}
                    </td>
                    <td className="px-2 py-1 font-mono text-gray-500">
                      {r.barcode || "—"}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={r.sector}
                        onChange={(e) =>
                          updateRow(r.key, { sector: e.target.value })
                        }
                        className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-gray-300 focus:border-gray-300"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-2 py-1 text-gray-600">
                      {r.quality || "—"}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {r.weight ? r.weight.toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-1 text-gray-500">
                      {r.unitName || "шт"}
                    </td>
                    <td className="px-2 py-1 text-right text-gray-600">
                      {r.qtyAccounting}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => toggleActual(r.key)}
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          found
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                        }`}
                        title={
                          found
                            ? "Знайдено — клік прибрати"
                            : "Позначити знайденим"
                        }
                      >
                        {found ? "✓ Є" : "— Нема"}
                      </button>
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-medium ${
                        diff > 0
                          ? "text-sky-700"
                          : diff < 0
                            ? "text-amber-700"
                            : "text-gray-400"
                      }`}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td className="px-2 py-1 text-right text-gray-600">
                      {r.priceEur ? r.priceEur.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-1 text-right text-gray-700">
                      {(r.priceEur * r.qtyActual).toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(r.key)}
                        className="text-red-400 hover:text-red-600"
                        title="Видалити рядок"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Зведення */}
      <div className="grid gap-2 rounded-md border bg-white p-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Cell label="Найменувань" value={String(summary.rows)} />
        <Cell
          label="Відскановано"
          value={String(summary.found)}
          tone="emerald"
        />
        <Cell
          label="Нестача"
          value={`${summary.missing} · ${summary.missingWeight} кг`}
          tone={summary.missing > 0 ? "amber" : undefined}
        />
        <Cell
          label="Надлишки"
          value={`${summary.surplus} · ${summary.surplusWeight} кг`}
          tone={summary.surplus > 0 ? "sky" : undefined}
        />
        <Cell
          label="Вага облік / факт"
          value={`${summary.accWeight} / ${summary.actWeight} кг`}
        />
        <Cell label="Сума факт" value={`${summary.actAmountEur} €`} />
      </div>

      {/* Дії */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => save(false)}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Зберегти
        </button>
        <button
          type="button"
          disabled={busy || rows.length === 0}
          onClick={() => save(true)}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Зберегти та провести
        </button>
        <AutosaveStatus
          status={autosave.status}
          savedAt={autosave.savedAt}
          className="ml-2"
        />
      </div>
      <p className="text-xs text-gray-400">
        Документ лише звіряє облік і факт. Списання нестач та оприбуткування
        надлишків — окремими документами на підставі цієї інвентаризації.
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "sky";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : tone === "sky"
          ? "border-sky-200 bg-sky-50"
          : "border-gray-200 bg-gray-50";
  return (
    <div className={`rounded-md border p-2 ${toneClass}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 font-semibold text-gray-800">{value}</div>
    </div>
  );
}
