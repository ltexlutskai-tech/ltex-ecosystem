import { NextResponse } from "next/server";
import { readMediaFile } from "@/lib/media/storage";

// Serve self-hosted media files from MEDIA_ROOT (product photos + banners saved
// to the server's disk instead of Supabase Storage). Path traversal is blocked
// inside readMediaFile → resolveInsideRoot.

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
};

function contentTypeFor(rel: string): string {
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const rel = (segments ?? []).join("/");
  if (!rel) {
    return new NextResponse("Not found", { status: 404 });
  }

  const data = await readMediaFile(rel);
  if (!data) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Node Buffer → Uint8Array so the body typechecks as a valid BodyInit.
  const body = new Uint8Array(data);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(rel),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
