import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageTreasury } from "@/lib/manager/treasury-permission";
import { cancelBankPaymentOutgoing } from "@/lib/manager/treasury-posting";
import { treasuryActionResponse } from "@/lib/manager/treasury-action-response";

/** Скасування проведення вихідної платіжки (posted→cancelled). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canManageTreasury(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  const { id } = await params;
  const result = await cancelBankPaymentOutgoing(id);
  if (result.ok) revalidatePath("/manager/bank-payments-outgoing");
  return treasuryActionResponse(result);
}
