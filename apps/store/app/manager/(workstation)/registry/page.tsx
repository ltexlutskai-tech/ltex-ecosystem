import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  DICTIONARIES,
  DOCUMENTS,
  REGISTERS,
  REPORTS,
} from "@/lib/manager/registry-catalog";
import { RegistryHub } from "../_components/registry-hub";

export const dynamic = "force-dynamic";
export const metadata = { title: "Довідники та регістри" };

const ALLOWED = [
  "admin",
  "owner",
  "analyst",
  "supervisor",
  "bookkeeper",
  "manager",
] as const;

export default async function RegistryHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!(ALLOWED as readonly string[]).includes(user.role)) {
    redirect("/manager");
  }

  return (
    <div className="mx-auto max-w-6xl">
      <RegistryHub
        dictionaries={DICTIONARIES}
        registers={REGISTERS}
        reports={REPORTS}
        documents={DOCUMENTS}
      />
    </div>
  );
}
