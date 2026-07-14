import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { RequisitesManager } from "./_components/requisites-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Реквізити для оплати — L-TEX Manager" };

export default async function PaymentRequisitesPage() {
  const user = await requireRole(["admin", "owner"]);
  if (!user) redirect("/manager");

  const items = await prisma.mgrPaymentRequisite.findMany({
    orderBy: [{ archived: "asc" }, { isDefault: "desc" }, { sortOrder: "asc" }],
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">
          Реквізити для оплати
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Набори реквізитів одержувача, які менеджер обирає перед відправкою
          повідомлення «Скинути реквізити» у реалізації. Набір «за
          замовчуванням» підставляється першим.
        </p>
      </header>
      <RequisitesManager
        initial={items.map((r) => ({
          id: r.id,
          name: r.name,
          recipient: r.recipient,
          edrpou: r.edrpou,
          bankName: r.bankName,
          iban: r.iban,
          purpose: r.purpose,
          isDefault: r.isDefault,
          archived: r.archived,
        }))}
      />
    </div>
  );
}
