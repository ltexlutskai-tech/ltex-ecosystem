import type { ManagerRole } from "@/lib/auth/jwt";
import { canManageCatalog } from "@/lib/manager/catalog-permissions";

/**
 * Реєстр полів для «Групової обробки» (bulk-edit) — аналог 1С-обробки
 * «Групповая обработка справочников и документов».
 *
 * ЄДИНЕ ДЖЕРЕЛО ПРАВДИ дозволених для масової зміни полів. Клієнт НІКОЛИ не
 * надсилає реальне Prisma-поле (`column`) — лише `entity` + `fieldKey` + `value`.
 * Реєстр сам резолвить `fieldKey → column`. Це закриває ін'єкцію довільних полів:
 * записати можна ЛИШЕ те, що явно занесено сюди.
 *
 * MVP: сутність `product` (номенклатура). Права — per-field (не per-entity).
 */

export type BulkEntity = "product";

export type BulkFieldType = "text" | "enum" | "boolean" | "category";

/** Значення, яке дозволено записувати масово (після валідації). */
export type BulkValue = string | boolean | null;

export interface BulkFieldOption {
  value: string;
  label: string;
}

export interface BulkFieldDef {
  /** Ключ поля у payload/UI (whitelist). */
  key: string;
  /** Укр. підпис у діалозі. */
  label: string;
  /** Реальне Prisma-поле моделі — резолвиться лише на сервері. */
  column: string;
  type: BulkFieldType;
  /**
   * Для `enum` — строгий перелік дозволених значень (валідація по ньому).
   * Для `text` — необовʼязкові підказки (datalist), значення не обмежують.
   * Для `category` опції підтягуються з БД у `serializeFields` (динамічні).
   */
  options?: BulkFieldOption[];
  /** Чи можна встановити `null` (скинути значення). */
  nullable: boolean;
  /** Макс. довжина для `text`. */
  maxLength?: number;
  /** Хто може масово міняти саме це поле. */
  roles: (role: ManagerRole) => boolean;
}

export interface BulkEntityDef {
  entity: BulkEntity;
  label: string;
  fields: BulkFieldDef[];
}

/** Пакування товару (коробка/мішок) — впливає на авто-обробку НП. */
const PACKAGING_OPTIONS: BulkFieldOption[] = [
  { value: "box", label: "Коробка" },
  { value: "bag", label: "Мішок" },
];

/** Підказки для назви чека (3 узагальнені назви L-TEX + власний текст). */
const RECEIPT_NAME_SUGGESTIONS: BulkFieldOption[] = [
  { value: "Одяг вживаний", label: "Одяг вживаний" },
  { value: "Взуття вживане", label: "Взуття вживане" },
  { value: "Товари для дому вживані", label: "Товари для дому вживані" },
];

const PRODUCT_ENTITY: BulkEntityDef = {
  entity: "product",
  label: "Товари",
  fields: [
    {
      key: "packaging",
      label: "Пакування",
      column: "packaging",
      type: "enum",
      options: PACKAGING_OPTIONS,
      nullable: true,
      roles: canManageCatalog,
    },
    {
      key: "receiptName",
      label: "Назва для чека",
      column: "receiptName",
      type: "text",
      options: RECEIPT_NAME_SUGGESTIONS,
      nullable: true,
      maxLength: 200,
      roles: canManageCatalog,
    },
    {
      key: "categoryId",
      label: "Категорія",
      column: "categoryId",
      type: "category",
      nullable: false,
      roles: canManageCatalog,
    },
    {
      key: "producer",
      label: "Виробник",
      column: "producer",
      type: "text",
      nullable: true,
      maxLength: 100,
      roles: canManageCatalog,
    },
    {
      key: "inStock",
      label: "В наявності",
      column: "inStock",
      type: "boolean",
      nullable: false,
      roles: canManageCatalog,
    },
    {
      key: "archived",
      label: "Архів",
      column: "archived",
      type: "boolean",
      nullable: false,
      roles: canManageCatalog,
    },
  ],
};

