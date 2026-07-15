import { notFound } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { BackButton } from "../../_components/back-button";
import { BagStateForm } from "../_components/bag-state-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Новий: Зміна стану мішка | L-TEX Manager" };

export default async function NewBagStatePage() {
  const user = await requireRole(["warehouse", "admin", "owner"]);
  if (!user) notFound();

  const [agents, sectors] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.warehouseSector.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="text-sm">
        <BackButton fallbackHref="/manager/bag-state-changes" />
      </div>
      <h1 className="text-xl font-semibold">Новий: Зміна стану мішка</h1>
      <BagStateForm mode="create" agents={agents} sectors={sectors} />
    </div>
  );
}
