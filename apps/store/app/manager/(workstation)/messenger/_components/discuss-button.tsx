"use client";

import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Button, useToast } from "@ltex/ui";
import type { MessengerDocRef } from "@/lib/messenger/types";
import { PickConversationDialog } from "./pick-conversation-dialog";

/**
 * Кнопка «Обговорити» для сторінок документів. Відкриває вибір розмови й
 * надсилає туди картку-посилання на документ (docRef). Кладеться на картку
 * будь-якого документа системи.
 */
export function DiscussButton({
  docRef,
  label = "Обговорити",
  size = "sm",
  variant = "outline",
}: {
  docRef: MessengerDocRef;
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default";
}) {
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
      toast({ description: "Надіслано у чат ✓" });
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
        size={size}
        variant={variant}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5"
      >
        <MessagesSquare className="h-4 w-4" />
        {label}
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
