import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { mgrClientContactCreateSchema } from "@/lib/validations/mgr-client";

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

/** POST — додає нову контактну особу клієнту (owner/assigned/admin). */
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
  const parsed = mgrClientContactCreateSchema.safeParse(body);
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

  const max = await prisma.mgrClientContact.aggregate({
    where: { clientId: id },
    _max: { sortOrder: true },
  });
  const nextSort = (max._max.sortOrder ?? -1) + 1;

  const created = await prisma.mgrClientContact.create({
    data: {
      clientId: id,
      fullName: parsed.data.fullName,
      position: normalize(parsed.data.position),
      phone: normalize(parsed.data.phone),
      email: normalize(parsed.data.email),
      comment: normalize(parsed.data.comment),
      sortOrder: nextSort,
    },
  });

  return NextResponse.json(
    { contact: serializeContact(created) },
    { status: 201 },
  );
}
