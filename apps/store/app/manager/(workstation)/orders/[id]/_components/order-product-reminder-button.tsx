"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
  useToast,
} from "@ltex/ui";

/**
 * «🔔 Нагадування по товарах» — створення товарного нагадування прямо із
 * замовлення на конкретні позиції + клієнта (порт 1С: створити нагадування «из
 * заказа» на позиції ТЧ Товары). Менеджер обирає, по яких позиціях нагадати,
 * і система формує подієве товарне нагадування (isProductReminder, orderId).
 */

export interface OrderReminderProduct {
  productId: string;
  name: string;
  articleCode: string | null;
  quantity: number;
}

interface Props {
  /** MgrClient.id замовлення (null → створити не можна: чужий/нерезолвлений). */
  mgrClientId: string | null;
  clientName: string;
  orderId: string;
  products: OrderReminderProduct[];
}

export function OrderProductReminderButton({
  mgrClientId,
  clientName,
  orderId,
  products,
}: Props) {
  const [open, setOpen] = useState(false);

  if (products.length === 0) return null;

  const disabled = !mgrClientId;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={
          disabled
            ? "Нагадування можна створити лише для свого клієнта"
            : "Створити нагадування по товарах замовлення"
        }
      >
        🔔 Нагадування по товарах
      </Button>
      {mgrClientId && (
        <ReminderDialog
          open={open}
          onOpenChange={setOpen}
          mgrClientId={mgrClientId}
          clientName={clientName}
          orderId={orderId}
          products={products}
        />
      )}
    </>
  );
}

function ReminderDialog({
  open,
  onOpenChange,
  mgrClientId,
  clientName,
  orderId,
  products,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mgrClientId: string;
  clientName: string;
  orderId: string;
  products: OrderReminderProduct[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  // Стан вибору: productId → { checked, quantity }.
  const [rows, setRows] = useState(() =>
    products.map((p) => ({
      productId: p.productId,
      quantity: Math.max(1, p.quantity),
    })),
  );
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(products.map((p) => p.productId)),
  );

  const selected = rows.filter((r) => checked.has(r.productId));

  function toggle(productId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function setQty(productId: string, qty: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.productId === productId ? { ...r, quantity: Math.max(1, qty) } : r,
      ),
    );
  }

  async function submit() {
    if (selected.length === 0) {
      toast({ title: "Оберіть хоча б один товар", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isProductReminder: true,
          clientId: mgrClientId,
          orderId,
          items: selected.map((r) => ({
            productId: r.productId,
            quantity: r.quantity,
          })),
          body: note.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        skippedProductIds?: string[];
      };
      if (res.ok) {
        const skipped = data.skippedProductIds?.length ?? 0;
        toast({
          title: "Нагадування створено",
          description:
            skipped > 0
              ? `Пропущено ${skipped} товар(ів) — вони вже в активних нагадуваннях.`
              : undefined,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        toast({
          title: data.error ?? "Не вдалося створити",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Помилка зʼєднання", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const productById = new Map(products.map((p) => [p.productId, p]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Нагадування по товарах</DialogTitle>
          <DialogDescription>
            Клієнт: <strong>{clientName}</strong>. Оберіть позиції, по яких
            створити нагадування (наприклад, коли товар знову буде в наявності).
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {rows.map((r) => {
            const p = productById.get(r.productId);
            if (!p) return null;
            const on = checked.has(r.productId);
            return (
              <li
                key={r.productId}
                className="flex items-center gap-2 rounded-md border border-gray-200 p-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(r.productId)}
                  className="h-4 w-4 accent-green-600"
                  aria-label={`Обрати ${p.name}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-gray-800">{p.name}</span>
                  {p.articleCode ? (
                    <span className="ml-1 text-xs text-gray-400">
                      ({p.articleCode})
                    </span>
                  ) : null}
                </span>
                <Input
                  type="number"
                  min={1}
                  value={r.quantity}
                  onChange={(e) =>
                    setQty(
                      r.productId,
                      Number.parseInt(e.target.value, 10) || 1,
                    )
                  }
                  disabled={!on}
                  className="h-8 w-16 text-sm"
                  aria-label={`Кількість ${p.name}`}
                />
              </li>
            );
          })}
        </ul>

        <div>
          <label
            htmlFor="order-reminder-note"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Коментар (необовʼязково)
          </label>
          <Textarea
            id="order-reminder-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Напр.: передзвонити, коли завезуть"
            disabled={loading}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={loading || selected.length === 0}
          >
            {loading ? "Створення..." : `Створити (${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
