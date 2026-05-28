import { z } from "zod";
import { UA_REGION_SLUGS } from "@/lib/constants/regions";

/**
 * Чат-inbox Phase 2 — Zod-схеми адмін-CRUD мапи `MgrRegionAgent`
 * (область → торговий). 24 области з whitelist'у `UA_REGIONS`.
 */

export const createRegionAgentSchema = z.object({
  region: z
    .string()
    .trim()
    .refine((s) => (UA_REGION_SLUGS as readonly string[]).includes(s), {
      message: "Невірний slug області",
    }),
  userId: z.string().trim().min(1, "Виберіть менеджера"),
});

export const updateRegionAgentSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Немає полів для оновлення",
  });

export type CreateRegionAgentInput = z.infer<typeof createRegionAgentSchema>;
export type UpdateRegionAgentInput = z.infer<typeof updateRegionAgentSchema>;
