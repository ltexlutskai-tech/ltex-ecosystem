"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Tag, X } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";
import { AutosaveStatus } from "../../../_components/autosave-status";
import type { DocAutosaveStatus } from "@/lib/autosave/use-document-autosave";

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

/** Стабільна палітра для тега (колір за хешем слова — однаковий скрізь). */
const TAG_PALETTE = [
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-purple-100 text-purple-800",
  "bg-amber-100 text-amber-800",
  "bg-pink-100 text-pink-800",
  "bg-cyan-100 text-cyan-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
] as const;

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash * 31 + tag.charCodeAt(i)) & 0xffffffff;
  }
  return (
    TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length] ??
    "bg-gray-100 text-gray-800"
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
  // Індикатор автозбереження — теги зберігаються одразу при додаванні/видаленні.
  const [saveStatus, setSaveStatus] = useState<DocAutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const editable = canEdit && !isForeign;

  async function persist(next: string[]) {
    setBusy(true);
    setSaveStatus("saving");
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
        setSaveStatus("offline");
        toast({
          description: err.error ?? "Помилка збереження",
          variant: "destructive",
        });
        return false;
      }
      setSavedAt(new Date());
      setSaveStatus("saved");
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
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Tag className="h-4 w-4 text-gray-400" /> Ключові слова
          </h3>
          {editable && <AutosaveStatus status={saveStatus} savedAt={savedAt} />}
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Теги для пошуку/фільтра клієнтів у списку. Клікніть тег — щоб побачити
          всіх клієнтів з ним.
        </p>

        {tags.length === 0 ? (
          <p className="text-sm text-gray-500">Ключових слів не вказано.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm ${tagColor(tag)}`}
              >
                <Link
                  href={`/manager/customers?keywords=${encodeURIComponent(tag)}`}
                  className="hover:underline"
                  title={`Показати клієнтів з тегом «${tag}»`}
                >
                  {tag}
                </Link>
                {editable && (
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    disabled={busy}
                    aria-label={`Прибрати «${tag}»`}
                    title="Прибрати"
                    className="flex h-4 w-4 items-center justify-center rounded-full text-current opacity-60 hover:bg-white/50 hover:opacity-100"
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
