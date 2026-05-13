import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { UnderConstruction } from "../../_components/under-construction";
import { ClientAssortmentTab } from "./_components/client-assortment-tab";
import { ClientHeader } from "./_components/client-header";
import { ClientHistoryTab } from "./_components/client-history-tab";
import { ClientRequisitesTab } from "./_components/client-requisites-tab";
import { ClientRoutesTab } from "./_components/client-routes-tab";
import { ClientTabs } from "./_components/client-tabs";
import { loadClientDetail } from "./_lib/load-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await loadClientDetail(id);
  return {
    title: client ? `${client.name} — Клієнти` : "Клієнт — L-TEX Manager",
  };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;
  const client = await loadClientDetail(id);
  if (!client) notFound();

  const canAssign = user.role === "admin";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link
        href="/manager/customers"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до списку
      </Link>

      <ClientHeader client={client} canAssign={canAssign} />

      <ClientTabs
        requisites={<ClientRequisitesTab client={client} />}
        history={
          <ClientHistoryTab clientId={client.id} timeline={client.timeline} />
        }
        routes={
          <ClientRoutesTab
            routes={client.routes}
            primaryRouteId={client.primaryRoute?.id ?? null}
          />
        }
        assortment={<ClientAssortmentTab items={client.assortmentItems} />}
        orders={
          <UnderConstruction
            session="M1.5"
            description="Замовлення клієнта з'являться у наступних сесіях."
          />
        }
      />
    </div>
  );
}
