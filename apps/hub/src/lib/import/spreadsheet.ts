import "server-only";

/**
 * Reading an agent's own spreadsheet.
 *
 * Most agents who have listings elsewhere have them in Excel, not on a portal.
 * The IFCA import proved the shape works, but it ran from a command line by an
 * operator — which is no use to an agent in Surabaya with a file on their
 * phone. This turns the same idea into an upload.
 *
 * NO DEPENDENCY. `xlsx` is not in this workspace and adding it to a Cloudflare
 * Worker bundle for one screen is a poor trade, so both formats are parsed
 * here: CSV properly (quotes, embedded newlines, the semicolon that Indonesian
 * Excel writes), and .xlsx by unzipping it with the platform's own
 * DecompressionStream and reading the two XML parts that matter.
 *
 * The parser's job ends at "these are the cells". It never invents a value and
 * never coerces a doubtful one — the mapping step decides what a column means,
 * and anything it cannot place is left for the agent.
 */

/** A spreadsheet as a grid of trimmed strings. Empty cells are "". */
export type Grid = string[][];

export class SpreadsheetError extends Error {
  constructor(public readonly reason:
    | "empty_file" | "too_large" | "unsupported_format" | "corrupt" | "no_rows",
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "SpreadsheetError";
  }
}

const MAX_BYTES = 5_000_000;
const MAX_ROWS = 2_000;
const MAX_COLS = 64;

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Pick the delimiter by counting candidates outside quotes on the first few
 * lines. Excel on an Indonesian or European locale writes `;`, and guessing `,`
 * there turns every row into one cell — a failure that looks like a broken file
 * rather than a wrong assumption.
 */
function sniffDelimiter(text: string): string {
  const sample = text.slice(0, 8_000);
  let best = ",";
  let bestCount = 0;
  for (const d of [",", ";", "\t", "|"]) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

export function parseCsv(text: string): Grid {
  // Excel writes a UTF-8 BOM. Left in place it becomes part of the first
  // header, and the header then matches nothing.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delimiter = sniffDelimiter(text);

  const rows: Grid = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }   // escaped quote
        else inQuotes = false;
      } else field += ch;
      continue;
    }

    // A quote only opens a quoted section at the START of a field. Anywhere
    // else it is a literal character — agents write `Rumah "Griya" Asri`, and
    // treating that quote as syntax swallows it and glues two fields together.
    if (ch === '"' && field === "") { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field.trim()); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field.trim());
      field = "";
      if (row.some((c) => c !== "")) rows.push(row.slice(0, MAX_COLS));
      row = [];
      if (rows.length >= MAX_ROWS) return rows;
      continue;
    }
    field += ch;
  }

  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row.slice(0, MAX_COLS));
  return rows;
}

/* -------------------------------------------------------------------------- */
/* XLSX — a zip of XML, opened without a zip library                           */
/* -------------------------------------------------------------------------- */

type ZipEntry = { name: string; method: number; offset: number; compressedSize: number };

/**
 * Read the central directory. Not the local headers: a local header may carry
 * zeroed sizes with the real ones in a trailing data descriptor, which is how a
 * naive reader ends up with an empty sheet and no error.
 */
function readZipDirectory(buf: Uint8Array): ZipEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // End of central directory: scan back from the end past any comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new SpreadsheetError("corrupt", "no end-of-central-directory");

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, offset: localOffset, compressedSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipEntry(buf: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) {
    throw new SpreadsheetError("corrupt", `bad local header for ${entry.name}`);
  }
  const nameLen = view.getUint16(entry.offset + 26, true);
  const extraLen = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8) {
    throw new SpreadsheetError("unsupported_format", `zip method ${entry.method}`);
  }
  // deflate-raw: the platform's decompressor, so there is no inflate to get
  // wrong here.
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/** `AB12` -> 27. Needed because empty cells are simply absent from the XML. */
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");   // last, so &amp;lt; does not become <
}

