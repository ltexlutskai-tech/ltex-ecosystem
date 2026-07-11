import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMessengerConversationForUser } from "@/lib/messenger/access";
import {
  AttachmentError,
  MAX_ATTACHMENTS_PER_MESSAGE,
  saveMessengerAttachment,
} from "@/lib/messenger/attachments";
import { buildPushPreview, notifyNewMessage } from "@/lib/messenger/notify";
import { serializeMessage } from "@/lib/messenger/serialize";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/v1/manager/messenger/conversations/[id]/attachments
 *
 * Завантажити фото/файли (multipart). Поля: `files` (1..10), `caption`
 * (необов'язковий текст). Створює одне повідомлення з підписом і вкладеннями.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (
    !rateLimit(`msgr-upload:${user.id}:${ip}`, { windowMs: 60_000, max: 30 })
  ) {
    return NextResponse.json(
      { error: "Забагато завантажень. Зачекайте трохи." },
      { status: 429 },
    );
  }

  const { id } = await params;
  const access = await getMessengerConversationForUser(user, id);
  if (access.status === 404) {
    return NextResponse.json({ error: "Розмову не знайдено" }, { status: 404 });
  }
  if (access.status === 403 || !access.membership) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Невірний формат запиту" },
      { status: 400 },
    );
  }

  const caption =
    (form.get("caption") as string | null)?.trim().slice(0, 4000) ?? "";
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Немає файлів" }, { status: 400 });
  }
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return NextResponse.json(
      { error: `Максимум ${MAX_ATTACHMENTS_PER_MESSAGE} файлів за раз` },
      { status: 400 },
    );
  }

  const saved = [];
  try {
    for (const file of files) {
      saved.push(await saveMessengerAttachment(id, file));
    }
  } catch (e) {
    if (e instanceof AttachmentError) {
      const msg =
        e.code === "too_large"
          ? "Файл завеликий (фото до 15 МБ, документи до 25 МБ)"
          : e.code === "empty"
            ? "Порожній файл"
            : "Непідтримуваний тип файлу (фото, PDF, Excel, Word)";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw e;
  }

  const now = new Date();
  const created = await prisma.messengerMessage.create({
    data: {
      conversationId: id,
      authorId: user.id,
      kind: "text",
      text: caption,
      attachments: {
        create: saved.map((a) => ({
          kind: a.kind,
          url: a.url,
          name: a.name,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          width: a.width,
          height: a.height,
        })),
      },
    },
    include: {
      attachments: true,
      replyTo: {
        select: { id: true, authorId: true, text: true, deletedAt: true },
      },
    },
  });

  await prisma.$transaction([
    prisma.messengerConversation.update({
      where: { id },
      data: { lastMessageAt: now },
    }),
    prisma.messengerMember.update({
      where: { id: access.membership.id },
      data: { lastReadAt: now },
    }),
  ]);

  const message = serializeMessage(created, {
    currentUserId: user.id,
    isOwner: user.role === "owner",
    nameById: new Map([[user.id, user.fullName]]),
  });

  void notifyNewMessage({
    conversationId: id,
    authorId: user.id,
    authorName: user.fullName,
    preview: buildPushPreview({
      text: caption,
      hasImage: saved.some((a) => a.kind === "image"),
      hasFile: saved.some((a) => a.kind === "file"),
    }),
  });

  return NextResponse.json({ message }, { status: 201 });
}
