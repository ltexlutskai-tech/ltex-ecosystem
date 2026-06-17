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

// ─── Фаза 1 (5.6) — нові довідники паритету ─────────────────────────────────
// Одиниці виміру / Області / Міста / Торгові агенти. Спільний патерн:
// create вимагає лише `name`; PATCH — частковий, без зміни code1C-ключа.

// Одиниці виміру (← Catalog.ЕдиницыИзмерения).
export const createUnitSchema = z.object({
  name: z.string().trim().min(1, "Вкажіть назву").max(50),
  code: z.string().trim().max(50).optional(),
  fullName: z.string().trim().max(200).optional(),
});

export const updateUnitSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    code: z.string().trim().max(50).nullable().optional(),
    fullName: z.string().trim().max(200).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Немає полів для оновлення",
  });

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

// Області (← Catalog.Области).
export const createRegionSchema = z.object({
  name: z.string().trim().min(1, "Вкажіть назву").max(100),
  code: z.string().trim().max(50).optional(),
});

export const updateRegionSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    code: z.string().trim().max(50).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Немає полів для оновлення",
  });

export type CreateRegionInput = z.infer<typeof createRegionSchema>;
export type UpdateRegionInput = z.infer<typeof updateRegionSchema>;

// Міста (← Catalog.Города; належать області).
export const createCitySchema = z.object({
  name: z.string().trim().min(1, "Вкажіть назву").max(100),
  code: z.string().trim().max(50).optional(),
  regionId: z.string().trim().min(1).nullable().optional(),
});

export const updateCitySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    code: z.string().trim().max(50).nullable().optional(),
    regionId: z.string().trim().min(1).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Немає полів для оновлення",
  });

export type CreateCityInput = z.infer<typeof createCitySchema>;
export type UpdateCityInput = z.infer<typeof updateCitySchema>;

// Торгові агенти (← Catalog.ТорговыеАгенты).
export const createTradeAgentSchema = z.object({
  name: z.string().trim().min(1, "Вкажіть ПІБ").max(100),
  code: z.string().trim().max(50).optional(),
  userId: z.string().trim().min(1).nullable().optional(),
});

export const updateTradeAgentSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    code: z.string().trim().max(50).nullable().optional(),
    userId: z.string().trim().min(1).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Немає полів для оновлення",
  });

export type CreateTradeAgentInput = z.infer<typeof createTradeAgentSchema>;
export type UpdateTradeAgentInput = z.infer<typeof updateTradeAgentSchema>;
