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
export async function loadDictRows(type: SimpleDictType): Promise<DictRow[]> {
  switch (type) {
    case "client-statuses": {
      const rows = await prisma.mgrClientStatus.findMany({
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label, color: r.colorHex }));
    }
    case "search-channels": {
      const rows = await prisma.mgrSearchChannel.findMany({
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
    case "categories-tt": {
      const rows = await prisma.mgrCategoryTT.findMany({
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
    case "delivery-methods": {
      const rows = await prisma.mgrDeliveryMethod.findMany({
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });
      return rows.map((r) => ({ id: r.id, label: r.label }));
    }
    case "routes": {
      const rows = await prisma.mgrRoute.findMany({ orderBy: { name: "asc" } });
      return rows.map((r) => ({
        id: r.id,
        label: r.name,
        active: r.isActive,
      }));
    }
    case "producers": {
      const rows = await prisma.mgrProducer.findMany({
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
  }
  revalidate(type);
}

// ─── Видалення ──────────────────────────────────────────────────────────────
export async function deleteDictEntry(
  typeRaw: string,
  id: string,
): Promise<void> {
  await requireDictAdmin();
  if (!isSimpleDictType(typeRaw)) throw new Error("Невідомий довідник");
  const type = typeRaw;
  try {
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
    }
  } catch {
    throw new Error(
      "Не вдалося видалити (можливо, значення вже використовується)",
    );
  }
  revalidate(type);
}
