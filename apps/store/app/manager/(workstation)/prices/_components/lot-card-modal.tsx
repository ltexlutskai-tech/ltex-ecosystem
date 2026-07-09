"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { useRecordAutosave } from "@/lib/autosave/use-record-autosave";
import {
  AutosaveStatus,
  RestoreDraftBanner,
} from "../../_components/autosave-status";
import { buildProductShareText } from "@/lib/manager/share-message";
import { ClientPicker } from "../../orders/new/_components/client-picker";
import { OrderVideoButton } from "./order-video-button";
import { ShareSheet } from "./share-sheet";

/** Дані товара-власника для рекламного тексту «Поділитися» (Stage 5a). */
interface LotShareInfo {
  articleCode: string | null;
  description: string;
  basePriceEur: number | null;
  salePriceEur: number | null;
  isNew: boolean;
  videoUrl: string | null;
}

/** Деталь лоту з GET /api/v1/manager/lots/[id]. */
interface LotDetail {
  id: string;
  product: { id: string; name: string; slug: string };
  /** Дані для share-тексту (товар-власник). */
  share: LotShareInfo;
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
    isActive: boolean;
    isMine: boolean;
    reservedForClientId: string | null;
    reservedForName: string | null;
    reservedByName: string | null;
    reservedUntilIso: string | null;
  };
}

/** Дефолтна дата броні «до» — +14 днів (YYYY-MM-DD для <input type=date>). */
function defaultUntilDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

interface Props {
  /** ID лоту або null коли модалка закрита. */
  lotId: string | null;
  onClose: () => void;
  /** Курс EUR → UAH (для вартості лота в грн у share-тексті). */
  rateUah: number;
  /** ПІБ поточного менеджера (продавець у «Замовити відео»). */
  sellerName: string;
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

export function LotCardModal({ lotId, onClose, rateUah, sellerName }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [lot, setLot] = useState<LotDetail | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // ── Бронь (Етап 4) ──
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookClientId, setBookClientId] = useState<string | null>(null);
  const [bookUntil, setBookUntil] = useState<string>(defaultUntilDate());
  const [booking, setBooking] = useState(false);
  // ── Активні замовлення на товар (Етап 1 блоку Замовлень) ──
  const [claim, setClaim] = useState<{
    totalQuantity: number;
    totalWeight: number;
    ordersCount: number;
  } | null>(null);