const REGISTRY: Record<BulkEntity, BulkEntityDef> = {
  product: PRODUCT_ENTITY,
};

/** Повертає опис сутності або null, якщо невідома. */
export function getBulkEntity(entity: string): BulkEntityDef | null {
  return (REGISTRY as Record<string, BulkEntityDef>)[entity] ?? null;
}

/** Резолвить поле сутності за ключем. Невідома сутність/поле → null. */
export function getBulkField(entity: string, key: string): BulkFieldDef | null {
  const def = getBulkEntity(entity);
  if (!def) return null;
  return def.fields.find((f) => f.key === key) ?? null;
}

/** Помилка валідації значення масового поля (укр. повідомлення). */
export class BulkFieldError extends Error {}

/**
 * Валідує/нормалізує значення під тип поля. Кидає `BulkFieldError` з укр.
 * повідомленням при невідповідності. `null` дозволено лише для nullable-полів.
 * Повертає нормалізоване значення для запису.
 */
export function assertValueForField(
  field: BulkFieldDef,
  value: unknown,
): BulkValue {
  if (value === null || value === undefined) {
    if (!field.nullable) {
      throw new BulkFieldError(
        `Поле «${field.label}» не можна очистити (порожнє значення недопустиме)`,
      );
    }
    return null;
  }

  switch (field.type) {
    case "boolean": {
      if (typeof value !== "boolean") {
        throw new BulkFieldError(
          `Поле «${field.label}» очікує так/ні (boolean)`,
        );
      }
      return value;
    }
    case "category": {
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new BulkFieldError(`Оберіть категорію для поля «${field.label}»`);
      }
      return value.trim();
    }
    case "enum": {
      if (typeof value !== "string") {
        throw new BulkFieldError(`Поле «${field.label}» очікує рядок`);
      }
      const allowed = (field.options ?? []).map((o) => o.value);
      if (!allowed.includes(value)) {
        throw new BulkFieldError(
          `Недопустиме значення для поля «${field.label}»`,
        );
      }
      return value;
    }
    case "text": {
      if (typeof value !== "string") {
        throw new BulkFieldError(`Поле «${field.label}» очікує текст`);
      }
      const max = field.maxLength ?? 500;
      if (value.length > max) {
        throw new BulkFieldError(
          `Поле «${field.label}» задовге (макс. ${max} символів)`,
        );
      }
      return value;
    }
    default: {
      // Вичерпність: якщо додали новий тип і забули обробити.
      throw new BulkFieldError("Невідомий тип поля");
    }
  }
}

/** Серіалізоване поле для клієнта — БЕЗ `column` (клієнт його не бачить). */
export interface SerializedBulkField {
  key: string;
  label: string;
  type: BulkFieldType;
  options?: BulkFieldOption[];
  nullable: boolean;
  maxLength?: number;
}

/**
 * Повертає лише ті поля сутності, які роль поточного користувача МОЖЕ масово
 * редагувати, у серіалізованому вигляді (без реального `column`). Для полів типу
 * `category` опції підтягуються з переданого `dynamicOptions` (з БД).
 */
export function serializeFields(
  entity: string,
  role: ManagerRole,
  dynamicOptions?: Partial<Record<string, BulkFieldOption[]>>,
): SerializedBulkField[] {
  const def = getBulkEntity(entity);
  if (!def) return [];
  return def.fields
    .filter((f) => f.roles(role))
    .map((f) => {
      const options =
        f.type === "category" ? (dynamicOptions?.[f.key] ?? []) : f.options;
      const out: SerializedBulkField = {
        key: f.key,
        label: f.label,
        type: f.type,
        nullable: f.nullable,
      };
      if (options) out.options = options;
      if (f.maxLength !== undefined) out.maxLength = f.maxLength;
      return out;
    });
}
