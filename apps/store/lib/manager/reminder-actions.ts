import { phoneToTelUrl, phoneToViberUrl } from "@ltex/shared";

/**
 * Інтерактивні нагадування — чисте виведення «швидких дій» з контексту
 * нагадування (порт 1С Enum.ТипыДействийПриНапоминании + покращення).
 *
 * Замість статичного тексту менеджер прямо з нагадування виконує задачу:
 *  - злетіла бронь  → перейти у Прайс на конкретний лот і продовжити бронь;
 *  - протерміноване замовлення → відкрити/закрити замовлення;
 *  - треба звʼязатися з клієнтом → картка / дзвінок / Viber;
 *  - зʼявилось відео → сформувати повідомлення й надіслати клієнту у Viber.
 *
 * Дію «виконано, нічого не змінювати» дає окрема кнопка «Виконати» у списку.
 */

export type ReminderActionKind =
  | "client-card"
  | "call"
  | "client-viber"
  | "open-order"
  | "booking"
  | "video-share";

export interface ReminderAction {
  kind: ReminderActionKind;
  label: string;
  /** Для навігаційних/протокольних дій (router.push або tel:/viber:). */
  href?: string;
  /** true → відкривати у застосунку (router.push); false → протокол/нове вікно. */
  internal: boolean;
}

/** Мінімальний контекст нагадування, потрібний для виведення дій. */
export interface ReminderActionContext {
  actionType: string;
  lotId: string | null;
  orderId: string | null;
  client: { id: string; phone: string | null } | null;
  order: { id: string } | null;
}

/**
 * Повертає список контекстних дій. Порядок — від найспецифічнішої дії
 * (бронь/відео/замовлення) до загальних дій із клієнтом.
 */
export function buildReminderActions(
  r: ReminderActionContext,
): ReminderAction[] {
  const actions: ReminderAction[] = [];

  // 1. Продовження броні — перехід на конкретний лот у Прайсі.
  if (r.actionType === "continue_bron" && r.lotId) {
    actions.push({
      kind: "booking",
      label: "Перенести бронь",
      href: `/manager/prices/lots?lotId=${r.lotId}`,
      internal: true,
    });
  }

  // 2. Відео зʼявилось — сформувати повідомлення (обробляється окремо: fetch).
  if (r.actionType === "viber_video") {
    actions.push({
      kind: "video-share",
      label: "Надіслати відео клієнту",
      internal: true,
    });
  }

  // 3. Замовлення — відкрити (для протермінованих — «закрити»).
  const orderId = r.order?.id ?? r.orderId;
  if (orderId) {
    actions.push({
      kind: "open-order",
      label:
        r.actionType === "close_orders"
          ? "Закрити замовлення"
          : "Відкрити замовлення",
      href: `/manager/orders/${orderId}`,
      internal: true,
    });
  }

  // 4. Клієнт — картка + дзвінок + Viber.
  if (r.client) {
    actions.push({
      kind: "client-card",
      label: "Картка клієнта",
      href: `/manager/customers/${r.client.id}`,
      internal: true,
    });
    const tel = phoneToTelUrl(r.client.phone);
    if (tel) {
      actions.push({
        kind: "call",
        label: "Подзвонити",
        href: tel,
        internal: false,
      });
    }
    const viber = phoneToViberUrl(r.client.phone);
    if (viber) {
      actions.push({
        kind: "client-viber",
        label: "Написати у Viber",
        href: viber,
        internal: false,
      });
    }
  }

  return actions;
}
