import { describe, it, expect } from "vitest";
import { isAllowedReaction, summarizeReactions } from "./reactions";

describe("isAllowedReaction", () => {
  it("accepts whitelisted emoji", () => {
    expect(isAllowedReaction("👍")).toBe(true);
    expect(isAllowedReaction("🔥")).toBe(true);
  });
  it("rejects others", () => {
    expect(isAllowedReaction("💩")).toBe(false);
    expect(isAllowedReaction("abc")).toBe(false);
  });
});

describe("summarizeReactions", () => {
  it("groups by emoji with counts and marks mine", () => {
    const rows = [
      { emoji: "👍", userId: "u1" },
      { emoji: "👍", userId: "u2" },
      { emoji: "🔥", userId: "u2" },
    ];
    const out = summarizeReactions(rows, "u1");
    expect(out).toEqual([
      { emoji: "👍", count: 2, mine: true },
      { emoji: "🔥", count: 1, mine: false },
    ]);
  });

  it("orders by the allowed-reactions order, not insertion", () => {
    const rows = [
      { emoji: "😂", userId: "u1" },
      { emoji: "👍", userId: "u1" },
    ];
    const out = summarizeReactions(rows, "u1");
    expect(out.map((r) => r.emoji)).toEqual(["👍", "😂"]);
  });

  it("returns empty for no reactions", () => {
    expect(summarizeReactions([], "u1")).toEqual([]);
  });
});
