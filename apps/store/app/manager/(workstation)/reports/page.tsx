import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, PieChart } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { REPORTS, REPORT_THEMES } from "@/lib/manager/registry-catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Звіти" };

const ALLOWED = [
  "analyst",
  "admin",
  "owner",
  "supervisor",
  "bookkeeper",
] as const;

export default async function ReportsHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!(ALLOWED as readonly string[]).includes(user.role)) {
    redirect("/manager");
  }

  // Звіти, згруповані за темами (порядок секцій = порядок REPORT_THEMES).
  const themed = REPORT_THEMES.map((theme) => ({
    theme,
    reports: REPORTS.filter((r) => r.theme === theme.key),
  })).filter((g) => g.reports.length > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Звіти</h1>
        <p className="mt-1 text-sm text-gray-500">
          Аналітичні звіти по продажах, фінансах, складу та боргах.
        </p>
      </div>

      {themed.map(({ theme, reports }) => (
        <section key={theme.key} className="space-y-2.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            {theme.label}
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((r) => (
              <Link
                key={r.key}
                href={r.href}
                className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50/30"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                    <PieChart className="h-4 w-4" />
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                </div>
                <div className="text-sm font-semibold text-gray-800">
                  {r.label}
                </div>
                <p className="mt-0.5 text-xs leading-snug text-gray-500">
                  {r.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