/** All the <t> runs inside one element, concatenated — rich text is split. */
function textRuns(xml: string): string {
  const out: string[] = [];
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(decodeXmlText(m[1]));
  return out.join("");
}

export async function parseXlsx(bytes: Uint8Array): Promise<Grid> {
  const entries = readZipDirectory(bytes);
  const byName = new Map(entries.map((e) => [e.name, e]));

  // Which sheet is first is decided by workbook.xml, not by filename order —
  // sheet1.xml is not reliably the first tab.
  let sheetPath: string | null = null;
  const workbook = byName.get("xl/workbook.xml");
  const rels = byName.get("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const wbXml = await readZipEntry(bytes, workbook);
    const relsXml = await readZipEntry(bytes, rels);
    const firstRid = wbXml.match(/<sheet[^>]*r:id="([^"]+)"/)?.[1];
    if (firstRid) {
      const target = relsXml.match(
        new RegExp(`<Relationship[^>]*Id="${firstRid}"[^>]*Target="([^"]+)"`),
      )?.[1];
      if (target) {
        const clean = target.replace(/^\/?xl\//, "").replace(/^\//, "");
        sheetPath = `xl/${clean}`;
      }
    }
  }
  if (!sheetPath || !byName.has(sheetPath)) {
    sheetPath = entries.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))?.name ?? null;
  }
  if (!sheetPath) throw new SpreadsheetError("corrupt", "no worksheet in file");

  // Shared strings: most text cells hold an index into this table, not text.
  let shared: string[] = [];
  const sharedEntry = byName.get("xl/sharedStrings.xml");
  if (sharedEntry) {
    const xml = await readZipEntry(bytes, sharedEntry);
    shared = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]));
  }

  const sheetXml = await readZipEntry(bytes, byName.get(sheetPath)!);
  const grid: Grid = [];

  for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)\/>|<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1] ?? cellMatch[2] ?? "";
      const body = cellMatch[3] ?? "";
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="([^"]+)"/)?.[1] ?? "n";

      let value = "";
      if (type === "s") {
        const idx = Number(body.match(/<v>(\d+)<\/v>/)?.[1] ?? -1);
        value = shared[idx] ?? "";
      } else if (type === "inlineStr") {
        value = textRuns(body);
      } else {
        // "str" (formula result) and numbers both live in <v>. Numbers stay as
        // written: rounding a price here would be a silent edit.
        value = decodeXmlText(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      }

      const at = ref ? columnIndex(ref) : cells.length;
      if (at >= MAX_COLS) continue;
      while (cells.length < at) cells.push("");
      cells[at] = value.trim();
    }
    if (cells.some((c) => c !== "")) grid.push(cells);
    if (grid.length >= MAX_ROWS) break;
  }

  return grid;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export async function readSpreadsheet(filename: string, bytes: Uint8Array): Promise<Grid> {
  if (!bytes.length) throw new SpreadsheetError("empty_file");
  if (bytes.length > MAX_BYTES) throw new SpreadsheetError("too_large");

  const name = filename.toLowerCase();
  // The magic bytes decide, not the extension: a .csv that is really a
  // workbook is a common thing for an agent to send.
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  let grid: Grid;
  if (isZip || name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    if (!isZip) throw new SpreadsheetError("unsupported_format", "not a zip container");
    grid = await parseXlsx(bytes);
  } else if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    grid = parseCsv(new TextDecoder("utf-8").decode(bytes));
  } else if (name.endsWith(".xls")) {
    // The old binary format. Genuinely a different parser, and saying so beats
    // producing nonsense from it.
    throw new SpreadsheetError("unsupported_format", "xls");
  } else {
    throw new SpreadsheetError("unsupported_format", name.split(".").pop() ?? "");
  }

  if (!grid.length) throw new SpreadsheetError("no_rows");
  return grid;
}

