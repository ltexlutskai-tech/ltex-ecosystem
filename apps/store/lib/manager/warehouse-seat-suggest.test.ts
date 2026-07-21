import { describe, it, expect } from "vitest";
import {
  buildSuggestedSeats,
  type ItemForSeatSuggest,
} from "./warehouse-seat-suggest";

const base: ItemForSeatSuggest = {
  weight: 0,
  packaging: null,
  defaultLengthCm: null,
  defaultWidthCm: null,
  defaultHeightCm: null,
};

describe("buildSuggestedSeats", () => {
  it("returns empty when no dims and no bags", () => {
    expect(buildSuggestedSeats([{ ...base, weight: 12 }, { ...base }])).toEqual(
      [],
    );
  });

  it("builds one seat per item using product default dims", () => {
    const seats = buildSuggestedSeats([
      {
        ...base,
        weight: 18.5,
        packaging: "box",
        defaultLengthCm: 60,
        defaultWidthCm: 40,
        defaultHeightCm: 40,
      },
      {
        ...base,
        weight: 25,
        packaging: "bag",
        defaultLengthCm: 80,
        defaultWidthCm: 50,
        defaultHeightCm: 50,
      },
    ]);
    expect(seats).toEqual([
      {
        weight: 18.5,
        lengthCm: 60,
        widthCm: 40,
        heightCm: 40,
        manualHandling: false,
      },
      {
        weight: 25,
        lengthCm: 80,
        widthCm: 50,
        heightCm: 50,
        manualHandling: true,
      },
    ]);
  });

  it("marks bags as manual handling even without dims", () => {
    const seats = buildSuggestedSeats([
      { ...base, weight: 30, packaging: "bag" },
    ]);
    expect(seats).toEqual([
      {
        weight: 30,
        lengthCm: 0,
        widthCm: 0,
        heightCm: 0,
        manualHandling: true,
      },
    ]);
  });

  it("falls back to defaultSeatWeightKg when item weight is 0", () => {
    const seats = buildSuggestedSeats([
      { ...base, weight: 0, defaultSeatWeightKg: 15, defaultLengthCm: 50 },
    ]);
    expect(seats[0]!.weight).toBe(15);
  });

  it("rounds weight to 2 decimals", () => {
    const seats = buildSuggestedSeats([
      { ...base, weight: 12.3456, defaultLengthCm: 60 },
    ]);
    expect(seats[0]!.weight).toBe(12.35);
  });
});
