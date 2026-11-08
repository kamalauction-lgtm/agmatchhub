import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCsv, parseXlsx, readSpreadsheet, detectColumns, rowToDraft,
  parseIndonesianNumber, normalisePropertyType, normaliseListingType,
} from "../../../../apps/hub/src/lib/import/spreadsheet";

/**
 * The spreadsheet importer, against files openpyxl actually wrote — not
 * hand-written XML that agrees with the parser by construction.
 *
 * The rule under test throughout: a value the sheet does not state must come
 * out missing, never inferred. An agent can fill a blank in; they cannot see a
 * confidently wrong number.
 */

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, "..", "fixtures", name)));

describe("CSV", () => {
  it("reads the semicolons Indonesian Excel writes, not just commas", async () => {
    const grid = parseCsv(new TextDecoder().decode(fixture("semicolon.csv")));
    expect(grid[0]).toEqual(["Judul", "Harga", "Tipe", "Alamat", "Deskripsi"]);
    expect(grid).toHaveLength(3);
  });

  it("strips the BOM, so the first header still matches", () => {
    const grid = parseCsv(new TextDecoder().decode(fixture("semicolon.csv")));
    expect(grid[0][0]).toBe("Judul");     // not "﻿Judul"
  });

  it("keeps quoted text with embedded quotes and newlines in one cell", () => {
    const grid = parseCsv(new TextDecoder().decode(fixture("semicolon.csv")));
    expect(grid[1][0]).toBe('Rumah "Griya" Asri');
    expect(grid[1][4]).toBe("Baris satu\nbaris dua");
  });

  it("handles commas when that is what the file uses", () => {
    const grid = parseCsv("a,b,c\n1,2,3\n");
    expect(grid).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("drops blank lines rather than emitting empty rows", () => {
    expect(parseCsv("a,b\n\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("XLSX", () => {
  it("reads a real workbook", async () => {
    const grid = await parseXlsx(fixture("agent-listings.xlsx"));
    expect(grid.length).toBeGreaterThan(3);
    expect(grid[0][0]).toBe("DAFTAR PROPERTI SAYA");
  });

  it("reads the sheet workbook.xml lists first, not sheet1.xml by name", async () => {
    const grid = await parseXlsx(fixture("two-sheets.xlsx"));
    expect(grid[1][0]).toBe("Dari tab pertama");
  });

  it("keeps empty cells in position, so columns do not shift left", async () => {
    const grid = await parseXlsx(fixture("agent-listings.xlsx"));
    const { headerRow, map } = detectColumns(grid);
    const ruko = grid.slice(headerRow + 1).find((r) => r[map.title]?.startsWith("Ruko"))!;
    // Bedrooms and bathrooms are blank on this row; the address must still be
    // in the address column and not shifted into theirs.
    expect(ruko[map.bedrooms]).toBe("");
    expect(ruko[map.addressText]).toBe("Jl. Asia Afrika");
  });

  it("dispatches on the magic bytes, so a mislabelled file still reads", async () => {
    // Agents rename files. A workbook called .csv is not a parse error.
    const grid = await readSpreadsheet("listings.csv", fixture("agent-listings.xlsx"));
    expect(grid[0][0]).toBe("DAFTAR PROPERTI SAYA");
  });

  it("refuses the old binary .xls instead of producing nonsense", async () => {
    await expect(readSpreadsheet("old.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])))
      .rejects.toThrow("xls");
  });

  it("refuses an empty file", async () => {
    await expect(readSpreadsheet("x.csv", new Uint8Array())).rejects.toThrow("empty_file");
  });
});

describe("finding the header row", () => {
  it("skips a title and a blank line above the real header", async () => {
    const grid = await parseXlsx(fixture("agent-listings.xlsx"));
    const { headerRow, map } = detectColumns(grid);
    // The workbook has a title row, a blank row, then the header. The blank
    // row is dropped on read, so the header lands at index 1.
    expect(headerRow).toBe(1);
    expect(map.title).toBe(0);
    expect(map.price).toBe(1);
  });

  it("maps Indonesian headers", async () => {
    const grid = await parseXlsx(fixture("agent-listings.xlsx"));
    const { map } = detectColumns(grid);
    expect(Object.keys(map).sort()).toEqual([
      "addressText", "bathrooms", "bedrooms", "buildingSize", "city",
      "description", "landSize", "listingType", "price", "propertyType", "title",
    ]);
  });

  it("does not let 'luas tanah' be swallowed by a shorter synonym", async () => {
    const grid = await parseXlsx(fixture("agent-listings.xlsx"));
    const { map } = detectColumns(grid);
    expect(map.buildingSize).not.toBe(map.landSize);
  });

  it("maps English headers too", () => {
    const { map } = detectColumns([["Title", "Price", "Bedrooms", "Land Size"]]);
    expect(map).toMatchObject({ title: 0, price: 1, bedrooms: 2, landSize: 3 });
  });
});

describe("Indonesian numbers", () => {
  // The hundredfold error this rule exists to prevent: in this dataset a dot
  // is a thousands separator OR a decimal point, decided by what follows it.
  it("reads 1.500.000.000 as one and a half billion", () => {
    expect(parseIndonesianNumber("1.500.000.000")).toBe(1_500_000_000);
  });
  it("reads 24.20 as twenty-four point two, not two thousand", () => {
    expect(parseIndonesianNumber("24.20")).toBe(24.2);
  });
  it("reads 36,50 with a decimal comma", () => {
    expect(parseIndonesianNumber("36,50")).toBe(36.5);
  });
  it("reads Rp 750.000.000", () => {
    expect(parseIndonesianNumber("Rp 750.000.000")).toBe(750_000_000);
  });
  it("reads the shorthand agents write", () => {
    expect(parseIndonesianNumber("2,5 M")).toBe(2_500_000_000);
    expect(parseIndonesianNumber("850 jt")).toBe(850_000_000);
    expect(parseIndonesianNumber("500 ribu")).toBe(500_000);
  });
  it("returns nothing for text that is not a number", () => {
    expect(parseIndonesianNumber("nego")).toBeNull();
    expect(parseIndonesianNumber("")).toBeNull();
    expect(parseIndonesianNumber("-")).toBeNull();
  });
});

describe("type words", () => {
  it("accepts only words the sheet actually contains", () => {
    expect(normalisePropertyType("Rumah")).toBe("rumah");
    expect(normalisePropertyType("Apartement")).toBe("apartemen");
    expect(normalisePropertyType("Landed House")).toBe("rumah");
    expect(normalisePropertyType("properti bagus")).toBeUndefined();
    expect(normalisePropertyType("")).toBeUndefined();
  });
  it("reads jual and sewa", () => {
    expect(normaliseListingType("Dijual")).toBe("sale");
    expect(normaliseListingType("Disewakan")).toBe("rent");
    expect(normaliseListingType("belum pasti")).toBeUndefined();
  });
});

describe("row to draft — the no-invention rule", () => {
  it("carries across what the row states", async () => {
    const grid = await parseXlsx(fixture("agent-listings.xlsx"));
    const { headerRow, map } = detectColumns(grid);
    const draft = rowToDraft(grid[headerRow + 1], map);
    expect(draft).toMatchObject({
      title: "Rumah minimalis Cikarang",
      price: 1_500_000_000,
      propertyType: "rumah",
      listingType: "sale",
      bedrooms: 3,
      bathrooms: 2,
      buildingSize: 120,
      landSize: 150,
      city: "Kabupaten Bekasi",
    });
  });

  it("leaves a missing price missing rather than defaulting it to zero", async () => {
    const grid = await parseXlsx(fixture("agent-listings.xlsx"));
    const { headerRow, map } = detectColumns(grid);
    const tanah = grid.slice(headerRow + 1).find((r) => r[map.title]?.startsWith("Tanah"))!;
    const draft = rowToDraft(tanah, map);
    expect(draft.price).toBeUndefined();
    expect(draft.bedrooms).toBeUndefined();
    expect(draft.landSize).toBe(500);      // what it does say still comes through
  });

  it("reads the 36.50 m² that a thousands-separator rule would have made 3650", async () => {
    const grid = await parseXlsx(fixture("agent-listings.xlsx"));
    const { headerRow, map } = detectColumns(grid);
    const apt = grid.slice(headerRow + 1).find((r) => r[map.title]?.startsWith("Apartemen"))!;
    expect(rowToDraft(apt, map).buildingSize).toBe(36.5);
  });

  it("returns an empty draft when nothing is mapped, not a row of guesses", () => {
    expect(rowToDraft(["a", "b"], {})).toEqual({});
  });
});
