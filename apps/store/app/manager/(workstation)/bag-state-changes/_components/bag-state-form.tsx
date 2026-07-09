"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDocumentAutosave } from "@/lib/autosave/use-document-autosave";
import {
  AutosaveStatus,
  RestoreDraftBanner,
} from "../../_components/autosave-status";
import {
  BagStateRowCard,
  type AgentOption,
  type BagRow,
  type SectorOption,
} from "./bag-state-row";

/**
 * Форма документа «Зміна стану мішка» (← 1С ИзменениеСостоянияМешка).
 *
 * Шапка (Дата / Коментар) + тулбар (сканер ШК, «Додати всі залишки», масове
 * «Заповнити сектор») + рядки-мішки. Дві дії: «Зберегти» (чернетка) та
 * «Зберегти та провести» (запис у лоти + журнал). Попередження про ненайдені
 * ШК — портальний inline-діалог (без window.confirm — блокується в iframe-shell).
 */

export interface BagStateFormInitial {
  docNumber: string;
  docDate: string; // yyyy-mm-dd
  notes: string;
  rows: BagRow[];
}

export interface BagStateFormProps {
  mode: "create" | "edit";
  docId?: string;
  agents: AgentOption[];
  sectors: SectorOption[];
  initial?: BagStateFormInitial;
}

let rowSeq = 0;
function emptyRow(barcode = ""): BagRow {
  rowSeq += 1;
  return {
    key: `r${rowSeq}`,
    barcode,
    productId: null,
    productName: "",
    weight: "",
    lotStatus: null,
    found: false,
    isOpen: false,
    hasVideo: false,
    isTarget: false,
    onAir: false,
    onAirDelivery: false,
    youtubeUrl: "",
    description: "",
    comment: "",
    reservedAgentUserId: "",
    reservedClientId: null,
    reservedClientSummary: null,
    reservedUntil: "",
    sectorId: "",
    sectorNew: "",
    lookupError: null,
  };
}

interface LotLookup {
  lot?: {
    id: string;
    weight: number;
    status: string;
    videoUrl?: string | null;
    isOpen?: boolean;
    isTarget?: boolean;
  } | null;
  product?: { id: string; name: string } | null;
}

