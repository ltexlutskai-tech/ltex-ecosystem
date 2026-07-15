"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { Button, useToast } from "@ltex/ui";
import type { MessengerDocRef } from "@/lib/messenger/types";
import { PickConversationDialog } from "./pick-conversation-dialog";

/**
 * Кнопка «Обговорити» для сторінок документів — лише іконка (без тексту).
 * Відкриває вибір розмови, надсилає туди картку-посилання на документ (docRef),
 * і одразу переносить користувача у цей чат (`/manager/messenger?c=<id>`), де
 * повідомлення вже містить клікабельне посилання на документ. `label` йде у
 * tooltip/aria-label. Кладеться на картку будь-якого документа системи.
 */
export function DiscussButton({
  docRef,
  label = "Обговорити",
  variant = "outline",
}: {
  docRef: MessengerDocRef;
  label?: string;
  variant?: "outline" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function share(conversationId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/manager/messenger/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ docRef }),
        },
      );
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Не вдалось надіслати");
      }
      setOpen(false);
      // Переносимо користувача у чат, куди щойно надіслали посилання.
      router.push(`/manager/messenger?c=${encodeURIComponent(conversationId)}`);
    } catch (e) {
      toast({
        description: e instanceof Error ? e.message : "Помилка",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant={variant}
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
      >
        <MessagesSquare className="h-4 w-4" />
      </Button>
      <PickConversationDialog
        open={open}
        onOpenChange={setOpen}
        title="Обговорити з…"
        busy={busy}
        onPick={share}
      />
    </>
  );
}
