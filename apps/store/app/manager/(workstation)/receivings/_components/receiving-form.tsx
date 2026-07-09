"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDocumentAutosave } from "@/lib/autosave/use-document-autosave";
import {
  AutosaveStatus,
  RestoreDraftBanner,
} from "../../_components/autosave-status";

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
  salePrice: number;
  barcode: string;
  barcodeSource: "scanned" | "manual" | "generated";
  sector: string;
  barcodeWarning: string | null;
}

let uidCounter = 0;
function nextUid(): string {
  uidCounter++;
  return `i${Date.now()}-${uidCounter}`;
}

/**
 * Форма створення документа поступлення (правки 2026-06-05).
 *
 * Smart-сканер: поле пошуку приймає і звичайний текст, і зашитий штрихкод
 * постачальника (XYYYYYZTTTUUU... — артикул у позиціях 2-6, вага у 9-11).
 *
 * Клавіатурна навігація:
 *   - У полі пошуку: ↑/↓ — навігація по результатах, Enter — додати виділений
 *     (або єдиний результат), Esc — закрити dropdown
 *   - У полі ваги: Enter → перехід на штрихкод цього ж рядка
 *   - У полі штрихкоду: Enter → перехід на пошук (всередині форми)
 *   - У полі ціни закупки: Enter → ціна наступного рядка
 *
 * Per-row дії: Копіювати (дублювати товар без ваги), Згенерувати ШК,
 * Друкувати етикетку (відкриває нову вкладку з 1 етикеткою), ×.
 */
export interface ReceivingFormInitial {
  id: string;
  supplierId: string;
  warehouseId: string;
  docDate: string; // ISO date (YYYY-MM-DD)
  notes: string;
  items: Array<{
    productId: string;
    productName: string;
    articleCode: string | null;
    weight: number;
    purchasePrice: number;
    salePrice?: number;
    barcode: string;
    barcodeSource: "scanned" | "manual" | "generated";
    sector: string;
  }>;
}

