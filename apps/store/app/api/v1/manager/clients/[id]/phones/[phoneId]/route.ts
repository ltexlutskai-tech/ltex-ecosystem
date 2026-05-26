import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { mgrClientPhoneUpdateSchema } from "@/lib/validations/mgr-client";

function serializePhone(p: {
  id: string;
  phone: string;
  label: string | null;
  messenger: string | null;
  sortOrder: number;
}) {
  return {
    id: p.id,
    phone: p.phone,
    label: p.label,
    messenger: p.messenger,
    sortOrder: p.sortOrder,
  };
}

/** PATCH — редагує номер телефону (owner/assigned/admin). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; phoneId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, phoneId } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = mgrClientPhoneUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  // Перевіряємо, що номер належить саме цьому клієнту.
  const existing = await prisma.mgrClientPhone.findUnique({
    where: { id: phoneId },
    select: { id: true, clientId: true },
  });
  if (!existing || existing.clientId !== id) {
    return NextResponse.json({ error: "Номер не знайдено" }, { status: 404 });
  }

  const data: {
    phone?: string;
    messenger?: string | null;
    label?: string | null;
  } = {};
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone;
  if (parsed.data.messenger !== undefined) {
    data.messenger =
      parsed.data.messenger === "" || parsed.data.messenger == null
        ? null
        : parsed.data.messenger;
  }
  if (parsed.data.label !== undefined) {
    data.label =
      parsed.data.label == null || parsed.data.label === ""
        ? null
        : parsed.data.label;
  }

  const updated = await prisma.mgrClientPhone.update({
    where: { id: phoneId },
    data,
  });

  return NextResponse.json({ phone: serializePhone(updated) });
}

/** DELETE — видаляє номер телефону (owner/assigned/admin). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; phoneId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, phoneId } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const existing = await prisma.mgrClientPhone.findUnique({
    where: { id: phoneId },
    select: { id: true, clientId: true },
  });
  if (!existing || existing.clientId !== id) {
    return NextResponse.json({ error: "Номер не знайдено" }, { status: 404 });
  }

  await prisma.mgrClientPhone.delete({ where: { id: phoneId } });

  return NextResponse.json({ ok: true });
}
