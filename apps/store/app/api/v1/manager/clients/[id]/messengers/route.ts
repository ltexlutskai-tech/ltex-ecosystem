import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { mgrClientMessengerCreateSchema } from "@/lib/validations/mgr-client";

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

/** POST — додає соцмережу / месенджер клієнту (owner/assigned/admin). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = mgrClientMessengerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const handle = parsed.data.handle?.trim() ?? "";
  const url =
    parsed.data.url == null || parsed.data.url === ""
      ? null
      : parsed.data.url.trim();
  const comment =
    parsed.data.comment == null || parsed.data.comment === ""
      ? null
      : parsed.data.comment.trim();

  const created = await prisma.mgrClientMessenger.create({
    data: {
      clientId: id,
      network: parsed.data.network,
      handle,
      url,
      comment,
    },
  });

  return NextResponse.json(
    { messenger: serializeMessenger(created) },
    { status: 201 },
  );
}
