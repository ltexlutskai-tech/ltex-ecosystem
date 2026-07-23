"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Картка клієнта — «Замовити відео» (Відеозона, 2026-07-23).
 *
 * Менеджер шукає товар + вказує кількість → створюється завдання на відеоогляд
 * для ЦЬОГО клієнта (`POST /api/v1/manager/video-tasks`, клієнт фіксований).
 * Далі — стандартний потік: склад приносить мішок, відеозона знімає й описує.
 */

interface ProductHit {
  id: string;
  name: string;
  articleCode: string | null;
}

export function ClientVideoOrderButton({
  clientId,
}: {
  clientId: string; // MgrClient.id
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [picked, setPicked] = useState<ProductHit | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (picked || q.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(
          `/api/v1/manager/products/search?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { items?: ProductHit[] };
        setHits(data.items ?? []);
      } catch {
        /* aborted / ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open, picked]);

  function reset() {
    setQuery("");
    setHits([]);
    setPicked(null);
    setQuantity(1);
  }

  async function submit() {
    if (!picked) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/manager/video-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: picked.id, clientId, quantity }),
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
        description: "Склад принесе мішок, відеозона зніме огляд.",
      });
      setOpen(false);
      reset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-10"
      >
        Замовити відео
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          setOpen(o);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Замовити відео</DialogTitle>
            <DialogDescription>
              Знайдіть товар — відеозона зніме для клієнта відеоогляд.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {picked ? (
              <div className="flex items-center justify-between rounded-md border bg-gray-50 p-2 text-sm">
                <span className="min-w-0 truncate">
                  {picked.name}
                  {picked.articleCode ? ` · ${picked.articleCode}` : ""}
                </span>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600"
                  onClick={() => setPicked(null)}
                >
                  Змінити
                </button>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Товар
                </label>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Назва / артикул…"
                  autoFocus
                />
                {hits.length > 0 ? (
                  <ul className="mt-1 max-h-56 overflow-auto rounded-md border">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                          onClick={() => {
                            setPicked(h);
                            setHits([]);
                          }}
                        >
                          {h.name}
                          {h.articleCode ? (
                            <span className="text-gray-400">
                              {" "}
                              · {h.articleCode}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}

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
                  reset();
                  setOpen(false);
                }}
              >
                Скасувати
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!picked || submitting}
                onClick={submit}
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
