import { describe, it, expect } from "vitest";
import {
  findBestMatch,
  normalizeItemName,
  getConfidenceColor,
  getConfidenceLabel,
} from "./itemMatching";

const menuItems = [
  { id: "1", name: "Ribeye" },
  { id: "2", name: "Asian Salad" },
  { id: "3", name: "Half Caesar Salad" },
  { id: "4", name: "Full Caesar Salad" },
  { id: "5", name: "Grilled Chicken Sandwich" },
];

describe("findBestMatch", () => {
  it("returns exact match (case-insensitive)", () => {
    const result = findBestMatch("ribeye", menuItems);
    expect(result.confidence).toBe("exact");
    expect(result.item?.id).toBe("1");
  });

  it("returns normalized match stripping oz prefix", () => {
    const result = findBestMatch("8oz Ribeye", menuItems);
    expect(result.confidence).toBe("normalized");
    expect(result.item?.id).toBe("1");
  });

  it("preserves Half and Full as distinct items", () => {
    const half = findBestMatch("Half Caesar Salad", menuItems);
    const full = findBestMatch("Full Caesar Salad", menuItems);
    expect(half.item?.id).toBe("3");
    expect(full.item?.id).toBe("4");
    expect(half.item?.id).not.toBe(full.item?.id);
  });

  it("returns fuzzy match via word overlap", () => {
    const result = findBestMatch("Chicken Sandwich", menuItems);
    expect(result.confidence).toBe("fuzzy");
    expect(result.item?.id).toBe("5");
  });

  it("returns none when no match found", () => {
    const result = findBestMatch("Lobster Thermidor", menuItems);
    expect(result.confidence).toBe("none");
    expect(result.item).toBeNull();
  });

  it("returns none for empty input", () => {
    const result = findBestMatch("", menuItems);
    expect(result.confidence).toBe("none");
    expect(result.item).toBeNull();
  });
});

describe("normalizeItemName", () => {
  it("strips oz prefixes", () => {
    expect(normalizeItemName("8oz Ribeye")).toBe("ribeye");
    expect(normalizeItemName("10 oz. Filet")).toBe("filet");
  });
});

describe("getConfidenceColor", () => {
  it("returns correct color classes", () => {
    expect(getConfidenceColor("exact")).toBe("text-green-500");
    expect(getConfidenceColor("normalized")).toBe("text-blue-500");
    expect(getConfidenceColor("fuzzy")).toBe("text-yellow-500");
    expect(getConfidenceColor("none")).toBe("text-muted-foreground");
  });
});

describe("getConfidenceLabel", () => {
  it("returns correct labels", () => {
    expect(getConfidenceLabel("exact")).toBe("Exact");
    expect(getConfidenceLabel("normalized")).toBe("Partial");
    expect(getConfidenceLabel("fuzzy")).toBe("Fuzzy");
    expect(getConfidenceLabel("none")).toBe("None");
  });
});
