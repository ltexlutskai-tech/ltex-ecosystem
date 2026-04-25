import { z } from "zod";

export const newsletterSubscribeSchema = z.object({
  email: z.string().email("Невірний email").max(200),
  source: z.enum(["footer", "checkout", "manual"]).optional(),
});