export function BagStateForm(props: BagStateFormProps) {
  const router = useRouter();
  const [docDate, setDocDate] = useState(
    props.initial?.docDate ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(props.initial?.notes ?? "");
  const [rows, setRows] = useState<BagRow[]>(
    props.initial?.rows.length ? props.initial.rows : [],
  );
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fillSectorId, setFillSectorId] = useState("");
  const [missingWarn, setMissingWarn] = useState<string[] | null>(null);
  /** id збереженого документа (edit-режим АБО створена autosave чернетка). */
  const [savedId, setSavedId] = useState<string | null>(props.docId ?? null);

  function updateRow(key: string, patch: Partial<BagRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function lookupBarcode(code: string): Promise<LotLookup | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    try {
      const res = await fetch(
        `/api/v1/manager/lots/by-barcode?code=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) return null;
      return (await res.json()) as LotLookup;
    } catch {
      return null;
    }
  }

  function applyLookupToRow(key: string, code: string, data: LotLookup | null) {
    if (!data || !data.lot) {
      updateRow(key, {
        barcode: code.trim(),
        found: false,
        lookupError: "Мішок за ШК не знайдено",
      });
      return;
    }
    updateRow(key, {
      barcode: code.trim(),
      productId: data.product?.id ?? null,
      productName: data.product?.name ?? "",
      weight: data.lot.weight != null ? String(data.lot.weight) : "",
      lotStatus: data.lot.status ?? null,
      isOpen: data.lot.isOpen ?? false,
      isTarget: data.lot.isTarget ?? false,
      hasVideo: !!data.lot.videoUrl,
      youtubeUrl: data.lot.videoUrl ?? "",
      found: true,
      lookupError: null,
    });
  }

  async function rescanRow(key: string, code: string) {
    if (!code.trim()) return;
    const data = await lookupBarcode(code);
    applyLookupToRow(key, code, data);
  }

  async function handleScan() {
    const code = scan.trim();
    if (!code) return;
    // Уже є рядок з таким ШК → просто підсвітити (не дублюємо).
    const existing = rows.find((r) => r.barcode.trim() === code);
    if (existing) {
      setScan("");
      void rescanRow(existing.key, code);
      return;
    }
    const row = emptyRow(code);
    setRows((rs) => [...rs, row]);
    setScan("");
    const data = await lookupBarcode(code);
    applyLookupToRow(row.key, code, data);
  }

  async function addAllRemnants() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/v1/manager/lots?status=free&pageSize=100&onlyInStock=true",
      );
      if (!res.ok) {
        setError("Не вдалось завантажити залишки");
        return;
      }
      const data = (await res.json()) as { items?: LotItem[] };
      const items = data.items ?? [];
      const existingCodes = new Set(rows.map((r) => r.barcode.trim()));
      const added: BagRow[] = [];
      for (const it of items) {
        if (!it.barcode || existingCodes.has(it.barcode)) continue;
        existingCodes.add(it.barcode);
        const r = emptyRow(it.barcode);
        r.productId = it.product?.id ?? null;
        r.productName = it.product?.name ?? "";
        r.weight = it.weight != null ? String(it.weight) : "";
        r.lotStatus = it.status ?? null;
        r.isOpen = !!it.isOpen;
        r.isTarget = !!it.isTarget;
        r.hasVideo = !!it.videoUrl;
        r.youtubeUrl = it.videoUrl ?? "";
        r.found = true;
        added.push(r);
      }
      if (added.length === 0) {
        setError("Нових вільних мішків не знайдено");
        return;
      }
      setRows((rs) => [...rs, ...added]);
    } catch {
      setError("Помилка завантаження залишків");
    } finally {
      setBusy(false);
    }
  }

  function fillSector() {
    if (!fillSectorId) return;
    setRows((rs) => rs.map((r) => ({ ...r, sectorId: fillSectorId })));
  }

  function sectorTextForRow(r: BagRow): string | null {
    if (r.sectorId === "__new__") return r.sectorNew.trim() || null;
    if (r.sectorId)
      return props.sectors.find((s) => s.id === r.sectorId)?.name ?? null;
    return null;
  }

  function buildPayload(src?: {
    docDate: string;
    notes: string;
    rows: BagRow[];
  }): Record<string, unknown> {
    const s = src ?? { docDate, notes, rows };
    const items = s.rows
      .filter((r) => r.barcode.trim())
      .map((r) => ({
        barcode: r.barcode.trim(),
        productId: r.productId,
        isOpen: r.isOpen,
        hasVideo: r.hasVideo,
        isTarget: r.isTarget,
        onAir: r.onAir,
        onAirDelivery: r.onAirDelivery,
        youtubeUrl: r.youtubeUrl.trim() || null,
        description: r.description.trim() || null,
        comment: r.comment.trim() || null,
        reservedAgentUserId: r.reservedAgentUserId || null,
        reservedClientId: r.reservedClientId,
        reservedUntil: r.reservedUntil
          ? `${r.reservedUntil}T00:00:00.000Z`
          : null,
        sector: sectorTextForRow(r),
      }));
    return {
      docDate: `${s.docDate}T00:00:00.000Z`,
      notes: s.notes || null,
      items,
    };
  }

  // ─── Автозбереження чернетки (наскрізне, План AUTOSAVE_REALTIME_PLAN) ──────
  // Дворівневий захист (localStorage + жива чернетка в БД). Draft НЕ проводить
  // документ — запис у лоти/журнал ЛИШЕ при «Провести» (`/[id]/post`).
  const draftData = useMemo(
    () => ({ docDate, notes, rows }),
    [docDate, notes, rows],
  );
  type BagDraftData = typeof draftData;

  // Документ має сенс лише з ≥1 мішком — до першого сканування захищає localStorage.
  const hasItems = rows.some((r) => r.barcode.trim() !== "");

  const createDraftServer = useCallback(
    async (d: BagDraftData): Promise<string> => {
      const res = await fetch("/api/v1/manager/bag-state-changes", {
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
    [],
  );

  const updateDraftServer = useCallback(
    async (id: string, d: BagDraftData): Promise<void> => {
      const res = await fetch(`/api/v1/manager/bag-state-changes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(d), draft: true }),
      });
      if (!res.ok) throw new Error(`draft update ${res.status}`);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const autosave = useDocumentAutosave<BagDraftData>({
    docType: "bag-state",
    existingId: props.docId ?? null,
    data: draftData,
    canCreateDraft: hasItems,
    createDraft: createDraftServer,
    updateDraft: updateDraftServer,
    onIdAssigned: (id) => {
      setSavedId(id);
      window.history.replaceState(null, "", `/manager/bag-state-changes/${id}`);
    },
  });

  /** Застосувати відновлені з localStorage дані у стан форми. */
  function applyRestore(d: BagDraftData): void {
    setDocDate(d.docDate);
    setNotes(d.notes);
    setRows(d.rows);
    autosave.acceptRestore();
  }

  async function save(thenPost: boolean) {
    if (rows.filter((r) => r.barcode.trim()).length === 0) {
      setError("Додайте хоча б один мішок (сканером ШК)");
      return;
    }
    setBusy(true);
    setError(null);
    setMissingWarn(null);
    try {
      // Гасимо чергу autosave, щоб відкладений draft-PATCH не перезаписав
      // проведений документ після цього запиту.
      autosave.clearAll();
      const usePatch = savedId != null;
      const url = usePatch
        ? `/api/v1/manager/bag-state-changes/${savedId}`
        : "/api/v1/manager/bag-state-changes";
      const method = usePatch ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      const saved = (await res.json()) as { id: string };
      const id = usePatch ? (savedId as string) : saved.id;
      setSavedId(id);

      if (thenPost) {
        const postRes = await fetch(
          `/api/v1/manager/bag-state-changes/${id}/post`,
          { method: "POST" },
        );
        if (!postRes.ok) {
          const data = (await postRes.json().catch(() => ({}))) as {
            error?: string;
            missingBarcodes?: string[];
          };
          if (data.missingBarcodes && data.missingBarcodes.length > 0) {
            setMissingWarn(data.missingBarcodes);
            setBusy(false);
            return;
          }
          setError(
            `Збережено, але не проведено: ${data.error ?? postRes.status}`,
          );
          setBusy(false);
          return;
        }
      }
      router.push(`/manager/bag-state-changes/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {autosave.restoreData && (
        <RestoreDraftBanner
          onRestore={() => applyRestore(autosave.restoreData as BagDraftData)}
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
          {props.initial?.docNumber && (
            <Field label="Номер">
              <input
                value={props.initial.docNumber}
                readOnly
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-600"
              />
            </Field>
          )}
          <Field label="Дата">
            <input
              type="date"
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Коментар">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-md border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-0.5 block text-xs text-gray-500">
              Сканер ШК
            </span>
            <input
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleScan();
                }
              }}
              placeholder="Скан / введення ШК + Enter"
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleScan()}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          >
            ➕ Додати мішок
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void addAllRemnants()}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Додати всі залишки
          </button>
          <div className="ml-auto flex items-end gap-1">
            <label className="block">
              <span className="mb-0.5 block text-xs text-gray-500">
                Заповнити сектор
              </span>
              <select
                value={fillSectorId}
                onChange={(e) => setFillSectorId(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">— Сектор —</option>
                {props.sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={fillSector}
              disabled={!fillSectorId || rows.length === 0}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Застосувати
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">
              Скануйте мішки, щоб додати рядки.
            </p>
          )}
          {rows.map((r, idx) => (
            <BagStateRowCard
              key={r.key}
              row={r}
              index={idx}
              agents={props.agents}
              sectors={props.sectors}
              onChange={(patch) => updateRow(r.key, patch)}
              onRemove={() =>
                setRows((rs) => rs.filter((x) => x.key !== r.key))
              }
              onRescan={(code) => void rescanRow(r.key, code)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(false)}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Зберегти
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(true)}
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

      {/* Діалог ненайдених ШК (без window.confirm — блокується в iframe-shell). */}
      {missingWarn && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={() => setMissingWarn(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900">
              Мішки за ШК не знайдено
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Документ збережено як чернетку, але не проведено — не знайдено
              мішки:
            </p>
            <ul className="mt-2 max-h-40 overflow-auto rounded-md bg-gray-50 p-2 text-sm text-gray-700">
              {missingWarn.map((b) => (
                <li key={b} className="font-mono">
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setMissingWarn(null)}
                className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
              >
                Зрозуміло
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface LotItem {
  barcode: string;
  weight: number;
  status: string;
  videoUrl: string | null;
  isOpen: boolean;
  isTarget: boolean;
  product: { id: string; name: string } | null;
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
