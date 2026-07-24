"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, useToast } from "@ltex/ui";
import {
  ExternalLink,
  Printer,
  Check,
  Receipt,
  RefreshCw,
  MapPin,
  Loader2,
} from "lucide-react";
import { classifyDelivery } from "@/lib/manager/order-delivery";
import {
  NpWarehousePicker,
  type NpSelection,
} from "../../../_components/np-warehouse-picker";
import { usePortalConfirm } from "../../../_components/use-portal-confirm";
import { SeatsEditor, type SeatInit } from "./seats-editor";
import type { SuggestedSeat } from "@/lib/manager/warehouse-seat-suggest";

/** Публічне посилання відстеження Нової Пошти за номером ТТН. */
function trackingUrl(cargoNumber: string): string {
  return `https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(
    cargoNumber,
  )}`;
}

interface TaskItem {
  id: string;
  productName: string;
  articleCode: string | null;
  barcode: string | null;
  sector: string | null;
  quantity: number;
  weight: number;
  packed: boolean;
  packaging: string | null;
}

interface TaskData {
  id: string;
  status: string;
  customerName: string;
  deliveryLabel: string | null;
  deliveryMethod: string | null;
  novaPoshtaBranch: string | null;
  expressWaybill: string | null;
  deliveryAddress: string | null;
  managerName: string | null;
  comment: string | null;
  receivedByName: string | null;
  receivedAt: string | null;
  sentByName: string | null;
  sentAt: string | null;
  labelPrintedAt: string | null;
  saleId: string | null;
  saleNumber: string;
  saleTtnRef: string | null;
  saleExpressWaybill: string | null;
  /** Реалізація з накладкою (COD) — тоді очікуємо чек Checkbox. */
  saleCashOnDelivery: boolean;
  /** Реф-и відділення-отримувача НП (для зміни при підготовці). */
  npCityRef: string | null;
  npCityName: string | null;
  npWarehouseRef: string | null;
  npWarehouseName: string | null;
  /** Статус чека Checkbox: "created" | "failed" | "pending" | null. */
  receiptStatus: string | null;
  /** Остання помилка створення чека Checkbox. */
  receiptError: string | null;
  seats: SeatInit[];
  items: TaskItem[];
}

const DEFAULT_STATUS = { label: "Нове", cls: "bg-amber-100 text-amber-700" };
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  new: DEFAULT_STATUS,
  received: { label: "В роботі", cls: "bg-blue-100 text-blue-700" },
  sent: { label: "Відправлено", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Скасовано", cls: "bg-gray-100 text-gray-500" },
};

const BASE = "/api/v1/manager/warehouse-tasks";

