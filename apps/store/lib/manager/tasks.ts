import { Prisma, prisma } from "@ltex/db";
import type { CurrentManager } from "@/lib/auth/manager-auth";
import {
  normalizeTask,
  normalizeWarehouseTask,
  type RawTask,
  type TaskCard,
  type Viewer,
} from "./task-types";

/**
 * Блок «Завдання» — async-запити. Зводить ручні завдання (`Task`) і складські
 * (`WarehouseTask`, від реалізацій) у два розділи: «Мені» (виконую) та
 * «Від мене» (поставив/контролюю).
 */

// Ролі, для яких складські завдання — «мої на виконання».
const WAREHOUSE_VIEW_ROLES = new Set(["warehouse", "admin", "owner"]);

const TASK_INCLUDE = {
  createdBy: { select: { fullName: true } },
  assignee: { select: { fullName: true } },
} satisfies Prisma.TaskInclude;

type DbTask = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

function toRaw(t: DbTask): RawTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    status: t.status,
    resultComment: t.resultComment,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    createdByUserId: t.createdByUserId,
    createdByName: t.createdBy?.fullName ?? "—",
    assigneeUserId: t.assigneeUserId,
    assigneeRole: t.assigneeRole,
    assigneeName: t.assignee?.fullName ?? null,
    archivedByName: t.archivedByName,
    clientId: t.clientId,
    saleId: t.saleId,
  };
}

function sortCards(cards: TaskCard[]): TaskCard[] {
  // Відкриті вгорі; всередині — новіші першими.
  return cards.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export interface TasksForUser {
  assignedToMe: TaskCard[];
  createdByMe: TaskCard[];
  /** Реєстр виконаних завдань користувача (виконав / був виконавцем). */
  completed: TaskCard[];
}

export async function getTasksForUser(
  user: Pick<CurrentManager, "id" | "role">,
  limit = 200,
): Promise<TasksForUser> {
  const viewer: Viewer = { id: user.id, role: user.role };
  const isWarehouseView = WAREHOUSE_VIEW_ROLES.has(user.role);

  // Реєстр виконаних: складські «sent» — для складських ролей усі, інакше лише
  // де я менеджер реалізації.
  const whCompletedWhere: Prisma.WarehouseTaskWhereInput = isWarehouseView
    ? { status: "sent" }
    : { status: "sent", managerUserId: user.id };

  const [
    assignedTasks,
    createdTasks,
    completedTasks,
    whAssigned,
    whCreated,
    whCompleted,
  ] = await Promise.all([
    // Мені (ручні): відкриті + архівні (щоб виконавець бачив «Архів»),
    // особисто або за роллю.
    prisma.task.findMany({
      where: {
        status: { in: ["open", "archived"] },
        OR: [{ assigneeUserId: user.id }, { assigneeRole: user.role }],
      },
      include: TASK_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    // Від мене (ручні, будь-який статус — щоб бачити результат).
    prisma.task.findMany({
      where: { createdByUserId: user.id },
      include: TASK_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    // Виконані (ручні): статус done, де я — виконавець/за роллю/фактичний
    // виконавець. Це закриває «виконав завдання, а в списку пусто».
    prisma.task.findMany({
      where: {
        status: "done",
        OR: [
          { completedByUserId: user.id },
          { assigneeUserId: user.id },
          { assigneeRole: user.role },
        ],
      },
      include: TASK_INCLUDE,
      orderBy: { completedAt: "desc" },
      take: limit,
    }),
    // Мені (складські): лише для складських ролей — відкриті.
    isWarehouseView
      ? prisma.warehouseTask.findMany({
          where: { status: { in: ["new", "received"] } },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
    // Від мене (складські): де я — менеджер реалізації.
    prisma.warehouseTask.findMany({
      where: { managerUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    // Виконані (складські): відправлені.
    prisma.warehouseTask.findMany({
      where: whCompletedWhere,
      orderBy: { sentAt: "desc" },
      take: limit,
    }),
  ]);

  const assignedToMe = sortCards([
    ...assignedTasks.map((t) => normalizeTask(toRaw(t), viewer)),
    ...whAssigned.map((w) => normalizeWarehouseTask(w)),
  ]);
  const createdByMe = sortCards([
    ...createdTasks.map((t) => normalizeTask(toRaw(t), viewer)),
    ...whCreated.map((w) => normalizeWarehouseTask(w)),
  ]);
  // Виконані — новіші зверху (за фактом виконання/створення).
  const completed = [
    ...completedTasks.map((t) => normalizeTask(toRaw(t), viewer)),
    ...whCompleted.map((w) => normalizeWarehouseTask(w)),
  ].sort((a, b) => {
    const at = a.completedAt ?? a.createdAt;
    const bt = b.completedAt ?? b.createdAt;
    return at < bt ? 1 : -1;
  });

  return { assignedToMe, createdByMe, completed };
}

/** Лічильник відкритих завдань «на мене» — для бейджа у меню. */
export async function countOpenAssignedTasks(
  user: Pick<CurrentManager, "id" | "role">,
): Promise<number> {
  const isWarehouseView = WAREHOUSE_VIEW_ROLES.has(user.role);
  const [tasks, wh] = await Promise.all([
    prisma.task.count({
      where: {
        status: "open",
        OR: [{ assigneeUserId: user.id }, { assigneeRole: user.role }],
      },
    }),
    isWarehouseView
      ? prisma.warehouseTask.count({
          where: { status: { in: ["new", "received"] } },
        })
      : Promise.resolve(0),
  ]);
  return tasks + wh;
}
