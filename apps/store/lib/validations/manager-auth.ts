import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Невірний email").max(120),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.string().email().max(120),
});
export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(120),
  newPassword: z
    .string()
    .min(12, "Мінімум 12 символів")
    .max(200)
    .refine((v) => /[0-9]/.test(v), "Хоча б одна цифра")
    .refine((v) => /[A-Za-zА-Яа-яҐІЇЄ]/.test(v), "Хоча б одна буква"),
});
export type PasswordResetConfirmInput = z.infer<
  typeof passwordResetConfirmSchema
>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

// Усі ролі системи (← Тиждень 1 блоку Ролі, 2026-06-03).
// Має співпадати з `ManagerRole` у `lib/auth/jwt.ts` і Prisma `UserRole`.
export const MANAGER_ROLES = [
  "manager",
  "senior_manager",
  "admin",
  "owner",
  "supervisor",
  "analyst",
  "warehouse",
  "expeditor",
  "bookkeeper",
] as const;

export const inviteUserSchema = z.object({
  email: z.string().email().max(120),
  fullName: z.string().min(2).max(120),
  role: z.enum(MANAGER_ROLES).default("manager"),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(MANAGER_ROLES).optional(),
  fullName: z.string().min(2).max(120).optional(),
  forcePasswordReset: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
