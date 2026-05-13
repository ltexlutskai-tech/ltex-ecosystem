"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea, useToast } from "@ltex/ui";

export function ClientHistoryCommentForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/clients/${clientId}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка збереження",
          variant: "destructive",
        });
        return;
      }
      setBody("");
      toast({ description: "Коментар додано" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Додати коментар про клієнта…"
        rows={3}
        maxLength={2000}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{body.length} / 2000</span>
        <Button
          type="button"
          onClick={submit}
          disabled={busy || body.trim().length === 0}
        >
          {busy ? "Записую…" : "Записати"}
        </Button>
      </div>
    </div>
  );
}
