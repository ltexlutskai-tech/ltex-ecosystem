"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface SupplierOption {
  id: string;
  name: string;
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
  articleCode: string | null;
  weight: number;
  purchasePrice: number;
  barcode: string;
  barcodeSource: "scanned" | "manual" | "generated";
  // UI-стан
  barcodeWarning: string | null;
}

let uidCounter = 0;
function nextUid(): string {
  uidCounter++;
  return `i${Date.now()}-${uidCounter}`;
}

/**
 * Форма створення документа поступлення (← правки 2026-06-04).
 *
 * Компактна табличного-вигляду форма у стилі 1С:
 *   - валюта/курс/№ накладної постачальника — прибрано (управ. облік у EUR)
 *   - quantity завжди = 1 (штрихкод унікальний)
 *   - ціна закупки прихована для warehouse
 *   - авто-фокус: вибрав товар → вага → enter → штрихкод → enter → next
 *   - на штрихкоді робиться live-перевірка дублів
 *   - 3 кнопки збереження: «Зберегти чернетку» (всі) і «Зберегти і провести»
 *     (тільки admin/owner) — узгоджено з user 2026-06-04
 */
export function ReceivingForm({
  suppliers,
  warehouses,
  defaultWarehouseId,
  userRole,
}: {
  suppliers: SupplierOption[];
  warehouses: WarehouseOption[];
  defaultWarehouseId: string;
  userRole:
    | "warehouse"
    | "admin"
    | "owner"
    | "manager"
    | "senior_manager"
    | "supervisor"
    | "analyst"
    | "bookkeeper";
}) {
  const router = useRouter();

  const canSeePrice = userRole === "admin" || userRole === "owner";
  const canPost = userRole === "admin" || userRole === "owner";

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<
    { id: string; name: string; articleCode: string | null }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs для авто-фокусу на полі ваги / штрихкоду останнього доданого рядка
  const weightRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const barcodeRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function addItem(product: {
    id: string;
    name: string;
    articleCode: string | null;
  }) {
    const uid = nextUid();
    setItems((arr) => [
      ...arr,
      {
        uid,
        productId: product.id,
        productName: product.name,
        articleCode: product.articleCode,
        weight: 0,
        purchasePrice: 0,
        barcode: "",
        barcodeSource: "generated",
        barcodeWarning: null,
      },
    ]);
    setProductResults([]);
    setProductSearch("");
    // Авто-фокус на полі ваги нового рядка
    setTimeout(() => weightRefs.current[uid]?.focus(), 0);
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

  async function checkBarcode(uid: string, code: string) {
    if (!code || code.length < 2) {
      updateItem(uid, { barcodeWarning: null });
      return;
    }
    // Локальний дубль у поточному документі
    const dupLocal = items.find(
      (i) => i.uid !== uid && i.barcode.trim() === code.trim(),
    );
    if (dupLocal) {
      updateItem(uid, {
        barcodeWarning: `⚠ Дубль: уже у рядку з товаром "${dupLocal.productName}"`,
      });
      return;
    }
    // Дубль у БД
    try {
      const res = await fetch(
        `/api/v1/manager/warehouse/barcode/check?code=${encodeURIComponent(code)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        exists: boolean;
        lot: { productName: string; supplierName: string | null } | null;
      };
      if (data.exists && data.lot) {
        updateItem(uid, {
          barcodeWarning: `⚠ Цей мішок уже у системі: ${data.lot.productName}${
            data.lot.supplierName ? ` (${data.lot.supplierName})` : ""
          }`,
        });
      } else {
        updateItem(uid, { barcodeWarning: null });
      }
    } catch {
      // ignore
    }
  }

  async function generateBarcode(uid: string, productId: string) {
    try {
      const res = await fetch("/api/v1/manager/warehouse/barcode/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Не вдалося згенерувати штрихкод");
        return;
      }
      const data = (await res.json()) as { barcode: string };
      updateItem(uid, {
        barcode: data.barcode,
        barcodeSource: "generated",
        barcodeWarning: null,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Помилка");
    }
  }

  function totalWeight(): number {
    return items.reduce((s, i) => s + i.weight, 0);
  }
  function totalAmount(): number {
    return items.reduce((s, i) => s + i.weight * i.purchasePrice, 0);
  }

  async function handleSubmit(postAfter: boolean) {
    setError(null);
    if (!supplierId || !warehouseId) {
      setError("Оберіть постачальника і склад");
      return;
    }
    if (items.length === 0) {
      setError("Додайте хоча б один рядок");
      return;
    }
    // Локальна валідація
    for (const it of items) {
      if (it.weight <= 0) {
        setError(`Вага не вказана для товару "${it.productName}"`);
        return;
      }
      if (it.barcodeWarning) {
        setError(`Виправте попередження: ${it.barcodeWarning}`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/manager/warehouse/receivings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          supplierId,
          warehouseId,
          docDate: new Date(docDate).toISOString(),
          notes: notes || null,
          items: items.map((i) => ({
            productId: i.productId,
            weight: i.weight,
            quantity: 1,
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
      if (postAfter) {
        // Одразу проводимо
        const postRes = await fetch(
          `/api/v1/manager/warehouse/receivings/${data.id}/post`,
          { method: "POST" },
        );
        if (!postRes.ok) {
          const errData = await postRes.json().catch(() => ({}));
          // Документ збережено, але провести не вдалось — переходимо у деталі
          router.push(`/manager/receivings/${data.id}`);
          alert(
            `Документ збережено, але провести не вдалось: ${errData.error ?? postRes.status}`,
          );
          return;
        }
      }
      router.push(`/manager/receivings/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      {/* Шапка — компактно: постачальник + склад + дата */}
      <section className="grid gap-2 rounded-md border bg-white p-3 sm:grid-cols-3">
        <Field label="Постачальник *">
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
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
      </section>

      {/* Пошук + результат */}
      <section className="rounded-md border bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Рядки документа ({items.length})
          </h2>
          <div className="text-xs text-gray-500">
            Σ {totalWeight().toFixed(1)} кг
            {canSeePrice && ` · Σ ${totalAmount().toFixed(2)} €`}
          </div>
        </div>
        <div className="mb-2 space-y-1">
          <input
            type="search"
            value={productSearch}
            onChange={(e) => searchProducts(e.target.value)}
            placeholder="🔍 Знайти товар (назва / артикул / 1С-код)…"
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          {productResults.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-md border bg-white shadow-sm">
              {productResults.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addItem(p)}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-emerald-50"
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

        {/* Компактна таблиця */}
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
            Знайдіть товар у полі вище і додайте.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-1 py-1.5 w-8">№</th>
                  <th className="px-2 py-1.5 w-20">Артикул</th>
                  <th className="px-2 py-1.5">Товар</th>
                  <th className="px-2 py-1.5 w-24">Вага, кг</th>
                  <th className="px-2 py-1.5 w-44">Штрихкод</th>
                  {canSeePrice && (
                    <th className="px-2 py-1.5 w-24">Ціна закупки €/кг</th>
                  )}
                  <th className="px-2 py-1.5 w-24">Спосіб</th>
                  <th className="px-1 py-1.5 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it, idx) => (
                  <tr key={it.uid}>
                    <td className="px-1 py-1 text-gray-500">{idx + 1}</td>
                    <td className="px-2 py-1 text-xs text-gray-600">
                      {it.articleCode ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-gray-900">
                      <div className="truncate">{it.productName}</div>
                      {it.barcodeWarning && (
                        <div className="mt-0.5 text-xs text-amber-700">
                          {it.barcodeWarning}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        ref={(el) => {
                          weightRefs.current[it.uid] = el;
                        }}
                        type="number"
                        min="0"
                        step="0.1"
                        value={it.weight}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) =>
                          updateItem(it.uid, {
                            weight: parseNumberOrZero(e.target.value),
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            barcodeRefs.current[it.uid]?.focus();
                          }
                        }}
                        className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm text-right"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        ref={(el) => {
                          barcodeRefs.current[it.uid] = el;
                        }}
                        type="text"
                        value={it.barcode}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateItem(it.uid, {
                            barcode: v,
                            barcodeSource:
                              v.length > 0 ? "manual" : "generated",
                          });
                        }}
                        onBlur={(e) => checkBarcode(it.uid, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            checkBarcode(it.uid, e.currentTarget.value);
                            // Поставити фокус на пошук для наступного товару
                            (
                              document.querySelector(
                                'input[type="search"]',
                              ) as HTMLInputElement | null
                            )?.focus();
                          }
                        }}
                        placeholder="(згенерується)"
                        className={`w-full rounded border px-1.5 py-1 font-mono text-xs ${
                          it.barcodeWarning
                            ? "border-amber-400 bg-amber-50"
                            : "border-gray-300"
                        }`}
                      />
                    </td>
                    {canSeePrice && (
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.purchasePrice}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) =>
                            updateItem(it.uid, {
                              purchasePrice: parseNumberOrZero(e.target.value),
                            })
                          }
                          className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm text-right"
                        />
                      </td>
                    )}
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        onClick={() => generateBarcode(it.uid, it.productId)}
                        className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800 hover:bg-emerald-100"
                      >
                        🎯 Згенер.
                      </button>
                    </td>
                    <td className="px-1 py-1 text-center">
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleSubmit(false)}
          disabled={saving}
          className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? "Зберігаю…" : "💾 Зберегти чернетку"}
        </button>
        {canPost && (
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={saving}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "…" : "✅ Зберегти і провести"}
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push("/manager/receivings")}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
        >
          Скасувати
        </button>
        {!canPost && items.length > 0 && (
          <div className="ml-auto text-xs text-gray-500 self-center">
            ℹ Документ буде проведено адміністратором/власником після перевірки
          </div>
        )}
      </div>
    </form>
  );
}

/** Парсить число або повертає 0 — для UX «порожнє поле → 0». */
function parseNumberOrZero(v: string): number {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
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
