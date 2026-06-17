import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { RegionsManager } from "./_components/regions-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Області — L-TEX Manager" };

export default async function RegionsPage() {
  const user = await requireRole(["admin", "owner"]);
  if (!user) redirect("/manager");

  const items = await prisma.region.findMany({
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, archived: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Області</h1>
        <p className="mt-1 text-sm text-gray-600">
          Довідник областей України. ← 1С Області.
        </p>
      </header>
      <RegionsManager initial={items} />
    </div>
  );
}
