import { describe, it, expect } from "vitest";
import {
  canTransition,
  getAllowedRouteSheetTransitions,
  isRouteSheetLocked,
  isRouteSheetStatus,
} from "./route-sheet-status";

describe("route-sheet-status — canTransition graph", () => {
  it("allows draft → dispatched", () => {
    expect(canTransition("draft", "dispatched")).toBe(true);
  });

  it("allows dispatched → completed", () => {
    expect(canTransition("dispatched", "completed")).toBe(true);
  });

  it("allows dispatched → draft (revert)", () => {
    expect(canTransition("dispatched", "draft")).toBe(true);
  });

  it("allows completed → dispatched (unlock/correction)", () => {
    expect(canTransition("completed", "dispatched")).toBe(true);
  });

  it("rejects illegal jump draft → completed", () => {
    expect(canTransition("draft", "completed")).toBe(false);
  });

  it("rejects illegal jump completed → draft", () => {
    expect(canTransition("completed", "draft")).toBe(false);
  });

  it("rejects unknown target status", () => {
    expect(canTransition("draft", "nope")).toBe(false);
  });

  it("rejects unknown source status", () => {
    expect(canTransition("weird", "dispatched")).toBe(false);
  });

  it("treats no-op (from === to) as allowed", () => {
    expect(canTransition("draft", "draft")).toBe(true);
    expect(canTransition("completed", "completed")).toBe(true);
  });
});

describe("route-sheet-status — helpers", () => {
  it("getAllowedRouteSheetTransitions returns graph neighbours", () => {
    expect(getAllowedRouteSheetTransitions("draft")).toEqual(["dispatched"]);
    expect(getAllowedRouteSheetTransitions("dispatched")).toEqual([
      "completed",
      "draft",
    ]);
    expect(getAllowedRouteSheetTransitions("completed")).toEqual([
      "dispatched",
    ]);
  });

  it("unknown current treated as draft", () => {
    expect(getAllowedRouteSheetTransitions("???")).toEqual(["dispatched"]);
  });

  it("isRouteSheetLocked only for completed", () => {
    expect(isRouteSheetLocked("completed")).toBe(true);
    expect(isRouteSheetLocked("draft")).toBe(false);
    expect(isRouteSheetLocked("dispatched")).toBe(false);
  });

  it("isRouteSheetStatus validates allow-list", () => {
    expect(isRouteSheetStatus("draft")).toBe(true);
    expect(isRouteSheetStatus("nope")).toBe(false);
  });
});
