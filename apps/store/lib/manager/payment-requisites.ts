import { prisma } from "@ltex/db";
import type { RequisiteInfo } from "@/lib/manager/sale-message";

/**
 * Довідник реквізитів для оплати (`MgrPaymentRequisite`). Набори реквізитів
 * одержувача, які менеджер обирає перед відправкою повідомлення «Скинути
 * реквізити». За замовчуванням у базі сидиться ФОП Кузенко (`isDefault`).
 */
export interface PaymentRequisiteView extends RequisiteInfo {
  id: string;
  name: string;
  isDefault: boolean;
}

/** Активні (не архівні) реквізити, впорядковані: дефолт → sortOrder → назва. */
export async function getActivePaymentRequisites(): Promise<
  PaymentRequisiteView[]
> {
  const rows = await prisma.mgrPaymentRequisite.findMany({
    where: { archived: false },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    recipient: r.recipient,
    edrpou: r.edrpou,
    bankName: r.bankName,
    iban: r.iban,
    purpose: r.purpose,
    isDefault: r.isDefault,
  }));
}
