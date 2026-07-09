import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  CashFlowArticlesManager,
  type CashFlowArticleItem,
} from "./_components/cash-flow-articles-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Статті руху коштів — L-TEX Manager" };

export default async function CashFlowArticlesPage() {
  const admin = await requireRole(["admin"]);
  if (!admin) redirect("/manager");

  const items = await prisma.mgrCashFlowArticle.findMany({
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      parentId: true,
      direction: true,
      archived: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Статті руху коштів</h1>
        <p className="mt-1 text-sm text-gray-600">
          Довідник статей для ордерів-розходу (← 1С Статті руху коштів).
        </p>
      </header>
      <CashFlowArticlesManager initial={items as CashFlowArticleItem[]} />
    </div>
  );
}
