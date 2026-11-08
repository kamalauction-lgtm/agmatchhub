import { requireUser } from "@/lib/authz";

/**
 * The template an agent starts from.
 *
 * CSV rather than .xlsx: Excel opens it, Google Sheets opens it, and it needs
 * no writer library in a Worker. The headers are the exact Indonesian ones the
 * detector matches, and the single example row shows the number formats — the
 * fastest way to explain that "1.500.000.000" is understood is to show it.
 */

export const dynamic = "force-dynamic";

const HEADERS = [
  "Judul", "Harga", "Tipe Properti", "Jual/Sewa", "Kamar Tidur", "Kamar Mandi",
  "Luas Bangunan", "Luas Tanah", "Alamat", "Kota", "Provinsi", "Deskripsi",
];

const EXAMPLE = [
  "Rumah minimalis dekat stasiun", "1.500.000.000", "Rumah", "Dijual", "3", "2",
  "120", "150", "Jl. Melati No. 5", "Kabupaten Bekasi", "Jawa Barat",
  "Hadap timur, listrik 2200W",
];

export async function GET() {
  await requireUser();

  const line = (cells: string[]) =>
    cells.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");

  // BOM first: without it Excel on Windows opens a UTF-8 CSV as mojibake, and
  // the agent's first impression of the importer is a broken file.
  const body = "﻿" + [line(HEADERS), line(EXAMPLE)].join("\r\n") + "\r\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="template-listing-propertiguru.csv"',
      "Cache-Control": "no-store",
    },
  });
}
