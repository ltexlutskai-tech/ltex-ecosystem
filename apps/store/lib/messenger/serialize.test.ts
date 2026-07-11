import { describe, it, expect } from "vitest";
import {
  DELETED_PLACEHOLDER,
  makePreview,
  serializeMessage,
  type MessageRowLike,
} from "./serialize";

const nameById = new Map([
  ["u1", "Тарас"],
  ["u2", "Оля"],
]);

function row(over: Partial<MessageRowLike> = {}): MessageRowLike {
  return {
    id: "m1",
    conversationId: "c1",
    authorId: "u2",
    kind: "text",
    text: "Привіт",
    editedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-07-11T10:00:00Z"),
    ...over,
  };
}

describe("makePreview", () => {
  it("collapses whitespace", () => {
    expect(makePreview("а\n\n  б   в")).toBe("а б в");
  });
  it("truncates with ellipsis", () => {
    expect(makePreview("x".repeat(200), 10)).toBe(`${"x".repeat(10)}…`);
  });
});

describe("serializeMessage", () => {
  it("marks mine and resolves author name", () => {
    const m = serializeMessage(row({ authorId: "u1" }), {
      currentUserId: "u1",
      isOwner: false,
      nameById,
    });
    expect(m.isMine).toBe(true);
    expect(m.authorName).toBe("Тарас");
  });

  it("masks deleted text for non-owner", () => {
    const m = serializeMessage(row({ deletedAt: new Date() }), {
      currentUserId: "u1",
      isOwner: false,
      nameById,
    });
    expect(m.text).toBe(DELETED_PLACEHOLDER);
    expect(m.deletedAt).not.toBeNull();
  });

  it("shows original deleted text to owner (archive)", () => {
    const m = serializeMessage(row({ deletedAt: new Date(), text: "секрет" }), {
      currentUserId: "boss",
      isOwner: true,
      nameById,
    });
    expect(m.text).toBe("секрет");
  });

  it("builds reply preview with author + text", () => {
    const m = serializeMessage(
      row({
        replyTo: {
          id: "m0",
          authorId: "u1",
          text: "оригінал",
          deletedAt: null,
        },
      }),
      { currentUserId: "u2", isOwner: false, nameById },
    );
    expect(m.replyTo).toEqual({
      id: "m0",
      authorName: "Тарас",
      preview: "оригінал",
    });
  });

  it("masks deleted reply preview for non-owner", () => {
    const m = serializeMessage(
      row({
        replyTo: {
          id: "m0",
          authorId: "u1",
          text: "оригінал",
          deletedAt: new Date(),
        },
      }),
      { currentUserId: "u2", isOwner: false, nameById },
    );
    expect(m.replyTo?.preview).toBe(DELETED_PLACEHOLDER);
  });
});
