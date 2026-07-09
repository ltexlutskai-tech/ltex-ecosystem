import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { mgrClientContactUpdateSchema } from "@/lib/validations/mgr-client";

function serializeContact(c: {
  id: string;
  fullName: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  sortOrder: number;
}) {
  return {
    id: c.id,
    fullName: c.fullName,
    position: c.position,
    phone: c.phone,
    email: c.email,
    comment: c.comment,
    sortOrder: c.sortOrder,
  };
}

function normalize(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : value;
}

/** PATCH — редагує контактну особу (owner/assigned/admin). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, contactId } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = mgrClientContactUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  // Перевіряємо, що контакт належить саме цьому клієнту.
  const existing = await prisma.mgrClientContact.findUnique({
    where: { id: contactId },
    select: { id: true, clientId: true },
  });
  if (!existing || existing.clientId !== id) {
    return NextResponse.json({ error: "Контакт не знайдено" }, { status: 404 });
  }

  const data: {
    fullName?: string;
    position?: string | null;
    phone?: string | null;
    email?: string | null;
    comment?: string | null;
  } = {};
  if (parsed.data.fullName !== undefined) data.fullName = parsed.data.fullName;
  if (parsed.data.position !== undefined)
    data.position = normalize(parsed.data.position);
  if (parsed.data.phone !== undefined)
    data.phone = normalize(parsed.data.phone);
  if (parsed.data.email !== undefined)
    data.email = normalize(parsed.data.email);
  if (parsed.data.comment !== undefined)
    data.comment = normalize(parsed.data.comment);

  const updated = await prisma.mgrClientContact.update({
    where: { id: contactId },
    data,
  });

  return NextResponse.json({ contact: serializeContact(updated) });
}

/** DELETE — видаляє контактну особу (owner/assigned/admin). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, contactId } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const existing = await prisma.mgrClientContact.findUnique({
    where: { id: contactId },
    select: { id: true, clientId: true },
  });
  if (!existing || existing.clientId !== id) {
    return NextResponse.json({ error: "Контакт не знайдено" }, { status: 404 });
  }

  await prisma.mgrClientContact.delete({ where: { id: contactId } });

  return NextResponse.json({ ok: true });
}
