"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, useToast } from "@ltex/ui";
import {
  PackageCheck,
  Truck,
  ExternalLink,
  Printer,
  Check,
} from "lucide-react";
import { classifyDelivery } from "@/lib/manager/order-delivery";
import { SeatsEditor, type SeatInit } from "./seats-editor";

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
}: {
  task: TaskData;
  /** Чи може користувач діяти (склад/адмін/власник). Менеджер — лише перегляд. */
  canAct: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [ttn, setTtn] = useState(task.expressWaybill ?? "");
  // Локальний стан «запаковано» для миттєвого відгуку.
  const [packed, setPacked] = useState<Record<string, boolean>>(
    Object.fromEntries(task.items.map((i) => [i.id, i.packed])),
  );

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
  const allPacked = task.items.every((i) => packed[i.id]);

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

  async function receive() {
    const ok = await call(`${BASE}/${task.id}/receive`);
    if (ok) toast({ description: "Завдання прийнято ✓" });
  }

  async function send() {
    const ok = await call(`${BASE}/${task.id}/send`, {
      expressWaybill: ttn.trim() || undefined,
    });
    if (ok) toast({ description: "Позначено як відправлено ✓" });
  }

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-800">
            Завдання: {task.customerName}
          </h1>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}
          >
            {st.label}
          </span>
        </div>
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
                    <div className="font-medium text-gray-800">
                      {it.productName}
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

      {/* Місця відправлення (габарити) — лише для Нової Пошти */}
      {canAct && isNovaPoshta && task.status !== "sent" && (
        <SeatsEditor taskId={task.id} initialSeats={task.seats} />
      )}

      {/* Дії складу */}
      {canAct && task.status !== "sent" && (
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-800">Дії</h2>
          {task.status === "new" && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void receive()}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <PackageCheck className="mr-1 h-4 w-4" />
              Прийняти в роботу
            </Button>
          )}
          {task.status === "received" && (
            <div className="space-y-3">
              {isPost && (
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
              {/* Друк етикетки Нової Пошти */}
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
                  <p className="text-xs text-gray-500">
                    Якщо етикетка не відкрилась — перевірте, що ТТН створено.
                  </p>
                </div>
              )}
              {!allPacked && (
                <p className="text-xs text-amber-600">
                  Відмітьте всі позиції як запаковані перед відправленням.
                </p>
              )}
              {needsLabel && (
                <p className="text-xs text-amber-600">
                  Спершу надрукуйте етикетку.
                </p>
              )}
              <Button
                type="button"
                disabled={busy || !allPacked || needsLabel}
                onClick={() => void send()}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                <Truck className="mr-1 h-4 w-4" />
                Запаковано + ТТН — відправлено
              </Button>
            </div>
          )}
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
