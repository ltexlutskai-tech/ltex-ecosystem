/**
 * YouTube URL helpers.
 *
 * Supports the URL shapes 1C / admins paste in product/lot videoUrl fields:
 *  - https://www.youtube.com/watch?v=ID
 *  - https://youtu.be/ID
 *  - https://www.youtube.com/embed/ID
 *  - https://www.youtube.com/shorts/ID
 */

const YT_ID_RE =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/;

export function extractYouTubeId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const match = url.match(YT_ID_RE);
  return match?.[1] ?? null;
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}
