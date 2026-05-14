import { describe, expect, it } from "vitest";
import { countOverdue, groupReminders } from "./client-reminders-grouping";
import type { ClientReminder } from "./types";

function mk(
  partial: Partial<ClientReminder> & { id: string; remindAt: string },
): ClientReminder {
  return {
    id: partial.id,
    body: partial.body ?? "test",
    remindAt: partial.remindAt,
    completedAt: partial.completedAt ?? null,
    snoozedUntilAt: partial.snoozedUntilAt ?? null,
    createdAt: partial.createdAt ?? new Date(0).toISOString(),
    owner: partial.owner ?? null,
  };
}

describe("groupReminders", () => {
  const NOW = new Date("2026-05-14T12:00:00Z");

  it("places past-remind into overdue", () => {
    const r = mk({ id: "1", remindAt: "2026-05-13T10:00:00Z" });
    const groups = groupReminders([r], NOW);
    expect(groups.find((g) => g.bucket === "overdue")?.items).toHaveLength(1);
    expect(groups.find((g) => g.bucket === "today")?.items).toHaveLength(0);
  });

  it("places today-remind into today", () => {
    const r = mk({ id: "1", remindAt: "2026-05-14T18:00:00Z" });
    const groups = groupReminders([r], NOW);
    expect(groups.find((g) => g.bucket === "today")?.items).toHaveLength(1);
  });

  it("places future-remind into upcoming", () => {
    const r = mk({ id: "1", remindAt: "2026-05-20T10:00:00Z" });
    const groups = groupReminders([r], NOW);
    expect(groups.find((g) => g.bucket === "upcoming")?.items).toHaveLength(1);
  });

  it("places completed into done regardless of remindAt", () => {
    const r = mk({
      id: "1",
      remindAt: "2026-05-10T10:00:00Z",
      completedAt: "2026-05-11T10:00:00Z",
    });
    const groups = groupReminders([r], NOW);
    expect(groups.find((g) => g.bucket === "done")?.items).toHaveLength(1);
    expect(groups.find((g) => g.bucket === "overdue")?.items).toHaveLength(0);
  });

  it("uses snoozedUntilAt to defer effective bucket", () => {
    const r = mk({
      id: "1",
      remindAt: "2026-05-13T10:00:00Z", // overdue by remindAt
      snoozedUntilAt: "2026-05-20T10:00:00Z", // but snoozed into future
    });
    const groups = groupReminders([r], NOW);
    expect(groups.find((g) => g.bucket === "upcoming")?.items).toHaveLength(1);
    expect(groups.find((g) => g.bucket === "overdue")?.items).toHaveLength(0);
  });
});

describe("countOverdue", () => {
  const NOW = new Date("2026-05-14T12:00:00Z");

  it("counts only overdue (not completed)", () => {
    const reminders: ClientReminder[] = [
      {
        id: "1",
        body: "a",
        remindAt: "2026-05-13T00:00:00Z",
        completedAt: null,
        snoozedUntilAt: null,
        createdAt: "x",
        owner: null,
      },
      {
        id: "2",
        body: "b",
        remindAt: "2026-05-10T00:00:00Z",
        completedAt: "2026-05-12T00:00:00Z",
        snoozedUntilAt: null,
        createdAt: "x",
        owner: null,
      },
      {
        id: "3",
        body: "c",
        remindAt: "2026-05-20T00:00:00Z",
        completedAt: null,
        snoozedUntilAt: null,
        createdAt: "x",
        owner: null,
      },
    ];
    expect(countOverdue(reminders, NOW)).toBe(1);
  });
});
