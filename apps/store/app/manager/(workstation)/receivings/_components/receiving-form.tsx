"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface SupplierOption {
  id: string;
  name: string;
  currency: string;
}
interface WarehouseOption {
  id: string;
  name: string;
  isDefault: boolean;
}
interface ItemDraft {
  uid: string;
  productId: string;
  productName: string;
  productSearch: string;
  weight: number;
  quantity: number;
  purchasePrice: number;
  barcode: string;
  barcodeSource: "scanned" | "manual" | "generated";
}

let uidCounter = 0;
function nextUid(): string {
  uidCounter++;
  return `i${Date.now()}-${uidCounter}`;
}

/**
 * Форма створення документа поступлення (← Тиждень 2 блоку Поступлення).
 * 3 сценарії штрихкодів (узгоджено з user 2026-06-03 питання 1):
 *  - scanned   → штрихкод зчитано сканером (зашита інфо)
 *  - manual    → введено вручну (паперова бірка)
 *  - generated → згенерує система при проведенні
 */
export function ReceivingForm({
  suppliers,
  warehouses,
  defaultWarehouseId,
}: {
  suppliers: SupplierOption[];
  warehouses: WarehouseOption[];
  defaultWarehouseId: string;
}) {
  const router = useRouter();

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [currency, setCurrency] = useState(suppliers[0]?.currency ?? "EUR");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [inboundDocNumber, setInboundDocNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<
    { id: string; name: string; articleCode: string | null }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addItem(product: {
    id: string;
    name: string;
    articleCode: string | null;
  }) {
    setItems((arr) => [
      ...arr,
      {
        uid: nextUid(),
        productId: product.id,
        productName: product.name,
        productSearch: "",
        weight: 20,
        quantity: 1,
        purchasePrice: 0,
        barcode: "",
        barcodeSource: "generated",
      },
    ]);
    setProductResults([]);
    setProductSearch("");
  }

  function removeItem(uid: string) {
    setItems((arr) => arr.filter((i) => i.uid !== uid));
  }

  function updateItem(uid: string, patch: Partial<ItemDraft>) {
    setItems((arr) => arr.map((i) => (i.uid === uid ? { ...i, ...patch } : i)));
  }

  async function searchProducts(q: string) {
    setProductSearch(q);
    if (q.trim().length < 2) {
      setProductResults([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/manager/products/search?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: { id: string; name: string; articleCode: string | null }[];
      };
      setProductResults(data.items.slice(0, 10));
    } catch {
      // ignore
    }
  }

  function totalWeight() {
    return items.reduce((s, i) => s + i.weight * i.quantity, 0);
  }
  function totalAmount() {
    return items.reduce(
      (s, i) => s + i.weight * i.quantity * i.purchasePrice,
      0,
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supplierId || !warehouseId) {
      setError("Оберіть постачальника і склад");
      return;
    }
    if (items.length === 0) {
      setError("Додайте хоча б один рядок");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/manager/warehouse/receivings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          supplierId,
          warehouseId,
          currency,
          exchangeRate,
          docDate: new Date(docDate).toISOString(),
          inboundDocNumber: inboundDocNumber || null,
          notes: notes || null,
          items: items.map((i) => ({
            productId: i.productId,
            weight: i.weight,
            quantity: i.quantity,
            purchasePrice: i.purchasePrice,
            barcode: i.barcode || null,
            barcodeSource: i.barcodeSource,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      router.push(`/manager/receivings/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Шапка документа */}
      <section className="grid gap-3 rounded-md border bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Постачальник *">
          <select
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              const s = suppliers.find((x) => x.id === e.target.value);
              if (s) setCurrency(s.currency);
            }}
            required
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">— Оберіть —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Склад *">
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} {w.isDefault ? "(за замовч.)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Дата документа *">
          <input
            type="date"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          />
        </Field>

        <Field label="Валюта">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          >
            <option>EUR</option>
            <option>USD</option>
            <option>UAH</option>
          </select>
        </Field>

        <Field label="Курс до EUR">
          <input
            type="number"
            min="0.0001"
            step="0.0001"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(Number(e.target.value))}
            disabled={currency === "EUR"}
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm disabled:bg-gray-100"
          />
        </Field>

        <Field label="№ накладної постачальника">
          <input
            type="text"
            value={inboundDocNumber}
            onChange={(e) => setInboundDocNumber(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          />
        </Field>
      </section>

      {/* Рядки товарів */}
      <section className="rounded-md border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Рядки документа ({items.length})
          </h2>
        </div>

        <div className="mb-3 space-y-1">
          <input
            type="search"
            value={productSearch}
            onChange={(e) => searchProducts(e.target.value)}
            placeholder="Знайти товар (назва / артикул / 1С-код)…"
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          {productResults.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-md border bg-white shadow-sm">
              {productResults.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addItem(p)}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="font-medium">{p.name}</span>
                    {p.articleCode && (
                      <span className="ml-2 text-xs text-gray-500">
                        Арт. {p.articleCode}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
            Знайдіть товар у полі вище і додайте.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="py-1.5 pr-2">Товар</th>
                  <th className="py-1.5 pr-2">Вага, кг</th>
                  <th className="py-1.5 pr-2">К-сть</th>
                  <th className="py-1.5 pr-2">Ціна закупки</th>
                  <th className="py-1.5 pr-2">Штрихкод</th>
                  <th className="py-1.5 pr-2">Спосіб</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it) => (
                  <tr key={it.uid}>
                    <td className="py-1.5 pr-2 align-top text-gray-900">
                      {it.productName}
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="number"
                        min="0.001"
                        step="0.1"
                        value={it.weight}
                        onChange={(e) =>
                          updateItem(it.uid, { weight: Number(e.target.value) })
                        }
                        className="w-20 rounded border border-gray-300 px-1.5 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={it.quantity}
                        onChange={(e) =>
                          updateItem(it.uid, {
                            quantity: Number(e.target.value),
                          })
                        }
                        className="w-16 rounded border border-gray-300 px-1.5 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.purchasePrice}
                        onChange={(e) =>
                          updateItem(it.uid, {
                            purchasePrice: Number(e.target.value),
                          })
                        }
                        className="w-24 rounded border border-gray-300 px-1.5 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="text"
                        value={it.barcode}
                        onChange={(e) =>
                          updateItem(it.uid, {
                            barcode: e.target.value,
                            barcodeSource:
                              e.target.value.length > 0
                                ? "manual"
                                : "generated",
                          })
                        }
                        placeholder={
                          it.barcodeSource === "generated"
                            ? "(згенерується)"
                            : ""
                        }
                        className="w-36 rounded border border-gray-300 px-1.5 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <select
                        value={it.barcodeSource}
                        onChange={(e) =>
                          updateItem(it.uid, {
                            barcodeSource: e.target
                              .value as ItemDraft["barcodeSource"],
                          })
                        }
                        className="rounded border border-gray-300 px-1.5 py-1 text-sm"
                      >
                        <option value="generated">Згенерувати</option>
                        <option value="manual">Вручну</option>
                        <option value="scanned">Зі сканера</option>
                      </select>
                    </td>
                    <td className="py-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => removeItem(it.uid)}
                        className="text-red-600 hover:underline"
                        aria-label="Видалити рядок"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-sm font-medium text-gray-700">
                <tr>
                  <td className="pt-2"></td>
                  <td className="pt-2">Σ {totalWeight().toFixed(1)} кг</td>
                  <td className="pt-2">
                    Σ {items.reduce((s, i) => s + i.quantity, 0)} шт
                  </td>
                  <td className="pt-2">
                    Σ {totalAmount().toFixed(2)} {currency}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <Field label="Коментар">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
        />
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          ❌ {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Зберігаю…" : "Зберегти як чернетку"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/manager/receivings")}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
        >
          Скасувати
        </button>
      </div>
    </form>
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
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </span>
      {children}
    </label>
  );
}
