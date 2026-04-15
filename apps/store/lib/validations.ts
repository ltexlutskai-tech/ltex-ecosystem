import { z } from "zod";

export const orderCustomerSchema = z.object({
  name: z.string().min(1, "Ім'я обов'язкове").max(200),
  phone: z.string().min(10, "Невірний номер телефону").max(20),
  telegram: z.string().max(100).optional(),
});

export const orderItemSchema = z.object({
  lotId: z.string().min(1),
  productId: z.string().min(1),
  priceEur: z.number().positive(),
  weight: z.number().positive(),
  quantity: z.number().int().positive(),
});

export const orderSchema = z.object({
  customer: orderCustomerSchema,
  items: z.array(orderItemSchema).min(1, "Додайте хоча б один лот"),
  notes: z.string().max(1000).optional(),
});

export const syncProductSchema = z.object({
  code1C: z.string().min(1),
  articleCode: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  categorySlug: z.string().min(1),
  description: z.string().optional(),
  quality: z.string().min(1),
  season: z.string().optional(),
  country: z.string().min(1),
  priceUnit: z.enum(["kg", "piece"]).optional(),
  averageWeight: z.number().positive().optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  inStock: z.boolean().optional(),
});

export const syncLotsSchema = z.array(
  z.object({
    barcode: z.string().min(1),
    articleCode: z.string().min(1),
    weight: z.number().positive(),
    quantity: z.number().int().positive().optional(),
    status: z.enum(["free", "reserved", "on_sale"]).optional(),
    priceEur: z.number().positive(),
    videoUrl: z.string().url().optional().or(z.literal("")),
  }),
);

export const syncRatesSchema = z.array(
  z.object({
    currencyFrom: z.enum(["EUR", "UAH", "USD"]),
    currencyTo: z.enum(["EUR", "UAH", "USD"]),
    rate: z.number().positive(),
    date: z.string().datetime().optional(),
    source: z.string().optional(),
  }),
);

// ─── Mobile API schemas ──────────────────────────────────────────────────────

export const mobileAuthSchema = z.object({
  phone: z.string().min(10, "Невірний номер телефону").max(20),
  name: z.string().min(1).max(200).optional(),
  telegram: z.string().max(100).optional(),
  city: z.string().max(200).optional(),
});

export const mobileProfileUpdateSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(200).optional().nullable(),
  telegram: z.string().max(100).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
});

export const mobileFavoriteSchema = z.object({
  customerId: z.string().min(1),
  productId: z.string().min(1),
});

export const mobileChatMessageSchema = z.object({
  text: z.string().min(1, "Повідомлення не може бути порожнім").max(5000),
  imageUrl: z.string().url().max(2048).optional().nullable(),
});

export const adminChatReplySchema = z.object({
  customerId: z.string().min(1),
  text: z.string().min(1, "Повідомлення не може бути порожнім").max(5000),
  imageUrl: z.string().url().max(2048).optional().nullable(),
});

export const mobileChatReadSchema = z.object({
  customerId: z.string().min(1),
  messageIds: z.array(z.string().min(1)).min(1),
});

export const mobileNotificationTokenSchema = z.object({
  customerId: z.string().min(1),
  token: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
});

export const mobileVideoSubscriptionSchema = z.object({
  customerId: z.string().min(1),
  productId: z.string().min(1),
});
