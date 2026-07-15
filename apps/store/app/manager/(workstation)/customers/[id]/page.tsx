import { notFound, redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { BackButton } from "../../_components/back-button";
import { DiscussButton } from "../../messenger/_components/discuss-button";
import { ClientActionButtons } from "./_components/client-action-buttons";
import { ClientAssortmentTab } from "./_components/client-assortment-tab";
import { ClientDebtMovementsTab } from "./_components/client-debt-movements-tab";
import { ClientHeader } from "./_components/client-header";
import { ClientHistoryTab } from "./_components/client-history-tab";
import { ClientKeywordsTab } from "./_components/client-keywords-tab";
import { ClientOrdersTab } from "./_components/client-orders-tab";
import { ClientPresentationHistoryTab } from "./_components/client-presentation-history-tab";
import { ClientPresentationsTab } from "./_components/client-presentations-tab";
import { ClientRemindersTab } from "./_components/client-reminders-tab";
import { ClientRequisitesTab } from "./_components/client-requisites-tab";
import { ClientSalesHistoryTab } from "./_components/client-sales-history-tab";
import { ClientSocialTab } from "./_components/client-social-tab";
import { ClientTabs } from "./_components/client-tabs";
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
    loadClientDetail(id, user),
    loadEditDictionaries(),
  ]);
  if (!client) notFound();

  const isForeign = client.viewerOwnership === "foreign";
  const canAssign = user.role === "admin" || user.role === "owner";
  const canCorrectDebt = user.role === "admin" || user.role === "owner";
  const canEdit = await canEditClient(user, client.id);
  const editDisabledReason = canEdit
    ? undefined
    : isForeign
      ? "Тільки призначений менеджер"
      : "Тільки призначений менеджер або адмін може редагувати";
  const overdueCount = countOverdue(client.reminders);

  // Дзеркало `Customer` (read-only лукап по code1C) для prefill сторінок
  // Замовлення / Реалізація, які чекають `Customer.id` у `?clientId`. Якщо
  // дзеркала ще нема — лишаємо null (форма відкриється з порожнім пікером).
  const customerMirror = client.code1C
    ? await prisma.customer.findUnique({
        where: { code1C: client.code1C },
        select: { id: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <BackButton fallbackHref="/manager/customers" />
        <DiscussButton
          docRef={{
            type: "client",
            label: client.name,
            subtitle: client.city ?? undefined,
            url: `/manager/customers/${client.id}`,
          }}
        />
      </div>

      {/* Закріплена шапка — завжди видно, з ким працюємо (C6). */}
      <div className="sticky top-0 z-20 -mx-1 bg-gray-50 px-1 pt-1 pb-2">
        <ClientHeader client={client} canAssign={canAssign} />
      </div>

      {/* Дії по клієнту — на верху картки, поза «Реквізитами» (C1). */}
      <ClientActionButtons
        clientId={client.id}
        customerId={customerMirror?.id ?? null}
        canEdit={canEdit}
      />

      <ClientTabs
        overdueRemindersCount={overdueCount}
        isForeign={isForeign}
        requisites={
          <ClientRequisitesTab
            client={client}
            dictionaries={dictionaries}
            canEdit={canEdit}
            currentUserRole={user.role}
            editDisabledReason={editDisabledReason}
            isForeign={isForeign}
            customerId={customerMirror?.id ?? null}
          />
        }
        assortment={<ClientAssortmentTab clientId={client.id} />}
        presentations={<ClientPresentationsTab items={client.presentations} />}
        history={
          <ClientHistoryTab
            clientId={client.id}
            timeline={client.timeline}
            canEdit={canEdit}
            currentUserId={user.id}
            currentUserRole={user.role}
          />
        }
        salesHistory={<ClientSalesHistoryTab clientId={client.id} />}
        orders={<ClientOrdersTab clientId={client.id} />}
        reminders={
          <ClientRemindersTab
            clientId={client.id}
            clientName={client.name}
            currentUserId={user.id}
            currentUserRole={user.role}
          />
        }
        presentationHistory={<ClientPresentationHistoryTab />}
        social={
          <ClientSocialTab
            client={client}
            canEdit={canEdit}
            isForeign={isForeign}
          />
        }
        keywords={
          <ClientKeywordsTab
            clientId={client.id}
            keywords={client.keywords}
            canEdit={canEdit}
            isForeign={isForeign}
          />
        }
        debtMovements={
          <ClientDebtMovementsTab
            clientId={client.id}
            canCorrectDebt={canCorrectDebt}
          />
        }
      />
    </div>
  );
}
