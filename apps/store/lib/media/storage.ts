import { promises as fs } from "fs";
import path from "path";

// Self-hosted media storage on the server's disk (replaces Supabase Storage
// for NEW product photos + banners). Files live under MEDIA_ROOT and are served
// back by /media/[...path]/route.ts. Existing Supabase-hosted images keep
// working until Task B chistka.
//
// Env:
//   MEDIA_ROOT       — absolute path to the media folder (e.g. E:\ltex-storage\media)
//   MEDIA_PUBLIC_URL — public base URL without trailing slash (e.g. https://new.ltex.com.ua)

function mediaRoot(): string {
  const root = process.env.MEDIA_ROOT;
  if (!root) {
    throw new Error("MEDIA_ROOT is not configured");
  }
  return root;
}

function mediaPublicBase(): string {
  // Fallback to MEDIA_ROOT-less relative base is not useful for next/image, so
  // require MEDIA_PUBLIC_URL explicitly. Strip any trailing slash defensively.
  const base = process.env.MEDIA_PUBLIC_URL;
  if (!base) {
    throw new Error("MEDIA_PUBLIC_URL is not configured");
  }
  return base.replace(/\/+$/, "");
}

/** Whether disk-based media storage is configured (MEDIA_ROOT present). */
export function mediaConfigured(): boolean {
  return Boolean(process.env.MEDIA_ROOT);
}

/**
 * Resolve a relative media path to an absolute path INSIDE `root`, rejecting
 * any attempt to escape the root via `..` segments or absolute paths.
 *
 * Exported (and separately testable) because it is the single choke-point that
 * makes both writes and reads safe against path traversal.
 *
 * @param rel  relative path using forward or back slashes (e.g. "product-images/x/1.webp")
 * @param root absolute media root (defaults to MEDIA_ROOT env)
 */
export function resolveInsideRoot(
  rel: string,
  root: string = mediaRoot(),
): string {
  // Normalize slashes so callers may pass POSIX-style joined segments even on
  // Windows. path.normalize collapses "." and ".." within the string.
  const normalizedRel = rel.replace(/\\/g, "/");

  // Reject an absolute input outright — path.resolve(root, "/etc/passwd") would
  // otherwise ignore `root` entirely.
  if (path.isAbsolute(normalizedRel) || path.win32.isAbsolute(normalizedRel)) {
    throw new Error(`Invalid media path (absolute): ${rel}`);
  }

  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, normalizedRel);

  // The resolved target must be the root itself or live strictly beneath it.
  const rootWithSep = absoluteRoot.endsWith(path.sep)
    ? absoluteRoot
    : absoluteRoot + path.sep;
  if (target !== absoluteRoot && !target.startsWith(rootWithSep)) {
    throw new Error(`Invalid media path (escapes root): ${rel}`);
  }

  return target;
}

/** Build the public URL for a relative media path (forward slashes). */
export function mediaPublicUrl(rel: string): string {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${mediaPublicBase()}/media/${clean}`;
}

/**
 * Persist bytes to `MEDIA_ROOT/<rel>` (creating parent dirs) and return the
 * public URL to store in the DB. Throws on traversal or missing config.
 */
export async function saveMediaFile(
  rel: string,
  data: Buffer,
): Promise<string> {
  const target = resolveInsideRoot(rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
  return mediaPublicUrl(rel);
}

/** Read a media file for serving. Returns null when missing or path invalid. */
export async function readMediaFile(rel: string): Promise<Buffer | null> {
  let target: string;
  try {
    target = resolveInsideRoot(rel);
  } catch {
    return null;
  }
  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}

/**
 * Best-effort delete of a locally-hosted media file given its public URL.
 * Ignores files that don't exist and silently ignores non-local URLs
 * (e.g. legacy Supabase URLs) — those are handled elsewhere / left as-is.
 */
export async function deleteMediaByUrl(url: string): Promise<void> {
  if (!mediaConfigured()) return;

  // Only handle URLs that point at our own /media/ route. Everything else
  // (Supabase, etc.) is not ours to remove from disk.
  const marker = "/media/";
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const rel = url.slice(idx + marker.length);
  if (!rel) return;

  let target: string;
  try {
    target = resolveInsideRoot(rel);
  } catch {
    return;
  }
  try {
    await fs.unlink(target);
  } catch {
    // best-effort: ignore ENOENT and any other unlink error
  }
}
