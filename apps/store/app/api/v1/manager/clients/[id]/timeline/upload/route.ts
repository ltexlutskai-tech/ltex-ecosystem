import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { mediaConfigured, saveMediaFile } from "@/lib/media/storage";

const MAX_BYTES = 15 * 1024 * 1024; // 15 МБ

// Дозволені розширення (картинки + типові документи). Ключ = розширення.
const ALLOWED_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
]);

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * POST — завантаження вкладення (файл/картинка) до історії роботи з клієнтом.
 * Зберігає на диск (MEDIA_ROOT) і повертає публічний URL + метадані. Клієнт
 * потім передає ці метадані у POST /timeline (поле attachments).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  if (!mediaConfigured()) {
    return NextResponse.json(
      { error: "Сховище файлів не налаштоване (MEDIA_ROOT)" },
      { status: 503 },
    );
  }

  const { id } = await params;
  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передано" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Порожній файл" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Файл завеликий (макс. 15 МБ)" },
      { status: 413 },
    );
  }

  const ext = extOf(file.name);
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Недозволений тип файлу" },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rel = `client-timeline/${id}/${randomUUID()}.${ext}`;
  const url = await saveMediaFile(rel, buffer);

  return NextResponse.json({
    url,
    name: file.name,
    type: file.type || undefined,
    size: file.size,
  });
}
