import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    product: { count: vi.fn() },
    viewLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/mobile-auth", () => ({
  tryMobileSession: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@ltex/db";
import { tryMobileSession } from "@/lib/mobile-auth";

const mockPrisma = prisma as unknown as {
  product: { count: ReturnType<typeof vi.fn> };
  viewLog: { create: ReturnType<typeof vi.fn> };
};
const mockTrySession = tryMobileSession as unknown as ReturnType<typeof vi.fn>;

function buildRequest(body?: unknown): Request {
  return new Request("http://localhost/api/mobile/products/p-1/view", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "p-1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/mobile/products/[id]/view", () => {
  it("records a view with customerId when the request is authenticated", async () => {
    mockTrySession.mockReturnValue({ customerId: "cust-1" });
    mockPrisma.product.count.mockResolvedValue(1);
    mockPrisma.viewLog.create.mockResolvedValue({ id: "v-1" });

    const res = await POST(
      buildRequest({ source: "product_detail" }) as never,
      {
        params,
      },
    );

    expect(res.status).toBe(204);
    expect(mockPrisma.viewLog.create).toHaveBeenCalledWith({
      data: {
        customerId: "cust-1",
        productId: "p-1",
        source: "product_detail",
      },
    });
  });

  it("records an anonymous view (customerId=null) when no token is present", async () => {
    mockTrySession.mockReturnValue(null);
    mockPrisma.product.count.mockResolvedValue(1);
    mockPrisma.viewLog.create.mockResolvedValue({ id: "v-2" });

    const res = await POST(buildRequest({ source: "home" }) as never, {
      params,
    });

    expect(res.status).toBe(204);
    expect(mockPrisma.viewLog.create).toHaveBeenCalledWith({
      data: { customerId: null, productId: "p-1", source: "home" },
    });
  });

  it("returns 204 silently and does not insert when product does not exist", async () => {
    mockTrySession.mockReturnValue(null);
    mockPrisma.product.count.mockResolvedValue(0);

    const res = await POST(buildRequest({ source: "catalog" }) as never, {
      params,
    });

    expect(res.status).toBe(204);
    expect(mockPrisma.viewLog.create).not.toHaveBeenCalled();
  });

  it("defaults source to 'unknown' when missing or invalid", async () => {
    mockTrySession.mockReturnValue(null);
    mockPrisma.product.count.mockResolvedValue(1);
    mockPrisma.viewLog.create.mockResolvedValue({ id: "v-3" });

    const res = await POST(buildRequest({ source: "evil-source" }) as never, {
      params,
    });

    expect(res.status).toBe(204);
    expect(mockPrisma.viewLog.create).toHaveBeenCalledWith({
      data: { customerId: null, productId: "p-1", source: "unknown" },
    });
  });
});
