import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { queryAuditLog } from "@/lib/audit/audit-log";
import { AuditLogTable } from "./audit-table";
import { AuditFilters } from "./audit-filters";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Журнал дій | L-TEX Manager",
};

interface SearchParams {
  q?: string;
  userId?: string;
  role?: string;
  action?: string;
  resource?: string;
  ownerOnly?: string;
  from?: string;
  to?: string;
  page?: string;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireRole(["admin", "owner"]);
  if (!user) notFound();
  const sp = await searchParams;

  const result = await queryAuditLog({
    userId: sp.userId,
    role: sp.role as
      | "manager"
      | "senior_manager"
      | "admin"
      | "owner"
      | "supervisor"
      | "analyst"
      | "warehouse"
      | "bookkeeper"
      | undefined,
    action: sp.action as
      | "create"
      | "update"
      | "delete"
      | "login"
      | "logout"
      | "failed_login"
      | "password_reset"
      | "permission_change"
      | "export"
      | "post"
      | undefined,
    resource: sp.resource,
    ownerOnly: sp.ownerOnly === "true",
    search: sp.q,
    fromDate: sp.from ? new Date(sp.from) : undefined,
    toDate: sp.to ? new Date(sp.to) : undefined,
    page: sp.page ? Number(sp.page) : 1,
    pageSize: 50,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Журнал дій</h1>
        <p className="mt-1 text-sm text-gray-500">
          Усі мутаційні дії користувачів. Дії власника позначені бейджем «owner»
          (їх можна відфільтрувати окремо).
        </p>
      </div>
      <AuditFilters initial={sp} />
      <AuditLogTable result={result} />
    </div>
  );
}
