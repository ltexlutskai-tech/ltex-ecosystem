"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ltex/ui";
import { PackageCheck, RefreshCw, ExternalLink } from "lucide-react";

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

  const hasTtn = Boolean(ttnRef) && Boolean(ttnNumber);

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
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-700">
            ТТН:{" "}
            <span className="font-mono font-semibold text-gray-900">
              {ttnNumber}
            </span>
          </span>
          <a
            href={trackingUrl(ttnNumber as string)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
          >
            Відстежити
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
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
