import "server-only";

/**
 * Minimal styled-XLSX writer (no dependencies, Workers-safe).
 * XLSX = a zip of XML parts; entries are STORED (no compression), which every
 * spreadsheet app accepts. Styling: brand header, banded rows, borders,
 * frozen panes — the things CSV cannot do.
 */

// ---------------------------------------------------------------- zip (store)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
  const u32 = (v: number) =>
    new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = [
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0x5021),
      u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0),
    ];
    const localBytes = concat([...local, name, f.data]);
    chunks.push(localBytes);

    const cen = [
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x5021),
      u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
    ];
    central.push(concat([...cen, name]));
    offset += localBytes.length;
  }

  const centralBytes = concat(central);
  const eocd = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBytes.length), u32(offset), u16(0),
  ]);
  return concat([...chunks, centralBytes, eocd]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------------------------------------------------------------- xlsx build

const X = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");

function colLetter(i: number): string {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export type ComparisonSheet = {
  title: string;
  subtitle: string;
  /** Property display names — one column each. */
  properties: string[];
  rows: { label: string; values: string[]; emphasis?: boolean }[];
  footers: string[];
};

export function buildComparisonXlsx(sheet: ComparisonSheet): Uint8Array {
  const enc = new TextEncoder();
  const nCols = sheet.properties.length + 1;
  const lastCol = colLetter(nCols - 1);

  // styles: see cellXfs order below
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="7">
<font><sz val="10"/><name val="Arial"/></font>
<font><sz val="15"/><b/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
<font><sz val="10"/><b/><color rgb="FF1F1F1F"/><name val="Arial"/></font>
<font><sz val="8"/><b/><color rgb="FF8A8A8A"/><name val="Arial"/></font>
<font><sz val="10"/><color rgb="FF333333"/><name val="Arial"/></font>
<font><sz val="11"/><b/><color rgb="FFB11226"/><name val="Arial"/></font>
<font><sz val="8"/><i/><color rgb="FF999999"/><name val="Arial"/></font>
</fonts>
<fills count="8">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F1F1F"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFB11226"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFAFAFA"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF7F5F0"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border>
<left style="thin"><color rgb="FFDFDFDF"/></left>
<right style="thin"><color rgb="FFDFDFDF"/></right>
<top style="thin"><color rgb="FFDFDFDF"/></top>
<bottom style="thin"><color rgb="FFDFDFDF"/></bottom><diagonal/>
</border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="0" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="5" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="7" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="6" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="7" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const cell = (r: number, c: number, style: number, text?: string) =>
    text != null && text !== ""
      ? `<c r="${colLetter(c)}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${X(text)}</t></is></c>`
      : `<c r="${colLetter(c)}${r}" s="${style}"/>`;

  const rowsXml: string[] = [];
  const merges: string[] = [];
  let r = 1;

  // Row 1: title banner (charcoal)
  rowsXml.push(
    `<row r="${r}" ht="34" customHeight="1">` +
      Array.from({ length: nCols }, (_, c) => cell(r, c, 1, c === 0 ? sheet.title : "")).join("") +
      `</row>`,
  );
  merges.push(`A${r}:${lastCol}${r}`);
  r++;

  // Row 2: crimson accent bar
  rowsXml.push(
    `<row r="${r}" ht="4" customHeight="1">` +
      Array.from({ length: nCols }, (_, c) => cell(r, c, 2)).join("") +
      `</row>`,
  );
  merges.push(`A${r}:${lastCol}${r}`);
  r++;

  // Row 3: subtitle
  rowsXml.push(
    `<row r="${r}" ht="18" customHeight="1">` +
      Array.from({ length: nCols }, (_, c) => cell(r, c, 8, c === 0 ? sheet.subtitle : "")).join("") +
      `</row>`,
  );
  merges.push(`A${r}:${lastCol}${r}`);
  r++;

  // Row 4: property headers
  rowsXml.push(
    `<row r="${r}" ht="30" customHeight="1">` +
      cell(r, 0, 3) +
      sheet.properties.map((p, i) => cell(r, i + 1, 3, p)).join("") +
      `</row>`,
  );
  const headerRow = r;
  r++;

  // Data rows (banded)
  let band = 0;
  for (const row of sheet.rows) {
    const valueStyle = row.emphasis ? 7 : band % 2 ? 6 : 5;
    rowsXml.push(
      `<row r="${r}"${row.emphasis ? ' ht="22" customHeight="1"' : ""}>` +
        cell(r, 0, 4, row.label) +
        sheet.properties.map((_, i) => cell(r, i + 1, valueStyle, row.values[i] ?? "")).join("") +
        `</row>`,
    );
    band++;
    r++;
  }

  // Footers
  r++;
  for (const note of sheet.footers) {
    rowsXml.push(
      `<row r="${r}" ht="24" customHeight="1">` +
        Array.from({ length: nCols }, (_, c) => cell(r, c, 8, c === 0 ? note : "")).join("") +
        `</row>`,
    );
    merges.push(`A${r}:${lastCol}${r}`);
    r++;
  }

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0" showGridLines="0">
<pane xSplit="1" ySplit="${headerRow}" topLeftCell="B${headerRow + 1}" activePane="bottomRight" state="frozen"/>
</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16"/>
<cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="${nCols}" width="44" customWidth="1"/></cols>
<sheetData>${rowsXml.join("")}</sheetData>
<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>
</worksheet>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Comparison" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "xl/workbook.xml", data: enc.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRels) },
    { name: "xl/styles.xml", data: enc.encode(styles) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml) },
  ]);
}