/* -------------------------------------------------------------------------- */
/* Working out what the columns mean                                           */
/* -------------------------------------------------------------------------- */

/**
 * Header synonyms, Indonesian first because that is what the files say.
 *
 * Matching is on a normalised header (lowercase, punctuation removed) and the
 * longest synonym wins, so "luas bangunan" is not swallowed by "luas".
 */
const HEADER_SYNONYMS: Record<string, string[]> = {
  title: ["judul", "nama properti", "nama listing", "title", "property name", "listing title", "nama"],
  price: ["harga jual", "harga sewa", "harga", "price", "asking price", "selling price"],
  propertyType: ["tipe properti", "jenis properti", "tipe", "jenis", "property type", "type"],
  listingType: ["status jual sewa", "jual sewa", "listing type", "transaksi", "tipe transaksi"],
  bedrooms: ["kamar tidur", "jumlah kamar tidur", "kamar", "bedrooms", "bedroom", "kt", "beds"],
  bathrooms: ["kamar mandi", "jumlah kamar mandi", "bathrooms", "bathroom", "km", "baths"],
  buildingSize: ["luas bangunan", "building size", "built up", "lb", "luas bangunan m2"],
  landSize: ["luas tanah", "land size", "lt", "luas tanah m2"],
  addressText: ["alamat lengkap", "alamat", "address", "lokasi lengkap", "full address"],
  city: ["kota", "kabupaten", "kota kabupaten", "city", "regency", "kotamadya"],
  province: ["provinsi", "propinsi", "province", "state"],
  description: ["deskripsi", "keterangan", "description", "catatan", "notes", "remarks"],
  currency: ["mata uang", "currency"],
};

const normalise = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

export type ColumnMap = Record<string, number>;

/**
 * Find the header row and map it.
 *
 * The header is not always row 1 — exported files carry a title and a blank
 * line above it — so the first fifteen rows are tried and the one that maps the
 * most fields wins.
 */
export function detectColumns(grid: Grid): { headerRow: number; map: ColumnMap; headers: string[] } {
  let best = { headerRow: -1, map: {} as ColumnMap, headers: [] as string[], score: 0 };

  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const headers = grid[r].map(normalise);
    const map: ColumnMap = {};

    for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
      let bestLen = 0;
      for (let c = 0; c < headers.length; c++) {
        const h = headers[c];
        if (!h) continue;
        for (const syn of synonyms) {
          // Exact match, or the header contains the synonym as whole words.
          const hit = h === syn || new RegExp(`(^| )${syn}( |$)`).test(h);
          if (hit && syn.length > bestLen) { map[field] = c; bestLen = syn.length; }
        }
      }
    }

    const score = Object.keys(map).length;
    if (score > best.score) best = { headerRow: r, map, headers: grid[r], score };
  }

  return { headerRow: best.headerRow, map: best.map, headers: best.headers };
}

/**
 * Indonesian number formats, without guessing.
 *
 * "1.500.000" is one and a half million; "24.20" is twenty-four point two.
 * The separator is decided by what FOLLOWS it — exactly three digits is a
 * thousands group, one or two is a decimal. This rule is here because the IFCA
 * import got it wrong once and stored a size a hundred times too large.
 *
 * "1,2 M" / "850 jt" are the shorthands portals and agents actually write.
 */
