"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@ltex/ui";

/**
 * Кнопка «Провести» для чернетки касового ордера. Викликає
 * POST /cash-orders/[id]/post (draft→posted: рухи ДДС + борг + архів).
 */
export function PostCashOrderButton({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function post(): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/cash-orders/${id}/post`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: body.error ?? `Помилка ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Оплату проведено" });
      router.refresh();
    } catch (e) {
      toast({
        title: (e as Error).message ?? "Невідома помилка",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" disabled={busy} onClick={post}>
      {busy ? "Проведення…" : "Провести"}
    </Button>
  );
}
