"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@ltex/ui";
import { isRouteSheetLocked } from "@/lib/manager/route-sheet-status";
import type { LoadingBoardOrder } from "@/lib/manager/route-sheet-loading";
import {
  LoadingBoard,
  type LoadedLotRow,
  type LoadingBoardCounters,
} from "../../_components/loading-board";

export interface WarehouseLoadingView {
  id: string;
  displayNumber: string;
  status: string;
  routeName: string | null;
  arrivalDate: string | null;
  board: LoadingBoardOrder[];
  loading: LoadedLotRow[];
  counters: LoadingBoardCounters;
}

/**
 * Екран складу «Завантаження маршруту» — окремий документ для працівників складу
 * (наповнення маршрутного листа товаром без правки самого МЛ). Показує дошку
 * замовлень з підсвіткою стану + скан ШК; читає/пише через ті самі loading-роути.
 */
export function WarehouseLoadingClient({
  initial,
}: {
  initial: WarehouseLoadingView;
}) {
  const router = useRouter();
  const sheetId = initial.id;
  const locked = isRouteSheetLocked(initial.status);

  const [board, setBoard] = useState<LoadingBoardOrder[]>(initial.board);
  const [loading, setLoading] = useState<LoadedLotRow[]>(initial.loading);
  const [counters, setCounters] = useState<LoadingBoardCounters>(
    initial.counters,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Перечитати дошку/лоти/лічильники з сервера (GET). */
  const reload = useCallback(async () => {
    const res = await fetch(`/api/v1/manager/route-sheets/${sheetId}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      sheet: {
        loadingBoard: LoadingBoardOrder[];
        loading: LoadedLotRow[];
        counters: LoadingBoardCounters;
      };
    };
    setBoard(data.sheet.loadingBoard);
    setLoading(data.sheet.loading);
    setCounters(data.sheet.counters);
  }, [sheetId]);

  /** Скан ШК → рядок Завантаження (POST). orderId — «у виділене замовлення». */
  async function scan(barcode: string, targetOrderId: string | null) {
    const code = barcode.trim();
    if (!code) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/loading`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barcode: code,
            orderId: targetOrderId ?? undefined,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  /** Додати заброньований мішок зі списку (POST lotId). */
  async function addReserved(lotId: string, targetOrderId: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/loading`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lotId, orderId: targetOrderId }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function removeLoading(loadingId: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/loading?loadingId=${encodeURIComponent(
          loadingId,
        )}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function patchLoading(
    loadingId: string,
    patch: { loaded?: boolean; isReturn?: boolean },
  ) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/loading?loadingId=${encodeURIComponent(
          loadingId,
        )}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/manager/routes/${sheetId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          До маршрутного листа
        </Link>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void reload()}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Оновити
        </Button>
      </div>

      <header>
        <h1 className="text-2xl font-bold text-gray-800">
          Завантаження маршруту {initial.displayNumber}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {initial.routeName ? `${initial.routeName} · ` : ""}
          Скануйте мішки під замовлення. Заброньовані іншими менеджерами лоти
          вантажити не можна.
        </p>
      </header>

      {locked && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Маршрутний лист завершено — завантаження заблоковано. Розблокувати
          може менеджер у самому маршрутному листі.
        </p>
      )}

      <LoadingBoard
        board={board}
        loading={loading}
        counters={counters}
        locked={locked}
        editable
        busy={busy}
        error={error}
        onScan={(code, orderId) => void scan(code, orderId)}
        onRemoveLoading={(id) => void removeLoading(id)}
        onPatchLoading={(id, patch) => void patchLoading(id, patch)}
        sheetId={sheetId}
        onAddReserved={(lotId, orderId) => void addReserved(lotId, orderId)}
        createSaleHrefFor={(g) =>
          g.orderId
            ? `/manager/sales/new?routeSheetId=${encodeURIComponent(sheetId)}${
                g.customerId
                  ? `&clientId=${encodeURIComponent(g.customerId)}`
                  : ""
              }&orderId=${encodeURIComponent(g.orderId)}`
            : null
        }
      />

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => router.push(`/manager/routes/${sheetId}`)}
          className="bg-green-600 text-white hover:bg-green-700"
        >
          Готово — до маршрутного листа
        </Button>
      </div>
    </div>
  );
}
