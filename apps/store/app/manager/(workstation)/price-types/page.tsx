import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Типи цін" };

export default async function PriceTypesPage() {
  const user = await requireRole(["admin", "owner"]);
  if (!user) redirect("/manager");

  const items = await prisma.mgrPriceType.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, label: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Типи цін</h1>
        <p className="mt-1 text-sm text-gray-600">
          Довідкова характеристика клієнта; не впливає на ціни документів (опт /
          акція — з прайсу). ← 1С Типи цін.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Код</th>
              <th className="px-4 py-2 font-medium">Назва</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-gray-400">
                  Немає типів цін.
                </td>
              </tr>
            )}
            {items.map((t) => (
              <tr key={t.id} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                    {t.code}
                  </span>
                </td>
                <td className="px-4 py-2 font-medium text-gray-800">
                  {t.label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