export function parseIndonesianNumber(raw: string): number | null {
  if (!raw) return null;
  let s = raw.toLowerCase().replace(/rp\.?|idr|\s/g, "").trim();
  if (!s) return null;

  let multiplier = 1;
  const suffix = s.match(/(m|milyar|miliar|jt|juta|rb|ribu)$/);
  if (suffix) {
    const unit = suffix[1];
    multiplier = unit === "m" || unit.startsWith("mil") ? 1_000_000_000
      : unit === "jt" || unit === "juta" ? 1_000_000
      : 1_000;
    s = s.slice(0, -unit.length);
  }

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const sep = Math.max(lastDot, lastComma);

  if (sep >= 0) {
    const tail = s.slice(sep + 1);
    if (/^\d{3}$/.test(tail) && multiplier === 1) {
      s = s.replace(/[.,]/g, "");                 // thousands group
    } else if (/^\d{1,2}$/.test(tail)) {
      s = s.slice(0, sep).replace(/[.,]/g, "") + "." + tail;   // decimal
    } else {
      s = s.replace(/[.,]/g, "");
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n * multiplier;
}

const PROPERTY_TYPE_WORDS: Record<string, string> = {
  rumah: "rumah", house: "rumah", "landed house": "rumah",
  apartemen: "apartemen", apartment: "apartemen", apartement: "apartemen",
  ruko: "ruko", rukan: "rukan", kondominium: "kondominium", condominium: "kondominium",
  villa: "villa", vila: "villa", kost: "kost", kos: "kost", kontrakan: "kost",
  gudang: "gudang", warehouse: "gudang", pabrik: "pabrik", factory: "pabrik",
  kantor: "kantor", office: "kantor", toko: "toko", shop: "toko",
  hotel: "hotel", tanah: "tanah", land: "tanah", kavling: "kavling", kaveling: "kavling",
};

/** Only a word the sheet actually contains. No inference from anything else. */
export function normalisePropertyType(raw: string): string | undefined {
  const s = normalise(raw);
  if (!s) return undefined;
  for (const [word, value] of Object.entries(PROPERTY_TYPE_WORDS)) {
    if (s === word || new RegExp(`(^| )${word}( |$)`).test(s)) return value;
  }
  return undefined;
}

export function normaliseListingType(raw: string): "sale" | "rent" | undefined {
  const s = normalise(raw);
  if (!s) return undefined;
  if (/(^| )(sewa|rent|rental|disewa|disewakan)( |$)/.test(s)) return "rent";
  if (/(^| )(jual|sale|dijual|sell)( |$)/.test(s)) return "sale";
  return undefined;
}

export type SheetDraft = {
  title?: string;
  price?: number;
  propertyType?: string;
  listingType?: "sale" | "rent";
  bedrooms?: number;
  bathrooms?: number;
  buildingSize?: number;
  landSize?: number;
  addressText?: string;
  city?: string;
  province?: string;
  description?: string;
  currency?: string;
};

/** One sheet row -> a draft. Absent stays absent; nothing is filled in. */
export function rowToDraft(row: string[], map: ColumnMap): SheetDraft {
  const cell = (field: string): string => {
    const idx = map[field];
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  };
  const int = (field: string): number | undefined => {
    const n = parseIndonesianNumber(cell(field));
    return n === null ? undefined : Math.round(n);
  };

  const draft: SheetDraft = {};
  const title = cell("title");
  if (title) draft.title = title.slice(0, 140);

  const price = parseIndonesianNumber(cell("price"));
  if (price !== null && price > 0) draft.price = price;

  const type = normalisePropertyType(cell("propertyType"));
  if (type) draft.propertyType = type;

  const listing = normaliseListingType(cell("listingType")) ?? normaliseListingType(cell("price"));
  if (listing) draft.listingType = listing;

  const beds = int("bedrooms"); if (beds !== undefined) draft.bedrooms = beds;
  const baths = int("bathrooms"); if (baths !== undefined) draft.bathrooms = baths;

  const lb = parseIndonesianNumber(cell("buildingSize"));
  if (lb !== null && lb > 0) draft.buildingSize = lb;
  const lt = parseIndonesianNumber(cell("landSize"));
  if (lt !== null && lt > 0) draft.landSize = lt;

  for (const f of ["addressText", "city", "province", "description", "currency"] as const) {
    const v = cell(f);
    if (v) draft[f] = v.slice(0, f === "description" ? 4000 : 400);
  }
  return draft;
}
