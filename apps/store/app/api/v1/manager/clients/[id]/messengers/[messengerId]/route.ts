import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { mgrClientMessengerUpdateSchema } from "@/lib/validations/mgr-client";

function serializeMessenger(m: {
  id: string;
  network: string;
  handle: string;
  url: string | null;
  browserUrl: string | null;
  comment: string | null;
}) {
  return {
    id: m.id,
    network: m.network,
    handle: m.handle,
    url: m.url,
    browserUrl: m.browserUrl,
    comment: m.comment,
  };
}

/** PATCH — редагує соцмережу / месенджер (owner/assigned/admin). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messengerId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, messengerId } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = mgrClientMessengerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  // Перевіряємо, що запис належить саме цьому клієнту.
  const existing = await prisma.mgrClientMessenger.findUnique({
    where: { id: messengerId },
    select: { id: true, clientId: true },
  });
  if (!existing || existing.clientId !== id) {
    return NextResponse.json({ error: "Запис не знайдено" }, { status: 404 });
  }

  const data: {
    network?: string;
    handle?: string;
    url?: string | null;
    comment?: string | null;
  } = {};
  if (parsed.data.network !== undefined) data.network = parsed.data.network;
  if (parsed.data.handle !== undefined) {
    data.handle = parsed.data.handle?.trim() ?? "";
  }
  if (parsed.data.url !== undefined) {
    data.url =
      parsed.data.url == null || parsed.data.url === ""
        ? null
        : parsed.data.url.trim();
  }
  if (parsed.data.comment !== undefined) {
    data.comment =
      parsed.data.comment == null || parsed.data.comment === ""
        ? null
        : parsed.data.comment.trim();
  }

  const updated = await prisma.mgrClientMessenger.update({
    where: { id: messengerId },
    data,
  });

  return NextResponse.json({ messenger: serializeMessenger(updated) });
}

/** DELETE — видаляє соцмережу / месенджер (owner/assigned/admin). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messengerId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, messengerId } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const existing = await prisma.mgrClientMessenger.findUnique({
    where: { id: messengerId },
    select: { id: true, clientId: true },
  });
  if (!existing || existing.clientId !== id) {
    return NextResponse.json({ error: "Запис не знайдено" }, { status: 404 });
  }

  await prisma.mgrClientMessenger.delete({ where: { id: messengerId } });

  return NextResponse.json({ ok: true });
}
