import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  BankAccountsManager,
  type BankAccountItem,
} from "./_components/bank-accounts-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Банк. рахунки — L-TEX Manager" };

export default async function BankAccountsPage() {
  const admin = await requireRole(["admin"]);
  if (!admin) redirect("/manager");

  const items = await prisma.mgrBankAccount.findMany({
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      kind: true,
      hiddenInApp: true,
      archived: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Банківські рахунки</h1>
        <p className="mt-1 text-sm text-gray-600">
          Довідник рахунків для прийому безготівки (← 1С Банк. рахунки).
          «Прихований» рахунок не можна вибрати при приході.
        </p>
      </header>
      <BankAccountsManager initial={items as BankAccountItem[]} />
    </div>
  );
}
