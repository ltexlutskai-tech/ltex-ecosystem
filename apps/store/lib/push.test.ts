import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma before importing the module
vi.mock("@ltex/db", () => ({
  prisma: {
    pushToken: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { sendPushNotification } from "./push";
import { prisma } from "@ltex/db";

const mockFindMany = prisma.pushToken.findMany as ReturnType<typeof vi.fn>;
const mockUpdateMany = prisma.pushToken.updateMany as ReturnType<typeof vi.fn>;

describe("sendPushNotification", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns empty result when customer has no tokens", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await sendPushNotification("cust-1", "Title", "Body");

    expect(result).toEqual({ sent: 0, failed: 0, tickets: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends push to all active tokens", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", token: "ExponentPushToken[abc]" },
      { id: "t2", token: "ExponentPushToken[def]" },
    ]);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "ok", id: "receipt-1" },
            { status: "ok", id: "receipt-2" },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await sendPushNotification("cust-1", "Нове замовлення", "Деталі");

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toHaveLength(2);
    expect(body[0].to).toBe("ExponentPushToken[abc]");
    expect(body[0].title).toBe("Нове замовлення");
    expect(body[0].body).toBe("Деталі");
    expect(body[0].sound).toBe("default");
  });

  it("deactivates tokens on DeviceNotRegistered error", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", token: "ExponentPushToken[abc]" },
      { id: "t2", token: "ExponentPushToken[invalid]" },
    ]);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "ok", id: "receipt-1" },
            { status: "error", message: "Device not registered", details: { error: "DeviceNotRegistered" } },
          ],
        }),
        { status: 200 },
      ),
    );
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await sendPushNotification("cust-1", "Title", "Body");

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t2"] } },
      data: { active: false },
    });
  });

  it("does not deactivate tokens on other errors", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", token: "ExponentPushToken[abc]" },
    ]);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "error", message: "Rate limit exceeded", details: { error: "TooManyRequests" } },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await sendPushNotification("cust-1", "Title", "Body");

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("handles Expo API HTTP error gracefully", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", token: "ExponentPushToken[abc]" },
    ]);
    fetchSpy.mockResolvedValue(
      new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }),
    );

    const result = await sendPushNotification("cust-1", "Title", "Body");

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.tickets).toEqual([]);
  });

  it("handles fetch network failure gracefully", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", token: "ExponentPushToken[abc]" },
    ]);
    fetchSpy.mockRejectedValue(new Error("Network error"));

    const result = await sendPushNotification("cust-1", "Title", "Body");

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.tickets).toEqual([]);
  });

  it("passes optional data to push messages", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", token: "ExponentPushToken[abc]" },
    ]);
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 }),
    );

    await sendPushNotification("cust-1", "Title", "Body", { orderId: "ord-1" });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body[0].data).toEqual({ orderId: "ord-1" });
  });

  it("handles updateMany failure gracefully during deactivation", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", token: "ExponentPushToken[abc]" },
    ]);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "error", details: { error: "DeviceNotRegistered" } },
          ],
        }),
        { status: 200 },
      ),
    );
    mockUpdateMany.mockRejectedValue(new Error("DB error"));

    // Should not throw
    const result = await sendPushNotification("cust-1", "Title", "Body");
    expect(result.failed).toBe(1);
  });
});
