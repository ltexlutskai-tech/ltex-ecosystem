"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Універсальна форма створення документа руху товару (Фаза 5).
 * Шапка + редаговані рядки. «Зберегти» → draft; «Зберегти та провести» → +/post.
 */

interface ProductHit {
  id: string;
  name: string;
  articleCode: string | null;
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
}

let rowSeq = 0;
function emptyRow(): Row {
  rowSeq += 1;
  return {
    key: `r${rowSeq}`,
    productId: null,
    productName: "",
    barcode: "",
    weight: "",
    quantity: "1",
    priceEur: "",
    role: "disassembled",
    qtyAccounting: "",
    qtyActual: "",
  };
}

export function StockDocForm(props: StockDocFormProps) {
  const router = useRouter();
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
        if (props.isRepacking) base.role = r.role;
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

  async function save(thenPost: boolean) {
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
            <div key={r.key} className="rounded-md border border-gray-200 p-2">
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
                {props.isRepacking && (
                  <select
                    value={r.role}
                    onChange={(e) =>
                      updateRow(r.key, { role: e.target.value as Row["role"] })
                    }
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="disassembled">Розбір</option>
                    <option value="assembled">Комплектація</option>
                  </select>
                )}
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
            </div>
          ))}
        </div>
      </div>

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
