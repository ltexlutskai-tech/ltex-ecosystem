"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tag, X } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";

/** Розбиває рядок ключових слів (через кому) на масив тегів. */
function parseKeywords(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

interface Props {
  clientId: string;
  keywords: string | null;
  /** true → owner/admin, можна редагувати теги. */
  canEdit?: boolean;
  /** true → masked read-only view (чужий клієнт). */
  isForeign?: boolean;
}

export function ClientKeywordsTab({
  clientId,
  keywords,
  canEdit = false,
  isForeign = false,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [tags, setTags] = useState<string[]>(() => parseKeywords(keywords));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const editable = canEdit && !isForeign;

  async function persist(next: string[]) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          keywords: next.length > 0 ? next.join(", ") : null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка збереження",
          variant: "destructive",
        });
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function addTag() {
    const value = draft.trim();
    if (!value) return;
    if (tags.some((t) => t.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      setDraft("");
      return;
    }
    const next = [...tags, value];
    if (next.join(", ").length > 500) {
      toast({
        description: "Забагато ключових слів (макс. 500 символів)",
        variant: "destructive",
      });
      return;
    }
    const ok = await persist(next);
    if (ok) {
      setTags(next);
      setDraft("");
    }
  }

  async function removeTag(tag: string) {
    const next = tags.filter((t) => t !== tag);
    const ok = await persist(next);
    if (ok) setTags(next);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Tag className="h-4 w-4 text-gray-400" /> Ключові слова
        </h3>
        <p className="mb-3 text-xs text-gray-500">
          Теги для пошуку/фільтра клієнтів у списку.
        </p>

        {tags.length === 0 ? (
          <p className="text-sm text-gray-500">Ключових слів не вказано.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm text-gray-700"
              >
                {tag}
                {editable && (
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    disabled={busy}
                    aria-label={`Прибрати «${tag}»`}
                    title="Прибрати"
                    className="flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {editable && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addTag();
                }
              }}
              placeholder="Нове ключове слово"
              maxLength={100}
              className="h-8 w-56"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void addTag()}
              disabled={busy || !draft.trim()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Додати
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
