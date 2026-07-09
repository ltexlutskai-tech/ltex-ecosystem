import { prisma } from "@ltex/db";
import type { NextRequest } from "next/server";
import type { CurrentManager } from "@/lib/auth/manager-auth";
import { logAuditEvent } from "@/lib/audit/audit-log";
import { recordClientEventSafe } from "@/lib/manager/client-timeline";
import { recomputeDebtForClients } from "@/lib/manager/debt-register";
import {
  findReferences,
  type DeletableEntityType,
  type ReferenceCheckResult,
} from "@/lib/manager/reference-check";

/**
 * ТЗ 8.0 B4 — центральний модуль «позначки на вилучення» (1С-стиль).
 *
 * Потік: менеджер → markForDeletion (позначка + запис у чергу з причиною) →
 * адмін у /manager/admin/deletions → approveDeletion (фіз. видалення ЛИШЕ якщо
 * немає посилань і не історичний 1С-запис, інакше авто-архів) або
 * rejectDeletion (зняти позначку).
 */

const DICT_MODELS = {
  "client-statuses": "mgrClientStatus",
  "search-channels": "mgrSearchChannel",
  "categories-tt": "mgrCategoryTT",
  "delivery-methods": "mgrDeliveryMethod",
  routes: "mgrRoute",
  producers: "mgrProducer",
} as const;

type DictType = keyof typeof DICT_MODELS;

interface EntityFlags {
  markedForDeletion?: boolean;
  archived?: boolean;
}

