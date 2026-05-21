"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
  useToast,
} from "@ltex/ui";

/**
 * Manager «Прайс» — Stage 5b: довідник шаблонів повідомлень.
 *
 * Клієнтський CRUD-екран (mirror стилю `/manager/admin/users`): список шаблонів +
 * кнопка «Додати» (модалка name+text) + per-row Редагувати / Видалити (з
 * підтвердженням). Дані з API `/api/v1/manager/message-templates`,
 * `router.refresh()` після кожної мутації (server component re-fetch).
 */

export interface MessageTemplate {
  id: string;
  name: string;
  text: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function TemplatesManager({ initial }: { initial: MessageTemplate[] }) {
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setCreating(true)}>
          + Додати шаблон
        </Button>
      </div>

      {initial.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Поки немає жодного шаблону. Натисніть «Додати шаблон», щоб створити
          першу готову фразу.
        </div>
      ) : (
        <ul className="space-y-2">
          {initial.map((t) => (
            <TemplateRow key={t.id} template={t} onEdit={() => setEditing(t)} />
          ))}
        </ul>
      )}

      <TemplateFormModal
        mode="create"
        open={creating}
        onOpenChange={setCreating}
      />
      <TemplateFormModal
        mode="edit"
        template={editing ?? undefined}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </div>
  );
}

function TemplateRow({
  template,
  onEdit,
}: {
  template: MessageTemplate;
  onEdit: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`Видалити шаблон «${template.name}»?`)) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/manager/message-templates/${template.id}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        toast({ title: "Шаблон видалено" });
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast({
          title: data.error ?? "Не вдалося видалити",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Помилка зʼєднання", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-800">{template.name}</div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600">
            {template.text}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onEdit}
            disabled={loading}
            className="h-8 px-2 text-xs"
          >
            Редагувати
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
            className="h-8 px-2 text-xs"
          >
            Видалити
          </Button>
        </div>
      </div>
    </li>
  );
}

function TemplateFormModal({
  mode,
  template,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  template?: MessageTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(template?.name ?? "");
  const [text, setText] = useState(template?.text ?? "");
  const [loading, setLoading] = useState(false);

  // Скидаємо поля коли модалка відкривається з новим шаблоном (edit) або
  // повторно відкривається порожня (create).
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (template?.id ?? "new") : null;
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(template?.name ?? "");
    setText(template?.text ?? "");
  }
  if (!open && lastKey !== null) {
    setLastKey(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const url =
        mode === "edit" && template
          ? `/api/v1/manager/message-templates/${template.id}`
          : "/api/v1/manager/message-templates";
      const res = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, text }),
      });
      if (res.ok) {
        toast({
          title: mode === "edit" ? "Шаблон оновлено" : "Шаблон створено",
        });
        onOpenChange(false);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast({
          title: data.error ?? "Не вдалося зберегти",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Помилка зʼєднання", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Редагувати шаблон" : "Новий шаблон"}
          </DialogTitle>
          <DialogDescription>
            Назва — для пошуку у списку. Текст — те, що вставиться у
            повідомлення.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="template-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Назва
            </label>
            <Input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              disabled={loading}
            />
          </div>
          <div>
            <label
              htmlFor="template-text"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Текст
            </label>
            <Textarea
              id="template-text"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              maxLength={5000}
              disabled={loading}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Збереження..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
