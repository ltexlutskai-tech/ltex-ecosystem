import { z } from "zod";

/**
 * Блок «Оплати / Каса» — Етап 1. Zod-схеми адмін-CRUD довідників каси:
 *  • `MgrBankAccount` (← 1С Catalog.БанковскиеСчета);
 *  • `MgrCashFlowArticle` (← 1С Catalog.СтатьиДвиженияДенежныхСредств).
 *
 * Усі поля редагування — додаткові; create вимагає лише `name`. PATCH —
 * частковий (усі поля optional), без зміни ключа.
 */

// ─── Банк. рахунки ──────────────────────────────────────────────────────────

export const createBankAccountSchema = z.object({
  name: z.string().trim().min(1, "Вкажіть назву").max(200),
  description: z.string().trim().max(500).optional(),
  hiddenInApp: z.boolean().optional().default(false),
});

export const updateBankAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    hiddenInApp: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Немає полів для оновлення",
  });

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;

// ─── Статті руху коштів ───────────────────────────────────────────────────

export const createCashFlowArticleSchema = z.object({
  name: z.string().trim().min(1, "Вкажіть назву").max(200),
  code: z.string().trim().max(50).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
});

export const updateCashFlowArticleSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().max(50).nullable().optional(),
    parentId: z.string().trim().min(1).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Немає полів для оновлення",
  });

export type CreateCashFlowArticleInput = z.infer<
  typeof createCashFlowArticleSchema
>;
export type UpdateCashFlowArticleInput = z.infer<
  typeof updateCashFlowArticleSchema
>;
