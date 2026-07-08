import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { ClosuresClient } from "./_components/closures-client";
import type { ClientPickerItem } from "../orders/new/_components/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Закриття замовлень — L-TEX Manager" };

/**
 * Закриття старих замовлень (як у 1С «Закрытие заказов»).
 *
 *  1. Менеджер обирає контрагента (або приходить з картки замовлення з
 *     `?clientId=<MgrClient.id>` — тоді клієнт підтягується одразу).
 *  2. Бачить незакриті замовлення клієнта, згруповані по документу, з
 *     позиціями та чекбоксами «додати в нове замовлення».
 *  3. Відмічає позиції → «Створити нове замовлення з відмічених» (перенос).
 *  4. Закриває старі документи кнопкою «Закрити замовлення» (з причиною).
 */
export default async function ClosuresPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const clientId = sp.clientId ?? null;

  let initialClientSummary: ClientPickerItem | null = null;
  if (clientId) {
    const mgr = await prisma.mgrClient.findUnique({
      where: { id: clientId },
      select: { id: true, code1C: true, name: true, city: true },
    });
    if (mgr) {
      initialClientSummary = {
        id: mgr.id,
        code1C: mgr.code1C,
        name: mgr.name,
        tradePointName: null,
        city: mgr.city,
        debt: "0",
        agent: null,
        isOwned: true,
      };
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">
          Закриття старих замовлень
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Незакриті замовлення контрагента з позиціями. Відмітьте товари для
          переносу в нове замовлення і закрийте старі документи.
        </p>
      </header>

      <ClosuresClient
        userRole={user.role}
        initialClientId={clientId}
        initialClientSummary={initialClientSummary}
      />
    </div>
  );
}
