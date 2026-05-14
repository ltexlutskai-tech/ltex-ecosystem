import { z } from "zod";

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.string().max(50).optional(),
  channel: z.string().max(50).optional(),
  deliveryMethod: z.string().max(50).optional(),
  hasDebt: z.coerce.boolean().optional(),
  hasOverpayment: z.coerce.boolean().optional(),
  onlyMine: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
  hideTrash: z.coerce.boolean().default(true),
});
export type ListQueryInput = z.infer<typeof listQuerySchema>;

export const timelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
});

export const timelineCommentSchema = z.object({
  body: z.string().trim().min(1, "Коментар не може бути порожнім").max(2000),
});
export type TimelineCommentInput = z.infer<typeof timelineCommentSchema>;

export const assignSchema = z.object({
  userId: z
    .string()
    .min(1)
    .max(50)
    .nullable()
    .describe("null = unassign, інакше — User.id"),
});
export type AssignInput = z.infer<typeof assignSchema>;
