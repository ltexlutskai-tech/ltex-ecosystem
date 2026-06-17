import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildStockNormWhere,
  mapStockNormToRow,
} from "@/lib/manager/misc-register-view";
import { ListPagination } from "../../customers/_components/list-pagination";
import { RegSearchFilter } from "../_components/reg-search-filter";
import { StockNormsTable } from "./_components/stock-norms-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регістр: Норми запасів" };

const PAGE_SIZE = 50;
const ALLOWED = ["admin", "owner", "analyst"] as const;

export default async function StockNormsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!(ALLOWED as readonly string[]).includes(user.role)) {
    redirect("/manager");
  }

  const sp = await searchParams;
  const where = buildStockNormWhere(sp);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [total, norms] = await Promise.all([
    prisma.stockNorm.count({ where }),
    prisma.stockNorm.findMany({
      where,
      orderBy: [{ productCode1C: "asc" }, { setAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        productCode1C: true,
        warehouseCode1C: true,
        norm: true,
        setAt: true,
      },
    }),
  ]);

  const rows = norms.map(mapStockNormToRow);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Регістр: Норми запасів
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Нормативні залишки по номенклатурі та складах (1С «НормыЗапасов»).
        </p>
      </div>

      <RegSearchFilter searchLabel="Пошук за 1С-кодом номенклатури" />
      <StockNormsTable rows={rows} total={total} />
      <ListPagination page={page} totalPages={totalPages} />
    </div>
  );
}
