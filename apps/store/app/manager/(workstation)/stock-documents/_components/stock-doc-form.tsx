"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDocumentAutosave } from "@/lib/autosave/use-document-autosave";
import {
  AutosaveStatus,
  RestoreDraftBanner,
} from "../../_components/autosave-status";
import { BarcodeInput } from "../../sales/new/_components/barcode-input";

/**
 * Універсальна форма створення документа руху товару (Фаза 5).
 * Шапка + редаговані рядки. «Зберегти» → draft; «Зберегти та провести» → +/post.
 *
 * Для «Перепаковки» (isRepacking) — розширений режим повного циклу: рядок розбору
 * скановано з ШК (підтягує джерельний лот + собівартість), рядок комплектації має
 * ЦінаПродажуВес / якість / сектор / автоген-ШК; панель зведення ваги+собівартості
 * + контроль допуску ваги (портальний діалог замість window.confirm).
 */

interface ProductHit {
  id: string;
  name: string;
  articleCode: string | null;
}

interface DictItem {
  id: string;
  name: string;
}

interface Row {
  key: string;
  productId: string | null;
  productName: string;
  barcode: string;
  weight: string;
  quantity: string;
  priceEur: string;
  role: "disassembled" | "assembled";
  qtyAccounting: string;
  qtyActual: string;
  // ── Перепаковка ──
  sourceLotId: string | null;
  purchasePriceEur: number | null;
  /** Постачальник (для розбору — з джерельного лота; read-only показ). */
  supplierName: string | null;
  salePriceEur: string;
  qualityId: string;
  /** "" | <sectorId> | "__new__" */
  sectorId: string;
  sectorNew: string;
  lookupError: string | null;
}

/** Рядок для попереднього заповнення форми при редагуванні наявного документа. */
export interface StockDocInitialRow {
  productId: string | null;
  productName: string;
  barcode: string;
  weight: string;
  quantity: string;
  priceEur: string;
  role: "disassembled" | "assembled";
  qtyAccounting: string;
  qtyActual: string;
  sourceLotId: string | null;
  supplierName: string | null;
  salePriceEur: string;
  sectorId: string;
}

/** Початкові дані для редагування (edit-режим). */
export interface StockDocInitial {
  id: string;
  docDate: string;
  notes: string;
  customerName: string;
  supplierName: string;
  reason: string;
  rows: StockDocInitialRow[];
}

export interface StockDocFormProps {
  kind: string;
  label: string;
  showPrice: boolean;
  showReason: boolean;
  isRepacking: boolean;
  isInventory: boolean;
  showCustomer: boolean;
  showSupplier: boolean;
  qualities?: DictItem[];
  sectors?: DictItem[];
  /** Довідник постачальників (для комплектації перепаковки). */
  suppliers?: DictItem[];
  weightTolerance?: number;
  /** Наявний документ для редагування (edit-режим). */
  initial?: StockDocInitial;
}

