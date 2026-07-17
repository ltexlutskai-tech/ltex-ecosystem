"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { generateSlug } from "@ltex/shared";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  type SimpleDictType,
  type DictRow,
  isSimpleDictType,
} from "./simple-dict-config";

const WRITE_ROLES = new Set(["owner", "admin"]);

async function requireDictAdmin(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !WRITE_ROLES.has(user.role)) {
    throw new Error(
      "Створювати/змінювати довідники може лише власник або адмін",
    );
  }
}

function revalidate(type: SimpleDictType): void {
  revalidatePath(`/manager/dictionaries/${type}`);
  revalidatePath("/manager/registry");
}

/** Унікальний код для нового запису (не показується користувачу). */
function makeCode(label: string): string {
  const base = generateSlug(label) || "item";
  // Date.now доступний у server action (runtime).
  return `${base}-${Date.now().toString(36)}`;
}

// ─── Читання (нормалізовані рядки) ───────────────────────────────────────────
// ТЗ 8.0 B7: у редакторі приховуємо позначені на вилучення / заархівовані
// записи (видалення тепер = мʼяка позначка archived, а не hard-delete —
// запис лишається у вже збережених документах/клієнтах, але зникає зі списку).
const ACTIVE_DICT: { markedForDeletion: false; archived: false } = {
  markedForDeletion: false,
  archived: false,
};

