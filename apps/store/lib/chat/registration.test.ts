import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatConversation } from "@ltex/db";

const { mockPrisma, matchClientByPhoneMock } = vi.hoisted(() => ({
  mockPrisma: {
    chatConversation: { update: vi.fn() },
    mgrRegionAgent: { findUnique: vi.fn() },
    mgrClient: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  matchClientByPhoneMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));

vi.mock("./phone-match", () => ({
  matchClientByPhone: (...a: unknown[]) => matchClientByPhoneMock(...a),
}));

import {
  handleRegistrationStep,
  setRegistrationStep,
  extractRegionSlug,
  WELCOME_PROMPT_PHONE,
  NEED_PHONE_REMINDER,
  ASK_REGION_PROMPT,
  NEED_REGION_REMINDER,
} from "./registration";

type ConvFixture = Pick<
  ChatConversation,
  "id" | "clientId" | "registrationStep" | "pendingPhone" | "externalUserName"
>;

function makeConv(overrides: Partial<ConvFixture> = {}): ConvFixture {
  return {
    id: "conv-1",
    clientId: null,
    registrationStep: null,
    pendingPhone: null,
    externalUserName: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.chatConversation.update.mockResolvedValue({});
  mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Менеджер Х" });
});

describe("extractRegionSlug", () => {
  it("extracts slug from 'region:<slug>'", () => {
    expect(extractRegionSlug("region:volynska")).toBe("volynska");
  });

  it("extracts bare slug", () => {
    expect(extractRegionSlug("kyivska")).toBe("kyivska");
  });

  it("returns null for invalid slug", () => {
    expect(extractRegionSlug("region:nope")).toBeNull();
    expect(extractRegionSlug("random text")).toBeNull();
    expect(extractRegionSlug("")).toBeNull();
  });
});

describe("setRegistrationStep", () => {
  it("updates only registrationStep when pendingPhone arg omitted", async () => {
    await setRegistrationStep("conv-1", "awaiting_phone");
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { registrationStep: "awaiting_phone" },
    });
  });

  it("clears pendingPhone when explicit null", async () => {
    await setRegistrationStep("conv-1", "completed", null);
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { registrationStep: "completed", pendingPhone: null },
    });
  });
});

describe("handleRegistrationStep — entry/null state", () => {
  it("new conversation → ask_phone + sets awaiting_phone", async () => {
    const conv = makeConv(); // registrationStep=null, clientId=null
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "text", text: "Привіт" },
    });
    expect(out).toEqual({
      kind: "ask_phone",
      promptText: WELCOME_PROMPT_PHONE,
    });
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { registrationStep: "awaiting_phone" },
    });
  });
});

describe("handleRegistrationStep — awaiting_phone", () => {
  it("text (no contact) → reminder, NO step change", async () => {
    const conv = makeConv({ registrationStep: "awaiting_phone" });
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "text", text: "хочу взяти" },
    });
    expect(out).toEqual({
      kind: "ask_phone",
      promptText: NEED_PHONE_REMINDER,
    });
    // Жодного DB write
    expect(mockPrisma.chatConversation.update).not.toHaveBeenCalled();
  });

  it("contact found in DB → linked + sets completed + clientId", async () => {
    const conv = makeConv({
      registrationStep: "awaiting_phone",
      externalUserName: "Іван",
    });
    matchClientByPhoneMock.mockResolvedValueOnce({
      clientId: "client-1",
      agentUserId: "user-mgr",
      phone: "+380501112233",
    });
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "contact", phone: "0501112233" },
    });
    expect(out.kind).toBe("linked");
    if (out.kind === "linked") {
      expect(out.managerName).toBe("Менеджер Х");
      expect(out.greeting).toContain("Іван");
      expect(out.greeting).toContain("Менеджер Х");
    }
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: {
        clientId: "client-1",
        agentUserId: "user-mgr",
        phone: "+380501112233",
        registrationStep: "completed",
        pendingPhone: null,
      },
    });
  });

  it("contact NOT found → ask_region + sets awaiting_region + saves pendingPhone", async () => {
    const conv = makeConv({ registrationStep: "awaiting_phone" });
    matchClientByPhoneMock.mockResolvedValueOnce(null);
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "contact", phone: "0671111111" },
    });
    expect(out.kind).toBe("ask_region");
    if (out.kind === "ask_region") {
      expect(out.promptText).toBe(ASK_REGION_PROMPT);
      expect(out.regionSlugs.length).toBe(24);
    }
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: {
        registrationStep: "awaiting_region",
        pendingPhone: "+380671111111",
        phone: "+380671111111",
      },
    });
  });

  it("contact with invalid phone → reminder, no DB write", async () => {
    const conv = makeConv({ registrationStep: "awaiting_phone" });
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "contact", phone: "not-a-phone" },
    });
    expect(out.kind).toBe("ask_phone");
    expect(matchClientByPhoneMock).not.toHaveBeenCalled();
    expect(mockPrisma.chatConversation.update).not.toHaveBeenCalled();
  });
});

