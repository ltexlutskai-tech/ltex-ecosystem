"use client";

import { useState } from "react";

/**
 * Кнопка «копіювати штрихкод» — компактна, для таблиць лотів і картки лота.
 *
 * Клік зупиняє спливання (`stopPropagation`), щоб клік у рядку таблиці не
 * відкривав картку лота. На успіх показує ✓ на ~1.2с. Копіювання через
 * `navigator.clipboard` (secure context — прод на https); тихий fallback на
 * прихований textarea для http/старих браузерів.
 */
export function CopyBarcode({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Скопійовано" : "Копіювати штрихкод"}
      aria-label="Копіювати штрихкод"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-[11px] leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-700 ${
        className ?? ""
      }`}
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallthrough на legacy-спосіб
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
