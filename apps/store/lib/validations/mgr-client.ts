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
    // Картка клієнта — Фаза 3: вільний текст ключових слів (теги через кому).
    keywords: z.string().max(500).nullable().optional(),
  })
  .strict();

export type MgrClientPatchInput = z.infer<typeof mgrClientPatchSchema>;

// Створення нового клієнта (M3.6 — UI manual entry). Мінімум — `name`;
// інші поля можна заповнити пізніше через PATCH після відкриття картки.
export const mgrClientCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Введіть назву").max(255),
    code1C: z.string().trim().max(50).optional(),
    phonePrimary: z.string().trim().max(50).optional(),
    tradePointName: z.string().trim().max(255).optional(),
    region: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    priceTypeId: z.string().min(1).max(50).optional(),
    agentUserId: z.string().min(1).max(50).optional(),
  })
  .strict();

export type MgrClientCreateInput = z.infer<typeof mgrClientCreateSchema>;

// ── Phones CRUD (Phase 2a) ──────────────────────────────────────────────
// `MgrClientPhone.messenger` is a free `String?` у схемі (НЕ enum), тому
// валідуємо як один з відомих месенджерів або null. Це не блокує майбутні
// значення з 1С (read-only render через resolveBrandIconKind → link fallback),
// але форма дає лише канонічний набір.
export const MGR_PHONE_MESSENGERS = ["viber", "telegram", "whatsapp"] as const;
export type MgrPhoneMessenger = (typeof MGR_PHONE_MESSENGERS)[number];

const messengerField = z
  .union([z.enum(MGR_PHONE_MESSENGERS), z.literal(""), z.null()])
  .optional();

export const mgrClientPhoneCreateSchema = z
  .object({
    phone: z.string().trim().min(1, "Номер не може бути порожнім").max(32),
    messenger: messengerField,
    label: z.string().trim().max(50).nullable().optional(),
  })
  .strict();

export const mgrClientPhoneUpdateSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .min(1, "Номер не може бути порожнім")
      .max(32)
      .optional(),
    messenger: messengerField,
    label: z.string().trim().max(50).nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: "Немає полів для оновлення",
  });

export type MgrClientPhoneCreateInput = z.infer<
  typeof mgrClientPhoneCreateSchema
>;
export type MgrClientPhoneUpdateInput = z.infer<
  typeof mgrClientPhoneUpdateSchema
>;

// ── Messengers / соцмережі CRUD (Phase 2b) ──────────────────────────────
// `MgrClientMessenger.network` — free `String` у схемі (НЕ enum), тому
// валідуємо проти канонічного набору social-network-ів. Render через
// `resolveBrandIconKind(network)` → link fallback для невідомих значень
// з 1С. Хоча б одне з handle/url має бути присутнім.
export const MGR_MESSENGER_NETWORKS = [
  "tiktok",
  "instagram",
  "facebook",
  "telegram",
  "viber",
  "youtube",
  "whatsapp",
  "pinterest",
  "other",
] as const;
export type MgrMessengerNetwork = (typeof MGR_MESSENGER_NETWORKS)[number];

const messengerHandleField = z.string().trim().max(200).nullable().optional();
const messengerUrlField = z.string().trim().max(500).nullable().optional();
const messengerCommentField = z.string().trim().max(200).nullable().optional();

function hasHandleOrUrl(d: {
  handle?: string | null;
  url?: string | null;
}): boolean {
  return Boolean(d.handle?.trim()) || Boolean(d.url?.trim());
}

export const mgrClientMessengerCreateSchema = z
  .object({
    network: z.enum(MGR_MESSENGER_NETWORKS),
    handle: messengerHandleField,
    url: messengerUrlField,
    comment: messengerCommentField,
  })
  .strict()
  .refine(hasHandleOrUrl, {
    message: "Вкажіть посилання або ідентифікатор",
    path: ["handle"],
  });

export const mgrClientMessengerUpdateSchema = z
  .object({
    network: z.enum(MGR_MESSENGER_NETWORKS).optional(),
    handle: messengerHandleField,
    url: messengerUrlField,
    comment: messengerCommentField,
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: "Немає полів для оновлення",
  });

export type MgrClientMessengerCreateInput = z.infer<
  typeof mgrClientMessengerCreateSchema
>;
export type MgrClientMessengerUpdateInput = z.infer<
  typeof mgrClientMessengerUpdateSchema
>;

// ── Route assignments CRUD (Phase 3) ────────────────────────────────────
// Редаговане призначення маршрутів (`MgrClientRouteAssignment` ↔ `MgrRoute`).
// Сам довідник `MgrRoute` наповнюється з 1С на етапі обмінів.
export const mgrClientRouteCreateSchema = z
  .object({
    routeId: z.string().min(1, "Оберіть маршрут").max(50),
  })
  .strict();

export const mgrClientRouteReorderSchema = z
  .object({
    direction: z.enum(["up", "down"]),
  })
  .strict();

export type MgrClientRouteCreateInput = z.infer<
  typeof mgrClientRouteCreateSchema
>;
export type MgrClientRouteReorderInput = z.infer<
  typeof mgrClientRouteReorderSchema
>;

export const MGR_CLIENT_ADMIN_ONLY_FIELDS = ["agentUserId"] as const;
export type MgrClientAdminOnlyField =
  (typeof MGR_CLIENT_ADMIN_ONLY_FIELDS)[number];
