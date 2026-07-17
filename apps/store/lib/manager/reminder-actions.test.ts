import { describe, it, expect } from "vitest";
import {
  buildReminderActions,
  type ReminderActionContext,
} from "./reminder-actions";

const base: ReminderActionContext = {
  actionType: "none",
  lotId: null,
  orderId: null,
  client: null,
  order: null,
};

describe("buildReminderActions", () => {
  it("порожній контекст → жодних дій", () => {
    expect(buildReminderActions(base)).toEqual([]);
  });

  it("continue_bron + lotId → «Перенести бронь» на конкретний лот", () => {
    const a = buildReminderActions({
      ...base,
      actionType: "continue_bron",
      lotId: "lot-9",
    });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      kind: "booking",
      href: "/manager/prices/lots?lotId=lot-9",
      internal: true,
    });
  });

  it("continue_bron без lotId → без дії броні", () => {
    expect(
      buildReminderActions({ ...base, actionType: "continue_bron" }),
    ).toEqual([]);
  });

  it("viber_video → дія «Надіслати відео клієнту» (video-share)", () => {
    const a = buildReminderActions({ ...base, actionType: "viber_video" });
    expect(a).toHaveLength(1);
    expect(a[0]?.kind).toBe("video-share");
  });

  it("orderId → «Відкрити замовлення»", () => {
    const a = buildReminderActions({ ...base, orderId: "ord-1" });
    expect(a[0]).toMatchObject({
      kind: "open-order",
      label: "Відкрити замовлення",
      href: "/manager/orders/ord-1",
      internal: true,
    });
  });

  it("actionType close_orders → «Закрити замовлення»", () => {
    const a = buildReminderActions({
      ...base,
      actionType: "close_orders",
      order: { id: "ord-2" },
    });
    expect(a[0]).toMatchObject({
      kind: "open-order",
      label: "Закрити замовлення",
      href: "/manager/orders/ord-2",
    });
  });

  it("клієнт з телефоном → картка + дзвінок + Viber", () => {
    const a = buildReminderActions({
      ...base,
      client: { id: "c1", phone: "+380501234567" },
    });
    const kinds = a.map((x) => x.kind);
    expect(kinds).toEqual(["client-card", "call", "client-viber"]);
    expect(a.find((x) => x.kind === "client-card")?.href).toBe(
      "/manager/customers/c1",
    );
    expect(a.find((x) => x.kind === "call")?.href).toBe("tel:+380501234567");
    expect(a.find((x) => x.kind === "client-viber")?.href).toContain(
      "viber://",
    );
  });

  it("клієнт без телефону → лише картка", () => {
    const a = buildReminderActions({
      ...base,
      client: { id: "c1", phone: null },
    });
    expect(a.map((x) => x.kind)).toEqual(["client-card"]);
  });

  it("комбінує: протерміноване замовлення клієнта → закрити + картка + контакти", () => {
    const a = buildReminderActions({
      ...base,
      actionType: "close_orders",
      orderId: "ord-7",
      client: { id: "c9", phone: "+380671112233" },
    });
    expect(a.map((x) => x.kind)).toEqual([
      "open-order",
      "client-card",
      "call",
      "client-viber",
    ]);
  });
});
