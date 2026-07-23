"use client";

import { useState } from "react";
import { Button, Input, useToast } from "@ltex/ui";

/**
 * Редактор довідника посилань YouTube-опису (Відеозона). Кожен рядок — ключ
 * опису: поточне значення (з БД) + плейсхолдер-дефолт. Порожнє поле = взяти
 * дефолт. «Зберегти» шле весь набір у PUT /api/v1/manager/video-links.
 */

export interface VideoLinkRow {
  key: string;
  label: string;
  defaultUrl: string;
  url: string;
}

export function VideoLinksEditor({ initial }: { initial: VideoLinkRow[] }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  const [saving, setSaving] = useState(false);

  function setUrl(key: string, url: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, url } : r)));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/manager/video-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          links: rows.map((r) => ({ key: r.key, url: r.url })),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: data.error ?? "Не вдалося зберегти",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Збережено",
        description: "Нові описи вже з цими значеннями.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-white p-4">
      {rows.map((r) => (
        <div key={r.key}>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {r.label}
          </label>
          <Input
            value={r.url}
            onChange={(e) => setUrl(r.key, e.target.value)}
            placeholder={r.defaultUrl || "— не показувати рядок —"}
          />
          {r.url === "" && r.defaultUrl ? (
            <p className="mt-0.5 text-xs text-gray-400">
              Використовується значення за замовчуванням.
            </p>
          ) : null}
        </div>
      ))}
      <div className="border-t pt-3">
        <Button type="button" disabled={saving} onClick={save}>
          {saving ? "…" : "Зберегти"}
        </Button>
      </div>
    </div>
  );
}
