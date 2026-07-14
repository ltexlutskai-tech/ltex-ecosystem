"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, useToast } from "@ltex/ui";

/**
 * Кнопка видалення касового ордера (оплати) у списку панелі оплат.
 * Двокрокове підтвердження (window.confirm блокується у вкладці-iframe).
 * Після видалення — router.refresh() (оновлює суми/список).
 */
export function PaymentDeleteButton({ cashOrderId }: { cashOrderId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/cash-orders/${cashOrderId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: j.error ?? "Не вдалось видалити оплату",
          variant: "destructive",
        });
        return;
      }
      toast({ description: "Оплату видалено ✓" });
      setConfirming(false);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void remove()}
          className="h-7 bg-red-600 px-2 text-xs text-white hover:bg-red-700"
        >
          Так
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="h-7 px-2 text-xs"
        >
          Ні
        </Button>
      </span>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setConfirming(true)}
      className="h-7 px-2 text-xs text-red-600 hover:bg-red-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
