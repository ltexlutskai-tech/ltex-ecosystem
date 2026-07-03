import { describe, it, expect } from "vitest";

// manager-auth (imported transitively for MANAGER_ACCESS_COOKIE) pulls in
// Prisma at module load — stub it so the guard can be imported in isolation.
import { vi } from "vitest";
vi.mock("@ltex/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

process.env.MANAGER_JWT_SECRET = "a".repeat(48);

import type { NextRequest } from "next/server";
import { adminGuard } from "./middleware-admin";
import { signAccessToken } from "./lib/auth/jwt";

function makeReq(pathname: string, cookieValue?: string): NextRequest {
  const nextUrl = {
    pathname,
    clone() {
      return new URL(`https://ltex.test${pathname}`);
    },
  };
  return {
    nextUrl,
    cookies: {
      get: (name: string) =>
        name === "ltex_mgr_access" && cookieValue
          ? { value: cookieValue }
          : undefined,
    },
  } as unknown as NextRequest;
}

function location(res: { headers: { get(k: string): string | null } }) {
  return res.headers.get("location");
}

describe("adminGuard", () => {
  it("redirects to /admin/login when no cookie", async () => {
    const res = await adminGuard(makeReq("/admin"));
    expect(location(res)).toContain("/admin/login");
    expect(location(res)).not.toContain("forbidden");
  });

  it("redirects to /admin/login when cookie is invalid", async () => {
    const res = await adminGuard(makeReq("/admin/orders", "not-a-real-token"));
    expect(location(res)).toContain("/admin/login");
  });

  it("allows a valid admin session (no redirect)", async () => {
    const token = signAccessToken("u1", "admin");
    const res = await adminGuard(makeReq("/admin", token));
    expect(location(res)).toBeNull();
  });

  it("allows a valid owner session (no redirect)", async () => {
    const token = signAccessToken("u1", "owner");
    const res = await adminGuard(makeReq("/admin/products", token));
    expect(location(res)).toBeNull();
  });

  it("redirects a valid non-admin session to login?forbidden=1", async () => {
    const token = signAccessToken("u1", "manager");
    const res = await adminGuard(makeReq("/admin", token));
    expect(location(res)).toContain("/admin/login");
    expect(location(res)).toContain("forbidden=1");
  });

  it("lets a signed-out user reach /admin/login", async () => {
    const res = await adminGuard(makeReq("/admin/login"));
    expect(location(res)).toBeNull();
  });

  it("bounces a signed-in admin away from /admin/login to /admin", async () => {
    const token = signAccessToken("u1", "admin");
    const res = await adminGuard(makeReq("/admin/login", token));
    const loc = location(res);
    expect(loc).toContain("/admin");
    expect(loc).not.toContain("/admin/login");
  });
});
