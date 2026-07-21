import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, getPlatformSenderMock, sendMock, matchClientByPhoneMock } =
  vi.hoisted(() => {
    const sendMock = vi.fn();
    return {
      sendMock,
      getPlatformSenderMock: vi.fn((_platform: unknown) => ({
        send: sendMock,
      })),
      matchClientByPhoneMock: vi.fn(),
      mockPrisma: {
        sale: { findUnique: vi.fn() },
        chatConversation: { findMany: vi.fn() },
        notification: { create: vi.fn() },
        shipment: { upsert: vi.fn() },
      },
    };
  });

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));

vi.mock("@/lib/chat/platform-send", () => ({
  getPlatformSender: (platform: unknown) => getPlatformSenderMock(platform),
}));

vi.mock("@/lib/chat/phone-match", () => ({
  matchClientByPhone: (phone: unknown) => matchClientByPhoneMock(phone),
}));

import {
  buildShipmentMessage,
  notifyCustomerShipmentSent,
} from "./notify-customer";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.create.mockResolvedValue({ id: "n1" });
  mockPrisma.shipment.upsert.mockResolvedValue({ id: "s1" });
  mockPrisma.chatConversation.findMany.mockResolvedValue([]);
  sendMock.mockResolvedValue({});
});

describe("buildShipmentMessage", () => {
  it("includes ТТН, tracking URL and COD when NP waybill + cash on delivery", () => {
    const text = buildShipmentMessage({
      docNumber: 42,
      number1C: "L0000001335",
      code1C: null,
      expressWaybill: "20450000000001",
      cashOnDelivery: true,
      codAmountUah: 1500,
      npCityName: "Луцьк",
      npWarehouseName: "Відділення №1",
    });
    expect(text).toContain("відправлено");
    expect(text).toContain("ТТН: 20450000000001");
    expect(text).toContain(
      "https://novaposhta.ua/tracking/?cargo_number=20450000000001",
    );
    expect(text).toContain("Луцьк, Відділення №1");
    expect(text).toContain("Накладений платіж: 1500 грн");
    expect(text).toContain("L0000001335");
  });

  it("says 'готове до відправлення' and skips tracking when no waybill", () => {
    const text = buildShipmentMessage({
      docNumber: 7,
      number1C: null,
      code1C: null,
      expressWaybill: null,
      cashOnDelivery: false,
      codAmountUah: null,
      npCityName: null,
      npWarehouseName: null,
    });
    expect(text).toContain("готове до відправлення");
    expect(text).not.toContain("novaposhta.ua/tracking");
    expect(text).not.toContain("ТТН");
    expect(text).toContain("№7");
  });
});

describe("notifyCustomerShipmentSent", () => {
  const baseSale = {
    id: "sale1",
    docNumber: 42,
    number1C: "L0000001335",
    code1C: null,
    expressWaybill: "20450000000001",
    cashOnDelivery: false,
    codAmountUah: null,
    npCityName: "Луцьк",
    npWarehouseName: "Відділення №1",
    npRecipientPhone: "0501234567",
    orderId: "order1",
    customer: { id: "cust1", name: "Іван", phone: "0501234567", code1C: "C-1" },
  };

  it("sends via bot conversation + creates notification + shipment", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(baseSale);
    matchClientByPhoneMock.mockResolvedValueOnce({
      clientId: "client1",
      agentUserId: "u1",
      phone: "+380501234567",
    });
    mockPrisma.chatConversation.findMany.mockResolvedValueOnce([
      { platform: "telegram", externalUserId: "12345" },
    ]);

    const result = await notifyCustomerShipmentSent("sale1");

    expect(result).toEqual({ ok: true, sent: 1 });
    expect(getPlatformSenderMock).toHaveBeenCalledWith("telegram");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.shipment.upsert).toHaveBeenCalledTimes(1);
  });

  it("still creates a notification when there is no conversation", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(baseSale);
    matchClientByPhoneMock.mockResolvedValueOnce(null);
    // customer.code1C present → OR clause exists, but findMany returns none
    mockPrisma.chatConversation.findMany.mockResolvedValueOnce([]);

    const result = await notifyCustomerShipmentSent("sale1");

    expect(result).toEqual({ ok: true, sent: 0 });
    expect(sendMock).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it("returns ok:false when sale is missing", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(null);

    const result = await notifyCustomerShipmentSent("nope");

    expect(result.ok).toBe(false);
    expect(result.sent).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("never throws when prisma throws", async () => {
    mockPrisma.sale.findUnique.mockRejectedValueOnce(new Error("db down"));

    const result = await notifyCustomerShipmentSent("sale1");

    expect(result.ok).toBe(false);
    expect(result.sent).toBe(0);
    expect(result.error).toContain("db down");
  });
});