export function ReceivingForm({
  suppliers,
  warehouses,
  defaultWarehouseId,
  userRole,
  initial,
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
    | "expeditor"
    | "bookkeeper";
  /** Якщо передано — режим РЕДАГУВАННЯ існуючої чернетки (PATCH). */
  initial?: ReceivingFormInitial;
}) {
  const router = useRouter();
  const canSeePrice = userRole === "admin" || userRole === "owner";
  const canPost = userRole === "admin" || userRole === "owner";
  const isEdit = !!initial;

  const [supplierId, setSupplierId] = useState(
    initial?.supplierId ?? suppliers[0]?.id ?? "",
  );
  const [warehouseId, setWarehouseId] = useState(
    initial?.warehouseId ?? defaultWarehouseId,
  );
  const [docDate, setDocDate] = useState(
    initial?.docDate ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<ItemDraft[]>(
    initial
      ? initial.items.map((it) => ({
          uid: nextUid(),
          productId: it.productId,
          productName: it.productName,
          articleCode: it.articleCode,
          weight: it.weight,
          purchasePrice: it.purchasePrice,
          salePrice: it.salePrice ?? 0,
          barcode: it.barcode,
          barcodeSource: it.barcodeSource,
          sector: it.sector,
          barcodeWarning: null,
        }))
      : [],
  );
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<
    { id: string; name: string; articleCode: string | null }[]
  >([]);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const weightRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const barcodeRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const priceRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const searchRef = useRef<HTMLInputElement | null>(null);
  /** id збереженого документа (edit-режим АБО створена autosave чернетка). */
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);

  // Довідник секторів (autocomplete)
  const [sectorOptions, setSectorOptions] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/v1/manager/warehouse/sectors")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items: { name: string }[] } | null) => {
        if (d) setSectorOptions(d.items.map((s) => s.name));
      })
      .catch(() => {});
  }, []);

  // ── Наскрізне автозбереження чернетки (План AUTOSAVE_REALTIME_PLAN) ────────
  // Дворівневий захист: рівень 1 (localStorage — миттєво) + рівень 2 (жива
  // чернетка в БД). Замінює колишній localStorage-only бекап. Draft НЕ проводить
  // документ — лоти/прайс створюються ЛИШЕ при «Провести» (`/[id]/post`).

  /** Валідні для збереження рядки (товар + вага > 0, без попереджень). */
  const validItems = useMemo(
    () => items.filter((i) => i.productId && i.weight > 0 && !i.barcodeWarning),
    [items],
  );

  /** Тіло запиту чернетки (спільне для POST/PATCH). */
  const buildDraftBody = useCallback(
    (): Record<string, unknown> => ({
      supplierId,
      warehouseId,
      docDate: new Date(docDate).toISOString(),
      notes: notes || null,
      items: validItems.map((i) => ({
        productId: i.productId,
        weight: i.weight,
        quantity: 1,
        purchasePrice: i.purchasePrice,
        salePrice: i.salePrice > 0 ? i.salePrice : null,
        barcode: i.barcode || null,
        barcodeSource: i.barcodeSource,
        sector: i.sector || null,
      })),
    }),
    [supplierId, warehouseId, docDate, notes, validItems],
  );

  // Знімок стану форми для рівня 1 (localStorage-буфер) — джерело відновлення.
  const draftData = useMemo(
    () => ({ supplierId, warehouseId, docDate, notes, items }),
    [supplierId, warehouseId, docDate, notes, items],
  );
  type ReceivingDraftData = typeof draftData;

  const createDraftServer = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/v1/manager/warehouse/receivings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildDraftBody()),
    });
    if (!res.ok) throw new Error(`draft create ${res.status}`);
    const j = (await res.json()) as { id: string };
    return j.id;
  }, [buildDraftBody]);

  const updateDraftServer = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`/api/v1/manager/warehouse/receivings/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildDraftBody()),
      });
      if (!res.ok) throw new Error(`draft update ${res.status}`);
    },
    [buildDraftBody],
  );

  const autosave = useDocumentAutosave<ReceivingDraftData>({
    docType: "receiving",
    existingId: initial?.id ?? null,
    data: draftData,
    // Серверна чернетка можлива лише коли обрано постачальника+склад (FK) і є
    // хоч один валідний рядок. До того прогрес захищає localStorage-буфер.
    canCreateDraft: !!supplierId && !!warehouseId && validItems.length > 0,
    createDraft: createDraftServer,
    updateDraft: updateDraftServer,
    onIdAssigned: (id) => {
      setSavedId(id);
      window.history.replaceState(null, "", `/manager/receivings/${id}/edit`);
    },
  });

  /** Застосувати відновлені з localStorage дані у стан форми. */
  function applyRestore(d: ReceivingDraftData): void {
    setSupplierId(d.supplierId);
    setWarehouseId(d.warehouseId);
    setDocDate(d.docDate);
    setNotes(d.notes);
    setItems(
      d.items.map((it) => ({
        uid: nextUid(),
        productId: it.productId,
        productName: it.productName,
        articleCode: it.articleCode,
        weight: it.weight,
        purchasePrice: it.purchasePrice,
        salePrice: it.salePrice,
        barcode: it.barcode,
        barcodeSource: it.barcodeSource,
        sector: it.sector,
        barcodeWarning: null,
      })),
    );
    autosave.acceptRestore();
  }

  // Автопідстановка останньої ціни закупки
  async function fetchLastPrice(productId: string): Promise<number> {
    if (!supplierId) return 0;
    try {
      const res = await fetch(
        `/api/v1/manager/warehouse/last-purchase-price?productId=${encodeURIComponent(productId)}&supplierId=${encodeURIComponent(supplierId)}`,
      );
      if (!res.ok) return 0;
      const data = (await res.json()) as { price: number | null };
      return data.price ?? 0;
    } catch {
      return 0;
    }
  }

  // Автопідстановка поточної ціни продажу (правки 2026-06-05)
  async function fetchLastSalePrice(productId: string): Promise<number> {
    if (!canSeePrice) return 0;
    try {
      const res = await fetch(
        `/api/v1/manager/warehouse/last-sale-price?productId=${encodeURIComponent(productId)}`,
      );
      if (!res.ok) return 0;
      const data = (await res.json()) as { price: number | null };
      return data.price ?? 0;
    } catch {
      return 0;
    }
  }

  // ── Smart-сканер: спробує розпізнати зашитий штрихкод і додати рядок ──
  async function trySmartScan(code: string): Promise<boolean> {
    const trimmed = code.trim();
    if (trimmed.length < 12) return false;
    try {
      const res = await fetch(
        `/api/v1/manager/warehouse/barcode/lookup?code=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) return false;
      const data = (await res.json()) as {
        recognized: boolean;
        pattern: string;
        articleCode?: string;
        weight?: number | null;
        product: {
          id: string;
          name: string;
          articleCode: string | null;
        } | null;
      };
      if (!data.recognized) return false;
      if (!data.product) {
        setScanMsg(
          `⚠ Розпізнано артикул ${data.articleCode}, але товар у довіднику не знайдено`,
        );
        return true; // обробка завершена (хай навіть негативна)
      }
      const uid = nextUid();
      const [lastPurchase, lastSale] = await Promise.all([
        fetchLastPrice(data.product!.id),
        fetchLastSalePrice(data.product!.id),
      ]);
      setItems((arr) => [
        ...arr,
        {
          uid,
          productId: data.product!.id,
          productName: data.product!.name,
          articleCode: data.product!.articleCode,
          weight: data.weight ?? 0,
          purchasePrice: lastPurchase,
          salePrice: lastSale,
          barcode: trimmed,
          barcodeSource: "scanned",
          sector: "",
          barcodeWarning: null,
        },
      ]);
      setProductSearch("");
      setProductResults([]);
      setScanMsg(
        `✅ Зчитано: ${data.product.name} · ${data.weight} кг · ШК "${trimmed}"`,
      );
      setTimeout(() => setScanMsg(null), 3000);
      // Перевірка дубля ШК у БД (на випадок повторного сканування)
      void checkBarcode(uid, trimmed);
      return true;
    } catch {
      return false;
    }
  }

  async function addItem(product: {
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
        salePrice: 0,
        barcode: "",
        barcodeSource: "generated",
        sector: "",
        barcodeWarning: null,
      },
    ]);
    setProductResults([]);
    setProductSearch("");
    setHighlightedIdx(0);
    setTimeout(() => weightRefs.current[uid]?.focus(), 0);
    // Автопідстановка останніх цін (закупки + продажу) — правки 2026-06-05
    const [lastPurchase, lastSale] = await Promise.all([
      fetchLastPrice(product.id),
      fetchLastSalePrice(product.id),
    ]);
    setItems((arr) =>
      arr.map((i) =>
        i.uid === uid
          ? { ...i, purchasePrice: lastPurchase, salePrice: lastSale }
          : i,
      ),
    );
  }

  function copyItem(srcUid: string) {
    const src = items.find((i) => i.uid === srcUid);
    if (!src) return;
    const uid = nextUid();
    setItems((arr) => [
      ...arr,
      {
        uid,
        productId: src.productId,
        productName: src.productName,
        articleCode: src.articleCode,
        weight: 0,
        purchasePrice: src.purchasePrice,
        salePrice: src.salePrice,
        barcode: "",
        barcodeSource: "generated",
        sector: src.sector,
        barcodeWarning: null,
      },
    ]);
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
    setHighlightedIdx(0);
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

  async function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((idx) => Math.min(productResults.length - 1, idx + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((idx) => Math.max(0, idx - 1));
    } else if (e.key === "Escape") {
      setProductResults([]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const value = productSearch.trim();
      // Спочатку — спроба smart-сканування зашитого ШК
      const scanned = await trySmartScan(value);
      if (scanned) return;
      // Якщо у списку — додати виділений (або єдиний)
      const target =
        productResults[highlightedIdx] ?? productResults[0] ?? null;
      if (target) addItem(target);
    }
  }

  async function checkBarcode(uid: string, code: string) {
    if (!code || code.length < 2) {
      updateItem(uid, { barcodeWarning: null });
      return;
    }
    const dupLocal = items.find(
      (i) => i.uid !== uid && i.barcode.trim() === code.trim(),
    );
    if (dupLocal) {
      updateItem(uid, {
        barcodeWarning: `⚠ Дубль: уже у рядку з товаром "${dupLocal.productName}"`,
      });
      return;
    }
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

  function printSingleLabel(it: ItemDraft) {
    if (!it.barcode) {
      alert("Спершу згенеруйте або скануйте штрихкод для цього рядка");
      return;
    }
    const params = new URLSearchParams({
      code: it.barcode,
      name: it.productName,
      article: it.articleCode ?? "",
      weight: String(it.weight),
    });
    window.open(
      `/manager/receivings/preview-label?${params.toString()}`,
      "_blank",
    );
  }

  function focusPriceOfNextRow(uid: string) {
    const idx = items.findIndex((i) => i.uid === uid);
    const next = items[idx + 1];
    if (next) priceRefs.current[next.uid]?.focus();
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
      // Гасимо чергу autosave, щоб відкладений draft-PATCH не перезаписав
      // проведений документ після цього запиту.
      autosave.clearAll();
      // Якщо чернетку вже створено (edit або autosave) — PATCH; інакше POST.
      const usePatch = savedId != null;
      const url = usePatch
        ? `/api/v1/manager/warehouse/receivings/${savedId}`
        : "/api/v1/manager/warehouse/receivings";
      const method = usePatch ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
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
            salePrice: i.salePrice > 0 ? i.salePrice : null,
            barcode: i.barcode || null,
            barcodeSource: i.barcodeSource,
            sector: i.sector || null,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = usePatch
        ? { id: savedId as string }
        : ((await res.json()) as { id: string });
      setSavedId(data.id);
      if (postAfter) {
        const postRes = await fetch(
          `/api/v1/manager/warehouse/receivings/${data.id}/post`,
          { method: "POST" },
        );
        if (!postRes.ok) {
          const errData = await postRes.json().catch(() => ({}));
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
      {/* Банер відновлення незбереженого прогресу (localStorage-буфер). */}
      {autosave.restoreData && (
        <RestoreDraftBanner
          onRestore={() =>
            applyRestore(autosave.restoreData as ReceivingDraftData)
          }
          onDismiss={autosave.dismissRestore}
        />
      )}

      {/* Datalist для autocomplete секторів */}
      <datalist id="sector-options">
        {sectorOptions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* Шапка */}
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

      {/* Smart-сканер / пошук */}
      <section className="rounded-md border bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Рядки документа ({items.length})
          </h2>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <AutosaveStatus
              status={autosave.status}
              savedAt={autosave.savedAt}
            />
            <span>
              Σ {totalWeight().toFixed(1)} кг
              {canSeePrice && ` · Σ ${totalAmount().toFixed(2)} €`}
            </span>
          </div>
        </div>
        <div className="relative mb-2 space-y-1">
          <input
            ref={searchRef}
            type="search"
            value={productSearch}
            onChange={(e) => searchProducts(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="🔍 Сканер / пошук товару (назва, артикул, 1С-код)…"
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
            autoComplete="off"
          />
          {productResults.length > 0 && (
            <ul className="absolute z-10 max-h-60 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
              {productResults.map((p, idx) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    onClick={() => addItem(p)}
                    className={`block w-full px-3 py-1.5 text-left text-sm ${
                      idx === highlightedIdx
                        ? "bg-emerald-50"
                        : "hover:bg-emerald-50"
                    }`}
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
          {scanMsg && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
              {scanMsg}
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
            Скануйте штрихкод або знайдіть товар у полі вище.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-1 py-1.5 w-8">№</th>
                  <th className="px-2 py-1.5 w-20">Артикул</th>
                  <th className="px-2 py-1.5">Товар</th>
                  <th className="px-2 py-1.5 w-20">Вага, кг</th>
                  <th className="px-2 py-1.5 w-44">Штрихкод</th>
                  <th className="px-2 py-1.5 w-24">Сектор</th>
                  {canSeePrice && (
                    <>
                      <th className="px-2 py-1.5 w-20">Ціна закуп. €/кг</th>
                      <th className="px-2 py-1.5 w-20">Ціна прод. €/кг</th>
                    </>
                  )}
                  <th className="px-1 py-1.5 w-32">Дії</th>
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
                            // Фокус на пошук _у формі_ для наступного товару
                            searchRef.current?.focus();
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
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={it.sector}
                        list="sector-options"
                        onChange={(e) =>
                          updateItem(it.uid, { sector: e.target.value })
                        }
                        placeholder="—"
                        className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs"
                      />
                    </td>
                    {canSeePrice && (
                      <>
                        <td className="px-2 py-1">
                          <input
                            ref={(el) => {
                              priceRefs.current[it.uid] = el;
                            }}
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.purchasePrice}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) =>
                              updateItem(it.uid, {
                                purchasePrice: parseNumberOrZero(
                                  e.target.value,
                                ),
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                focusPriceOfNextRow(it.uid);
                              }
                            }}
                            className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm text-right"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.salePrice}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) =>
                              updateItem(it.uid, {
                                salePrice: parseNumberOrZero(e.target.value),
                              })
                            }
                            className="w-full rounded border border-emerald-200 bg-emerald-50/40 px-1.5 py-1 text-sm text-right"
                          />
                        </td>
                      </>
                    )}
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => generateBarcode(it.uid, it.productId)}
                          title="Згенерувати штрихкод"
                          className="rounded border border-emerald-300 bg-emerald-50 px-1 py-0.5 text-xs text-emerald-800 hover:bg-emerald-100"
                        >
                          🎯
                        </button>
                        <button
                          type="button"
                          onClick={() => printSingleLabel(it)}
                          title="Друкувати етикетку"
                          className="rounded border border-sky-300 bg-sky-50 px-1 py-0.5 text-xs text-sky-800 hover:bg-sky-100"
                        >
                          🖨
                        </button>
                        <button
                          type="button"
                          onClick={() => copyItem(it.uid)}
                          title="Копіювати рядок (без ваги)"
                          className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(it.uid)}
                          title="Видалити рядок"
                          className="rounded border border-red-300 bg-white px-1 py-0.5 text-xs text-red-700 hover:bg-red-50"
                        >
                          ×
                        </button>
                      </div>
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
