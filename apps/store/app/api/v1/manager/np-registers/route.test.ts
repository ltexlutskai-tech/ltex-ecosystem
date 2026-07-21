import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { getCurrentUserMock, getScanSheetListMock, insertDocumentsMock } =
  vi.hoisted(() => ({
    getCurrentUserMock: vi.fn(),
    getScanSheetListMock: vi.fn(),
    insertDocumentsMock: vi.fn(),
  }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
}));
vi.mock("@/lib/delivery/nova-poshta", () => ({
  getScanSheetList: (...a: unknown[]) => getScanSheetListMock(...a),
  insertDocumentsToScanSheet: (...a: unknown[]) => insertDocumentsMock(...a),
}));

import { GET, POST } from "./route";

const WAREHOUSE = { id: "u1", role: "warehouse" as const };

function getReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/np-registers");
}

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/np-registers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(WAREHOUSE);
  getScanSheetListMock.mockResolvedValue([
    { ref: "r1", number: "1001", date: "2026-07-21", count: 3 },
  ]);
  insertDocumentsMock.mockResolvedValue({ ref: "reg1", number: "2002" });
});

describe("GET /api/v1/manager/np-registers", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(getScanSheetListMock).not.toHaveBeenCalled();
  });

  it("returns 403 for wrong role", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u2", role: "manager" });
    const res = await GET(getReq());
    expect(res.status).toBe(403);
    expect(getScanSheetListMock).not.toHaveBeenCalled();
  });

  it("returns the registers list", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registers).toHaveLength(1);
    expect(body.registers[0].number).toBe("1001");
  });
});

describe("POST /api/v1/manager/np-registers", () => {
  it("returns 400 when documentRefs empty", async () => {
    const res = await POST(postReq({ documentRefs: [] }));
    expect(res.status).toBe(400);
    expect(insertDocumentsMock).not.toHaveBeenCalled();
  });

  it("happy path returns ok + ref + number", async () => {
    const res = await POST(postReq({ documentRefs: ["ttn-a", "ttn-b"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ref).toBe("reg1");
    expect(body.number).toBe("2002");
    expect(insertDocumentsMock).toHaveBeenCalledWith(
      ["ttn-a", "ttn-b"],
      undefined,
    );
  });

  it("surfaces NP error as 502", async () => {
    insertDocumentsMock.mockResolvedValueOnce({
      error: "Не вдалося додати ТТН у реєстр",
    });
    const res = await POST(postReq({ documentRefs: ["ttn-a"] }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/реєстр/);
  });
});
