"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ltex/ui";
import { PackageCheck, RefreshCw, ExternalLink, MapPin } from "lucide-react";

/** Публічне посилання відстеження Нової Пошти за номером ТТН. */
function trackingUrl(cargoNumber: string): string {
  return `https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(
    cargoNumber,
  )}`;
}

interface CreateTtnResponse {
  ttnRef: string | null;
  ttnNumber: string | null;
  ttnError: string | null;
  ok: boolean;
}

interface TrackResult {
  number: string;
  status: string;
  statusCode: string;
  scheduledDeliveryDate: string;
  warehouseRecipient: string;
}

export interface NpTtnStatusProps {
  saleId: string;
  /** Ref документа НП (є → ТТН створена). */
  ttnRef: string | null;
  /** Номер ТТН (= expressWaybill). */
  ttnNumber: string | null;
  /** Остання помилка створення ТТН. */
  ttnError: string | null;
  /** Чи проведено реалізацію (тоді очікуємо авто-створення ТТН). */
  posted: boolean;
}

/**
 * Блок «Нова Пошта» на картці реалізації: статус ТТН + повторне створення.
 *
 * Три стани:
 *  • ТТН уже є → номер + посилання відстеження;
 *  • є помилка (без ТТН) → червона підказка + «Повторити створення ТТН»;
 *  • проведено, але ТТН ще нема й помилки нема → «ТТН створюється…» + «Створити ТТН».
 */
export function NpTtnStatus({
  saleId,
  ttnRef,
  ttnNumber,
  ttnError,
  posted,
}: NpTtnStatusProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<TrackResult | null>(null);
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);

  const hasTtn = Boolean(ttnRef) && Boolean(ttnNumber);

  async function track(): Promise<void> {
    setTrackBusy(true);
    setTrackError(null);
    try {
      const res = await fetch(`/api/v1/manager/sales/${saleId}/track`);
      const data = (await res.json().catch(() => ({}))) as Partial<
        TrackResult & { error: string }
      >;
      if (!res.ok) {
        setTrackError(data.error ?? `Помилка ${res.status}`);
        setTracking(null);
        return;
      }
      setTracking(data as TrackResult);
    } catch (e) {
      setTrackError((e as Error).message ?? "Не вдалося відстежити ТТН");
    } finally {
      setTrackBusy(false);
    }
  }

  async function retry(): Promise<void> {
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fetch(`/api/v1/manager/sales/${saleId}/create-ttn`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as Partial<
        CreateTtnResponse & { error: string }
      >;
      if (!res.ok || data.ok === false) {
        setLocalError(data.ttnError ?? data.error ?? `Помилка ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setLocalError((e as Error).message ?? "Помилка створення ТТН");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        <PackageCheck className="h-4 w-4" />
        Нова Пошта
      </h2>

      {hasTtn ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-gray-700">
              ТТН:{" "}
              <span className="font-mono font-semibold text-gray-900">
                {ttnNumber}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={trackBusy}
              onClick={() => void track()}
            >
              <MapPin
                className={`mr-1 h-4 w-4 ${trackBusy ? "animate-pulse" : ""}`}
              />
              {trackBusy ? "Перевірка…" : "Відстежити"}
            </Button>
            <a
              href={trackingUrl(ttnNumber as string)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
            >
              Відкрити на сайті НП
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          {trackError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {trackError}
            </div>
          )}
          {tracking && (
            <dl className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-gray-500">Статус:</dt>
                <dd className="font-medium text-gray-900">{tracking.status}</dd>
              </div>
              {tracking.scheduledDeliveryDate && (
                <div className="flex gap-2">
                  <dt className="text-gray-500">Орієнтовна доставка:</dt>
                  <dd className="text-gray-800">
                    {tracking.scheduledDeliveryDate}
                  </dd>
                </div>
              )}
              {tracking.warehouseRecipient && (
                <div className="flex gap-2">
                  <dt className="text-gray-500">Відділення отримувача:</dt>
                  <dd className="text-gray-800">
                    {tracking.warehouseRecipient}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      ) : ttnError ? (
        <div className="space-y-3">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Не вдалося створити ТТН: {ttnError}
          </div>
          {localError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void retry()}
          >
            <RefreshCw
              className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`}
            />
            {busy ? "Створення…" : "Повторити створення ТТН"}
          </Button>
        </div>
      ) : posted ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">ТТН створюється…</p>
          {localError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void retry()}
          >
            <RefreshCw
              className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`}
            />
            {busy ? "Створення…" : "Створити ТТН"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          ТТН буде створено автоматично після проведення реалізації.
        </p>
      )}
    </section>
  );
}
