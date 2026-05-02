"use client";

import { Dialog, DialogContent, DialogTitle } from "@ltex/ui";
import { X } from "lucide-react";

interface VideoModalProps {
  videoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export function VideoModal({
  videoId,
  open,
  onOpenChange,
  title,
}: VideoModalProps) {
  if (!videoId) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-0 bg-black p-0 shadow-2xl">
        <DialogTitle className="sr-only">{title ?? "Відеоогляд"}</DialogTitle>
        <div className="relative aspect-video w-full">
          {open && (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              title={title ?? "Відеоогляд"}
            />
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute -top-10 right-0 rounded-full bg-white/20 p-2 text-white transition hover:bg-white/40"
            aria-label="Закрити"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
