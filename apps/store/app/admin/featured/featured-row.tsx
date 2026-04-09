"use client";

import { useState, useTransition } from "react";
import { Button, Input, toast } from "@ltex/ui";
import { ArrowUp, ArrowDown, Trash2, Save } from "lucide-react";
import {
  moveFeaturedDown,
  moveFeaturedUp,
  removeFeatured,
  updateFeaturedNote,
} from "./actions";

interface FeaturedRowProps {
  entry: {
    id: string;
    note: string | null;
    product: {
      id: string;
      name: string;
      articleCode: string | null;
      slug: string;
      image: string | null;
    };
  };
  isFirst: boolean;
  isLast: boolean;
}

export function FeaturedRow({ entry, isFirst, isLast }: FeaturedRowProps) {
  const [note, setNote] = useState(entry.note ?? "");
  const [isPending, startTransition] = useTransition();

  function handleMoveUp() {
    startTransition(async () => {
      try {
        await moveFeaturedUp(entry.id);
      } catch (err) {
        toast({
          title: "Помилка",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function handleMoveDown() {
    startTransition(async () => {
      try {
        await moveFeaturedDown(entry.id);
      } catch (err) {
        toast({
          title: "Помилка",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function handleRemove() {
    if (!confirm(`Видалити "${entry.product.name}" з топ товарів?`)) return;
    startTransition(async () => {
      try {
        await removeFeatured(entry.id);
        toast({ title: "Видалено", variant: "success" });
      } catch (err) {
        toast({
          title: "Помилка",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function handleSaveNote() {
    startTransition(async () => {
      try {
        await updateFeaturedNote(entry.id, note);
        toast({ title: "Нотатку збережено", variant: "success" });
      } catch (err) {
        toast({
          title: "Помилка",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-3">
        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded bg-gray-100">
          {entry.product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.product.image}
              alt={entry.product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">
              —
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {entry.product.name}
          </div>
          {entry.product.articleCode && (
            <div className="truncate text-xs text-gray-500">
              Арт. {entry.product.articleCode}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Нотатка (необов'язково)"
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending || note === (entry.note ?? "")}
              onClick={handleSaveNote}
              aria-label="Зберегти нотатку"
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isFirst || isPending}
          onClick={handleMoveUp}
          aria-label="Перемістити вище"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isLast || isPending}
          onClick={handleMoveDown}
          aria-label="Перемістити нижче"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={handleRemove}
          aria-label="Видалити"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}
