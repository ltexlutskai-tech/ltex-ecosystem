import { Prisma, prisma } from "@ltex/db";
import { maskPhone } from "@ltex/shared";
import type { CurrentManager } from "@/lib/auth/manager-auth";

/**
 * Власник клієнта з точки зору поточного користувача:
 * - `admin` — користувач у ролі `admin` (бачить усе, повне редагування)
 * - `mine` — клієнт призначений на цього менеджера (agentUserId === user.id
 *   АБО присутній у ClientAssignment)
 * - `foreign` — інший менеджер; доступ через прямий URL дозволено, але з
 *   маскованими контактами та обмеженим набором tabs
 */
export type ViewerOwnership = "mine" | "foreign" | "admin";

/**
 * Чи повинен поточний користувач бачити клієнта як «свого»?
 * Підвантажує лише поля потрібні для перевірки.
 *
 * Якщо clientId не знайдено — повертає "foreign" (детальне 404
 * вирішується викликаючим кодом окремо).
 */
export async function getViewerOwnership(
  user: Pick<CurrentManager, "id" | "role">,
  clientId: string,
): Promise<ViewerOwnership> {
  if (user.role === "admin") return "admin";

  const client = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: {
      agentUserId: true,
      assignments: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!client) return "foreign";
  if (client.agentUserId === user.id) return "mine";
  if (client.assignments.length > 0) return "mine";
  return "foreign";
}

/**
 * Batch-варіант: повертає Set id-ів усіх клієнтів, призначених на user.
 *
 * - `admin` → `null` (немає обмеження — бачить усіх)
 * - `manager` → `Set<string>` (можливо порожній)
 *
 * Використовується у list endpoints / pickers. Один Prisma-запит per
 * request — Set-lookup O(1) для подальшого mapping.
 */
export async function getOwnedClientIds(
  user: Pick<CurrentManager, "id" | "role">,
): Promise<Set<string> | null> {
  if (user.role === "admin") return null;

  const clients = await prisma.mgrClient.findMany({
    where: {
      OR: [
        { agentUserId: user.id },
        { assignments: { some: { userId: user.id } } },
      ],
    },
    select: { id: true },
  });
  return new Set(clients.map((c) => c.id));
}

/**
 * Prisma `WHERE` clause який enforce-ить «лише свої» для менеджера.
 *
 * - `admin` → `{}` (без обмежень)
 * - `manager` → `OR` між `agentUserId` та `assignments.some.userId`
 *
 * Призначено до додавання в `AND` array поточного фільтру списку
 * клієнтів, щоб менеджер ніколи не побачив чужого у списку
 * (URL `?mineOnly=false` ігнорується серверно).
 */
export function ownershipWhere(
  user: Pick<CurrentManager, "id" | "role">,
): Prisma.MgrClientWhereInput {
  if (user.role === "admin") return {};
  return {
    OR: [
      { agentUserId: user.id },
      { assignments: { some: { userId: user.id } } },
    ],
  };
}

interface MaskablePhone {
  id: string;
  phone: string;
  label: string | null;
  messenger: string | null;
}

interface MaskableClient {
  phonePrimary: string | null;
  phones?: MaskablePhone[];
  viberContact: string | null;
  websiteUrl: string | null;
  geolocation: string | null;
  // 5.4.1: контактні/внутрішні нотатки — маскуються для foreign-view.
  email?: string | null;
  comment?: string | null;
  additionalDescription?: string | null;
  messengers?: unknown[];
  bankAccounts?: unknown[];
  reminders?: unknown[];
  presentations?: unknown[];
  timeline?: unknown[];
}

/**
 * Накладає masking на детальний об'єкт клієнта для foreign-view.
 *
 * Серверне маскування — клієнт **ніколи** не отримує сирий phone або
 * messenger handle. UI не покладається на client-side фільтрацію.
 *
 * - `phonePrimary` → `*** *** *** XXX` (або null коли не валідний)
 * - `phones[].phone` → ідем по списку, кожен номер маскується; невалідні
 *   зберігаються як empty string (UI прибере row)
 * - `viberContact`, `websiteUrl`, `geolocation` → `null`
 * - `email`, `comment`, `additionalDescription` → `null` (контактні/внутрішні
 *   нотатки; бізнес-ідентифікатори ІНН/ЄДРПОУ/повна назва лишаються видимими)
 * - `messengers`, `bankAccounts`, `reminders`, `presentations`, `timeline`
 *   → `[]` (порожні масиви)
 */
export function maskClientForForeign<T extends MaskableClient>(client: T): T {
  return {
    ...client,
    phonePrimary: client.phonePrimary ? maskPhone(client.phonePrimary) : null,
    phones:
      client.phones?.map((p) => ({
        ...p,
        phone: maskPhone(p.phone) ?? "",
        messenger: null,
      })) ?? [],
    viberContact: null,
    websiteUrl: null,
    geolocation: null,
    email: null,
    comment: null,
    additionalDescription: null,
    messengers: [],
    bankAccounts: [],
    reminders: [],
    presentations: [],
    timeline: [],
  };
}