  // Завантажуємо деталь лоту при відкритті.
  useEffect(() => {
    if (!lotId) {
      setLot(null);
      setEdit(null);
      setError(null);
      setBookingOpen(false);
      setBookClientId(null);
      setBookUntil(defaultUntilDate());
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
        // Підтягуємо активні замовлення на цей товар (фон, не блокує UI).
        fetch(`/api/v1/manager/products/${loaded.product.id}/active-claims`)
          .then(async (res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (cancelled || !data) return;
            setClaim({
              totalQuantity: data.totalQuantity,
              totalWeight: data.totalWeight,
              ordersCount: data.ordersCount,
            });
          })
          .catch(() => {
            // best-effort; мовчки ігноруємо
          });
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

  /** Перезавантажує картку лоту (після book/unbook) без закриття модалки. */
  async function reloadLot(lotIdToReload: string): Promise<void> {
    const res = await fetch(`/api/v1/manager/lots/${lotIdToReload}`);
    if (res.ok) {
      const { lot: reloaded } = (await res.json()) as { lot: LotDetail };
      setLot(reloaded);
      setEdit(toEditState(reloaded));
    }
  }

  async function handleBook() {
    if (!lot || !bookClientId) return;
    setBooking(true);
    try {
      // <input type="date"> дає YYYY-MM-DD; book endpoint очікує ISO datetime.
      const untilIso = new Date(`${bookUntil}T23:59:59.000Z`).toISOString();
      const res = await fetch(`/api/v1/manager/lots/${lot.id}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: bookClientId, until: untilIso }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      toast({
        title: "Заброньовано",
        description: "Лот закріплено за клієнтом.",
      });
      setBookingOpen(false);
      setBookClientId(null);
      await reloadLot(lot.id);
      router.refresh();
    } catch (e) {
      toast({
        title: "Помилка",
        description: e instanceof Error ? e.message : "Не вдалося забронювати.",
        variant: "destructive",
      });
    } finally {
      setBooking(false);
    }
  }

  async function handleUnbook() {
    if (!lot) return;
    setBooking(true);
    try {
      const res = await fetch(`/api/v1/manager/lots/${lot.id}/unbook`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      toast({ title: "Бронь знято", description: "Лот знову вільний." });
      await reloadLot(lot.id);
      router.refresh();
    } catch (e) {
      toast({
        title: "Помилка",
        description: e instanceof Error ? e.message : "Не вдалося зняти бронь.",
        variant: "destructive",
      });
    } finally {
      setBooking(false);
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
            {/* ── Автозбереження менеджерських полів (свіжий baseline на лот) ── */}
            <LotFieldsAutosave
              key={lot.id}
              lotId={lot.id}
              edit={edit}
              onRestore={setEdit}
            />

            {/* ── Активні замовлення на товар (Етап 1 блоку Замовлень) ── */}
            {claim && claim.totalQuantity > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                📋 На товар{" "}
                <span className="font-medium">{lot.product.name}</span> вже
                замовлено{" "}
                <span className="font-medium">{claim.totalQuantity} шт</span> /{" "}
                {claim.totalWeight} кг ({claim.ordersCount}{" "}
                {claim.ordersCount === 1 ? "замовлення" : "замовлень"})
              </div>
            ) : null}

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

            {/* ── Бронь (Етап 4) ── */}
            <div
              className={`rounded-md border p-3 ${
                lot.reservation.isMine
                  ? "border-indigo-300 bg-indigo-50"
                  : lot.reservation.isActive
                    ? "border-amber-300 bg-amber-50"
                    : "bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">Бронь</span>
                {lot.reservation.isMine && (
                  <span className="rounded bg-indigo-200 px-1.5 py-0.5 text-xs font-medium text-indigo-900">
                    Ваша бронь
                  </span>
                )}
              </div>

              {lot.reservation.isActive ? (
                <div className="mt-1 space-y-1 text-gray-700">
                  <div>
                    Заброньовано
                    {lot.reservation.reservedForName
                      ? ` на: ${lot.reservation.reservedForName}`
                      : ""}
                    {lot.reservation.reservedUntilIso
                      ? ` до ${formatDate(lot.reservation.reservedUntilIso)}`
                      : ""}
                  </div>
                  {lot.reservation.reservedByName && (
                    <div className="text-xs text-gray-500">
                      Забронював: {lot.reservation.reservedByName}
                    </div>
                  )}
                  {lot.reservation.isMine ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1"
                      disabled={booking}
                      onClick={handleUnbook}
                    >
                      {booking ? "…" : "Вилучити бронь"}
                    </Button>
                  ) : (
                    <p className="text-xs text-amber-700">
                      Бронь іншого менеджера — зняти не можна.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-1 space-y-2">
                  {lot.reservation.reservedForName && (
                    <p className="text-xs text-gray-400">
                      Попередня бронь ({lot.reservation.reservedForName})
                      протермінована.
                    </p>
                  )}
                  {!bookingOpen ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setBookingOpen(true)}
                    >
                      Забронювати
                    </Button>
                  ) : (
                    <div className="space-y-3 rounded-md border bg-white p-3">
                      <ClientPicker
                        value={bookClientId}
                        onChange={(clientId: string | null) =>
                          setBookClientId(clientId)
                        }
                      />
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Заброньовано до
                        </label>
                        <Input
                          type="date"
                          value={bookUntil}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setBookUntil(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={booking || !bookClientId}
                          onClick={handleBook}
                        >
                          {booking ? "Бронювання…" : "Забронювати"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={booking}
                          onClick={() => {
                            setBookingOpen(false);
                            setBookClientId(null);
                          }}
                        >
                          Скасувати
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
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
              <div className="flex flex-wrap gap-2">
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShareOpen(true)}
                >
                  Поділитися
                </Button>
                <OrderVideoButton
                  productName={lot.product.name}
                  articleCode={lot.share.articleCode}
                  productId={lot.product.id}
                  lotId={lot.id}
                  barcode={lot.barcode}
                  sellerName={sellerName}
                />
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

            <ShareSheet
              open={shareOpen}
              onOpenChange={setShareOpen}
              title="Поділитися лотом"
              text={buildProductShareText({
                name: lot.product.name,
                articleCode: lot.share.articleCode,
                description: lot.share.description,
                basePriceEur: lot.share.basePriceEur,
                salePriceEur: lot.share.salePriceEur,
                isNew: lot.share.isNew,
                videoUrl: lot.share.videoUrl ?? lot.videoUrl,
                lot: { weight: lot.weight, barcode: lot.barcode },
                rateUah,
              })}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Автозбереження менеджерських полів лоту. Виділено в окремий компонент і
 * монтується з `key={lot.id}` — так `useRecordAutosave` отримує свіжий baseline
 * (завантажений стан лоту) і не намагається зберігати одразу після відкриття,
 * а також не плутає буфери різних лотів у персистентній модалці.
 */
function LotFieldsAutosave({
  lotId,
  edit,
  onRestore,
}: {
  lotId: string;
  edit: EditState;
  onRestore: (next: EditState) => void;
}) {
  const save = useCallback(
    async (snap: EditState): Promise<void> => {
      const res = await fetch(`/api/v1/manager/lots/${lotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector: snap.sector,
          isOpen: snap.isOpen,
          comment: snap.comment,
          description: snap.description,
          isTarget: snap.isTarget,
        }),
      });
      if (!res.ok) throw new Error("save_failed");
    },
    [lotId],
  );

  const autosave = useRecordAutosave<EditState>({
    recordKey: `lot:${lotId}`,
    data: edit,
    save,
  });

  return (
    <>
      {autosave.restoreData && (
        <RestoreDraftBanner
          onRestore={() => {
            onRestore(autosave.restoreData as EditState);
            autosave.acceptRestore();
          }}
          onDismiss={autosave.dismissRestore}
        />
      )}
      <div className="flex justify-end">
        <AutosaveStatus status={autosave.status} savedAt={autosave.savedAt} />
      </div>
    </>
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
