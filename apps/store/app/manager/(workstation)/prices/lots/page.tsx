import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import type {
  LotsListSort,
  LotsListSortDir,
  LotsListStatus,
} from "@/lib/manager/lots-list";
import { AllLotsToolbar } from "../_components/all-lots-toolbar";
import { AllLotsList } from "../_components/all-lots-list";
import { AllLotsPagination } from "../_components/all-lots-pagination";
import { loadAllLots, loadProductLabel } from "../_lib/load-all-lots";

export const dynamic = "force-dynamic";
export const metadata = { title: "Деталі по мішках — L-TEX Manager" };

export default async function AllLotsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const page = clampInt(sp.page, 1, 1, 9_999);
  const pageSize = clampInt(sp.pageSize, 50, 10, 100);
  const sort: LotsListSort = pickSort(sp.sort);
  const dir: LotsListSortDir = pickString(sp.dir) === "desc" ? "desc" : "asc";
  const status: LotsListStatus = pickStatus(sp.status);
  const productId = pickString(sp.productId);

  const [list, productLabel, rateUah] = await Promise.all([
    loadAllLots({
      q: pickString(sp.q),
      productId,
      target: pickBool(sp.target),
      hasVideo: pickBool(sp.hasVideo),
      onlyInStock: pickBool(sp.onlyInStock),
      status,
      sort,
      dir,
      page,
      pageSize,
      viewerUserId: user.id,
    }),
    productId ? loadProductLabel(productId) : Promise.resolve(null),
    getCurrentRate(),
  ]);

  return (
    <div className="max-w-none space-y-3">
      <Link
        href="/manager/prices"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-800"
      >
        ← Назад до прайсу
      </Link>
      <header>
        <h1 className="text-xl font-bold text-gray-800">
          Деталі по мішках / Наявні лоти
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Усього лотів: {list.total} · товарів: {list.groups.length} · сторінка{" "}
          {list.page} з {list.totalPages}
        </p>
      </header>

      <AllLotsToolbar totalCount={list.total} productLabel={productLabel} />
      <AllLotsList
        groups={list.groups}
        rateUah={rateUah}
        sellerName={user.fullName}
      />
      <AllLotsPagination page={list.page} totalPages={list.totalPages} />
    </div>
  );
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v && v.length > 0 ? v : undefined;
}

function pickBool(v: string | string[] | undefined): boolean | undefined {
  const s = pickString(v);
  if (s === "true") return true;
  if (s === "false") return false;
  return undefined;
}

function pickSort(v: string | string[] | undefined): LotsListSort {
  const s = pickString(v);
  if (s === "arrival" || s === "weight" || s === "manager") return s;
  return "product";
}

function pickStatus(v: string | string[] | undefined): LotsListStatus {
  const s = pickString(v);
  if (s === "free" || s === "reserved" || s === "my" || s === "expired") {
    return s;
  }
  return "all";
}

function clampInt(
  v: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const s = pickString(v);
  const n = s ? Number(s) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}
