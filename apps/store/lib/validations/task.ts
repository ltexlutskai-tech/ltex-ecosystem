import { z } from "zod";

/** Дозволені ролі-виконавці для завдання «на роль». */
export const TASK_ASSIGNEE_ROLES = [
  "warehouse",
  "manager",
  "senior_manager",
  "supervisor",
  "analyst",
  "bookkeeper",
  "expeditor",
  "admin",
  "owner",
] as const;

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Вкажіть суть завдання").max(200),
    description: z.string().trim().max(2000).optional(),
    assigneeUserId: z.string().min(1).nullable().optional(),
    assigneeRole: z.enum(TASK_ASSIGNEE_ROLES).nullable().optional(),
    clientId: z.string().min(1).nullable().optional(),
    saleId: z.string().min(1).nullable().optional(),
  })
  .refine((d) => Boolean(d.assigneeUserId) || Boolean(d.assigneeRole), {
    message: "Оберіть виконавця",
    path: ["assigneeUserId"],
  });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const patchTaskSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("complete"),
    resultComment: z.string().trim().max(2000).optional(),
  }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("unarchive") }),
]);

export type PatchTaskInput = z.infer<typeof patchTaskSchema>;
