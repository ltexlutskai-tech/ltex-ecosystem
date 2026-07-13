"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BarcodeInput } from "../../sales/new/_components/barcode-input";
import { useColumnWidths } from "../../_components/use-column-widths";
import {
  rowStatus,
  summarizeInventory,
  type LiveDoc,
  type LiveItem,
  type RowStatus,
  type SectorRef,
} from "@/lib/manager/inventory";

/**
 * Інвентаризація — жива спільна дошка (server-authoritative).
 *
 * Кілька пристроїв (телефон + сканер) працюють в ОДНОМУ документі одночасно:
 * кожен скан — атомарна операція над мішком на сервері, клієнти синхронізуються
 * поллінгом. Активний сектор — локальний для пристрою (сканують сектор → потім
 * мішки в нього). Ширину колонок можна тягнути як в Excel.
 */

interface Props {
  initialDoc: LiveDoc | null;
}

const BASE = "/api/v1/manager/stock-documents/inventories";

type Filter = "all" | "found" | "missing" | "surplus" | "diff";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Усі" },
  { key: "found", label: "Знайдені" },
  { key: "missing", label: "Не знайдені" },
  { key: "surplus", label: "Надлишки" },
  { key: "diff", label: "Розбіжності" },
];

interface ColDef {
  key: string;
  label: string;
  align?: "right" | "center";
  def: number;
}
const COLS: ColDef[] = [
  { key: "num", label: "№", def: 44 },
  { key: "article", label: "Артикул", def: 92 },
  { key: "name", label: "Номенклатура", def: 240 },
  { key: "barcode", label: "ШК", def: 150 },
  { key: "sector", label: "Сектор", def: 140 },
  { key: "weight", label: "Вага", align: "right", def: 66 },
  { key: "unit", label: "Ед", def: 48 },
  { key: "acc", label: "Облік", align: "right", def: 58 },
  { key: "fact", label: "Факт", align: "center", def: 84 },
  { key: "diff", label: "Відхил.", align: "right", def: 68 },
  { key: "price", label: "Ціна €", align: "right", def: 78 },
  { key: "sum", label: "Сума €", align: "right", def: 88 },
  { key: "who", label: "Хто", def: 110 },
  { key: "actions", label: "", def: 40 },
];
const DEFAULT_WIDTHS = Object.fromEntries(COLS.map((c) => [c.key, c.def]));

const STATUS_ROW: Record<RowStatus, string> = {
  matched: "bg-emerald-50/70",
  surplus: "bg-sky-50",
  missing: "",
  empty: "",
};

interface LogEntry {
  id: string;
  userName: string | null;
  action: string;
  message: string;
  createdAt: string;
}

