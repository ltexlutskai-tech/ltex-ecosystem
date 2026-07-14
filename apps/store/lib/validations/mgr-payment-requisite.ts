import { z } from "zod";

/** Реквізити для оплати — довідник (owner/admin CRUD). */
export const createPaymentRequisiteSchema = z.object({
  name: z.string().trim().min(1, "Вкажіть назву").max(120),
  recipient: z.string().trim().min(1, "Вкажіть одержувача").max(200),
  edrpou: z.string().trim().max(40).optional().nullable(),
  bankName: z.string().trim().max(200).optional().nullable(),
  iban: z.string().trim().max(60).optional().nullable(),
  purpose: z.string().trim().max(200).optional().nullable(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updatePaymentRequisiteSchema = createPaymentRequisiteSchema
  .partial()
  .extend({
    archived: z.boolean().optional(),
  });

export type CreatePaymentRequisiteInput = z.infer<
  typeof createPaymentRequisiteSchema
>;
