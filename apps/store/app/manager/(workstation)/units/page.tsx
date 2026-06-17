import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { UnitsManager } from "./_components/units-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Одиниці виміру — L-TEX Manager" };

export default async function UnitsPage() {
  const user = await requireRole(["admin", "owner"]);
  if (!user) redirect("/manager");

  const itemsRaw = await prisma.unit.findMany({
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      fullName: true,
      coefficient: true,
      archived: true,
    },
  });
  // Decimal → string (серіалізація у клієнтський компонент).
  const items = itemsRaw.map((u) => ({
    ...u,
    coefficient: u.coefficient == null ? null : u.coefficient.toString(),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Одиниці виміру</h1>
        <p className="mt-1 text-sm text-gray-600">
          Довідник одиниць (кг / шт / пара). ← 1С Одиниці виміру.
        </p>
      </header>
      <UnitsManager initial={items} />
    </div>
  );
}
