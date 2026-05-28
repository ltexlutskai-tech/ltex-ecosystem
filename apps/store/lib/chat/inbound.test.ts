import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, matchClientByPhoneMock } = vi.hoisted(() => ({
  mockPrisma: {
    chatConversation: { upsert: vi.fn(), update: vi.fn() },
    chatInboxMessage: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  matchClientByPhoneMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));

vi.mock("./phone-match", () => ({
  matchClientByPhone: (...args: unknown[]) => matchClientByPhoneMock(...args),
}));

import { ingestInboundMessage } from "./inbound";

beforeEach(() => {
  vi.clearAllMocks();
  // default: $transaction просто резолвиться у пустий масив (ми не читаємо
  // результат — нам важлива побічна дія).
  mockPrisma.$transaction.mockResolvedValue([]);
});

describe("ingestInboundMessage", () => {
  it("creates a new conversation + ingests message + matches client by phone", async () => {
    mockPrisma.chatConversation.upsert.mockResolvedValueOnce({
      id: "conv1",
      clientId: null,
      phone: null,
    });
    matchClientByPhoneMock.mockResolvedValueOnce({
      clientId: "client1",
      agentUserId: "user1",
      phone: "+380501234567",
    });

    const result = await ingestInboundMessage({
      platform: "telegram",
      externalUserId: "12345",
      externalUserName: "Іван Петренко",
      text: "Доброго ранку",
      phone: "0501234567",
      externalMessageId: "msg-1",
    });

    expect(result.conversationId).toBe("conv1");

    // Upsert + auto-link update + message create + counter bump update
    // (counter bump живе у transaction; update mock викликається 2 рази
    // — один для auto-link, один для бампу всередині транзакції).
    expect(mockPrisma.chatConversation.upsert).toHaveBeenCalledTimes(1);
    expect(matchClientByPhoneMock).toHaveBeenCalledWith("0501234567");
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "conv1" },
      data: {
        clientId: "client1",
        agentUserId: "user1",
        phone: "+380501234567",
      },
    });
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("re-uses existing conversation and does NOT re-match when clientId already set", async () => {
    mockPrisma.chatConversation.upsert.mockResolvedValueOnce({
      id: "conv2",
      clientId: "client2",
      phone: "+380671112233",
    });

    await ingestInboundMessage({
      platform: "viber",
      externalUserId: "viber-xyz",
      text: "Знову я",
      phone: "0671112233",
    });

    expect(matchClientByPhoneMock).not.toHaveBeenCalled();
    // Only the in-transaction counter bump (no auto-link update).
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("no phone + no match → conversation created without client", async () => {
    mockPrisma.chatConversation.upsert.mockResolvedValueOnce({
      id: "conv3",
      clientId: null,
      phone: null,
    });

    const result = await ingestInboundMessage({
      platform: "telegram",
      externalUserId: "anon-999",
      text: "Привіт",
    });

    expect(result.conversationId).toBe("conv3");
    expect(matchClientByPhoneMock).not.toHaveBeenCalled();
    // Only the in-transaction counter bump (no auto-link update).
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("phone present but no match → no client linked, message still stored", async () => {
    mockPrisma.chatConversation.upsert.mockResolvedValueOnce({
      id: "conv4",
      clientId: null,
      phone: null,
    });
    matchClientByPhoneMock.mockResolvedValueOnce(null);

    await ingestInboundMessage({
      platform: "telegram",
      externalUserId: "55555",
      text: "Ало",
      phone: "+380999999999",
    });

    expect(matchClientByPhoneMock).toHaveBeenCalled();
    // Only the in-transaction counter bump (no auto-link update because match returned null).
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
