"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Input, toast } from "@ltex/ui";
import { Plus, Search } from "lucide-react";
import {
  addFeatured,
  searchProductsForFeatured,
  type FeaturedSearchResult,
} from "./actions";

export function AddFeaturedForm() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FeaturedSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchProductsForFeatured(trimmed);
        if (!cancelled) setResults(found);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: "Помилка пошуку",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function handleAdd(productId: string) {
    startTransition(async () => {
      try {
        await addFeatured(productId);
        toast({ title: "Додано до топ товарів", variant: "success" });
        setResults((prev) => prev.filter((p) => p.id !== productId));
      } catch (err) {
        toast({
          title: "Не вдалося додати",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук товару для додавання..."
          className="pl-9"
        />
      </div>

      {searching && <p className="text-xs text-gray-500">Пошук...</p>}

      {!searching && query.trim() && results.length === 0 && (
        <p className="text-sm text-gray-500">Нічого не знайдено</p>
      )}

      {results.length > 0 && (
        <ul className="max-h-96 divide-y overflow-y-auto rounded border">
          {results.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 p-2 hover:bg-gray-50"
            >
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image}
                    alt={p.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-gray-400">
                    —
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.name}</div>
                {p.articleCode && (
                  <div className="truncate text-xs text-gray-500">
                    Арт. {p.articleCode}
                  </div>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() => handleAdd(p.id)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Додати
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
