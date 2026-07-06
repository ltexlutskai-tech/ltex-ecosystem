import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  mockMatch: vi.fn(),
  mgrLead: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@ltex/db", () => ({ prisma: { mgrLead: h.mgrLead } }));
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

  it("skips when an active lead already exists (dedup)", async () => {
    h.mockMatch.mockResolvedValue(null);
    h.mgrLead.findFirst.mockResolvedValue({ id: "lead1" });
    await createSiteLead({ name: "Іван", phone: "+380501112233" });
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
  });
});

describe("markLeadsConverted", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks active leads converted for the phone", async () => {
    await markLeadsConverted("+380501112233", "client-9");
    expect(h.mgrLead.updateMany).toHaveBeenCalledWith({
      where: { phone: "+380501112233", status: { not: "converted" } },
      data: { status: "converted", convertedClientId: "client-9" },
    });
  });

  it("no-ops on empty phone", async () => {
    await markLeadsConverted(null, "client-9");
    expect(h.mgrLead.updateMany).not.toHaveBeenCalled();
  });
});