export async function loadDictRows(type: SimpleDictType): Promise<DictRow[]> {
  switch (type) {
    case "client-statuses": {
      const rows = await prisma.mgrClientStatus.findMany({
        where: ACTIVE_DICT,
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label, color: r.colorHex }));
    }
    case "search-channels": {
      const rows = await prisma.mgrSearchChannel.findMany({
        where: ACTIVE_DICT,
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
    case "categories-tt": {
      const rows = await prisma.mgrCategoryTT.findMany({
        where: ACTIVE_DICT,
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
    case "delivery-methods": {
      const rows = await prisma.mgrDeliveryMethod.findMany({
        where: ACTIVE_DICT,
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
    case "routes": {
      const rows = await prisma.mgrRoute.findMany({
        where: ACTIVE_DICT,
        orderBy: { name: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        label: r.name,
        active: r.isActive,
      }));
    }
    case "producers": {
      const rows = await prisma.mgrProducer.findMany({
        where: ACTIVE_DICT,
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
    case "quality": {
      const rows = await prisma.mgrQuality.findMany({
        where: ACTIVE_DICT,
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
    case "countries": {
      const rows = await prisma.mgrCountry.findMany({
        where: ACTIVE_DICT,
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
    case "genders": {
      const rows = await prisma.mgrGender.findMany({
        where: ACTIVE_DICT,
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
    case "seasons": {
      const rows = await prisma.mgrSeason.findMany({
        where: ACTIVE_DICT,
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
  }
}

// ─── Створення ───────────────────────────────────────────────────────────────
export async function createDictEntry(
  typeRaw: string,
  formData: FormData,
): Promise<void> {
  await requireDictAdmin();
  if (!isSimpleDictType(typeRaw)) throw new Error("Невідомий довідник");
  const type = typeRaw;
  const label = ((formData.get("label") as string) ?? "").trim();
  const color = ((formData.get("color") as string) || "").trim() || null;
  if (!label) throw new Error("Вкажіть назву");

  switch (type) {
    case "client-statuses":
      await prisma.mgrClientStatus.create({
        data: { code: makeCode(label), label, colorHex: color ?? "#9ca3af" },
      });
      break;
    case "search-channels":
      await prisma.mgrSearchChannel.create({
        data: { code: makeCode(label), label },
      });
      break;
    case "categories-tt":
      await prisma.mgrCategoryTT.create({
        data: { code: makeCode(label), label },
      });
      break;
    case "delivery-methods":
      await prisma.mgrDeliveryMethod.create({
        data: { code: makeCode(label), label },
      });
      break;
    case "routes":
      await prisma.mgrRoute.create({ data: { name: label } });
      break;
    case "producers":
      await prisma.mgrProducer.create({
        data: { code: makeCode(label), label },
      });
      break;
    case "quality":
      await prisma.mgrQuality.create({
        data: { code: makeCode(label), label },
      });
      break;
    case "countries":
      await prisma.mgrCountry.create({
        data: { code: makeCode(label), label },
      });
      break;
    case "genders":
      // Стать зберігається у Product.gender як текст = сам напис, тож code = label.
      await prisma.mgrGender.create({ data: { code: label, label } });
      break;
    case "seasons":
      await prisma.mgrSeason.create({
        data: { code: makeCode(label), label },
      });
      break;
  }
  revalidate(type);
}

// ─── Редагування ────────────────────────────────────────────────────────────
export async function updateDictEntry(
  typeRaw: string,
  id: string,
  formData: FormData,
): Promise<void> {
  await requireDictAdmin();
  if (!isSimpleDictType(typeRaw)) throw new Error("Невідомий довідник");
  const type = typeRaw;
  const label = ((formData.get("label") as string) ?? "").trim();
  const color = ((formData.get("color") as string) || "").trim() || null;
  const active = formData.get("active") === "true";
  if (!label) throw new Error("Вкажіть назву");

  switch (type) {
    case "client-statuses":
      await prisma.mgrClientStatus.update({
        where: { id },
        data: { label, ...(color ? { colorHex: color } : {}) },
      });
      break;
    case "search-channels":
      await prisma.mgrSearchChannel.update({ where: { id }, data: { label } });
      break;
    case "categories-tt":
      await prisma.mgrCategoryTT.update({ where: { id }, data: { label } });
      break;
    case "delivery-methods":
      await prisma.mgrDeliveryMethod.update({ where: { id }, data: { label } });
      break;
    case "routes":
      await prisma.mgrRoute.update({
        where: { id },
        data: { name: label, isActive: active },
      });
      break;
    case "producers":
      await prisma.mgrProducer.update({ where: { id }, data: { label } });
      break;
    case "quality":
      await prisma.mgrQuality.update({ where: { id }, data: { label } });
      break;
    case "countries":
      await prisma.mgrCountry.update({ where: { id }, data: { label } });
      break;
    case "genders":
      await prisma.mgrGender.update({ where: { id }, data: { label } });
      break;
    case "seasons":
      await prisma.mgrSeason.update({ where: { id }, data: { label } });
      break;
  }
  revalidate(type);
}

// ─── Видалення (ТЗ 8.0 B7 — мʼяке, із захистом «1С не видаляти») ─────────────
//
// Правила:
//  • запис із `code1C != null` (історичний, з 1С — стосується маршрутів) фізично
//    НЕ видаляється: лише архівується (`archived = true`), щоб не осиротити
//    звʼязки клієнтів/документів;
//  • запис, що ВЖЕ використовується (FK: клієнти/маршрутні листи) — теж лише
//    архівується;
//  • вільний не-1С запис — фізично видаляється.
//
// Заархівований запис зникає зі списків вибору й з редактора, але лишається у
// вже збережених документах/клієнтах (історія не ламається). Це прибирає стару
// незрозумілу помилку «можливо, значення вже використовується».
export type DeleteDictResult = { deleted: boolean; archived: boolean };

/** Чи використовується запис (кількість залежних рядків > 0). */
async function isDictEntryReferenced(
  type: SimpleDictType,
  id: string,
): Promise<{ referenced: boolean; hasCode1C: boolean }> {
  switch (type) {
    case "client-statuses": {
      const row = await prisma.mgrClientStatus.findUnique({
        where: { id },
        select: {
          _count: {
            select: { clientsGeneral: true, clientsOperational: true },
          },
        },
      });
      const c = row?._count;
      return {
        referenced: !!c && c.clientsGeneral + c.clientsOperational > 0,
        hasCode1C: false,
      };
    }
    case "search-channels": {
      const row = await prisma.mgrSearchChannel.findUnique({
        where: { id },
        select: { _count: { select: { clients: true } } },
      });
      return { referenced: (row?._count.clients ?? 0) > 0, hasCode1C: false };
    }
    case "categories-tt": {
      const row = await prisma.mgrCategoryTT.findUnique({
        where: { id },
        select: { _count: { select: { clients: true } } },
      });
      return { referenced: (row?._count.clients ?? 0) > 0, hasCode1C: false };
    }
    case "delivery-methods": {
      const row = await prisma.mgrDeliveryMethod.findUnique({
        where: { id },
        select: { _count: { select: { clients: true } } },
      });
      return { referenced: (row?._count.clients ?? 0) > 0, hasCode1C: false };
    }
    case "routes": {
      const row = await prisma.mgrRoute.findUnique({
        where: { id },
        select: {
          code1C: true,
          _count: {
            select: {
              primaryForClients: true,
              assignments: true,
              routeSheets: true,
            },
          },
        },
      });
      const c = row?._count;
      return {
        referenced:
          !!c && c.primaryForClients + c.assignments + c.routeSheets > 0,
        hasCode1C: !!row?.code1C,
      };
    }
    case "producers":
    case "quality":
    case "countries":
    case "genders":
    case "seasons":
      // Ці характеристики у товарі зберігаються як текст (не FK) — фізичного
      // звʼязку немає, тож вільний запис можна стерти.
      return { referenced: false, hasCode1C: false };
  }
}

/** Мʼяко архівує запис довідника (без hard-delete). */
async function archiveDictEntry(
  type: SimpleDictType,
  id: string,
): Promise<void> {
  switch (type) {
    case "client-statuses":
      await prisma.mgrClientStatus.update({
        where: { id },
        data: { archived: true },
      });
      break;
    case "search-channels":
      await prisma.mgrSearchChannel.update({
        where: { id },
        data: { archived: true },
      });
      break;
    case "categories-tt":
      await prisma.mgrCategoryTT.update({
        where: { id },
        data: { archived: true },
      });
      break;
    case "delivery-methods":
      await prisma.mgrDeliveryMethod.update({
        where: { id },
        data: { archived: true },
      });
      break;
    case "routes":
      await prisma.mgrRoute.update({
        where: { id },
        data: { archived: true, isActive: false },
      });
      break;
    case "producers":
      await prisma.mgrProducer.update({
        where: { id },
        data: { archived: true },
      });
      break;
    case "quality":
      await prisma.mgrQuality.update({
        where: { id },
        data: { archived: true },
      });
      break;
    case "countries":
      await prisma.mgrCountry.update({
        where: { id },
        data: { archived: true },
      });
      break;
    case "genders":
      await prisma.mgrGender.update({
        where: { id },
        data: { archived: true },
      });
      break;
    case "seasons":
      await prisma.mgrSeason.update({
        where: { id },
        data: { archived: true },
      });
      break;
  }
}

/** Фізично видаляє вільний не-1С запис. */
async function hardDeleteDictEntry(
  type: SimpleDictType,
  id: string,
): Promise<void> {
  switch (type) {
    case "client-statuses":
      await prisma.mgrClientStatus.delete({ where: { id } });
      break;
    case "search-channels":
      await prisma.mgrSearchChannel.delete({ where: { id } });
      break;
    case "categories-tt":
      await prisma.mgrCategoryTT.delete({ where: { id } });
      break;
    case "delivery-methods":
      await prisma.mgrDeliveryMethod.delete({ where: { id } });
      break;
    case "routes":
      await prisma.mgrRoute.delete({ where: { id } });
      break;
    case "producers":
      await prisma.mgrProducer.delete({ where: { id } });
      break;
    case "quality":
      await prisma.mgrQuality.delete({ where: { id } });
      break;
    case "countries":
      await prisma.mgrCountry.delete({ where: { id } });
      break;
    case "genders":
      await prisma.mgrGender.delete({ where: { id } });
      break;
    case "seasons":
      await prisma.mgrSeason.delete({ where: { id } });
      break;
  }
}

export async function deleteDictEntry(
  typeRaw: string,
  id: string,
): Promise<DeleteDictResult> {
  await requireDictAdmin();
  if (!isSimpleDictType(typeRaw)) throw new Error("Невідомий довідник");
  const type = typeRaw;

  const { referenced, hasCode1C } = await isDictEntryReferenced(type, id);

  let result: DeleteDictResult;
  if (hasCode1C || referenced) {
    // Історичний (1С) або використовуваний запис — лише архівуємо.
    await archiveDictEntry(type, id);
    result = { deleted: false, archived: true };
  } else {
    // Вільний не-1С запис — фізично стираємо; на будь-який FK-збій
    // (страхувальник) архівуємо замість помилки.
    try {
      await hardDeleteDictEntry(type, id);
      result = { deleted: true, archived: false };
    } catch {
      await archiveDictEntry(type, id);
      result = { deleted: false, archived: true };
    }
  }

  revalidate(type);
  return result;
}
