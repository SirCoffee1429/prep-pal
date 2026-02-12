import { describe, it, expect } from "vitest";
import {
  classifyByA1,
  classifySheet,
  classifyContent,
  generateContentHash,
  areDuplicates,
  type ClassifiedFile,
} from "./fileClassification";

describe("classifyByA1", () => {
  it('returns "menu_item" for MENU ITEM', () => {
    expect(classifyByA1("MENU ITEM")).toBe("menu_item");
    expect(classifyByA1("MENU ITEM: Asian Salad")).toBe("menu_item");
  });

  it('returns "recipe" for RECIPE', () => {
    expect(classifyByA1("RECIPE")).toBe("recipe");
    expect(classifyByA1("RECIPE: Peanut Dressing")).toBe("recipe");
  });

  it('returns "par_sheet" for PAR', () => {
    expect(classifyByA1("PAR")).toBe("par_sheet");
    expect(classifyByA1("PAR SHEET")).toBe("par_sheet");
  });

  it('returns "sales" for SALES', () => {
    expect(classifyByA1("SALES")).toBe("sales");
    expect(classifyByA1("ITEM SALES REPORT")).toBe("sales");
  });

  it('returns "unknown" for random text', () => {
    expect(classifyByA1("random text")).toBe("unknown");
    expect(classifyByA1("")).toBe("unknown");
  });
});

describe("classifySheet", () => {
  it("falls back to position for multi-sheet workbooks with unknown A1", () => {
    expect(classifySheet("random", 0, 3)).toBe("menu_item");
    expect(classifySheet("random", 1, 3)).toBe("recipe");
    expect(classifySheet("random", 2, 3)).toBe("recipe");
  });

  it("uses A1 classification when available", () => {
    expect(classifySheet("RECIPE", 0, 3)).toBe("recipe");
  });

  it('returns "unknown" for single sheet with unknown A1', () => {
    expect(classifySheet("random", 0, 1)).toBe("unknown");
  });
});

describe("classifyContent", () => {
  it('detects sales reports by keyword "ITEM SALES REPORT"', () => {
    expect(classifyContent("ITEM SALES REPORT\nItem,Units Sold")).toBe("sales");
  });

  it('detects par sheets by "PAR SHEET"', () => {
    expect(classifyContent("PAR SHEET\nMon,Tue,Wed")).toBe("par_sheet");
  });

  it('returns "unknown" for unrecognizable content', () => {
    expect(classifyContent("lorem ipsum dolor sit amet")).toBe("unknown");
  });
});

describe("generateContentHash", () => {
  it("produces consistent hashes for same input", () => {
    const h1 = generateContentHash("test.xlsx", "some content here");
    const h2 = generateContentHash("test.xlsx", "some content here");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different content", () => {
    const h1 = generateContentHash("file1.xlsx", "content A");
    const h2 = generateContentHash("file2.xlsx", "content B");
    expect(h1).not.toBe(h2);
  });
});

describe("areDuplicates", () => {
  const makeFile = (overrides: Partial<ClassifiedFile>): ClassifiedFile => ({
    id: "1",
    fileName: "test.xlsx",
    sheetName: "Sheet1",
    fileType: "menu_item",
    content: "",
    contentHash: "hash1",
    isDuplicate: false,
    ...overrides,
  });

  it("detects duplicates by identical hash", () => {
    const f1 = makeFile({ contentHash: "abc123" });
    const f2 = makeFile({ id: "2", contentHash: "abc123" });
    expect(areDuplicates(f1, f2)).toBe(true);
  });

  it("returns false for dissimilar content", () => {
    const f1 = makeFile({ contentHash: "hash1", content: "apple\nbanana\ncherry" });
    const f2 = makeFile({ id: "2", contentHash: "hash2", content: "dog\ncat\nelephant" });
    expect(areDuplicates(f1, f2)).toBe(false);
  });
});
