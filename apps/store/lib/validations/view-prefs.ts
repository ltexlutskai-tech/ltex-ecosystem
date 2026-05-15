import { z } from "zod";

// Per-item shape для PUT body.
// Whitelist валідація keys робиться у route handler (mergePrefs() — теж),
// бо набір залежить від `viewKey` path-param.
const configItemSchema = z.object({
  key: z.string().min(1).max(64),
  visible: z.boolean(),
  order: z.number().int().min(1).max(1000),
});

export const viewPrefsBodySchema = z.object({
  items: z.array(configItemSchema).min(1).max(100),
});

export type ViewPrefsBody = z.infer<typeof viewPrefsBodySchema>;
export type ViewPrefsConfigItem = z.infer<typeof configItemSchema>;
