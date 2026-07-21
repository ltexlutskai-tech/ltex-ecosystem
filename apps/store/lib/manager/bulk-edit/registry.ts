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
 * Сутності: `product` (номенклатура), `client` (контрагенти), `order`
 * (замовлення), `sale` (реалізації). Права — per-field (не per-entity).
 */

export type BulkEntity = "product" | "client" | "order" | "sale";

export type BulkFieldType = "text" | "enum" | "boolean" | "category" | "select";

/**
 * Модель-довідник для перевірки існування обраного id (FK-цілісність) на сервері.
 * `category` тримаємо окремим типом поля (легасі), решта FK — через `select`.
 */
export type BulkRefModel =
  | "category"
  | "mgrClientStatus"
  | "user"
  | "mgrCategoryTT"
  | "mgrDeliveryMethod"
  | "mgrSearchChannel"
  | "mgrRoute";

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
   * Для `category`/`select` опції підтягуються з БД у `serializeFields`.
   */
  options?: BulkFieldOption[];
  /**
   * FK-модель для перевірки існування значення на сервері (для `category` та
   * `select`). Для `category` можна не вказувати — трактується як `"category"`.
   */
  refModel?: BulkRefModel;
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

/** Гейт для клієнтів/документів: масову зміну робить лише admin/owner. */
const adminOrOwner = (role: ManagerRole): boolean =>
  role === "admin" || role === "owner";

const CLIENT_ENTITY: BulkEntityDef = {
  entity: "client",
  label: "Клієнти",
  fields: [
    {
      key: "statusGeneralId",
      label: "Статус (загальний)",
      column: "statusGeneralId",
      type: "select",
      refModel: "mgrClientStatus",
      nullable: true,
      roles: adminOrOwner,
    },
    {
      key: "statusOperationalId",
      label: "Статус (оперативний)",
      column: "statusOperationalId",
      type: "select",
      refModel: "mgrClientStatus",
      nullable: true,
      roles: adminOrOwner,
    },
    {
      key: "agentUserId",
      label: "Менеджер",
      column: "agentUserId",
      type: "select",
      refModel: "user",
      nullable: true,
      roles: adminOrOwner,
    },
    {
      key: "categoryTTId",
      label: "Категорія ТТ",
      column: "categoryTTId",
      type: "select",
      refModel: "mgrCategoryTT",
      nullable: true,
      roles: adminOrOwner,
    },
    {
      key: "deliveryMethodId",
      label: "Спосіб доставки",
      column: "deliveryMethodId",
      type: "select",
      refModel: "mgrDeliveryMethod",
      nullable: true,
      roles: adminOrOwner,
    },
    {
      key: "searchChannelId",
      label: "Канал пошуку",
      column: "searchChannelId",
      type: "select",
      refModel: "mgrSearchChannel",
      nullable: true,
      roles: adminOrOwner,
    },
    {
      key: "primaryRouteId",
      label: "Маршрут",
      column: "primaryRouteId",
      type: "select",
      refModel: "mgrRoute",
      nullable: true,
      roles: adminOrOwner,
    },
  ],
};

/** Спільні поля документів (Замовлення/Реалізація) — булеві прапорці. */
const DOC_BOOLEAN_FIELDS: BulkFieldDef[] = [
  {
    key: "isActual",
    label: "Актуальне",
    column: "isActual",
    type: "boolean",
    nullable: false,
    roles: adminOrOwner,
  },
  {
    key: "archived",
    label: "Архів",
    column: "archived",
    type: "boolean",
    nullable: false,
    roles: adminOrOwner,
  },
];

const ORDER_ENTITY: BulkEntityDef = {
  entity: "order",
  label: "Замовлення",
  fields: DOC_BOOLEAN_FIELDS,
};

const SALE_ENTITY: BulkEntityDef = {
  entity: "sale",
  label: "Реалізація",
  fields: DOC_BOOLEAN_FIELDS,
};

const REGISTRY: Record<BulkEntity, BulkEntityDef> = {
  product: PRODUCT_ENTITY,
  client: CLIENT_ENTITY,
  order: ORDER_ENTITY,
  sale: SALE_ENTITY,
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
    case "category":
    case "select": {
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new BulkFieldError(`Оберіть значення для поля «${field.label}»`);
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
 * `category`/`select` опції підтягуються з переданого `dynamicOptions` (з БД).
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
        f.type === "category" || f.type === "select"
          ? (dynamicOptions?.[f.key] ?? [])
          : f.options;
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
