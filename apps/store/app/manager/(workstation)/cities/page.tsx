import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { CitiesManager } from "./_components/cities-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Міста — L-TEX Manager" };

export default async function CitiesPage() {
  const user = await requireRole(["admin", "owner"]);
  if (!user) redirect("/manager");

  const [items, regions] = await Promise.all([
    prisma.cityy.findMany({
      orderBy: [{ archived: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        regionId: true,
        archived: true,
        region: { select: { id: true, name: true } },
      },
    }),
    prisma.region.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Міста</h1>
        <p className="mt-1 text-sm text-gray-600">
          Довідник міст (належать областям). ← 1С Міста.
        </p>
      </header>
      <CitiesManager initial={items} regions={regions} />
    </div>
  );
}
