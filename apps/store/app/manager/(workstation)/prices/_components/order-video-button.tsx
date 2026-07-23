"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  useToast,
} from "@ltex/ui";
import { ClientPicker } from "../../orders/new/_components/client-picker";
import type { ClientPickerItem } from "../../orders/new/_components/types";

/**
 * Manager «Прайс» — «Замовити відео» (Відеозона, 2026-07-23).
 *
 * Менеджер обирає клієнта + кількість → створюється завдання на відеоогляд
 * (`POST /api/v1/manager/video-tasks`, статус `new`): склад побачить його як
 * «принести мішок», відеозона — після принесення мішка зніме, заповнить
 * характеристики й сформує YouTube-опис. Коли відеозона тисне «Готово» — лот
 * бронюється на клієнта, а менеджеру приходить нагадування «відео готове» з
 * кнопкою «Надіслати відео клієнту».
 */

interface Props {
  productName: string;
  articleCode: string | null;
  /** ID товара — за ним створюється завдання й береться рандомний мішок. */
  productId: string;
  /** ШК конкретного лоту (коли flow з картки лоту) — стає підказкою складу. */
  barcode?: string;
  /** @deprecated більше не використовується (лишено для сумісності call-sites). */
  lotId?: string;
  /** @deprecated більше не використовується (лишено для сумісності call-sites). */
  sellerName?: string;
  buttonVariant?: "outline" | "default";
  buttonSize?: "sm" | "default";
  /** «Безголовий» режим (виклик із контекстного меню). */
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function OrderVideoButton({
  productName,
  productId,
  barcode,
  buttonVariant = "outline",
  buttonSize = "sm",
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const { toast } = useToast();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const formOpen = controlledOpen ?? uncontrolledOpen;
  const setFormOpen = (o: boolean) => {
    if (onOpenChange) onOpenChange(o);
    else setUncontrolledOpen(o);
  };
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSummary, setClientSummary] = useState<ClientPickerItem | null>(
    null,
  );
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setClientId(null);
    setClientSummary(null);
    setQuantity(1);
  }

  async function handleSubmit() {
    if (!clientId || !clientSummary) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/manager/video-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          clientId,
          quantity,
          requestedBarcode: barcode ?? null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: data.error ?? "Не вдалося замовити відео",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Відео замовлено",
        description: `Склад принесе мішок, відеозона зніме огляд для ${clientSummary.name}.`,
      });
      setFormOpen(false);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {!hideTrigger && (
        <Button
          type="button"
          variant={buttonVariant}
          size={buttonSize}
          onClick={() => setFormOpen(true)}
        >
          Замовити відео
        </Button>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(o) => {
          if (!o) resetForm();
          setFormOpen(o);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Замовити відео</DialogTitle>
            <DialogDescription>
              Оберіть клієнта та кількість штук — відеозона зніме огляд «
              {productName}» для нього.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <ClientPicker
              value={clientId}
              onChange={(id, summary) => {
                setClientId(id);
                setClientSummary(summary);
              }}
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Кількість, шт.
              </label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
              >
                Скасувати
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!clientId || submitting}
                onClick={handleSubmit}
              >
                {submitting ? "…" : "Замовити відео"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
