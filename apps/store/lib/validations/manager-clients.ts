import { z } from "zod";

// CSV → string[] (split + trim + drop empty + cap 50 entries).
const csvList = z
  .string()
  .max(2000)
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const arr = v
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 50);
    return arr.length > 0 ? arr : undefined;
  });

const optionalNumber = z.coerce.number().finite().optional();
const optionalIsoDate = z
  .string()
  .max(40)
  .optional()
  .refine(
    (v) => v === undefined || !Number.isNaN(Date.parse(v)),
    "Невалідна дата",
  );

export const listQuerySchema = z.object({
  // Існуючі (M1.3a) — backward-compat
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

  // M1.3e: розширені multi-select (id-based, ?statusId=a,b,c)
  statusId: csvList,
  statusOperationalId: csvList,
  channelId: csvList,
  deliveryMethodId: csvList,
  categoryTTId: csvList,
  priceTypeId: csvList,
  primaryAssortmentId: csvList,
  primaryRouteId: csvList,
  agentUserId: csvList,

  // Text LIKE
  region: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  dialogStatus: z.string().trim().max(100).optional(),

  // Range числові
  debtMin: optionalNumber,
  debtMax: optionalNumber,
  overdueDebtMin: optionalNumber,
  overdueDebtMax: optionalNumber,
  monthlyVolumeMin: optionalNumber,
  monthlyVolumeMax: optionalNumber,
  daysSinceMin: z.coerce.number().int().optional(),
  daysSinceMax: z.coerce.number().int().optional(),

  // Date range
  licenseExpiresBefore: optionalIsoDate,
  createdFrom: optionalIsoDate,
  createdTo: optionalIsoDate,

  // Bool exact
  hasNewMessage: z.coerce.boolean().optional(),
  isViberLinked: z.coerce.boolean().optional(),
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

/** Групова зміна менеджера (групова обробка). */
export const bulkAssignSchema = z.object({
  clientIds: z.array(z.string().min(1).max(50)).min(1).max(500),
  userId: z
    .string()
    .min(1)
    .max(50)
    .nullable()
    .describe("null = зняти прив'язку, інакше — User.id"),
});
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
