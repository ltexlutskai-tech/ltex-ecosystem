import { z } from "zod";

export const NOTIFY_CHANNELS = ["push", "telegram"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export const updateMeSchema = z
  .object({
    fullName: z.string().min(2).max(120).optional(),
    notifyChannels: z.array(z.enum(NOTIFY_CHANNELS)).max(2).optional(),
  })
  .refine(
    (data) => data.fullName !== undefined || data.notifyChannels !== undefined,
    { message: "Потрібно передати хоча б одне поле для оновлення" },
  );
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(12, "Мінімум 12 символів")
    .max(200)
    .refine((v) => /[0-9]/.test(v), "Хоча б одна цифра")
    .refine((v) => /[A-Za-zА-Яа-яҐІЇЄ]/.test(v), "Хоча б одна буква"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
