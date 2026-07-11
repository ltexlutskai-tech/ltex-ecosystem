import { randomUUID } from "crypto";
import sharp from "sharp";
import { saveMediaFile } from "@/lib/media/storage";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 МБ
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 МБ
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

// Дозволені типи файлів: розширення → MIME для віддачі.
const FILE_MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  csv: "text/csv",
  txt: "text/plain",
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export interface SavedAttachment {
  kind: "image" | "file";
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

/** Помилка з машинним кодом для перекладу у HTTP-статус/повідомлення. */
export class AttachmentError extends Error {
  constructor(public code: "unsupported" | "too_large" | "empty") {
    super(code);
  }
}

/**
 * Зберігає одне вкладення повідомлення на диск (self-hosted media).
 * Фото → стиснення sharp у webp; файли (PDF/Excel/Word/…) → as-is з whitelist.
 */
export async function saveMessengerAttachment(
  conversationId: string,
  file: File,
): Promise<SavedAttachment> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) throw new AttachmentError("empty");

  const name = (file.name || "файл").slice(0, 200);
  const ext = extOf(name);
  const type = file.type || "";
  const isImage = type.startsWith("image/") || IMAGE_EXT.has(ext);

  const base = `messenger/${conversationId}/${Date.now()}-${randomUUID()}`;

  if (isImage) {
    if (buf.length > MAX_IMAGE_BYTES) throw new AttachmentError("too_large");
    const optimized = await sharp(buf)
      .rotate()
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    const meta = await sharp(optimized).metadata();
    const url = await saveMediaFile(`${base}.webp`, optimized);
    return {
      kind: "image",
      url,
      name,
      mimeType: "image/webp",
      sizeBytes: optimized.length,
      width: meta.width ?? null,
      height: meta.height ?? null,
    };
  }

  const fileMime = FILE_MIME_BY_EXT[ext];
  if (!fileMime) throw new AttachmentError("unsupported");
  if (buf.length > MAX_FILE_BYTES) throw new AttachmentError("too_large");

  const url = await saveMediaFile(`${base}.${ext}`, buf);
  return {
    kind: "file",
    url,
    name,
    mimeType: fileMime,
    sizeBytes: buf.length,
    width: null,
    height: null,
  };
}
