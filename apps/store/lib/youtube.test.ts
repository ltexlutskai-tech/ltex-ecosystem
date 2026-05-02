import { describe, expect, it } from "vitest";
import {
  extractYouTubeId,
  getYouTubeThumbnail,
  getYouTubeEmbedUrl,
} from "./youtube";

describe("extractYouTubeId", () => {
  it("parses watch?v= URLs", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("parses youtu.be short URLs", () => {
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("parses /embed/ URLs", () => {
    expect(extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("parses /shorts/ URLs", () => {
    expect(extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("returns null for unrecognized URLs", () => {
    expect(extractYouTubeId("https://example.com/video")).toBeNull();
  });

  it("returns null for null/undefined/empty input", () => {
    expect(extractYouTubeId(null)).toBeNull();
    expect(extractYouTubeId(undefined)).toBeNull();
    expect(extractYouTubeId("")).toBeNull();
  });
});

describe("getYouTubeThumbnail", () => {
  it("returns hqdefault thumbnail URL for an id", () => {
    expect(getYouTubeThumbnail("abc123")).toBe(
      "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    );
  });
});

describe("getYouTubeEmbedUrl", () => {
  it("returns embed URL for an id", () => {
    expect(getYouTubeEmbedUrl("abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
  });
});