describe("handleRegistrationStep — awaiting_region", () => {
  it("valid region + agent exists → registered + creates MgrClient + completed", async () => {
    const conv = makeConv({
      registrationStep: "awaiting_region",
      pendingPhone: "+380501112233",
      externalUserName: "Олена",
    });
    mockPrisma.mgrRegionAgent.findUnique.mockResolvedValueOnce({
      userId: "agent-user-1",
    });
    mockPrisma.mgrClient.create.mockResolvedValueOnce({ id: "new-client-1" });

    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "region_select", regionSlug: "volynska" },
    });

    expect(out.kind).toBe("registered");
    expect(mockPrisma.mgrClient.create).toHaveBeenCalledWith({
      data: {
        name: "Олена",
        phonePrimary: "+380501112233",
        region: "Волинська",
        agentUserId: "agent-user-1",
      },
      select: { id: true },
    });
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: {
        clientId: "new-client-1",
        agentUserId: "agent-user-1",
        phone: "+380501112233",
        registrationStep: "completed",
        pendingPhone: null,
      },
    });
  });

  it("valid region but NO agent → unassigned + creates MgrClient with null agent", async () => {
    const conv = makeConv({
      registrationStep: "awaiting_region",
      pendingPhone: "+380673334455",
    });
    mockPrisma.mgrRegionAgent.findUnique.mockResolvedValueOnce(null);
    mockPrisma.mgrClient.create.mockResolvedValueOnce({ id: "new-client-2" });

    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "text", text: "region:donetska" },
    });

    expect(out.kind).toBe("unassigned");
    expect(mockPrisma.mgrClient.create).toHaveBeenCalledWith({
      data: {
        name: "+380673334455",
        phonePrimary: "+380673334455",
        region: "Донецька",
        agentUserId: null,
      },
      select: { id: true },
    });
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: {
        clientId: "new-client-2",
        agentUserId: null,
        phone: "+380673334455",
        registrationStep: "unassigned",
        pendingPhone: null,
      },
    });
  });

  it("invalid region text → reminder, no DB writes", async () => {
    const conv = makeConv({
      registrationStep: "awaiting_region",
      pendingPhone: "+380671112233",
    });
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "text", text: "не знаю" },
    });
    expect(out.kind).toBe("ask_region");
    if (out.kind === "ask_region") {
      expect(out.promptText).toBe(NEED_REGION_REMINDER);
    }
    expect(mockPrisma.mgrClient.create).not.toHaveBeenCalled();
    expect(mockPrisma.chatConversation.update).not.toHaveBeenCalled();
  });

  it("missing pendingPhone (defensive) → reset to awaiting_phone", async () => {
    const conv = makeConv({
      registrationStep: "awaiting_region",
      pendingPhone: null, // corrupted state
    });
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "region_select", regionSlug: "volynska" },
    });
    expect(out.kind).toBe("ask_phone");
    expect(mockPrisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { registrationStep: "awaiting_phone", pendingPhone: null },
    });
    expect(mockPrisma.mgrClient.create).not.toHaveBeenCalled();
  });
});

describe("handleRegistrationStep — completed/linked states → noop", () => {
  it("clientId already set → noop", async () => {
    const conv = makeConv({
      clientId: "existing-client",
      registrationStep: "completed",
    });
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "text", text: "продовжуємо" },
    });
    expect(out).toEqual({ kind: "noop" });
    expect(mockPrisma.chatConversation.update).not.toHaveBeenCalled();
  });

  it("completed without clientId → noop (paranoia)", async () => {
    const conv = makeConv({
      clientId: null,
      registrationStep: "completed",
    });
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "text", text: "ало" },
    });
    expect(out).toEqual({ kind: "noop" });
  });

  it("unassigned state → noop", async () => {
    const conv = makeConv({
      clientId: "client-unassigned",
      registrationStep: "unassigned",
    });
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "text", text: "hi" },
    });
    expect(out).toEqual({ kind: "noop" });
  });

  it("legacy conversation (registrationStep=null) + clientId set → noop", async () => {
    // Phase 1 розмова уже linked
    const conv = makeConv({
      clientId: "legacy-client",
      registrationStep: null,
    });
    const out = await handleRegistrationStep({
      conversation: conv,
      message: { type: "text", text: "hi" },
    });
    expect(out).toEqual({ kind: "noop" });
    expect(mockPrisma.chatConversation.update).not.toHaveBeenCalled();
  });
});
