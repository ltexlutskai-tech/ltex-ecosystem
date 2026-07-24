"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@ltex/ui";
import { usePortalConfirm } from "../../_components/use-portal-confirm";

/**
 * «Вилучити» відеозавдання (список/детальна). Рендериться лише коли сервер
 * дозволив (менеджер-замовник або admin/owner) — роут додатково перевіряє.
 * У списку кнопка живе всередині <Link>-рядка, тому глушимо клік
 * (preventDefault + stopPropagation), щоб не відкривати картку.
 */
export function VideoTaskDeleteButton({
  taskId,
  label,
  afterDelete,
}: {
  taskId: string;
  /** Підпис у підтвердженні (назва товару / клієнт). */
  label: string;
  /** refresh — оновити список; toList — перейти на список (з детальної). */
  afterDelete: "refresh" | "toList";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = usePortalConfirm();
  const [busy, setBusy] = useState(false);

  function ask() {
    confirm({
      title: "Вилучити завдання?",
      message: `«${label}» зникне зі списку відеозони. Броні, поставлені цим завданням, буде знято.`,
      destructive: true,
      confirmLabel: "Вилучити",
      cancelLabel: "Скасувати",
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/v1/manager/video-tasks/${taskId}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            toast({
              title: data.error ?? "Не вдалося вилучити",
              variant: "destructive",
            });
            return;
          }
          toast({ title: "Завдання вилучено" });
          if (afterDelete === "toList") {
            router.push("/manager/video-tasks");
          }
          router.refresh();
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ask();
        }}
        className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Вилучити
      </button>
      {dialog}
    </>
  );
}
