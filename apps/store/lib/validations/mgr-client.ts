import { z } from "zod";

const optionalIdField = z
  .string()
  .min(1, "ID не може бути порожнім")
  .max(50)
  .nullable()
  .optional();

const websiteUrlField = z
  .union([z.literal(""), z.string().url().max(500), z.null()])
  .optional();

const dateField = z
  .union([z.string().datetime(), z.string().length(0), z.null()])
  .optional();

export const mgrClientPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    tradePointName: z.string().max(255).nullable().optional(),
    region: z.string().max(100).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    street: z.string().max(255).nullable().optional(),
    house: z.string().max(50).nullable().optional(),
    novaPoshtaBranch: z.string().max(50).nullable().optional(),
    websiteUrl: websiteUrlField,
    geolocation: z.string().max(100).nullable().optional(),
    viberContact: z.string().max(50).nullable().optional(),
    monthlyVolume: z.number().nonnegative().nullable().optional(),
    licenseExpiresAt: dateField,
    hasNewMessage: z.boolean().optional(),
    isViberLinked: z.boolean().optional(),
    dialogStatus: z.string().max(100).nullable().optional(),
    statusGeneralId: optionalIdField,
    statusOperationalId: optionalIdField,
    categoryTTId: optionalIdField,
    priceTypeId: optionalIdField,
    primaryAssortmentId: optionalIdField,
    deliveryMethodId: optionalIdField,
    searchChannelId: optionalIdField,
    primaryRouteId: optionalIdField,
    agentUserId: optionalIdField,
  })
  .strict();

export type MgrClientPatchInput = z.infer<typeof mgrClientPatchSchema>;

export const MGR_CLIENT_ADMIN_ONLY_FIELDS = ["agentUserId"] as const;
export type MgrClientAdminOnlyField =
  (typeof MGR_CLIENT_ADMIN_ONLY_FIELDS)[number];
