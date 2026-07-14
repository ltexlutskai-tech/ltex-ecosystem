import { prisma } from "@ltex/db";
import type { RequisiteInfo } from "@/lib/manager/sale-message";

/**
 * Набори реквізитів для «Скинути реквізити» у реалізації беруться з довідника
 * «Банківські рахунки» (`MgrBankAccount`) — це той самий рахунок, на який
 * приймають оплату. Кожен рахунок несе поля реквізитів (одержувач/ЄДРПОУ/IBAN/
 * банк/призначення); у селекторі показуємо `name` рахунку.
 */
export interface PaymentRequisiteView extends RequisiteInfo {
  id: string;
  name: string;
  isDefault: boolean;
}

/**
 * Активні рахунки-реквізити для селектора. Показуємо не-архівні рахунки типу
 * "account"/"card" (готівкові каси не пропонуємо як реквізити). Перший у списку
 * (за назвою) вважається дефолтним у формі.
 */
export async function getActivePaymentRequisites(): Promise<
  PaymentRequisiteView[]
> {
  const rows = await prisma.mgrBankAccount.findMany({
    where: { archived: false, kind: { in: ["account", "card"] } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      recipientName: true,
      edrpou: true,
      iban: true,
      bankName: true,
      paymentPurpose: true,
    },
  });
  return rows.map((r, i) => ({
    id: r.id,
    name: r.name,
    // Одержувач = юр. назва (recipientName) або назва рахунку як fallback.
    recipient: r.recipientName?.trim() || r.name,
    edrpou: r.edrpou,
    iban: r.iban,
    bankName: r.bankName,
    purpose: r.paymentPurpose,
    isDefault: i === 0,
  }));
}
