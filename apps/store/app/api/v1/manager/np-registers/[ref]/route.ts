import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { deleteScanSheet } from "@/lib/delivery/nova-poshta";

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

/**
 * DELETE /api/v1/manager/np-registers/[ref]
 *
 * Видаляє реєстр відправлень НП (ScanSheet.deleteScanSheet). ТТН при цьому
 * залишаються — просто «розгруповуються» з реєстру.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!WAREHOUSE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  const { ref } = await params;
  const result = await deleteScanSheet([ref]);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Не вдалося видалити реєстр" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
