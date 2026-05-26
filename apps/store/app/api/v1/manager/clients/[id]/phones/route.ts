import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { mgrClientPhoneCreateSchema } from "@/lib/validations/mgr-client";

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

/** POST — додає новий номер телефону клієнту (owner/assigned/admin). */
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
  const parsed = mgrClientPhoneCreateSchema.safeParse(body);
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

  const max = await prisma.mgrClientPhone.aggregate({
    where: { clientId: id },
    _max: { sortOrder: true },
  });
  const nextSort = (max._max.sortOrder ?? -1) + 1;

  const messenger =
    parsed.data.messenger === "" || parsed.data.messenger == null
      ? null
      : parsed.data.messenger;
  const label =
    parsed.data.label == null || parsed.data.label === ""
      ? null
      : parsed.data.label;

  const created = await prisma.mgrClientPhone.create({
    data: {
      clientId: id,
      phone: parsed.data.phone,
      messenger,
      label,
      sortOrder: nextSort,
    },
  });

  return NextResponse.json({ phone: serializePhone(created) }, { status: 201 });
}
