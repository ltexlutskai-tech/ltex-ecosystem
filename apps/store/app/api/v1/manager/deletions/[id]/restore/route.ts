import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdminRole } from "@/lib/auth/manager-auth";
import { restoreDeletionRequest } from "@/lib/manager/deletion-queue";

/**
 * POST — повернути документ із кошика (скасувати власний pending-запит).
 * Доступно автору запиту або адміну. Знімає позначку + відновлює рухи регістрів.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const { id } = await params;
  const res = await restoreDeletionRequest(
    id,
    user,
    isAdminRole(user.role),
    req,
  );
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
