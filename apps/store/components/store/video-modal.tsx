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
  title = "Відеоогляд",
}: VideoModalProps) {
  if (!videoId) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-0 bg-black p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="relative aspect-video w-full">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={title}
          />
          <button
            onClick={() => onOpenChange(false)}
            className="absolute -top-10 right-0 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
            aria-label="Закрити"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
