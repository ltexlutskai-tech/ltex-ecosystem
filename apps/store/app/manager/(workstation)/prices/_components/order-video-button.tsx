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
import { buildVideoRequestText } from "@/lib/manager/share-message";
import { ClientPicker } from "../../orders/new/_components/client-picker";
import type { ClientPickerItem } from "../../orders/new/_components/types";
import { ShareSheet } from "./share-sheet";

/**
 * Manager «Прайс» — Stage 5a сценарій «Замовити відео».
 *
 * Менеджер обирає клієнта (перевикористаний `ClientPicker`) + кількість штук →
 * на submit:
 *  1) будує текст-запит `buildVideoRequestText` (артикул, назва, к-сть, клієнт,
 *     телефон, продавець = поточний менеджер);
 *  2) відкриває `ShareSheet` (копіювати / месенджер);
 *  3) створює нагадування-стеження за відео на обраного клієнта через глобальний
 *     `POST /api/v1/manager/reminders` (`orderVideo=true, periodicity=event`,
 *     з `productId`/`lotId`) — fire-and-forget, не блокує відкриття вікна
 *     «Поділитися». Cron `generate-reminders` «спрацьовує» його у нагадування
 *     «Скинути Viber», коли на товарі/лоті з'явиться відео.
 */

interface Props {
  /** Дані товара для тексту. */
  productName: string;
  articleCode: string | null;
  /** ID товара (обов'язково — для нагадування-стеження за відео). */
  productId: string;
  /** ID конкретного лоту (коли flow запущено з картки лоту). */
  lotId?: string;
  /** Штрих-код лоту (для тексту нагадування), коли lot-scoped. */
  barcode?: string;
  /** ПІБ поточного менеджера (продавець). */
  sellerName: string;
  /** Стиль кнопки-тригера. */
  buttonVariant?: "outline" | "default";
  buttonSize?: "sm" | "default";
  /**
   * «Безголовий» режим — не рендерити власну кнопку-тригер. Використовується
   * коли flow «Замовити відео» запускається ззовні (напр. з контекстного меню
   * рядка прайсу). У цьому режимі форму відкривають через `open`/`onOpenChange`.
   */
  hideTrigger?: boolean;
  /** Контрольований стан форми (для `hideTrigger`-режиму). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function OrderVideoButton({
  productName,
  articleCode,
  productId,
  lotId,
  barcode,
  sellerName,
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");
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

  /** Дістає основний телефон клієнта (для тексту). null коли недоступний. */
  async function fetchClientPhone(id: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/v1/manager/clients/${id}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { phonePrimary?: string | null };
      return data.phonePrimary ?? null;
    } catch {
      return null;
    }
  }

  async function handleSubmit() {
    if (!clientId || !clientSummary) return;
    setSubmitting(true);
    try {
      const clientPhone = await fetchClientPhone(clientId);
      const text = buildVideoRequestText({
        articleCode,
        productName,
        quantity,
        clientName: clientSummary.name,
        clientPhone,
        sellerName,
      });
      setShareText(text);

      // Нагадування-стеження за відео (fire-and-forget — не блокує вікно
      // «Поділитися»). periodicity=event → дзвіночок не «нагадує» по часу; cron
      // `generate-reminders` сам спрацює його у «Скинути Viber», коли з'явиться
      // відео на товарі/лоті.
      void fetch(`/api/v1/manager/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: `Очікуємо відео: ${productName}${barcode ? " · " + barcode : ""} для ${clientSummary.name}`,
          remindAt: new Date().toISOString(),
          periodicity: "event",
          orderVideo: true,
          clientId,
          productId,
          lotId: lotId ?? null,
        }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        })
        .catch(() => {
          toast({
            title: "Нагадування не створено",
            description: "Перевірте розділ «Нагадування» вручну.",
            variant: "destructive",
          });
        });

      setFormOpen(false);
      resetForm();
      setShareOpen(true);
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
              Оберіть клієнта та кількість штук — сформуємо запит на зйомку й
              нагадування на +3 дні.
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
                {submitting ? "…" : "Сформувати запит"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Замовити відео"
        text={shareText}
      />
    </>
  );
}
