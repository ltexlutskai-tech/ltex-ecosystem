/**
 * Image upload validation by magic bytes.
 *
 * The file extension is attacker-controlled. We must sniff the actual bytes
 * before accepting the upload — otherwise a `.exe` renamed to `shell.jpg`
 * slips straight into public storage.
 */

export type ImageType = "jpeg" | "png" | "webp" | "gif";

export interface ValidatedImage {
  type: ImageType;
  mime: string;
}

const MIME_BY_TYPE: Record<ImageType, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Detect the image format from the first bytes of the file.
 * Returns null if the bytes don't match any supported format.
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // GIF: "GIF87a" or "GIF89a"
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "gif";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export interface ValidateImageOptions {
  /** Max file size in bytes. Defaults to 5 MB. */
  maxBytes?: number;
}

export class InvalidImageError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "empty"
      | "too_large"
      | "unsupported_format" = "unsupported_format",
  ) {
    super(message);
  }
}

/**
 * Validate an uploaded File. Throws InvalidImageError on any failure.
 * Returns the detected image type + canonical MIME on success.
 *
 * This reads only the first 12 bytes for detection, so it's cheap to call
 * before accepting the upload or passing the full File to storage.
 */
export async function validateImageFile(
  file: File,
  opts: ValidateImageOptions = {},
): Promise<ValidatedImage> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;

  if (!file || file.size === 0) {
    throw new InvalidImageError("Файл не надано", "empty");
  }
  if (file.size > maxBytes) {
    throw new InvalidImageError(
      `Розмір файлу перевищує ${Math.round(maxBytes / 1024 / 1024)} МБ`,
      "too_large",
    );
  }

  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const type = detectImageType(head);
  if (!type) {
    throw new InvalidImageError(
      "Недійсний формат зображення. Дозволено JPEG, PNG, WEBP, GIF.",
    );
  }

  return { type, mime: MIME_BY_TYPE[type] };
}
