"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Paperclip, Plus, X } from "lucide-react";
import { Button, Textarea, useToast } from "@ltex/ui";

interface UploadedAttachment {
  url: string;
  name: string;
  type?: string;
  size?: number;
}

const ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*";

/**
 * Форма додавання запису в історію — зверху панелі, згортається/розгортається.
 * Підтримує додавання файлів та картинок (вкладення завантажуються на сервер,
 * а метадані йдуть у запис історії).
 */
export function ClientHistoryCommentForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 10));
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function uploadOne(file: File): Promise<UploadedAttachment> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(
      `/api/v1/manager/clients/${clientId}/timeline/upload`,
      { method: "POST", credentials: "include", body: fd },
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Не вдалося завантажити ${file.name}`);
    }
    return (await res.json()) as UploadedAttachment;
  }

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed && files.length === 0) return;
    setBusy(true);
    try {
      let attachments: UploadedAttachment[] = [];
      if (files.length > 0) {
        attachments = await Promise.all(files.map(uploadOne));
      }
      const res = await fetch(`/api/v1/manager/clients/${clientId}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body: trimmed,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
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
      setFiles([]);
      toast({ description: "Запис додано" });
      router.refresh();
    } catch (e) {
      toast({
        description: e instanceof Error ? e.message : "Помилка",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = body.trim().length > 0 || files.length > 0;

  return (
    <div className="rounded-md border bg-gray-50/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        <span className="inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" />
          Новий запис
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t px-3 py-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Додати коментар про клієнта…"
            rows={3}
            maxLength={2000}
          />

          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-xs text-gray-700"
                >
                  <Paperclip className="h-3 w-3 text-gray-400" />
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={`Прибрати ${f.name}`}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                <Paperclip className="h-4 w-4" />
                Файл / картинка
              </button>
              <span className="text-xs text-gray-400">
                {body.length} / 2000
              </span>
            </div>
            <Button
              type="button"
              onClick={submit}
              disabled={busy || !canSubmit}
            >
              {busy ? "Записую…" : "Записати"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
