"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@ltex/ui";
import { formatRelativeShort } from "../../_components/format-relative";
import type { MessengerSearchHit } from "./types";

/**
 * Пошук по тексту повідомлень у всіх моїх розмовах. Клік по результату відкриває
 * відповідну розмову.
 */
export function MessengerSearchDialog({
  open,
  onOpenChange,
  onOpenConversation,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MessengerSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setSearched(false);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/v1/manager/messenger/search?q=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        );
        if (r.ok) {
          const j = (await r.json()) as { hits: MessengerSearchHit[] };
          setHits(j.hits ?? []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Пошук у повідомленнях</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Введіть текст (мінімум 2 символи)…"
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-gray-400">Пошук…</p>
          ) : searched && hits.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              Нічого не знайдено.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenConversation(h.conversationId);
                    }}
                    className="block w-full px-1 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-800">
                        {h.conversationTitle}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-gray-400">
                        {formatRelativeShort(h.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {h.authorName ? `${h.authorName}: ` : ""}
                      {h.snippet}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
