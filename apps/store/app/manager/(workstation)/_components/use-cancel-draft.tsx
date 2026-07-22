"use client";

import type { JSX } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@ltex/ui";
import { notifyPendingBadges } from "./notify-pending-badges";
import { usePortalConfirm } from "./use-portal-confirm";

/**
 * «Скасувати» у формах документів (Замовлення/Реалізація/Оплата).
 *
 * Форми автозберігають чернетку на сервер щойно обрано клієнта — тож простий
 * вихід лишав би «висячий» чернетковий документ у списку. Цей хук:
 *  • якщо чернетку створено В ЦІЙ сесії (нова, не проведена) — питає підтвердження
 *    і ВИДАЛЯЄ документ (усі зміни втрачаються), потім виходить;
 *  • якщо редагуємо наявний/проведений документ — просто виходить (не видаляє).
 *
 * `clearAll` викликається ПЕРШИМ, щоб зупинити відкладений автозберіг і він не
 * відтворив рядок після видалення.
 */
export function useCancelDraft(opts: {
  docKind: "orders" | "sales" | "cash-orders";
  savedId: string | null;
  /** true → документ створено у цій сесії (нова чернетка, можна видалити). */
  createdThisSession: boolean;
  /** true → документ проведено (ніколи не видаляємо). */
  isPosted: boolean;
  clearAll: () => void;
  /** Куди перейти після скасування. */
  cancelHref: string;
}): { cancel: () => void; dialog: JSX.Element | null } {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = usePortalConfirm();

  function cancel() {
    // Немає своєї чернетки (або редагуємо наявний/проведений) — просто виходимо.
    if (!opts.savedId || !opts.createdThisSession || opts.isPosted) {
      router.push(opts.cancelHref);
      return;
    }
    confirm({
      title: "Скасувати й видалити документ?",
      message:
        "Усі внесені дані та сам чернетковий документ буде видалено безповоротно. Продовжити?",
      destructive: true,
      confirmLabel: "Так, видалити",
      cancelLabel: "Ні, залишити",
      onConfirm: async () => {
        opts.clearAll(); // спершу зупиняємо відкладений автозберіг
        try {
          const res = await fetch(
            `/api/v1/manager/${opts.docKind}/${opts.savedId}`,
            { method: "DELETE", credentials: "include" },
          );
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            toast({
              description: j.error ?? "Не вдалося видалити чернетку",
              variant: "destructive",
            });
            return;
          }
        } catch {
          toast({ description: "Помилка мережі", variant: "destructive" });
          return;
        }
        notifyPendingBadges(); // оновити сайдбар-лічильники (best-effort)
        router.push(opts.cancelHref);
      },
    });
  }

  return { cancel, dialog };
}
