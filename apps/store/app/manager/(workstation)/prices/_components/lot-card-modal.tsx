"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
  useToast,
} from "@ltex/ui";

/** Деталь лоту з GET /api/v1/manager/lots/[id]. */
interface LotDetail {
  id: string;
  product: { id: string; name: string; slug: string };
  barcode: string;
  barcodes: { id: string; code: string; type: string }[];
  weight: number;
  quantity: number;
  status: string;
  priceEur: number;
  videoUrl: string | null;
  arrivalIso: string;
  sector: string | null;
  isOpen: boolean;
  comment: string | null;
  description: string | null;
  isTarget: boolean;
  videoDateIso: string | null;
  reservation: {
    isReserved: boolean;
    reservedForClient: string | null;
    reservedUntilIso: string | null;
  };
}

interface Props {
  /** ID лоту або null коли модалка закрита. */
  lotId: string | null;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Editable-стан менеджерських полів. */
interface EditState {
  sector: string;
  isOpen: boolean;
  comment: string;
  description: string;
  isTarget: boolean;
}

function toEditState(lot: LotDetail): EditState {
  return {
    sector: lot.sector ?? "",
    isOpen: lot.isOpen,
    comment: lot.comment ?? "",
    description: lot.description ?? "",
    isTarget: lot.isTarget,
  };
}

export function LotCardModal({ lotId, onClose }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [lot, setLot] = useState<LotDetail | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Завантажуємо деталь лоту при відкритті.
  useEffect(() => {
    if (!lotId) {
      setLot(null);
      setEdit(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/manager/lots/${lotId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { lot: LotDetail };
      })
      .then(({ lot: loaded }) => {
        if (cancelled) return;
        setLot(loaded);
        setEdit(toEditState(loaded));
      })
      .catch(() => {
        if (!cancelled) setError("Не вдалося завантажити лот.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  async function handleSave() {
    if (!lot || !edit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/manager/lots/${lot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector: edit.sector,
          isOpen: edit.isOpen,
          comment: edit.comment,
          description: edit.description,
          isTarget: edit.isTarget,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      toast({ title: "Збережено", description: "Поля лоту оновлено." });
      router.refresh();
      onClose();
    } catch (e) {
      toast({
        title: "Помилка",
        description: e instanceof Error ? e.message : "Не вдалося зберегти.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={lotId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lot ? `Лот ${lot.weight.toLocaleString("uk-UA")} кг` : "Лот"}
          </DialogTitle>
        </DialogHeader>

        {loading && <p className="text-sm text-gray-500">Завантаження…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {lot && edit && (
          <div className="space-y-4 text-sm">
            {/* ── Read-only зведення (дані з 1С) ── */}
            <div className="grid gap-2 rounded-md border bg-gray-50 p-3 sm:grid-cols-2">
              <ReadOnlyRow label="Товар" value={lot.product.name} />
              <ReadOnlyRow
                label="Вага"
                value={`${lot.weight.toLocaleString("uk-UA")} кг`}
              />
              <ReadOnlyRow
                label="Залишок (к-сть)"
                value={String(lot.quantity)}
              />
              <ReadOnlyRow
                label="Дата приходу"
                value={formatDate(lot.arrivalIso)}
              />
              <ReadOnlyRow
                label="Дата відео"
                value={formatDate(lot.videoDateIso)}
              />
              <ReadOnlyRow
                label="Є відео"
                value={lot.videoUrl ? "Так" : "Ні"}
              />
            </div>

            {/* ── Бронь (лише показ; дія — Етап 4) ── */}
            <div
              className={`rounded-md border p-3 ${
                lot.reservation.isReserved
                  ? "border-amber-300 bg-amber-50"
                  : "bg-white"
              }`}
            >
              <div className="font-medium text-gray-700">Бронь</div>
              {lot.reservation.isReserved ? (
                <div className="mt-1 text-gray-700">
                  Заброньовано
                  {lot.reservation.reservedForClient
                    ? ` на: ${lot.reservation.reservedForClient}`
                    : ""}
                  {lot.reservation.reservedUntilIso
                    ? ` до ${formatDate(lot.reservation.reservedUntilIso)}`
                    : ""}
                  <span className="ml-1 text-xs text-gray-400">
                    (бронювання — Етап 4)
                  </span>
                </div>
              ) : (
                <div className="mt-1 text-gray-500">Вільний</div>
              )}
            </div>

            {/* ── Редаговані менеджерські поля ── */}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-medium text-gray-700">
                  Сектор складу
                </label>
                <SectorScanInput
                  value={edit.sector}
                  onChange={(v) => setEdit({ ...edit, sector: v })}
                />
              </div>

              <label className="flex items-center gap-2 font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={edit.isOpen}
                  onChange={(e) =>
                    setEdit({ ...edit, isOpen: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                Відкрито (мішок розпакований)
              </label>

              <label className="flex items-center gap-2 font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={edit.isTarget}
                  onChange={(e) =>
                    setEdit({ ...edit, isTarget: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                Цільовий лот
              </label>

              <div>
                <label className="mb-1 block font-medium text-gray-700">
                  Коментар
                </label>
                <Textarea
                  rows={2}
                  value={edit.comment}
                  onChange={(e) =>
                    setEdit({ ...edit, comment: e.target.value })
                  }
                  placeholder="Менеджерський коментар…"
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-gray-700">
                  Опис лоту
                </label>
                <Textarea
                  rows={3}
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                  placeholder="Сезон / сорт / к-сть одиниць / вага одиниці…"
                />
              </div>
            </div>

            {/* ── Штрих-коди (read-only) ── */}
            <div>
              <div className="mb-1 font-medium text-gray-700">Штрих-коди</div>
              <ul className="space-y-1">
                {lot.barcodes.map((b) => (
                  <li
                    key={b.id}
                    className="rounded border bg-gray-50 px-2 py-1 font-mono text-xs text-gray-700"
                  >
                    {b.code}
                    <span className="ml-2 text-gray-400">{b.type}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Дії ── */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="flex gap-2">
                {lot.videoUrl && (
                  <a
                    href={lot.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button type="button" variant="outline" size="sm">
                      ▶ YouTube
                    </Button>
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={saving}
                >
                  Закрити
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Збереження…" : "Зберегти"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <span className="text-xs uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="font-medium text-gray-800 sm:block">{value}</span>
    </div>
  );
}

/**
 * Поле «Сектор» + кнопка «ШК» (сканер штрих-коду).
 *
 * За зразком старого 1С: натиснувши «ШК», менеджер сканує штрих-код USB-сканером
 * (сканер «друкує» рядок і натискає Enter) АБО вводить вручну. Значення
 * записується у поле «сектор». Камеру не робимо (Етап-рішення №3 плану).
 *
 * Реалізація: кнопка «ШК» розкриває окреме поле, що автоматично отримує focus.
 * USB-сканер вводить символи й тисне Enter → ми читаємо рядок, кладемо у sector,
 * згортаємо поле. Ручне введення працює так само (Enter або кнопка «OK»).
 */
function SectorScanInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBuffer, setScanBuffer] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scanOpen) {
      setScanBuffer("");
      scanRef.current?.focus();
    }
  }, [scanOpen]);

  function commitScan() {
    const v = scanBuffer.trim();
    if (v.length > 0) onChange(v);
    setScanOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Напр. A-12"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setScanOpen((o) => !o)}
        >
          ШК
        </Button>
      </div>
      {scanOpen && (
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-gray-50 p-2">
          <Input
            ref={scanRef}
            value={scanBuffer}
            onChange={(e) => setScanBuffer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitScan();
              }
            }}
            placeholder="Скануйте або введіть код…"
            className="flex-1"
          />
          <Button type="button" size="sm" onClick={commitScan}>
            OK
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setScanOpen(false)}
          >
            Скасувати
          </Button>
        </div>
      )}
      <p className="text-xs text-gray-400">
        «ШК» — поле для USB-сканера або ручного введення (Enter записує у
        сектор).
      </p>
    </div>
  );
}
