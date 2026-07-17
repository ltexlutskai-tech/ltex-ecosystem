import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  mockMatch: vi.fn(),
  mgrLead: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  mgrRegionAgent: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@ltex/db", () => ({
  prisma: { mgrLead: h.mgrLead, mgrRegionAgent: h.mgrRegionAgent },
}));
vi.mock("@/lib/chat/phone-match", () => ({
  matchClientByPhone: (...a: unknown[]) => h.mockMatch(...a),
}));

import { createSiteLead, markLeadsConverted } from "./site-lead";

describe("createSiteLead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips when phone already belongs to a client", async () => {
    h.mockMatch.mockResolvedValue({ clientId: "c1" });
    await createSiteLead({ name: "Іван", phone: "+380501112233" });
    expect(h.mgrLead.create).not.toHaveBeenCalled();
  });

  it("skips when an active lead already exists (dedup by phoneKey)", async () => {
    h.mockMatch.mockResolvedValue(null);
    h.mgrLead.findFirst.mockResolvedValue({ id: "lead1" });
    await createSiteLead({ name: "Іван", phone: "+380501112233" });
    expect(h.mgrLead.findFirst).toHaveBeenCalledWith({
      where: { phoneKey: "501112233", status: { not: "converted" } },
      select: { id: true },
    });
    expect(h.mgrLead.create).not.toHaveBeenCalled();
  });

  it("creates a lead for a new phone", async () => {
    h.mockMatch.mockResolvedValue(null);
    h.mgrLead.findFirst.mockResolvedValue(null);
    h.mgrLead.create.mockResolvedValue({ id: "new" });
    await createSiteLead({
      name: "Іван",
      phone: "0501112233",
      city: "Луцьк",
    });
    expect(h.mgrLead.create).toHaveBeenCalledTimes(1);
    const data = h.mgrLead.create.mock.calls[0]![0].data;
    expect(data.status).toBe("new");
    expect(data.source).toBe("site");
    expect(data.phone).toBe("+380501112233");
    expect(data.city).toBe("Луцьк");
    // No region → no agent lookup.
    expect(data.region).toBeNull();
    expect(data.agentUserId).toBeNull();
    expect(h.mgrRegionAgent.findUnique).not.toHaveBeenCalled();
  });

  it("stores region label + routes agent from MgrRegionAgent map", async () => {
    h.mockMatch.mockResolvedValue(null);
    h.mgrLead.findFirst.mockResolvedValue(null);
    h.mgrLead.create.mockResolvedValue({ id: "new" });
    h.mgrRegionAgent.findUnique.mockResolvedValue({ userId: "agent-7" });

    await createSiteLead({
      name: "Іван",
      phone: "0501112233",
      regionSlug: "volynska",
    });

    expect(h.mgrRegionAgent.findUnique).toHaveBeenCalledWith({
      where: { region: "volynska" },
      select: { userId: true },
    });
    const data = h.mgrLead.create.mock.calls[0]![0].data;
    expect(data.region).toBe("Волинська");
    expect(data.agentUserId).toBe("agent-7");
  });

  it("ignores an invalid region slug (no agent lookup)", async () => {
    h.mockMatch.mockResolvedValue(null);
    h.mgrLead.findFirst.mockResolvedValue(null);
    h.mgrLead.create.mockResolvedValue({ id: "new" });

    await createSiteLead({
      name: "Іван",
      phone: "0501112233",
      regionSlug: "narnia",
    });

    expect(h.mgrRegionAgent.findUnique).not.toHaveBeenCalled();
    const data = h.mgrLead.create.mock.calls[0]![0].data;
    expect(data.region).toBeNull();
    expect(data.agentUserId).toBeNull();
  });
});

describe("markLeadsConverted", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks active leads converted for the phone (by phoneKey)", async () => {
    await markLeadsConverted("+380501112233", "client-9");
    expect(h.mgrLead.updateMany).toHaveBeenCalledWith({
      where: { phoneKey: "501112233", status: { not: "converted" } },
      data: { status: "converted", convertedClientId: "client-9" },
    });
  });

  it("no-ops on empty phone", async () => {
    await markLeadsConverted(null, "client-9");
    expect(h.mgrLead.updateMany).not.toHaveBeenCalled();
  });
});
