import { describe, it, expect } from "vitest";
import {
  isDeliveredStatus,
  isTerminalStatus,
  classifyShipmentUpdate,
} from "./np-status";

describe("np-status flags", () => {
  it("delivered codes", () => {
    expect(isDeliveredStatus("9")).toBe(true);
    expect(isDeliveredStatus("10")).toBe(true);
    expect(isDeliveredStatus("11")).toBe(true);
    expect(isDeliveredStatus("7")).toBe(false);
    expect(isDeliveredStatus(null)).toBe(false);
  });

  it("terminal includes delivered + failed", () => {
    expect(isTerminalStatus("10")).toBe(true);
    expect(isTerminalStatus("102")).toBe(true);
    expect(isTerminalStatus("105")).toBe(true);
    expect(isTerminalStatus("4")).toBe(false);
  });
});

describe("classifyShipmentUpdate", () => {
  it("detects a status change in transit", () => {
    const u = classifyShipmentUpdate(
      { status: "4", statusText: "В дорозі" },
      {
        status: "7",
        statusCode: "7",
        scheduledDeliveryDate: "2026-07-25 00:00:00",
      },
    );
    expect(u.changed).toBe(true);
    expect(u.becameDelivered).toBe(false);
    expect(u.status).toBe("7");
    expect(u.statusText).toBe("7");
    expect(u.estimatedDate).toBe("2026-07-25");
  });

  it("flags becameDelivered exactly on the transition", () => {
    const u = classifyShipmentUpdate(
      { status: "7", statusText: "Прибув" },
      { status: "Отримано", statusCode: "10", scheduledDeliveryDate: "" },
    );
    expect(u.becameDelivered).toBe(true);
    expect(u.estimatedDate).toBeNull();
  });

  it("does not re-flag delivered when already delivered", () => {
    const u = classifyShipmentUpdate(
      { status: "10", statusText: "Прибув на відділення" },
      { status: "Отримано", statusCode: "10", scheduledDeliveryDate: "" },
    );
    expect(u.becameDelivered).toBe(false);
    expect(u.changed).toBe(true); // statusText differs
  });

  it("no change when identical", () => {
    const u = classifyShipmentUpdate(
      { status: "7", statusText: "Прибув" },
      { status: "Прибув", statusCode: "7", scheduledDeliveryDate: "" },
    );
    expect(u.changed).toBe(false);
  });
});
