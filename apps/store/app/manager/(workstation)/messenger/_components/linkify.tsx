import type { ReactNode } from "react";

// URL (http/https/www) та телефон (+380…) у тексті повідомлення.
const URL_SPLIT = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const PHONE_SPLIT = /(\+\d[\d\s().-]{7,}\d)/g;

function isUrl(s: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(s);
}
function isPhone(s: string): boolean {
  return /^\+\d[\d\s().-]{7,}\d$/.test(s);
}

function linkClass(isMine: boolean): string {
  return isMine
    ? "underline decoration-white/60 hover:decoration-white"
    : "text-blue-600 underline hover:text-blue-700";
}

/**
 * Перетворює URL та телефони у тексті на клікабельні посилання, зберігаючи
 * решту тексту як є. Повертає масив React-вузлів для вставки у `<p>`.
 */
export function linkify(text: string, isMine: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let key = 0;

  for (const urlPart of text.split(URL_SPLIT)) {
    if (!urlPart) continue;
    if (isUrl(urlPart)) {
      const href = urlPart.startsWith("www.") ? `https://${urlPart}` : urlPart;
      out.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass(isMine)}
        >
          {urlPart}
        </a>,
      );
      continue;
    }
    for (const part of urlPart.split(PHONE_SPLIT)) {
      if (!part) continue;
      if (isPhone(part)) {
        const tel = part.replace(/[^\d+]/g, "");
        out.push(
          <a key={key++} href={`tel:${tel}`} className={linkClass(isMine)}>
            {part}
          </a>,
        );
      } else {
        out.push(<span key={key++}>{part}</span>);
      }
    }
  }
  return out;
}
