import { z } from "zod";

export const updateRatesSchema = z.object({
  EUR: z.number().positive().max(1000),
  USD: z.number().positive().max(1000),
});
export type UpdateRatesInput = z.infer<typeof updateRatesSchema>;
