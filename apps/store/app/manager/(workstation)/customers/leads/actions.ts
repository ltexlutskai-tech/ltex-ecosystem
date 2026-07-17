"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePhone } from "@ltex/shared";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { matchClientByPhone } from "@/lib/chat/phone-match";

async function requireManager() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Не авторизовано");
  return user;
}

/**
 * Конвертує лід у повноцінного клієнта (MgrClient) і відкриває його картку.
 * Якщо телефон уже належить клієнту — лінкує лід на нього (без дубля).
 */
export async function convertLeadToClient(leadId: string): Promise<void> {
  await requireManager();

  const lead = await prisma.mgrLead.findUnique({ where: { id: leadId } });
  if (!lead) redirect("/manager/customers/leads");

  let clientId: string;

  const normalized = lead.phone ? normalizePhone(lead.phone) : null;
  const existing = normalized ? await matchClientByPhone(normalized) : null;
  if (existing) {
    clientId = existing.clientId;
  } else {
    const client = await prisma.mgrClient.create({
      data: {
        name: lead.name,
        phonePrimary: normalized,
        city: lead.city,
        region: lead.region,
        // Переносимо менеджера, підвʼязаного за областю ще при реєстрації.
        agentUserId: lead.agentUserId,
      },
      select: { id: true },
    });
    clientId = client.id;
    await prisma.mgrClientTimelineEntry.create({
      data: {
        clientId,
        kind: "lead_converted",
        body: "Клієнта створено з ліда (реєстрація на сайті).",
        occurredAt: new Date(),
      },
    });
  }

  await prisma.mgrLead.update({
    where: { id: leadId },
    data: { status: "converted", convertedClientId: clientId },
  });

  revalidatePath("/manager/customers/leads");
  redirect(`/manager/customers/${clientId}`);
}

/** Відхиляє лід (спам / нецільовий). */
export async function rejectLead(leadId: string): Promise<void> {
  await requireManager();
  await prisma.mgrLead.update({
    where: { id: leadId },
    data: { status: "rejected" },
  });
  revalidatePath("/manager/customers/leads");
}
