"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  salePriceEur: string;
  qualityId: string;
  /** "" | <sectorId> | "__new__" */
  sectorId: string;
  sectorNew: string;
  lookupError: string | null;
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
  weightTolerance?: number;
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

export function StockDocForm(props: StockDocFormProps) {
  const router = useRouter();
  const tolerance = props.weightTolerance ?? 2;
  const qualities = props.qualities ?? [];
  const sectors = props.sectors ?? [];
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [weightWarn, setWeightWarn] = useState(false);

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
      updateRow(rowKey, {
        productId: data.product?.id ?? null,
        productName: data.product?.name ?? "",
        sourceLotId: data.lot?.id ?? null,
        weight:
          data.lot?.weight != null
            ? String(data.lot.weight)
            : rowWeight(rowKey),
        purchasePriceEur: data.lot?.purchasePriceEur ?? null,
        lookupError: null,
      });
    } catch {
      updateRow(rowKey, { lookupError: "Помилка пошуку лота" });
    }
  }

  function rowWeight(rowKey: string): string {
    return rows.find((r) => r.key === rowKey)?.weight ?? "";
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
        if (r.purchasePriceEur != null) sourceCost += r.purchasePriceEur * w;
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

  function buildPayload(): Record<string, unknown> {
    const items = rows
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
            base.qualityId = r.qualityId || null;
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
      docDate,
      notes: notes || null,
      items,
    };
    if (props.showCustomer) payload.customerName = customerName || null;
    if (props.showSupplier) payload.supplierName = supplierName || null;
    if (props.showReason) payload.reason = reason || null;
    return payload;
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
      const res = await fetch(`/api/v1/manager/stock-documents/${props.kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      const { id } = await res.json();
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

  return (
    <div className="space-y-4">
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

      <div className="rounded-md border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Рядки ({rows.length})</h2>
          <div className="flex gap-2">
            {props.isRepacking && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setRows((rs) => [...rs, emptyRow("disassembled")])
                  }
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  ➕ Розбір
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRows((rs) => [...rs, emptyRow("assembled")])
                  }
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  ➕ Комплектація
                </button>
              </>
            )}
            {!props.isRepacking && (
              <button
                type="button"
                onClick={() => setRows((rs) => [...rs, emptyRow()])}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                ➕ Додати рядок
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {rows.map((r, idx) => (
            <div
              key={r.key}
              className={`rounded-md border p-2 ${
                props.isRepacking && r.role === "assembled"
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  № {idx + 1}
                  {props.isRepacking && (
                    <span className="ml-1 font-medium text-gray-500">
                      · {r.role === "assembled" ? "Комплектація" : "Розбір"}
                    </span>
                  )}
                </span>
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
                {props.isRepacking && r.role === "disassembled" ? (
                  <input
                    value={r.barcode}
                    onChange={(e) =>
                      updateRow(r.key, { barcode: e.target.value })
                    }
                    onBlur={(e) => void lookupSourceLot(r.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void lookupSourceLot(r.key, r.barcode);
                      }
                    }}
                    placeholder="ШК джерельного мішка"
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                ) : (
                  <input
                    value={r.barcode}
                    onChange={(e) =>
                      updateRow(r.key, { barcode: e.target.value })
                    }
                    placeholder={
                      props.isRepacking ? "ШК (авто якщо порожньо)" : "Штрихкод"
                    }
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                )}
                <input
                  type="number"
                  step="0.1"
                  value={r.weight}
                  onChange={(e) => updateRow(r.key, { weight: e.target.value })}
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
                {props.showPrice &&
                  !props.isInventory &&
                  !(props.isRepacking && r.role === "assembled") && (
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

              {/* Додаткові поля рядка комплектації перепаковки. */}
              {props.isRepacking && r.role === "assembled" && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <input
                    type="number"
                    step="0.01"
                    value={r.salePriceEur}
                    onChange={(e) =>
                      updateRow(r.key, { salePriceEur: e.target.value })
                    }
                    placeholder="Ціна продажу €/кг"
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                  <select
                    value={r.qualityId}
                    onChange={(e) =>
                      updateRow(r.key, { qualityId: e.target.value })
                    }
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="">— Якість —</option>
                    {qualities.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={r.sectorId}
                    onChange={(e) =>
                      updateRow(r.key, { sectorId: e.target.value })
                    }
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="">— Сектор —</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value="__new__">+ Новий сектор…</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void generateBarcode(r.key)}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Згенерувати ШК
                  </button>
                  {r.sectorId === "__new__" && (
                    <input
                      value={r.sectorNew}
                      onChange={(e) =>
                        updateRow(r.key, { sectorNew: e.target.value })
                      }
                      placeholder="Назва нового сектора"
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm sm:col-span-2"
                    />
                  )}
                </div>
              )}
              {r.lookupError && (
                <p className="mt-1 text-xs text-red-500">{r.lookupError}</p>
              )}
            </div>
          ))}
        </div>
      </div>

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

      <div className="flex gap-2">
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
