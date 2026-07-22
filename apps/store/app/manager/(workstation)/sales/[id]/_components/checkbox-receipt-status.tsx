"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ltex/ui";
import { Receipt, RefreshCw, Check, Share2 } from "lucide-react";
import { ShareSheet } from "../../../prices/_components/share-sheet";

interface CreateReceiptResponse {
  ok: boolean;
  skipped: boolean;
  status: string | null;
  receiptId: string | null;
  error: string | null;
}

export interface CheckboxReceiptStatusProps {
  saleId: string;
  /** Статус чека Checkbox: "created" | "failed" | "pending" | null (немає запису). */
  status: string | null;
  /** Id чека у Checkbox (коли створено). */
  receiptId: string | null;
  /** Остання помилка створення чека. */
  error: string | null;
  /** Чи вже є № ТТН (без неї чек не створюється — створиться після відправлення). */
  hasTtn: boolean;
  /** Телефон клієнта — для кнопки «Відкрити Viber клієнта» у ShareSheet. */
  clientPhone?: string | null;
}

// Публічний перегляд чека Checkbox для клієнта (споживацький хост, не API).
const RECEIPT_BASE =
  process.env.NEXT_PUBLIC_CHECKBOX_RECEIPT_URL || "https://check.checkbox.ua";

function buildReceiptUrl(receiptId: string | null): string | null {
  if (!receiptId) return null;
  return `${RECEIPT_BASE.replace(/\/$/, "")}/${receiptId}`;
}

/**
 * Блок «Чек Checkbox» на картці реалізації (лише для накладки, `cashOnDelivery`).
 *
 * Три стани:
 *  • `created` → зелений «✓ Чек Checkbox створено» (+ receiptId);
 *  • `failed` або немає чека попри наявну ТТН → червоний + «Повторити чек»;
 *  • немає ТТН → підказка «Чек створиться після відправлення складом».
 */
export function CheckboxReceiptStatus({
  saleId,
  status,
  receiptId,
  error,
  hasTtn,
  clientPhone,
}: CheckboxReceiptStatusProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const receiptUrl = buildReceiptUrl(receiptId);
  const shareText = receiptUrl
    ? `Дякуємо за покупку в L-TEX! Ваш фіскальний чек: ${receiptUrl}`
    : "";

  // Чек має бути (спроба відбулась) коли є ТТН; без ТТН чек ще не створюється.
  const needsRetry = status === "failed" || (hasTtn && status !== "created");

  async function retry(): Promise<void> {
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fetch(
        `/api/v1/manager/sales/${saleId}/create-receipt`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as Partial<
        CreateReceiptResponse & { error: string }
      >;
      if (!res.ok || data.ok === false) {
        setLocalError(data.error ?? `Помилка ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setLocalError((e as Error).message ?? "Помилка створення чека");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        <Receipt className="h-4 w-4" />
        Чек Checkbox
      </h2>

      {status === "created" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 font-medium text-green-700">
              <Check className="h-4 w-4" />
              Чек Checkbox створено
            </span>
            {receiptId && (
              <span className="font-mono text-xs text-gray-500">
                {receiptId}
              </span>
            )}
          </div>
          {receiptUrl && (
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Відкрити чек
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="mr-1 h-4 w-4" />
                Поділитися чеком
              </Button>
            </div>
          )}
        </div>
      ) : needsRetry ? (
        <div className="space-y-3">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Чек не створено{error ? `: ${error}` : ""}
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
            {busy ? "Створення…" : "Повторити чек"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Чек створиться після відправлення складом.
        </p>
      )}

      {receiptUrl && (
        <ShareSheet
          open={shareOpen}
          onOpenChange={setShareOpen}
          title="Поділитися чеком з клієнтом"
          text={shareText}
          clientPhone={clientPhone}
        />
      )}
    </section>
  );
}