export function WarehouseTaskClient({
  task,
  canAct,
  canDelete = false,
  ttnDraft,
  ttnStatusText,
  suggestedSeats = [],
}: {
  task: TaskData;
  /** Чи може користувач діяти (склад/адмін/власник). Менеджер — лише перегляд. */
  canAct: boolean;
  /** Може вилучити завдання (менеджер реалізації, що його створив, або admin/owner). */
  canDelete?: boolean;
  /** ТТН НП ще «Чернетка» — тоді габарити/друк доступні навіть на відправленому. */
  ttnDraft: boolean;
  /** Людський статус ТТН НП (для нотатки, коли вже в дорозі). */
  ttnStatusText: string | null;
  /** Пропоновані місця з габаритів карток товарів (склад перевіряє/коригує). */
  suggestedSeats?: SuggestedSeat[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = usePortalConfirm();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [ttn, setTtn] = useState(task.expressWaybill ?? "");
  // Локальний стан «запаковано» для миттєвого відгуку.
  const [packed, setPacked] = useState<Record<string, boolean>>(
    Object.fromEntries(task.items.map((i) => [i.id, i.packed])),
  );
  // Відділення-отримувач НП (склад може змінити при підготовці).
  const [recipient, setRecipient] = useState<NpSelection>({
    cityRef: task.npCityRef ?? "",
    cityName: task.npCityName ?? "",
    warehouseRef: task.npWarehouseRef ?? "",
    warehouseName: task.npWarehouseName ?? "",
  });
  const [recipientBusy, setRecipientBusy] = useState(false);
  const [recipientResult, setRecipientResult] = useState<{
    ok: boolean;
    number?: string;
    error?: string;
  } | null>(null);

  const st = STATUS_LABEL[task.status] ?? DEFAULT_STATUS;
  const isPost =
    task.deliveryMethod === "post" || task.deliveryMethod === "ukrposhta";
  // Нова Пошта: є ТТН у реалізації АБО спосіб доставки класифікується як «post».
  const isNovaPoshta =
    Boolean(task.saleTtnRef) ||
    classifyDelivery(task.deliveryMethod, task.deliveryLabel) === "post";
  const hasTtn = Boolean(task.saleTtnRef);
  // «Готово» для НП доступне лише після друку етикетки.
  const needsLabel = hasTtn && !task.labelPrintedAt;
  const isSent = task.status === "sent";
  // Габарити можна правити поки завдання не відправлене АБО ТТН ще чернетка в НП.
  const canEditSeats = canAct && isNovaPoshta && (!isSent || ttnDraft);
  // Відправлене НП-завдання, чия ТТН уже в дорозі — місця лише для читання.
  const seatsLocked = canAct && isNovaPoshta && isSent && !ttnDraft;
  // Чек Checkbox (ETTN) — індикатор після «Готово» для накладки (COD).
  const showReceipt = task.saleCashOnDelivery && isSent;
  const receiptCreated = task.receiptStatus === "created";
  // Відділення-отримувача НП можна правити, поки завдання не відправлене АБО
  // ТТН ще «Чернетка» в НП (та сама умова, що й для габаритів).
  const canEditRecipient = canAct && isNovaPoshta && (!isSent || ttnDraft);
  const recipientLocked = canAct && isNovaPoshta && isSent && !ttnDraft;

  function printLabel() {
    window.open(`${BASE}/${task.id}/label`, "_blank");
    // Даємо серверу час позначити labelPrintedAt, тоді оновлюємо стан сторінки.
    setTimeout(() => startTransition(() => router.refresh()), 1500);
  }

  async function call(url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: j.error ?? "Помилка",
          variant: "destructive",
        });
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function togglePacked(itemId: string, next: boolean) {
    setPacked((p) => ({ ...p, [itemId]: next }));
    try {
      await fetch(`${BASE}/${task.id}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packed: next }),
      });
    } catch {
      // локальний стан лишається; best-effort
    }
  }

  async function send() {
    const ok = await call(`${BASE}/${task.id}/send`, {
      expressWaybill: ttn.trim() || undefined,
    });
    if (ok) toast({ description: "Позначено як відправлено ✓" });
  }

  async function saveRecipient() {
    setRecipientBusy(true);
    setRecipientResult(null);
    try {
      const res = await fetch(`${BASE}/${task.id}/recipient-warehouse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npCityRef: recipient.cityRef,
          npCityName: recipient.cityName || null,
          npWarehouseRef: recipient.warehouseRef,
          npWarehouseName: recipient.warehouseName || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        ttn?: { ok: boolean; number?: string; error?: string };
      };
      if (!res.ok || j.ok === false) {
        setRecipientResult({
          ok: false,
          error: j.error ?? j.ttn?.error ?? "Помилка",
        });
        return;
      }
      setRecipientResult({
        ok: Boolean(j.ttn?.ok),
        number: j.ttn?.number,
        error: j.ttn?.error,
      });
      startTransition(() => router.refresh());
    } finally {
      setRecipientBusy(false);
    }
  }

  function askDelete() {
    confirm({
      title: "Вилучити завдання?",
      message: `Завдання «${task.customerName}» зникне зі списку відправлень. Реалізацію це не зачепить.`,
      destructive: true,
      confirmLabel: "Вилучити",
      cancelLabel: "Скасувати",
      onConfirm: async () => {
        const res = await fetch(`${BASE}/${task.id}`, { method: "DELETE" });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast({
            description: j.error ?? "Не вдалося вилучити",
            variant: "destructive",
          });
          return;
        }
        toast({ description: "Завдання вилучено" });
        router.push("/manager/warehouse-tasks");
        router.refresh();
      },
    });
  }

  async function retryReceipt() {
    if (!task.saleId) return;
    setReceiptBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/sales/${task.saleId}/create-receipt`,
        { method: "POST" },
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || j.ok === false) {
        toast({
          description: j.error ?? "Не вдалося створити чек",
          variant: "destructive",
        });
      } else {
        toast({ description: "Чек Checkbox створено ✓" });
      }
      startTransition(() => router.refresh());
    } finally {
      setReceiptBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-800">
            Завдання: {task.customerName}
          </h1>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}
            >
              {st.label}
            </span>
            {canDelete && (
              <button
                type="button"
                onClick={askDelete}
                className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
              >
                Вилучити
              </button>
            )}
          </div>
        </div>
        {confirmDialog}
        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Реалізація">
            {task.saleId ? (
              <Link
                href={`/manager/sales/${task.saleId}`}
                className="text-blue-600 hover:text-blue-700"
              >
                {task.saleNumber}
              </Link>
            ) : (
              task.saleNumber
            )}
          </Field>
          <Field label="Доставка">{task.deliveryLabel ?? "—"}</Field>
          {task.novaPoshtaBranch && (
            <Field label="№ відділення">{task.novaPoshtaBranch}</Field>
          )}
          {task.expressWaybill && (
            <Field label="ТТН / трек">
              {task.deliveryMethod === "post" ? (
                <a
                  href={trackingUrl(task.expressWaybill)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono font-semibold text-blue-600 hover:text-blue-700"
                >
                  {task.expressWaybill}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="font-mono font-semibold text-gray-900">
                  {task.expressWaybill}
                </span>
              )}
            </Field>
          )}
          {task.deliveryAddress && (
            <Field label="Адреса">{task.deliveryAddress}</Field>
          )}
          {task.managerName && (
            <Field label="Менеджер">{task.managerName}</Field>
          )}
          {task.receivedByName && (
            <Field label="Прийняв">
              {task.receivedByName}
              {task.receivedAt
                ? ` · ${new Date(task.receivedAt).toLocaleString("uk-UA")}`
                : ""}
            </Field>
          )}
          {task.sentByName && (
            <Field label="Відправив">
              {task.sentByName}
              {task.sentAt
                ? ` · ${new Date(task.sentAt).toLocaleString("uk-UA")}`
                : ""}
            </Field>
          )}
        </dl>
        {isPost && task.status !== "sent" && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Перевірте у кабінеті Нової Пошти, чи створена ТТН правильно (за
            потреби внесіть корективи або створіть нову).
          </p>
        )}
      </section>

      {/* Чек Checkbox (ETTN) — індикатор після відправлення для накладки */}
      {showReceipt && (
        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            <Receipt className="h-4 w-4" />
            Чек Checkbox
          </h2>
          {receiptCreated ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700">
              <Check className="h-4 w-4" />
              Чек Checkbox створено
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-red-700">
                ⚠ Чек не створено
                {task.receiptError ? `: ${task.receiptError}` : ""}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={receiptBusy}
                onClick={() => void retryReceipt()}
              >
                <RefreshCw
                  className={`mr-1 h-4 w-4 ${receiptBusy ? "animate-spin" : ""}`}
                />
                {receiptBusy ? "Створення…" : "Повторити чек"}
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Позиції */}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-gray-800">
          Підготувати лоти ({task.items.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
                {canAct && <th className="w-10 px-2 py-2"></th>}
                <th className="px-2 py-2 font-medium">Товар</th>
                <th className="px-2 py-2 font-medium">Сектор</th>
                <th className="px-2 py-2 font-medium">ШК</th>
                <th className="px-2 py-2 text-right font-medium">К-сть</th>
                <th className="px-2 py-2 text-right font-medium">Вага</th>
              </tr>
            </thead>
            <tbody>
              {task.items.map((it) => (
                <tr
                  key={it.id}
                  className={`border-b last:border-b-0 ${
                    packed[it.id] ? "bg-green-50 text-gray-500" : ""
                  }`}
                >
                  {canAct && (
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={packed[it.id] ?? false}
                        disabled={task.status === "sent"}
                        onChange={(e) =>
                          void togglePacked(it.id, e.target.checked)
                        }
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        aria-label="Запаковано"
                      />
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 font-medium text-gray-800">
                      {it.productName}
                      {it.packaging === "bag" && (
                        <span className="inline-flex rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                          мішок · ручна обробка
                        </span>
                      )}
                      {it.packaging === "box" && (
                        <span className="inline-flex rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          коробка
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {it.articleCode ? `Арт. ${it.articleCode}` : "Арт. —"}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-gray-700">
                    {it.sector ?? "—"}
                  </td>
                  <td className="px-2 py-2 font-mono text-gray-600">
                    {it.barcode ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-700">
                    {it.quantity}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-700">
                    {it.weight.toFixed(1)} кг
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Відділення отримувача (Нова Пошта) — склад може змінити при підготовці */}
      {canEditRecipient && (
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-800">
            <MapPin className="h-4 w-4" />
            Відділення отримувача (Нова Пошта)
          </h2>
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Для мішків (ручна обробка) відділення-отримувач має бути ВАНТАЖНИМ,
            інакше Нова Пошта відхилить.
          </p>
          <div className="grid gap-3">
            <NpWarehousePicker
              cityRef={recipient.cityRef}
              cityName={recipient.cityName}
              warehouseRef={recipient.warehouseRef}
              warehouseName={recipient.warehouseName}
              onChange={setRecipient}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={
                recipientBusy || !recipient.cityRef || !recipient.warehouseRef
              }
              onClick={() => void saveRecipient()}
            >
              {recipientBusy ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="mr-1 h-4 w-4" />
              )}
              {recipientBusy ? "Збереження…" : "Зберегти відділення"}
            </Button>
            {recipientResult &&
              (recipientResult.number ? (
                <span className="text-sm font-medium text-green-700">
                  ТТН оновлено: {recipientResult.number}
                </span>
              ) : recipientResult.error ? (
                <span className="text-sm font-medium text-red-700">
                  {recipientResult.error}
                </span>
              ) : recipientResult.ok ? (
                <span className="text-sm font-medium text-green-700">
                  Відділення збережено ✓
                </span>
              ) : null)}
          </div>
        </section>
      )}

      {/* Відправлене НП, ТТН у дорозі — відділення лише для читання */}
      {recipientLocked && (
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-800">
            <MapPin className="h-4 w-4" />
            Відділення отримувача (Нова Пошта)
          </h2>
          <p className="mb-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            ТТН уже в дорозі{ttnStatusText ? ` (${ttnStatusText})` : ""} — зміна
            відділення недоступна.
          </p>
          <p className="text-sm text-gray-800">
            {task.npCityName || task.npWarehouseName
              ? [task.npCityName, task.npWarehouseName]
                  .filter(Boolean)
                  .join(" — ")
              : "Відділення не вказано."}
          </p>
        </section>
      )}

      {/* Місця відправлення (габарити) — лише для Нової Пошти */}
      {canEditSeats && (
        <SeatsEditor
          taskId={task.id}
          initialSeats={task.seats}
          suggestedSeats={suggestedSeats}
        />
      )}

      {/* Відправлено, ТТН у дорозі — місця лише для читання */}
      {seatsLocked && (
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-800">
            Місця відправлення (габарити)
          </h2>
          <p className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            ТТН уже в дорозі{ttnStatusText ? ` (${ttnStatusText})` : ""} — зміни
            недоступні.
          </p>
          {task.seats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="w-8 px-2 py-2 font-medium">№</th>
                    <th className="px-2 py-2 font-medium">Вага, кг</th>
                    <th className="px-2 py-2 font-medium">Д×Ш×В, см</th>
                    <th className="px-2 py-2 font-medium">Об'ємна вага, кг</th>
                    <th className="px-2 py-2 font-medium">Ручна обробка</th>
                  </tr>
                </thead>
                <tbody>
                  {task.seats.map((s, i) => (
                    <tr key={s.id} className="border-b last:border-b-0">
                      <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                      <td className="px-2 py-2 text-gray-700">{s.weight}</td>
                      <td className="px-2 py-2 text-gray-700">
                        {s.lengthCm}×{s.widthCm}×{s.heightCm}
                      </td>
                      <td className="px-2 py-2 text-gray-700">
                        {Math.round(
                          ((s.lengthCm * s.widthCm * s.heightCm) / 4000) * 100,
                        ) / 100 || "—"}
                      </td>
                      <td className="px-2 py-2 text-gray-700">
                        {s.manualHandling ? "Так" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Місця не вказано.</p>
          )}
        </section>
      )}

      {/* Відправлено, ТТН ще чернетка — можна передрукувати етикетку */}
      {canAct && isNovaPoshta && isSent && ttnDraft && (
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-800">
            Етикетка
          </h2>
          <p className="mb-3 text-xs text-gray-500">
            ТТН ще чернетка в Новій Пошті — за потреби виправте габарити вище та
            передрукуйте етикетку.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!hasTtn}
              onClick={printLabel}
            >
              <Printer className="mr-1 h-4 w-4" />
              Друк етикетки
            </Button>
            {task.labelPrintedAt && (
              <span className="inline-flex items-center gap-1 text-sm text-green-700">
                <Check className="h-4 w-4" />
                Етикетку надруковано
              </span>
            )}
          </div>
        </section>
      )}

      {/* Дії складу: друк етикетки → «Готово» (закриває завдання + сповіщає менеджера) */}
      {canAct && task.status !== "sent" && (
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-800">Дії</h2>
          <div className="space-y-3">
            {isPost && !isNovaPoshta && (
              <div className="max-w-sm">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  ТТН / трек-номер (за потреби уточніть)
                </label>
                <Input
                  value={ttn}
                  onChange={(e) => setTtn(e.target.value)}
                  placeholder="номер накладної"
                />
              </div>
            )}
            {/* Крок 1 — друк етикетки Нової Пошти */}
            {isNovaPoshta && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!hasTtn}
                    onClick={printLabel}
                  >
                    <Printer className="mr-1 h-4 w-4" />
                    Друк етикетки
                  </Button>
                  {task.labelPrintedAt && (
                    <span className="inline-flex items-center gap-1 text-sm text-green-700">
                      <Check className="h-4 w-4" />
                      Етикетку надруковано
                    </span>
                  )}
                </div>
                {!hasTtn && (
                  <p className="text-xs text-amber-600">
                    Спершу створіть ТТН у реалізації.
                  </p>
                )}
              </div>
            )}
            {/* Крок 2 — «Готово»: доступне після друку етикетки (для НП) */}
            {needsLabel && (
              <p className="text-xs text-amber-600">
                Спершу надрукуйте етикетку — тоді зʼявиться кнопка «Готово».
              </p>
            )}
            <Button
              type="button"
              disabled={busy || needsLabel}
              onClick={() => void send()}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <Check className="mr-1 h-4 w-4" />
              Готово
            </Button>
          </div>
        </section>
      )}
    </div>
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
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-gray-800">{children}</dd>
    </div>
  );
}
