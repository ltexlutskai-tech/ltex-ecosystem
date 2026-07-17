import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

// manager-auth (imported transitively via session-refresh) pulls in Prisma.
vi.mock("@ltex/db", () => ({ prisma: {} }));

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }));
vi.mock("@/lib/auth/jwt", () => ({
  verifyAccessToken: (token: string) => verifyMock(token),
}));

import { managerGuard } from "./middleware-manager";

const VALID_PAYLOAD = { sub: "u1", role: "manager", iat: 0, exp: 0 };

function makeReq(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://new.ltex.com.ua${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("managerGuard", () => {
  it("lets a request with a valid access token through", async () => {
    verifyMock.mockReturnValue(VALID_PAYLOAD);
    const res = await managerGuard(
      makeReq("/manager/prices", "ltex_mgr_access=good"),
    );
    // NextResponse.next() → no redirect location header.
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to login when there is no session at all", async () => {
    verifyMock.mockReturnValue(null);
    const res = await managerGuard(makeReq("/manager/prices"));
    expect(res.headers.get("location")).toContain("/manager/login");
  });

  it("silently refreshes when access token is expired but refresh cookie is valid", async () => {
    verifyMock.mockReturnValue(null); // expired/missing access token
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        getSetCookie: () => [
          "ltex_mgr_access=new; Path=/; HttpOnly",
          "ltex_mgr_refresh=rotated; Path=/; HttpOnly",
        ],
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await managerGuard(
      makeReq("/manager/prices?page=2", "ltex_mgr_refresh=alive"),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    // Redirects back to the SAME url (not to login) with the fresh cookies.
    const location = res.headers.get("location");
    expect(location).toContain("/manager/prices");
    expect(location).toContain("page=2");
    expect(location).not.toContain("/manager/login");
    expect(res.headers.getSetCookie()).toHaveLength(2);
  });

  it("redirects to login when the refresh sub-request fails", async () => {
    verifyMock.mockReturnValue(null);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: { getSetCookie: () => [] },
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await managerGuard(
      makeReq("/manager/prices", "ltex_mgr_refresh=stale"),
    );
    expect(res.headers.get("location")).toContain("/manager/login");
  });

  it("does not attempt refresh when there is no refresh cookie", async () => {
    verifyMock.mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await managerGuard(makeReq("/manager/prices"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/manager/login");
  });

  // ─── RBAC: заборонені розділи для менеджера (ТЗ 2026-07-17) ──────────────
  it("redirects a manager away from a denied section to /manager", async () => {
    verifyMock.mockReturnValue(VALID_PAYLOAD);
    for (const p of [
      "/manager/categories",
      "/manager/needs",
      "/manager/registry",
      "/manager/presentations",
      "/manager/reports",
      "/manager/reports/sales-summary",
      "/manager/admin/users",
      "/manager/receivings",
    ]) {
      const res = await managerGuard(makeReq(p, "ltex_mgr_access=good"));
      const location = res.headers.get("location");
      expect(location, p).toContain("/manager");
      expect(location, p).not.toContain(p.slice("/manager/".length));
    }
  });

  it("lets a manager into allowed sections", async () => {
    verifyMock.mockReturnValue(VALID_PAYLOAD);
    for (const p of [
      "/manager",
      "/manager/orders",
      "/manager/customers",
      "/manager/prices",
      "/manager/message-templates",
      "/manager/reminders",
      "/manager/closures",
      "/manager/chat",
      "/manager/messenger",
      "/manager/warehouse-tasks",
      "/manager/routes",
      "/manager/settings",
    ]) {
      const res = await managerGuard(makeReq(p, "ltex_mgr_access=good"));
      expect(res.headers.get("location"), p).toBeNull();
    }
  });

  it("does NOT restrict admin from any section", async () => {
    verifyMock.mockReturnValue({ ...VALID_PAYLOAD, role: "admin" });
    for (const p of [
      "/manager/categories",
      "/manager/reports",
      "/manager/admin/users",
      "/manager/registry",
    ]) {
      const res = await managerGuard(makeReq(p, "ltex_mgr_access=good"));
      expect(res.headers.get("location"), p).toBeNull();
    }
  });
});