const LOG_ACTION_LABEL: Record<string, string> = {
  fill: "Заповнення",
  found: "Знайдено",
  surplus: "Надлишок",
  unknown: "Невідомий ШК",
  edit: "Зміна",
  remove: "Видалення",
  header: "Шапка",
  post: "Проведення",
  reopen: "Розпроведення",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function InventoryBoard({ initialDoc }: Props) {
  const router = useRouter();
  const [docId, setDocId] = useState<string | null>(initialDoc?.id ?? null);
  const [status, setStatus] = useState(initialDoc?.status ?? "draft");
  const [docNumber, setDocNumber] = useState(initialDoc?.docNumber ?? "");
  const [docDate, setDocDate] = useState(
    initialDoc ? initialDoc.docDate.slice(0, 10) : todayIso(),
  );
  const [notes, setNotes] = useState(initialDoc?.notes ?? "");
  const [items, setItems] = useState<LiveItem[]>(initialDoc?.items ?? []);
  const [sectors, setSectors] = useState<SectorRef[]>([]);
  const [activeSector, setActiveSector] = useState<SectorRef | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: string; text: string } | null>(
    null,
  );
  const [newSector, setNewSector] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const {
    widths,
    startResize,
    reset: resetWidths,
  } = useColumnWidths("ltex:inv-cols", DEFAULT_WIDTHS);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFlash = useCallback((tone: string, text: string) => {
    setFlash({ tone, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  // ── Синхронізація (поллінг) ──
  const docIdRef = useRef(docId);
  docIdRef.current = docId;

  const pollNow = useCallback(async () => {
    const id = docIdRef.current;
    if (!id) return;
    try {
      const res = await fetch(`${BASE}/${id}/live`, { cache: "no-store" });
      if (!res.ok) return;
      const doc = (await res.json()) as LiveDoc;
      setItems(doc.items);
      setStatus(doc.status);
      if (doc.docNumber) setDocNumber(doc.docNumber);
    } catch {
      /* мережа моргнула — наступний тік */
    }
  }, []);

  useEffect(() => {
    if (!docId) return;
    const t = setInterval(() => void pollNow(), 2500);
    const onFocus = () => void pollNow();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [docId, pollNow]);

  // ── Довідник секторів ──
  const loadSectors = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/manager/warehouse/sectors`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setSectors(Array.isArray(data.items) ? data.items : []);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void loadSectors();
    const t = setInterval(() => void loadSectors(), 15000);
    return () => clearInterval(t);
  }, [loadSectors]);

  // ── Журнал документа ──
  const loadLogs = useCallback(async () => {
    const id = docIdRef.current;
    if (!id) return;
    try {
      const res = await fetch(`${BASE}/${id}/logs`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (!logsOpen) return;
    void loadLogs();
    const t = setInterval(() => void loadLogs(), 4000);
    return () => clearInterval(t);
  }, [logsOpen, loadLogs]);

  /** Створює чернетку на сервері (лінива), повертає id для спільної роботи. */
  const ensureDoc = useCallback(async (): Promise<string | null> => {
    if (docIdRef.current) return docIdRef.current;
    try {
      const res = await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docDate, notes: notes || null, items: [] }),
      });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { id: string };
      docIdRef.current = j.id;
      setDocId(j.id);
      window.history.replaceState(null, "", `${boardPath(j.id)}`);
      return j.id;
    } catch {
      setError("Не вдалося створити документ");
      return null;
    }
  }, [docDate, notes]);

  // ── Скан ──
  const mergeItem = useCallback((item: LiveItem) => {
    setItems((cur) => {
      const idx = cur.findIndex((r) => r.id === item.id);
      if (idx >= 0) {
        const next = cur.slice();
        next[idx] = item;
        return next;
      }
      return [...cur, item];
    });
  }, []);

  const handleScan = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setError(null);
      // Це штрихкод сектора? → активний сектор (локально для пристрою).
      const sec = sectors.find((s) => s.barcode && s.barcode === trimmed);
      if (sec) {
        setActiveSector(sec);
        showFlash("sky", `Активний сектор: ${sec.name}`);
        return;
      }
      const id = await ensureDoc();
      if (!id) return;
      try {
        const res = await fetch(`${BASE}/${id}/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barcode: trimmed,
            sectorId: activeSector?.id ?? null,
            sector: activeSector?.name ?? null,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? "Помилка скану");
          return;
        }
        const { outcome, item } = (await res.json()) as {
          outcome: string;
          item: LiveItem;
        };
        mergeItem(item);
        if (outcome === "found")
          showFlash("emerald", `✓ Знайдено: ${item.productName || trimmed}`);
        else if (outcome === "surplus")
          showFlash("sky", `➕ Надлишок: ${item.productName || trimmed}`);
        else showFlash("amber", `➕ Невідомий ШК: ${trimmed}`);
      } catch {
        setError("Помилка мережі при скані");
      }
    },
    [sectors, activeSector, ensureDoc, mergeItem, showFlash],
  );

  // ── Заповнення / додавання ──
  const fill = useCallback(
    async (productId?: string) => {
      setBusy(true);
      setError(null);
      const id = await ensureDoc();
      if (!id) {
        setBusy(false);
        return;
      }
      try {
        const res = await fetch(`${BASE}/${id}/fill`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productId ? { productId } : {}),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Помилка заповнення");
        } else {
          if (data.doc) setItems((data.doc as LiveDoc).items);
          showFlash("emerald", `Додано мішків: ${data.added}`);
        }
      } catch {
        setError("Помилка мережі");
      } finally {
        setBusy(false);
      }
    },
    [ensureDoc, showFlash],
  );

  // ── Дії над рядком ──
  const patchItem = useCallback(
    async (
      itemId: string,
      patch: {
        sector?: string | null;
        sectorId?: string | null;
        qtyActual?: number;
      },
    ) => {
      const id = docIdRef.current;
      if (!id) return;
      // оптимістично
      setItems((cur) =>
        cur.map((r) =>
          r.id === itemId
            ? {
                ...r,
                ...(patch.sector !== undefined
                  ? { sector: patch.sector ?? "" }
                  : {}),
                ...(patch.sectorId !== undefined
                  ? { sectorId: patch.sectorId }
                  : {}),
                ...(patch.qtyActual !== undefined
                  ? { qtyActual: patch.qtyActual }
                  : {}),
              }
            : r,
        ),
      );
      try {
        await fetch(`${BASE}/${id}/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      } catch {
        void pollNow();
      }
    },
    [pollNow],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const id = docIdRef.current;
      if (!id) return;
      setItems((cur) => cur.filter((r) => r.id !== itemId));
      try {
        await fetch(`${BASE}/${id}/items/${itemId}`, { method: "DELETE" });
      } catch {
        void pollNow();
      }
    },
    [pollNow],
  );

  const saveHeader = useCallback(async () => {
    const id = docIdRef.current;
    if (!id) return;
    try {
      await fetch(`${BASE}/${id}/header`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docDate, notes: notes || null }),
      });
    } catch {
      /* ignore */
    }
  }, [docDate, notes]);

  const createSector = useCallback(async () => {
    const name = newSector.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/v1/manager/warehouse/sectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok && data.sector) {
        setNewSector("");
        await loadSectors();
        setActiveSector({
          id: data.sector.id,
          name: data.sector.name,
          barcode: data.sector.barcode ?? null,
        });
        showFlash(
          "emerald",
          `Сектор «${data.sector.name}» створено${
            data.sector.barcode ? ` (ШК ${data.sector.barcode})` : ""
          }`,
        );
      } else {
        setError(data.error ?? "Не вдалося створити сектор");
      }
    } catch {
      setError("Помилка мережі");
    }
  }, [newSector, loadSectors, showFlash]);

  // ── Зведення / фільтр ──
  const summary = useMemo(() => summarizeInventory(items), [items]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      const st = rowStatus(r);
      if (filter === "found" && !(r.qtyActual > 0)) return false;
      if (filter === "missing" && st !== "missing") return false;
      if (filter === "surplus" && st !== "surplus") return false;
      if (filter === "diff" && st !== "missing" && st !== "surplus")
        return false;
      if (!q) return true;
      return (
        r.barcode.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.articleCode.toLowerCase().includes(q) ||
        r.sector.toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  const posted = status !== "draft";

  // ── Проведення / вихід ──
  async function post() {
    const id = await ensureDoc();
    if (!id) return;
    setBusy(true);
    await saveHeader();
    try {
      const res = await fetch(`${BASE}/${id}/post`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(`Не проведено: ${d.error ?? res.status}`);
        setBusy(false);
        return;
      }
      router.push(`/manager/stock-documents/inventories/${id}`);
      router.refresh();
    } catch {
      setError("Помилка проведення");
      setBusy(false);
    }
  }

  async function finish() {
    await saveHeader();
    const id = docIdRef.current;
    if (id) {
      router.push(`/manager/stock-documents/inventories/${id}`);
      router.refresh();
    } else {
      router.push(`/manager/stock-documents/inventories`);
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
              disabled={posted}
              onChange={(e) => setDocDate(e.target.value)}
              onBlur={() => void saveHeader()}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-xs text-gray-500">Коментар</span>
            <input
              value={notes}
              disabled={posted}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void saveHeader()}
              placeholder="напр. Інвентаризація 2025/2026"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        {docId && (
          <p className="mt-2 text-xs text-gray-400">
            Спільна робота: {docNumber ? `${docNumber} · ` : ""}кілька пристроїв
            можуть сканувати в цей документ одночасно (оновлення кожні 2–3 с).
          </p>
        )}
      </div>

      {!posted && (
        <>
          {/* Активний сектор + скан */}
          <div className="rounded-md border bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Активний сектор:</span>
              {activeSector ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">
                  {activeSector.name}
                  <button
                    type="button"
                    onClick={() => setActiveSector(null)}
                    className="ml-1 text-sky-600 hover:text-sky-900"
                    title="Прибрати активний сектор"
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <span className="text-xs text-gray-400">
                  не задано (мішки без сектора)
                </span>
              )}
              <select
                value={activeSector?.id ?? ""}
                onChange={(e) => {
                  const s = sectors.find((x) => x.id === e.target.value);
                  setActiveSector(s ?? null);
                }}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="">— обрати сектор —</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.barcode ? ` (${s.barcode})` : ""}
                  </option>
                ))}
              </select>
              <input
                value={newSector}
                onChange={(e) => setNewSector(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createSector();
                  }
                }}
                placeholder="+ новий сектор…"
                className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => void createSector()}
                disabled={!newSector.trim()}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Створити +ШК
              </button>
            </div>
            <p className="mb-2 text-xs text-gray-400">
              Порядок: скануєте ШК сектора (або обираєте зі списку) → потім
              скануєте мішки — вони потрапляють у цей сектор.
            </p>
            <BarcodeInput onCode={(c) => void handleScan(c)} />
            {flash && (
              <div
                className={`mt-2 rounded-md border px-3 py-1.5 text-sm ${flashTone}`}
              >
                {flash.text}
              </div>
            )}
          </div>

          {/* Дії */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void fill()}
              disabled={busy}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {busy ? "Зачекайте…" : "⭳ Заповнити зі складу"}
            </button>
            <AddProduct onPick={(pid) => void fill(pid)} />
            <button
              type="button"
              onClick={resetWidths}
              className="ml-auto rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
              title="Скинути ширину колонок"
            >
              ↔ Скинути колонки
            </button>
          </div>
        </>
      )}

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
        <button
          type="button"
          onClick={() => setLogsOpen((v) => !v)}
          disabled={!docId}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            logsOpen
              ? "bg-gray-800 text-white"
              : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          } disabled:opacity-40`}
          title={docId ? "Журнал змін документа" : "Доступно після першої дії"}
        >
          🕘 Журнал
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук (ШК / назва / артикул / сектор)…"
          className="ml-auto w-64 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      {logsOpen && (
        <div className="rounded-md border bg-white">
          <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
            <span>Журнал змін ({logs.length})</span>
            <button
              type="button"
              onClick={() => void loadLogs()}
              className="text-xs font-normal text-gray-500 hover:text-gray-800"
            >
              ↻ Оновити
            </button>
          </div>
          {logs.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-400">Журнал порожній.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-1.5">Час</th>
                    <th className="px-3 py-1.5">Користувач</th>
                    <th className="px-3 py-1.5">Дія</th>
                    <th className="px-3 py-1.5">Деталі</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap px-3 py-1 text-gray-500">
                        {fmtTime(l.createdAt)}
                      </td>
                      <td className="px-3 py-1 text-gray-700">
                        {l.userName || "—"}
                      </td>
                      <td className="px-3 py-1">
                        {LOG_ACTION_LABEL[l.action] ?? l.action}
                      </td>
                      <td className="px-3 py-1 text-gray-600">{l.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Таблиця з ресайзом колонок */}
      <div className="rounded-md border bg-white">
        <div className="overflow-x-auto">
          <table
            className="text-xs"
            style={{
              tableLayout: "fixed",
              width: "max-content",
              minWidth: "100%",
            }}
          >
            <colgroup>
              {COLS.map((c) => (
                <col key={c.key} style={{ width: widths[c.key] }} />
              ))}
            </colgroup>
            <thead className="bg-gray-100 text-left uppercase tracking-wide text-gray-500">
              <tr>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={`relative select-none px-2 py-1.5 ${
                      c.align === "right"
                        ? "text-right"
                        : c.align === "center"
                          ? "text-center"
                          : ""
                    }`}
                  >
                    <span className="block truncate">{c.label}</span>
                    {c.key !== "actions" && (
                      <span
                        onMouseDown={(e) => {
                          e.preventDefault();
                          startResize(c.key, e.clientX);
                        }}
                        onTouchStart={(e) => {
                          if (e.touches[0])
                            startResize(c.key, e.touches[0].clientX);
                        }}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-emerald-400"
                        title="Тягніть, щоб змінити ширину"
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={COLS.length}
                    className="px-3 py-8 text-center text-gray-400"
                  >
                    {items.length === 0
                      ? "Порожньо. «Заповнити зі складу», додайте позицію або скануйте ШК."
                      : "Немає рядків за фільтром."}
                  </td>
                </tr>
              )}
              {visible.map((r, idx) => {
                const st = rowStatus(r);
                const diff = r.qtyActual - r.qtyAccounting;
                const found = r.qtyActual > 0;
                return (
                  <tr key={r.id} className={STATUS_ROW[st]}>
                    <td className="px-2 py-1 text-gray-400">{idx + 1}</td>
                    <td className="truncate px-2 py-1 font-mono text-gray-700">
                      {r.articleCode || "—"}
                    </td>
                    <td className="truncate px-2 py-1" title={r.productName}>
                      {r.productName || (
                        <span className="text-gray-400">Невідомий товар</span>
                      )}
                    </td>
                    <td className="truncate px-2 py-1 font-mono text-gray-500">
                      {r.barcode || "—"}
                    </td>
                    <td className="px-2 py-1">
                      {posted ? (
                        <span className="truncate">{r.sector || "—"}</span>
                      ) : (
                        <select
                          value={r.sectorId ?? ""}
                          onChange={(e) => {
                            const s = sectors.find(
                              (x) => x.id === e.target.value,
                            );
                            void patchItem(r.id, {
                              sectorId: s?.id ?? null,
                              sector: s?.name ?? null,
                            });
                          }}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-gray-300 focus:border-gray-300"
                        >
                          <option value="">
                            {r.sector && !r.sectorId ? r.sector : "—"}
                          </option>
                          {sectors.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {r.weight ? r.weight.toFixed(1) : "—"}
                    </td>
                    <td className="truncate px-2 py-1 text-gray-500">
                      {r.unitName || "шт"}
                    </td>
                    <td className="px-2 py-1 text-right text-gray-600">
                      {r.qtyAccounting}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        disabled={posted}
                        onClick={() =>
                          void patchItem(r.id, { qtyActual: found ? 0 : 1 })
                        }
                        className={`rounded px-2 py-0.5 text-xs font-medium disabled:opacity-60 ${
                          found
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                        }`}
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
                    <td className="truncate px-2 py-1 text-gray-400">
                      {r.foundByName || ""}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {!posted && (
                        <button
                          type="button"
                          onClick={() => void removeItem(r.id)}
                          className="text-red-400 hover:text-red-600"
                          title="Видалити рядок"
                        >
                          ✕
                        </button>
                      )}
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
      {!posted && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void finish()}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Зберегти й вийти
          </button>
          <button
            type="button"
            disabled={busy || items.length === 0}
            onClick={() => void post()}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Зберегти та провести
          </button>
        </div>
      )}
      <p className="text-xs text-gray-400">
        Документ лише звіряє облік і факт. Списання нестач та оприбуткування
        надлишків — окремими документами на підставі цієї інвентаризації.
      </p>
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function boardPath(id: string): string {
  return `/manager/stock-documents/inventories/${id}/edit`;
}

interface ProductHit {
  id: string;
  name: string;
  articleCode: string | null;
}

function AddProduct({ onPick }: { onPick: (productId: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);

  async function search(v: string) {
    setQ(v);
    if (v.trim().length < 2) {
      setHits([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/manager/products/search?q=${encodeURIComponent(v)}`,
      );
      const data = await res.json();
      setHits(Array.isArray(data.items) ? data.items.slice(0, 10) : []);
    } catch {
      setHits([]);
    }
  }

  return (
    <div className="relative">
      <input
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setOpen(true);
          void search(e.target.value);
        }}
        placeholder="+ Додати позицію (товар)…"
        className="w-56 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
      {open && hits.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-72 overflow-auto rounded-md border bg-white shadow">
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                onPick(h.id);
                setOpen(false);
                setQ("");
                setHits([]);
              }}
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