/** Оновлює прапорці (позначка/архів) обʼєкта будь-якого типу. */
async function updateEntityFlags(
  entityType: DeletableEntityType,
  entityId: string,
  dictType: string | null,
  data: EntityFlags,
): Promise<void> {
  switch (entityType) {
    case "client":
      await prisma.mgrClient.update({ where: { id: entityId }, data });
      return;
    case "order":
      await prisma.order.update({ where: { id: entityId }, data });
      return;
    case "sale":
      await prisma.sale.update({ where: { id: entityId }, data });
      return;
    case "cash_order":
      await prisma.mgrCashOrder.update({ where: { id: entityId }, data });
      return;
    case "route_sheet":
      await prisma.routeSheet.update({ where: { id: entityId }, data });
      return;
    case "dictionary": {
      const model = dictType ? DICT_MODELS[dictType as DictType] : undefined;
      if (!model) throw new Error(`Невідомий тип довідника: ${dictType}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any)[model].update({ where: { id: entityId }, data });
      return;
    }
    case "category":
      await prisma.category.update({ where: { id: entityId }, data });
      return;
    case "product":
      await prisma.product.update({ where: { id: entityId }, data });
      return;
    default:
      throw new Error(`Непідтримуваний тип: ${entityType}`);
  }
}

/** Людський підпис обʼєкта для черги (знімок, переживає видалення). */
async function loadEntityLabel(
  entityType: DeletableEntityType,
  entityId: string,
  dictType: string | null,
): Promise<string | null> {
  switch (entityType) {
    case "client": {
      const c = await prisma.mgrClient.findUnique({
        where: { id: entityId },
        select: { name: true },
      });
      return c?.name ?? null;
    }
    case "order": {
      const o = await prisma.order.findUnique({
        where: { id: entityId },
        select: { number1C: true },
      });
      return o ? `Замовлення ${o.number1C ?? entityId}` : null;
    }
    case "sale": {
      const s = await prisma.sale.findUnique({
        where: { id: entityId },
        select: { number1C: true, docNumber: true },
      });
      return s ? `Реалізація ${s.number1C ?? s.docNumber ?? entityId}` : null;
    }
    case "cash_order": {
      const p = await prisma.mgrCashOrder.findUnique({
        where: { id: entityId },
        select: { number1C: true, docNumber: true },
      });
      return p ? `Оплата ${p.number1C ?? p.docNumber ?? entityId}` : null;
    }
    case "route_sheet": {
      const r = await prisma.routeSheet.findUnique({
        where: { id: entityId },
        select: { number1C: true, docNumber: true },
      });
      return r
        ? `Маршрутний лист ${r.number1C ?? r.docNumber ?? entityId}`
        : null;
    }
    case "dictionary": {
      const model = dictType ? DICT_MODELS[dictType as DictType] : undefined;
      if (!model) return null;
      // mgrRoute має поле `name`, решта довідників — `label`.
      const labelField = dictType === "routes" ? "name" : "label";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (prisma as any)[model].findUnique({
        where: { id: entityId },
        select: { [labelField]: true },
      });
      return row?.[labelField] ?? null;
    }
    case "category": {
      const c = await prisma.category.findUnique({
        where: { id: entityId },
        select: { name: true },
      });
      return c?.name ?? null;
    }
    case "product": {
      const p = await prisma.product.findUnique({
        where: { id: entityId },
        select: { name: true },
      });
      return p?.name ?? null;
    }
    default:
      return null;
  }
}

export interface MarkForDeletionInput {
  entityType: DeletableEntityType;
  entityId: string;
  reason: string;
  dictType?: string | null;
  user: CurrentManager;
  req?: NextRequest | null;
}

export interface MarkForDeletionResult {
  ok: boolean;
  requestId?: string;
  error?: string;
}

/**
 * Позначити обʼєкт на вилучення. Ідемпотентно: якщо вже є pending-запит на цей
 * обʼєкт — новий не створюється.
 */
export async function markForDeletion(
  input: MarkForDeletionInput,
): Promise<MarkForDeletionResult> {
  const { entityType, entityId, user } = input;
  const reason = input.reason.trim();
  const dictType = input.dictType ?? null;

  if (reason.length < 3) {
    return { ok: false, error: "Вкажіть причину (мінімум 3 символи)" };
  }

  const label = await loadEntityLabel(entityType, entityId, dictType);
  if (label === null) {
    return { ok: false, error: "Обʼєкт не знайдено" };
  }

  // Антидубль: активний pending-запит на цей самий обʼєкт.
  const existing = await prisma.deletionRequest.findFirst({
    where: { entityType, entityId, status: "pending" },
    select: { id: true },
  });
  if (existing) {
    // Все одно гарантуємо, що прапорець стоїть.
    await updateEntityFlags(entityType, entityId, dictType, {
      markedForDeletion: true,
    });
    return { ok: true, requestId: existing.id };
  }

  await updateEntityFlags(entityType, entityId, dictType, {
    markedForDeletion: true,
  });

  const request = await prisma.deletionRequest.create({
    data: {
      entityType,
      entityId,
      entityLabel: label,
      dictType,
      reason,
      status: "pending",
      requestedByUserId: user.id,
      requestedByName: user.fullName,
    },
  });

  void logAuditEvent({
    user: { id: user.id, email: user.email, role: user.role },
    action: "update",
    resource: entityType,
    resourceId: entityId,
    summary: `Позначено на вилучення: ${label}. Причина: ${reason}`,
    req: input.req ?? null,
  });

  if (entityType === "client") {
    recordClientEventSafe({
      clientId: entityId,
      kind: "comment",
      body: `Позначено на вилучення. Причина: ${reason}`,
      authorUserId: user.id,
    });
  }

  return { ok: true, requestId: request.id };
}

export interface ResolveResult {
  ok: boolean;
  outcome?: "deleted" | "archived";
  blockers?: ReferenceCheckResult["blockers"];
  error?: string;
}

/**
 * Адмін підтверджує видалення. Перевіряє посилання: якщо можна — фізично
 * видаляє (з реверсом боргу для документів), інакше архівує.
 */
export async function approveDeletion(
  requestId: string,
  admin: CurrentManager,
  req?: NextRequest | null,
): Promise<ResolveResult> {
  const request = await prisma.deletionRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { ok: false, error: "Запит не знайдено" };
  if (request.status !== "pending") {
    return { ok: false, error: "Запит уже оброблено" };
  }

  const entityType = request.entityType as DeletableEntityType;
  const refs = await findReferences(
    entityType,
    request.entityId,
    request.dictType,
  );

  if (!refs.found) {
    // Обʼєкт уже зник — закриваємо запит як виконаний.
    await prisma.deletionRequest.update({
      where: { id: requestId },
      data: {
        status: "approved",
        outcome: "deleted",
        resolvedByUserId: admin.id,
        resolvedAt: new Date(),
        resolutionNote: "Обʼєкт уже був відсутній",
      },
    });
    return { ok: true, outcome: "deleted" };
  }

  const outcome: "deleted" | "archived" = refs.canHardDelete
    ? "deleted"
    : "archived";

  if (outcome === "archived") {
    await updateEntityFlags(entityType, request.entityId, request.dictType, {
      archived: true,
      markedForDeletion: false,
    });
  } else {
    await hardDeleteEntity(entityType, request.entityId, request.dictType);
  }

  await prisma.deletionRequest.update({
    where: { id: requestId },
    data: {
      status: "approved",
      outcome,
      resolvedByUserId: admin.id,
      resolvedAt: new Date(),
      resolutionNote:
        outcome === "archived"
          ? `Перенесено в архів (є посилання/1С-історія): ${refs.blockers
              .map((b) => `${b.label} (${b.count})`)
              .join(", ")}`
          : "Видалено остаточно",
    },
  });

  void logAuditEvent({
    user: { id: admin.id, email: admin.email, role: admin.role },
    action: outcome === "deleted" ? "delete" : "update",
    resource: entityType,
    resourceId: request.entityId,
    summary:
      outcome === "deleted"
        ? `Остаточно видалено: ${request.entityLabel}`
        : `Перенесено в архів: ${request.entityLabel}`,
    req: req ?? null,
  });

  return { ok: true, outcome, blockers: refs.blockers };
}

/** Адмін відхиляє запит: знімає позначку, обʼєкт повертається користувачу. */
export async function rejectDeletion(
  requestId: string,
  admin: CurrentManager,
  note: string | null,
  req?: NextRequest | null,
): Promise<ResolveResult> {
  const request = await prisma.deletionRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { ok: false, error: "Запит не знайдено" };
  if (request.status !== "pending") {
    return { ok: false, error: "Запит уже оброблено" };
  }

  const entityType = request.entityType as DeletableEntityType;
  await updateEntityFlags(entityType, request.entityId, request.dictType, {
    markedForDeletion: false,
  });

  await prisma.deletionRequest.update({
    where: { id: requestId },
    data: {
      status: "rejected",
      resolvedByUserId: admin.id,
      resolvedAt: new Date(),
      resolutionNote: note?.trim() || null,
    },
  });

  void logAuditEvent({
    user: { id: admin.id, email: admin.email, role: admin.role },
    action: "update",
    resource: entityType,
    resourceId: request.entityId,
    summary: `Відхилено позначку на вилучення: ${request.entityLabel}`,
    req: req ?? null,
  });

  if (entityType === "client") {
    recordClientEventSafe({
      clientId: request.entityId,
      kind: "comment",
      body: `Адміністратор відхилив позначку на вилучення${
        note?.trim() ? `. ${note.trim()}` : ""
      }`,
      authorUserId: admin.id,
    });
  }

  return { ok: true };
}

/** Відновити обʼєкт з архіву (archived → false). */
export async function restoreFromArchive(
  entityType: DeletableEntityType,
  entityId: string,
  dictType: string | null,
  admin: CurrentManager,
  req?: NextRequest | null,
): Promise<ResolveResult> {
  await updateEntityFlags(entityType, entityId, dictType, { archived: false });
  void logAuditEvent({
    user: { id: admin.id, email: admin.email, role: admin.role },
    action: "update",
    resource: entityType,
    resourceId: entityId,
    summary: "Відновлено з архіву",
    req: req ?? null,
  });
  return { ok: true };
}

/**
 * Фізичне видалення обʼєкта (викликається лише коли findReferences дозволив).
 * Для документів дзеркалить наявні DELETE-транзакції з реверсом боргу.
 */
async function hardDeleteEntity(
  entityType: DeletableEntityType,
  entityId: string,
  dictType: string | null,
): Promise<void> {
  switch (entityType) {
    case "client":
      await prisma.mgrClient.delete({ where: { id: entityId } });
      return;

    case "order":
      // Замовлення не пишуть рухів боргу; каскади знімуть items/shipments/payments.
      await prisma.order.delete({ where: { id: entityId } });
      return;

    case "sale": {
      const moves = await prisma.mgrDebtMovement.findMany({
        where: { sourceType: "sale", sourceId: entityId },
        select: { clientId: true },
      });
      const clientIds = [...new Set(moves.map((m) => m.clientId))];
      await prisma.$transaction(async (tx) => {
        await tx.mgrDebtMovement.deleteMany({
          where: { sourceType: "sale", sourceId: entityId },
        });
        await tx.sale.delete({ where: { id: entityId } });
      });
      if (clientIds.length > 0)
        await recomputeDebtForClients(prisma, clientIds);
      return;
    }

    case "cash_order": {
      const moves = await prisma.mgrDebtMovement.findMany({
        where: { sourceType: "cash_order", sourceId: entityId },
        select: { clientId: true },
      });
      const clientIds = [...new Set(moves.map((m) => m.clientId))];
      await prisma.$transaction(async (tx) => {
        await tx.mgrDebtMovement.deleteMany({
          where: { sourceType: "cash_order", sourceId: entityId },
        });
        // Парна здача (self-relation Restrict) — видалити явно.
        await tx.mgrCashOrder.deleteMany({ where: { changeForId: entityId } });
        await tx.mgrCashOrder.delete({ where: { id: entityId } });
      });
      if (clientIds.length > 0)
        await recomputeDebtForClients(prisma, clientIds);
      return;
    }

    case "route_sheet":
      await prisma.$transaction(async (tx) => {
        await tx.sale.updateMany({
          where: { routeSheetId: entityId },
          data: { routeSheetId: null },
        });
        await tx.mgrCashOrder.updateMany({
          where: { routeSheetId: entityId },
          data: { routeSheetId: null },
        });
        await tx.order.updateMany({
          where: { routeSheetId: entityId },
          data: { routeSheetId: null },
        });
        await tx.routeSheet.delete({ where: { id: entityId } });
      });
      return;

    case "dictionary": {
      const model = dictType ? DICT_MODELS[dictType as DictType] : undefined;
      if (!model) throw new Error(`Невідомий тип довідника: ${dictType}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any)[model].delete({ where: { id: entityId } });
      return;
    }

    case "category":
      await prisma.category.delete({ where: { id: entityId } });
      return;

    case "product":
      await prisma.product.delete({ where: { id: entityId } });
      return;

    default:
      throw new Error(`Непідтримуваний тип: ${entityType}`);
  }
}

export interface DeletionRequestListItem {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  dictType: string | null;
  reason: string;
  status: string;
  outcome: string | null;
  requestedByName: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export async function listDeletionRequests(
  status: "pending" | "resolved" | "all" = "pending",
  page = 1,
  pageSize = 50,
): Promise<{ items: DeletionRequestListItem[]; total: number }> {
  const where =
    status === "pending"
      ? { status: "pending" }
      : status === "resolved"
        ? { status: { in: ["approved", "rejected"] } }
        : {};

  const [total, rows] = await Promise.all([
    prisma.deletionRequest.count({ where }),
    prisma.deletionRequest.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      entityLabel: r.entityLabel,
      dictType: r.dictType,
      reason: r.reason,
      status: r.status,
      outcome: r.outcome,
      requestedByName: r.requestedByName,
      requestedAt: r.requestedAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolutionNote: r.resolutionNote,
    })),
  };
}
