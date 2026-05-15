import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { ClientAssortmentTab } from "./_components/client-assortment-tab";
import { ClientBankAccountsTab } from "./_components/client-bank-accounts-tab";
import { ClientHeader } from "./_components/client-header";
import { ClientHistoryTab } from "./_components/client-history-tab";
import { ClientOrdersTab } from "./_components/client-orders-tab";
import { ClientPresentationHistoryTab } from "./_components/client-presentation-history-tab";
import { ClientPresentationsTab } from "./_components/client-presentations-tab";
import { ClientRemindersTab } from "./_components/client-reminders-tab";
import { ClientRequisitesTab } from "./_components/client-requisites-tab";
import { ClientSalesHistoryTab } from "./_components/client-sales-history-tab";
import { ClientSocialTab } from "./_components/client-social-tab";
import { ClientTabs } from "./_components/client-tabs";
import { ClientViberTab } from "./_components/client-viber-tab";
import { countOverdue } from "./_components/client-reminders-grouping";
import { loadClientDetail } from "./_lib/load-client";
import { loadEditDictionaries } from "./_lib/load-edit-dictionaries";

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
  const [client, dictionaries] = await Promise.all([
    loadClientDetail(id),
    loadEditDictionaries(),
  ]);
  if (!client) notFound();

  const canAssign = user.role === "admin";
  const canEdit = await canEditClient(user, client.id);
  const editDisabledReason = canEdit
    ? undefined
    : "Тільки призначений менеджер або адмін може редагувати";
  const overdueCount = countOverdue(client.reminders);

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
        overdueRemindersCount={overdueCount}
        requisites={
          <ClientRequisitesTab
            client={client}
            dictionaries={dictionaries}
            canEdit={canEdit}
            currentUserRole={user.role}
            editDisabledReason={editDisabledReason}
          />
        }
        assortment={<ClientAssortmentTab items={client.assortmentItems} />}
        presentations={<ClientPresentationsTab items={client.presentations} />}
        history={
          <ClientHistoryTab clientId={client.id} timeline={client.timeline} />
        }
        salesHistory={<ClientSalesHistoryTab />}
        orders={<ClientOrdersTab clientId={client.id} />}
        reminders={
          <ClientRemindersTab
            clientId={client.id}
            reminders={client.reminders}
            currentUserId={user.id}
            currentUserRole={user.role}
          />
        }
        viber={<ClientViberTab client={client} />}
        banks={<ClientBankAccountsTab accounts={client.bankAccounts} />}
        presentationHistory={<ClientPresentationHistoryTab />}
        social={<ClientSocialTab client={client} />}
      />
    </div>
  );
}
