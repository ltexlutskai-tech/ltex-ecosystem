"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Textarea,
  useToast,
} from "@ltex/ui";
import { phoneToViberUrl } from "@ltex/shared";

/**
 * Manager — єдине вікно «Поділитися».
 *
 * Перевикористовуваний Dialog: показує редаговане textarea з готовим текстом +
 * кнопку «Скопіювати» (clipboard) + «Поділитися» (Web Share API — коли доступне).
 *
 * Кнопки Viber / Telegram / WhatsApp прибрано: їхні deep-links (`viber://forward`
 * тощо) обрізають довгі повідомлення (кирилиця у %-кодуванні швидко роздуває
 * URL) → повідомлення приходило неповним. Надійний шлях — «Скопіювати» і
 * вставити у месенджер, або системне «Поділитися».
 */

interface Props {
  /** Відкрита коли true. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Заголовок вікна. */
  title: string;
  /** Готовий текст (initial) — користувач може редагувати перед відправкою. */
  text: string;
  /**
   * Телефон конкретного клієнта. Коли заданий — зʼявляється кнопка «Відкрити
   * Viber клієнта»: копіює текст у буфер і відкриває чат саме цього клієнта
   * (текст не передаємо в deep-link — Viber обрізає довгу кирилицю; менеджер
   * вставляє з буфера).
   */
  clientPhone?: string | null;
}

/** Чи доступний Web Share API (мобільні браузери / частина десктопних). */
function hasWebShare(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

export function ShareSheet({
  open,
  onOpenChange,
  title,
  text,
  clientPhone,
}: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(text);
  const [canShare, setCanShare] = useState(false);
  const viberUrl = phoneToViberUrl(clientPhone);

  // Скидаємо текст при кожному новому відкритті.
  useEffect(() => {
    if (open) {
      setDraft(text);
    }
  }, [open, text]);

  // navigator.share доступне лише у браузері — перевіряємо після монтування.
  useEffect(() => {
    setCanShare(hasWebShare());
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draft);
      toast({ title: "Скопійовано", description: "Текст у буфері обміну." });
    } catch {
      toast({
        title: "Не вдалося скопіювати",
        description: "Виділіть текст і скопіюйте вручну.",
        variant: "destructive",
      });
    }
  }

  async function handleWebShare() {
    try {
      await navigator.share({ text: draft });
    } catch {
      // Користувач скасував share або API недоступне — мовчки ігноруємо.
    }
  }

  /** Копіює текст у буфер і відкриває чат клієнта у Viber. */
  async function handleOpenClientViber() {
    if (!viberUrl) return;
    try {
      await navigator.clipboard.writeText(draft);
      toast({
        title: "Текст скопійовано",
        description: "Відкриваємо Viber клієнта — вставте повідомлення у чат.",
      });
    } catch {
      // Навіть якщо копіювання не вдалось — все одно відкриваємо чат.
    }
    window.location.href = viberUrl;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Перевірте та за потреби відредагуйте текст, потім натисніть
            «Скопіювати» і вставте у месенджер (або «Поділитися»).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            rows={10}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-sm"
          />

          <div className="text-xs text-gray-400">{draft.length} символів</div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleCopy}>
              📋 Скопіювати
            </Button>
            {viberUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={handleOpenClientViber}
              >
                Відкрити Viber клієнта
              </Button>
            )}
            {canShare && (
              <Button type="button" variant="outline" onClick={handleWebShare}>
                Поділитися…
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