let rowSeq = 0;
function emptyRow(role: Row["role"] = "disassembled"): Row {
  rowSeq += 1;
  return {
    key: `r${rowSeq}`,
    productId: null,
    productName: "",
    barcode: "",
    weight: "",
    quantity: "1",
    priceEur: "",
    role,
    qtyAccounting: "",
    qtyActual: "",
    sourceLotId: null,
    purchasePriceEur: null,
    supplierName: null,
    salePriceEur: "",
    qualityId: "",
    sectorId: "",
    sectorNew: "",
    lookupError: null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Перетворює initial-рядок у повний Row (edit-режим). */
function initialToRow(r: StockDocInitialRow): Row {
  return { ...emptyRow(r.role), ...r, sectorNew: "", lookupError: null };
}

export function StockDocForm(props: StockDocFormProps) {
  const router = useRouter();
  const tolerance = props.weightTolerance ?? 2;
  const sectors = props.sectors ?? [];
  const suppliers = props.suppliers ?? [];
  const init = props.initial;
  const [docDate, setDocDate] = useState(
    init ? init.docDate : new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(init?.notes ?? "");
  const [customerName, setCustomerName] = useState(init?.customerName ?? "");
  const [supplierName, setSupplierName] = useState(init?.supplierName ?? "");
  const [reason, setReason] = useState(init?.reason ?? "");
  const [rows, setRows] = useState<Row[]>(
    init && init.rows.length > 0 ? init.rows.map(initialToRow) : [emptyRow()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [weightWarn, setWeightWarn] = useState(false);
  /**
   * id збереженої чернетки. `null` доки документ ще не створено. Оновлюється
   * явним POST або autosave (`onIdAssigned`) — щоб явне збереження PATCH-ило
   * вже створену чернетку, а не дублювало документ.
   */
  const [savedId, setSavedId] = useState<string | null>(init?.id ?? null);

  async function searchProducts(rowKey: string, q: string) {
    setSearchKey(rowKey);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/manager/products/search?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      setHits(Array.isArray(data.items) ? data.items.slice(0, 10) : []);
    } catch {
      setHits([]);
    }
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function pickProduct(rowKey: string, hit: ProductHit) {
    updateRow(rowKey, { productId: hit.id, productName: hit.name });
    setSearchKey(null);
    setHits([]);
  }

  /** Скан ШК у рядку розбору → підтягнути джерельний лот + собівартість. */
  async function lookupSourceLot(rowKey: string, code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(
        `/api/v1/manager/lots/by-barcode?code=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) {
        updateRow(rowKey, {
          lookupError: "Лот за ШК не знайдено",
          sourceLotId: null,
          purchasePriceEur: null,
        });
        return;
      }
      const data = await res.json();
      // Собівартість €/кг: резолвлена сервером (лот або остання закупка товару).
      const costPerKg: number | null = data.lot?.costPerKgEur ?? null;
      updateRow(rowKey, {
        productId: data.product?.id ?? null,
        productName: data.product?.name ?? "",
        sourceLotId: data.lot?.id ?? null,
        weight:
          data.lot?.weight != null
            ? String(data.lot.weight)
            : rowWeight(rowKey),
        purchasePriceEur: costPerKg,
        // Поле «Ціна закупки €/кг» заповнюємо авто (лот вже має вартість).
        priceEur: costPerKg != null ? String(costPerKg) : "",
        supplierName: data.lot?.supplierName ?? null,
        lookupError: null,
      });
    } catch {
      updateRow(rowKey, { lookupError: "Помилка пошуку лота" });
    }
  }

  function rowWeight(rowKey: string): string {
    return rows.find((r) => r.key === rowKey)?.weight ?? "";
  }

  /**
   * Скан ШК (USB-сканер або камера) у блоці Розпаковка → додає рядок розбору
   * і одразу підтягує товар/вагу/постачальника/собівартість за штрихкодом.
   */
  async function addScannedSourceRow(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const row = emptyRow("disassembled");
    row.barcode = trimmed;
    setRows((rs) => [...rs, row]);
    await lookupSourceLot(row.key, trimmed);
  }

  async function generateBarcode(rowKey: string) {
    const row = rows.find((r) => r.key === rowKey);
    if (!row?.productId) {
      updateRow(rowKey, { lookupError: "Спершу оберіть товар" });
      return;
    }
    try {
      const res = await fetch("/api/v1/manager/warehouse/barcode/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: row.productId }),
      });
      const data = await res.json();
      if (res.ok && data.barcode) {
        updateRow(rowKey, { barcode: data.barcode, lookupError: null });
      } else {
        updateRow(rowKey, {
          lookupError: data.error ?? "Помилка генерації ШК",
        });
      }
    } catch {
      updateRow(rowKey, { lookupError: "Помилка генерації ШК" });
    }
  }

  // ── Зведення ваги/собівартості (перепаковка) ──
  const summary = useMemo(() => {
    let inW = 0;
    let outW = 0;
    let sourceCost = 0;
    for (const r of rows) {
      const w = Number(r.weight) || 0;
      if (r.role === "assembled") outW += w;
      else {
        inW += w;
        // Собівартість €/кг береться з редагованого поля «Ціна закупки €/кг»
        // (авто-заповнюється при скані з лота/довідника, але менеджер може
        // відкоригувати). Це джерело правди для розрахунку.
        const perKg = Number(r.priceEur) || 0;
        sourceCost += perKg * w;
      }
    }
    const diff = round2(inW - outW);
    const costPerKg = outW > 0 ? round2(sourceCost / outW) : 0;
    return {
      inW: round2(inW),
      outW: round2(outW),
      diff,
      sourceCost: round2(sourceCost),
      costPerKg,
      exceeds: Math.abs(diff) > tolerance,
    };
  }, [rows, tolerance]);

  function buildPayload(src?: {
    docDate: string;
    notes: string;
    customerName: string;
    supplierName: string;
    reason: string;
    rows: Row[];
  }): Record<string, unknown> {
    const s = src ?? {
      docDate,
      notes,
      customerName,
      supplierName,
      reason,
      rows,
    };
    const items = s.rows
      .filter((r) => r.productId || r.barcode || Number(r.weight) > 0)
      .map((r) => {
        const base: Record<string, unknown> = {
          productId: r.productId,
          barcode: r.barcode || null,
          weight: Number(r.weight) || 0,
          quantity: Number(r.quantity) || 1,
          priceEur: Number(r.priceEur) || 0,
        };
        if (props.isRepacking) {
          base.role = r.role;
          if (r.role === "assembled") {
            base.salePriceEur = Number(r.salePriceEur) || 0;
            // Постачальник рядка комплектації (з довідника/вручну). Порожній →
            // сервер успадкує постачальника з джерела.
            base.supplierName = r.supplierName?.trim() || null;
            if (r.sectorId === "__new__") {
              base.sector = r.sectorNew.trim() || null;
              base.sectorId = null;
            } else if (r.sectorId) {
              base.sectorId = r.sectorId;
              base.sector =
                sectors.find((s) => s.id === r.sectorId)?.name ?? null;
            }
          } else {
            base.sourceLotId = r.sourceLotId;
          }
        }
        if (props.isInventory) {
          base.qtyAccounting = Number(r.qtyAccounting) || 0;
          base.qtyActual = Number(r.qtyActual) || 0;
        }
        return base;
      });
    const payload: Record<string, unknown> = {
      docDate: s.docDate,
      notes: s.notes || null,
      items,
    };
    if (props.showCustomer) payload.customerName = s.customerName || null;
    if (props.showSupplier) payload.supplierName = s.supplierName || null;
    if (props.showReason) payload.reason = s.reason || null;
    return payload;
  }

  // ─── Автозбереження чернетки (наскрізне, План AUTOSAVE_REALTIME_PLAN) ──────
  // Дворівневий захист: рівень 1 (localStorage) + рівень 2 (жива чернетка в БД).
  // Draft НЕ проводить документ — облікові рухи ЛИШЕ при «Провести».
  const draftData = useMemo(
    () => ({ docDate, notes, customerName, supplierName, reason, rows }),
    [docDate, notes, customerName, supplierName, reason, rows],
  );

  type DocDraftData = typeof draftData;

  // Створювати серверну чернетку лише коли є хоч якийсь змістовний ввід (щоб не
  // засмічувати список порожніми документами). Порожні чернетки прибирає cron.
  const hasContent =
    rows.some((r) => r.productId || r.barcode.trim() || Number(r.weight) > 0) ||
    notes.trim() !== "" ||
    customerName.trim() !== "" ||
    supplierName.trim() !== "" ||
    reason.trim() !== "";

  const createDraftServer = useCallback(
    async (d: DocDraftData): Promise<string> => {
      const res = await fetch(`/api/v1/manager/stock-documents/${props.kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(d), draft: true }),
      });
      if (!res.ok) throw new Error(`draft create ${res.status}`);
      const j = (await res.json()) as { id: string };
      return j.id;
      // buildPayload — чистий трансформ переданого знімка `d` (стабільно).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [props.kind],
  );

  const updateDraftServer = useCallback(
    async (id: string, d: DocDraftData): Promise<void> => {
      const res = await fetch(
        `/api/v1/manager/stock-documents/${props.kind}/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...buildPayload(d), draft: true }),
        },
      );
      if (!res.ok) throw new Error(`draft update ${res.status}`);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [props.kind],
  );

  const autosave = useDocumentAutosave<DocDraftData>({
    docType: `stock-${props.kind}`,
    existingId: init?.id ?? null,
    data: draftData,
    canCreateDraft: hasContent,
    createDraft: createDraftServer,
    updateDraft: updateDraftServer,
    onIdAssigned: (id) => {
      setSavedId(id);
      window.history.replaceState(
        null,
        "",
        `/manager/stock-documents/${props.kind}/${id}`,
      );
    },
  });

  /** Застосувати відновлені з localStorage дані у стан форми. */
  function applyRestore(d: DocDraftData): void {
    setDocDate(d.docDate);
    setNotes(d.notes);
    setCustomerName(d.customerName);
    setSupplierName(d.supplierName);
    setReason(d.reason);
    setRows(d.rows.length > 0 ? d.rows : [emptyRow()]);
    autosave.acceptRestore();
  }

  async function save(thenPost: boolean, force = false) {
    // Контроль допуску ваги для перепаковки — портальний діалог замість
    // window.confirm (блокується в iframe-shell менеджерки).
    if (thenPost && props.isRepacking && summary.exceeds && !force) {
      setWeightWarn(true);
      return;
    }
    setWeightWarn(false);
    setBusy(true);
    setError(null);
    try {
      // Гасимо чергу autosave, щоб відкладений draft-PATCH не перезаписав
      // проведений документ після цього запиту.
      autosave.clearAll();
      // Якщо чернетку вже створено (autosave) — PATCH; інакше POST нового.
      const usePatch = savedId != null;
      const url = usePatch
        ? `/api/v1/manager/stock-documents/${props.kind}/${savedId}`
        : `/api/v1/manager/stock-documents/${props.kind}`;
      const res = await fetch(url, {
        method: usePatch ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
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
          `/api/v1/manager/stock-documents/${props.kind}/${id}/post`,
          { method: "POST" },
        );
        if (!postRes.ok) {
          const data = await postRes.json().catch(() => ({}));
          setError(
            `Збережено, але не проведено: ${data.error ?? postRes.status}`,
          );
        }
      }
      router.push(`/manager/stock-documents/${props.kind}/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setBusy(false);
    }
  }

  // Перепаковка рендериться двома окремими блоками (як у 1С): Розпаковка
  // (disassembled) і Комплектація (assembled). Постачальник комплектації
  // успадковується з першого джерельного мішка (показ read-only).
  const disassembledRows = rows.filter((r) => r.role === "disassembled");
  const assembledRows = rows.filter((r) => r.role === "assembled");
  const inheritedSupplier =
    disassembledRows.map((r) => r.supplierName).find(Boolean) ?? null;

  /** Поле пошуку товару з випадаючим списком (спільне для всіх рядків). */
  function productSearchField(r: Row) {
    return (
      <div className="relative min-w-[180px] flex-1">
        <input
          value={r.productName}
          onChange={(e) => {
            updateRow(r.key, {
              productName: e.target.value,
              productId: null,
            });
            void searchProducts(r.key, e.target.value);
          }}
          placeholder="Товар (назва/артикул)…"
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
        {searchKey === r.key && hits.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-white shadow">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => pickProduct(r.key, h)}
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

  return (
    <div className="space-y-4">
      {autosave.restoreData && (
        <RestoreDraftBanner
          onRestore={() => applyRestore(autosave.restoreData as DocDraftData)}
          onDismiss={autosave.dismissRestore}
        />
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-md border bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">Шапка документа</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Дата">
            <input
              type="date"
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </Field>
          {props.showCustomer && (
            <Field label="Клієнт (назва)">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="ПІБ / ТТ"
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </Field>
          )}
          {props.showSupplier && (
            <Field label="Постачальник (назва)">
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </Field>
          )}
          {props.showReason && (
            <Field label="Причина / підстава">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </Field>
          )}
          <Field label="Нотатки">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
        {props.showCustomer && (
          <p className="mt-2 text-xs text-gray-400">
            При проведенні сума повернення зменшить борг клієнта.
          </p>
        )}
      </div>

      {props.isRepacking ? (
        <>
          {/* ── Блок 1: Розпаковка (джерельні мішки) ── */}
          <div className="rounded-md border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">
                Розпаковка ({disassembledRows.length})
              </h2>
              <button
                type="button"
                onClick={() =>
                  setRows((rs) => [...rs, emptyRow("disassembled")])
                }
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                ➕ Додати рядок
              </button>
            </div>
            {/* Скан ШК (USB-сканер + камера телефона) → додає рядок розбору. */}
            <div className="mb-3 rounded-md border border-dashed border-gray-300 bg-gray-50 p-2">
              <BarcodeInput onCode={(code) => void addScannedSourceRow(code)} />
            </div>
            <div className="space-y-2">
              {disassembledRows.length === 0 && (
                <p className="text-xs text-gray-400">
                  Скануйте ШК (сканером чи камерою) або додайте рядок вручну —
                  скан підтягне товар, вагу, постачальника та собівартість.
                </p>
              )}
              {disassembledRows.map((r) => {
                const num = rows.indexOf(r) + 1;
                return (
                  <div
                    key={r.key}
                    className="rounded-md border border-gray-200 p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-5 shrink-0 text-xs text-gray-400">
                        №{num}
                      </span>
                      {productSearchField(r)}
                      <input
                        value={r.barcode}
                        onChange={(e) =>
                          updateRow(r.key, { barcode: e.target.value })
                        }
                        onBlur={(e) =>
                          void lookupSourceLot(r.key, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void lookupSourceLot(r.key, r.barcode);
                          }
                        }}
                        placeholder="ШК джерела"
                        className="w-36 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                      <input
                        value={r.supplierName ?? ""}
                        readOnly
                        placeholder="Постачальник"
                        title="Постачальник (з джерельного мішка)"
                        className="w-32 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-600"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={r.weight}
                        onChange={(e) =>
                          updateRow(r.key, { weight: e.target.value })
                        }
                        placeholder="Вага, кг"
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                      {props.showPrice && (
                        <input
                          type="number"
                          step="0.01"
                          value={r.priceEur}
                          onChange={(e) =>
                            updateRow(r.key, { priceEur: e.target.value })
                          }
                          placeholder="Ціна закупки €/кг"
                          title="Ціна закупки €/кг (авто з лота/довідника при скані; можна відкоригувати)"
                          className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
                        />
                      )}
                      {props.showPrice && (
                        <span
                          className="w-24 shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-right text-sm text-gray-700"
                          title="Собівартість рядка = ціна закупки €/кг × вага"
                        >
                          {(
                            (Number(r.priceEur) || 0) * (Number(r.weight) || 0)
                          ).toFixed(2)}{" "}
                          €
                        </span>
                      )}
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setRows((rs) => rs.filter((x) => x.key !== r.key))
                          }
                          className="ml-auto text-xs text-red-500 hover:text-red-700"
                        >
                          Видалити
                        </button>
                      )}
                    </div>
                    {r.lookupError && (
                      <p className="mt-1 text-xs text-red-500">
                        {r.lookupError}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Блок 2: Комплектація (нові мішки) ── */}
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-emerald-900">
                Комплектація ({assembledRows.length})
              </h2>
              <button
                type="button"
                onClick={() => setRows((rs) => [...rs, emptyRow("assembled")])}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                ➕ Додати рядок
              </button>
            </div>
            <div className="space-y-2">
              {assembledRows.length === 0 && (
                <p className="text-xs text-emerald-800/70">
                  Додайте зібрані мішки. Постачальник успадкується з розпаковки
                  {inheritedSupplier ? ` (${inheritedSupplier})` : ""}.
                </p>
              )}
              {assembledRows.map((r) => {
                const num = rows.indexOf(r) + 1;
                return (
                  <div
                    key={r.key}
                    className="rounded-md border border-emerald-200 bg-white p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-5 shrink-0 text-xs text-gray-400">
                        №{num}
                      </span>
                      {productSearchField(r)}
                      <input
                        value={r.barcode}
                        onChange={(e) =>
                          updateRow(r.key, { barcode: e.target.value })
                        }
                        placeholder="ШК (авто)"
                        className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void generateBarcode(r.key)}
                        disabled={!(Number(r.weight) > 0)}
                        title={
                          Number(r.weight) > 0
                            ? "Згенерувати штрихкод"
                            : "Спершу введіть вагу лота"
                        }
                        className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Згенерувати ШК
                      </button>
                      <input
                        value={r.supplierName ?? ""}
                        onChange={(e) =>
                          updateRow(r.key, { supplierName: e.target.value })
                        }
                        list="repack-suppliers"
                        placeholder={inheritedSupplier ?? "Постачальник"}
                        title="Постачальник — оберіть з довідника або впишіть вручну (порожньо = успадкувати з розпаковки)"
                        className="w-36 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={r.weight}
                        onChange={(e) =>
                          updateRow(r.key, { weight: e.target.value })
                        }
                        placeholder="Вага, кг"
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={r.salePriceEur}
                        onChange={(e) =>
                          updateRow(r.key, { salePriceEur: e.target.value })
                        }
                        placeholder="Ціна продажу €/кг"
                        className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                      <select
                        value={r.sectorId}
                        onChange={(e) =>
                          updateRow(r.key, { sectorId: e.target.value })
                        }
                        className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="">— Сектор —</option>
                        {sectors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        <option value="__new__">+ Новий…</option>
                      </select>
                      {r.sectorId === "__new__" && (
                        <input
                          value={r.sectorNew}
                          onChange={(e) =>
                            updateRow(r.key, { sectorNew: e.target.value })
                          }
                          placeholder="Назва сектора"
                          className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm"
                        />
                      )}
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setRows((rs) => rs.filter((x) => x.key !== r.key))
                          }
                          className="ml-auto text-xs text-red-500 hover:text-red-700"
                        >
                          Видалити
                        </button>
                      )}
                    </div>
                    {r.lookupError && (
                      <p className="mt-1 text-xs text-red-500">
                        {r.lookupError}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Довідник постачальників для datalist-полів комплектації. */}
          <datalist id="repack-suppliers">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </>
      ) : (
        <div className="rounded-md border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Рядки ({rows.length})</h2>
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, emptyRow()])}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            >
              ➕ Додати рядок
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((r, idx) => (
              <div
                key={r.key}
                className="rounded-md border border-gray-200 p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">№ {idx + 1}</span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRows((rs) => rs.filter((x) => x.key !== r.key))
                      }
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Видалити
                    </button>
                  )}
                </div>

                <div className="relative mt-1">
                  <input
                    value={r.productName}
                    onChange={(e) => {
                      updateRow(r.key, {
                        productName: e.target.value,
                        productId: null,
                      });
                      void searchProducts(r.key, e.target.value);
                    }}
                    placeholder="Товар (пошук за назвою/артикулом)…"
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  {searchKey === r.key && hits.length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-white shadow">
                      {hits.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => pickProduct(r.key, h)}
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

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <input
                    value={r.barcode}
                    onChange={(e) =>
                      updateRow(r.key, { barcode: e.target.value })
                    }
                    placeholder="Штрихкод"
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={r.weight}
                    onChange={(e) =>
                      updateRow(r.key, { weight: e.target.value })
                    }
                    placeholder="Вага, кг"
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                  {props.isInventory ? (
                    <>
                      <input
                        type="number"
                        step="0.001"
                        value={r.qtyAccounting}
                        onChange={(e) =>
                          updateRow(r.key, { qtyAccounting: e.target.value })
                        }
                        placeholder="Облік"
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        step="0.001"
                        value={r.qtyActual}
                        onChange={(e) =>
                          updateRow(r.key, { qtyActual: e.target.value })
                        }
                        placeholder="Факт"
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </>
                  ) : (
                    <input
                      type="number"
                      value={r.quantity}
                      onChange={(e) =>
                        updateRow(r.key, { quantity: e.target.value })
                      }
                      placeholder="К-сть"
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  )}
                  {props.showPrice && !props.isInventory && (
                    <input
                      type="number"
                      step="0.01"
                      value={r.priceEur}
                      onChange={(e) =>
                        updateRow(r.key, { priceEur: e.target.value })
                      }
                      placeholder="Ціна €"
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  )}
                </div>
                {r.lookupError && (
                  <p className="mt-1 text-xs text-red-500">{r.lookupError}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Панель зведення перепаковки. */}
      {props.isRepacking && (
        <div className="grid gap-2 rounded-md border bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCell label="Вага розбору" value={`${summary.inW} кг`} />
          <SummaryCell label="Вага комплектації" value={`${summary.outW} кг`} />
          <SummaryCell
            label={`Різниця (допуск ${tolerance} кг)`}
            value={`${summary.diff} кг`}
            danger={summary.exceeds}
          />
          <SummaryCell
            label="Собівартість джерела"
            value={`${summary.sourceCost} €`}
          />
          <SummaryCell
            label="Собівартість €/кг"
            value={`${summary.costPerKg} €`}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
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
          disabled={busy}
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

      {/* Діалог допуску ваги (без window.confirm — блокується в iframe-shell). */}
      {weightWarn && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={() => setWeightWarn(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900">
              Різниця ваги перевищує допуск
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Розібрали {summary.inW} кг, зібрали {summary.outW} кг — різниця{" "}
              <span className="font-semibold text-amber-700">
                {summary.diff} кг
              </span>{" "}
              (допуск {tolerance} кг). Все одно провести перепаковку?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWeightWarn(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={() => void save(true, true)}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Все одно провести
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function SummaryCell({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-2 ${
        danger ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`mt-0.5 font-semibold ${
          danger ? "text-red-700" : "text-gray-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
