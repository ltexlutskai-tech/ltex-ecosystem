"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@ltex/ui";

/**
 * Кнопки дій казначейського документа: Провести (draft→posted) / Скасувати
 * проведення (posted→cancelled) / Видалити (лише draft|cancelled).
 *
 * `basePath` = REST-база документа, напр. `/api/v1/manager/bank-payments-incoming`.
 * `listPath` = куди повернутись після видалення.
 */
export function TreasuryDocActions({
  basePath,
  listPath,
  id,
  status,
  canDelete,
}: {
  basePath: string;
  listPath: string;
  id: string;
  status: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run(action: "post" | "cancel"): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(`${basePath}/${id}/${action}`, {
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
      toast({
        title:
          action === "post" ? "Документ проведено" : "Проведення скасовано",
      });
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

  async function remove(): Promise<void> {
    if (!window.confirm("Видалити документ? Дію не можна скасувати.")) return;
    setBusy(true);
    try {
      const res = await fetch(`${basePath}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: body.error ?? `Помилка ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Документ видалено" });
      router.push(listPath);
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
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <Button type="button" disabled={busy} onClick={() => void run("post")}>
          {busy ? "…" : "Провести"}
        </Button>
      )}
      {status === "posted" && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void run("cancel")}
        >
          {busy ? "…" : "Скасувати проведення"}
        </Button>
      )}
      {canDelete && status !== "posted" && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void remove()}
          className="border-red-300 text-red-700 hover:bg-red-50"
        >
          Видалити
        </Button>
      )}
    </div>
  );
}
