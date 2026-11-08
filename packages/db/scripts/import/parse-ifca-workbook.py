"""
Parse the IFCA property workbook into a normalized dataset.

    python parse-ifca-workbook.py <workbook.xlsx> [-o out.json]

The workbook is the SOURCE OF TRUTH. This script only reshapes — it never
infers, rounds, converts or fills a missing value. Anything absent stays None
and is reported as missing rather than guessed at.

STRUCTURE
    A property is a BLOCK of rows, not a row. The block starts where column A
    holds a number and runs to the row before the next number. Fields float
    within the block — property 1 carries its address on the second row,
    property 3 on the first — so nothing is read at a fixed offset. Each column
    has a meaning, and the block is scanned for it.

    The two sheets do NOT share a layout:

      P365   I = market value   J = fair value   K = remark/URL   L = URL type
      PICI   I = market value   J = remark/URL   (no fair value, no URL type)

PRICE SEPARATION (§5 of the brief)
    Column I mixes the sale figure and the rental figure, told apart only by a
    trailing "(For Sell)" or "(Rental)" — and PICI marks neither. So:

      · "(For Sell)"          -> marketing_price, publishable
      · "(Rental)" / "rent"   -> rental_reference, never a sale price
      · anything else         -> captured verbatim, flagged
                                 REQUIRES_PRICE_REVIEW, NOT published

    purchase_price (G) and fair_value (J) are internal accounting figures and
    are never treated as a customer-facing price.
"""
import json
import re
import sys
from datetime import date, datetime

import openpyxl

# Column meanings per sheet. Anything not listed is ignored rather than guessed.
LAYOUTS = {
    "Property List P365": {
        "company": "PT IFCA Property365 Indonesia",
        "cols": {
            "no": "A", "type_and_text": "B", "address": "C", "tenure": "D",
            "condition": "E", "sp_date": "F", "purchase_price": "G",
            "maintenance_fee": "H", "market_value": "I", "fair_value": "J",
            "remark_or_url": "K", "url_kind": "L",
        },
    },
    "Property List PICI": {
        "company": "PT IFCA Consulting Indonesia",
        "cols": {
            "no": "A", "type_and_text": "B", "address": "C", "tenure": "D",
            "condition": "E", "sp_date": "F", "purchase_price": "G",
            "maintenance_fee": "H", "market_value": "I",
            "remark_or_url": "J",
        },
    },
}

COL = {c: i + 1 for i, c in enumerate("ABCDEFGHIJKLM")}
URL_RE = re.compile(r"(https?://\S+|www\.\S+|[a-z0-9-]+\.(?:com|co|id|co\.id)/\S+)", re.I)
MONEY_RE = re.compile(r"Rp\.?\s*([\d.,]+)", re.I)


def clean(v):
    """Trim, collapse newlines, drop the mojibake bullets the file is full of."""
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.date().isoformat() if isinstance(v, datetime) else v.isoformat()
    s = str(v).replace("�", " ").replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def parse_money(text):
    """
    'Rp 400.000.000 as at April 2026 (For Sell)' -> 400000000

    Indonesian formatting: dot groups thousands, comma is the decimal. Returns
    None rather than a guess if the number cannot be read cleanly.
    """
    if text is None:
        return None
    m = MONEY_RE.search(str(text))
    if not m:
        return None
    raw = m.group(1).rstrip(".,")
    # Strip thousands dots; a trailing ",xx" would be decimals (not seen here).
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = raw.replace(".", "")
    try:
        val = float(raw)
    except ValueError:
        return None
    return int(val) if val.is_integer() else val


def parse_number(text):
    """
    A bare figure, as the purchase and maintenance columns hold it.

    parse_money() only matches an "Rp ..." prefix, which these cells do not
    have — every purchase price came back None until this existed. Values are
    read as written; nothing is rounded.
    """
    if text is None:
        return None
    s = str(text).strip()
    if s.upper() in ("N/A", "NA", "NONE", "-"):
        return None
    money = parse_money(s)
    if money is not None:
        return money
    s2 = re.sub(r"[^\d.,-]", "", s)
    if not s2:
        return None
    if "," in s2 and "." in s2:
        s2 = s2.replace(".", "").replace(",", ".")
    elif s2.count(".") > 1:
        s2 = s2.replace(".", "")
    try:
        val = float(s2)
    except ValueError:
        return None
    return int(val) if val.is_integer() else val


def classify_value(text):
    """Which bucket a column-I figure belongs in. Never assume 'for sale'."""
    if text is None:
        return None
    t = str(text).lower()
    if "for sell" in t or "for sale" in t:
        return "sale"
    if "rental" in t or "rent " in t or "/year" in t or "per month" in t or "/month" in t:
        return "rental"
    return "unclear"


def parse_sheet(ws, sheet_name):
    layout = LAYOUTS[sheet_name]
    cols = layout["cols"]

    # Property boundaries: a number in column A opens a new block.
    starts = []
    for r in range(1, ws.max_row + 1):
        v = ws.cell(r, COL[cols["no"]]).value
        if isinstance(v, (int, float)) and float(v).is_integer() and v > 0:
            starts.append((r, int(v)))

    properties = []
    for i, (row, number) in enumerate(starts):
        end = starts[i + 1][0] - 1 if i + 1 < len(starts) else ws.max_row

        def col_values(key):
            """Every non-empty value in this column within the block, in order."""
            if key not in cols:
                return []
            c = COL[cols[key]]
            out = []
            for r in range(row, end + 1):
                v = clean(ws.cell(r, c).value)
                if v is not None:
                    out.append((r, v))
            return out

        b_values = col_values("type_and_text")
        # Column B carries, in order: the property type (on the number row),
        # then owner/development, then unit details, then the IFCA company.
        prop_type = None
        text_lines = []
        source_company = None
        for r, v in b_values:
            if r == row and prop_type is None:
                prop_type = v
                continue
            if v.upper().startswith("PT IFCA"):
                source_company = v
                continue
            text_lines.append(v)

        market_entries = []
        for _, v in col_values("market_value"):
            market_entries.append({"raw": v, "kind": classify_value(v), "amount": parse_money(v)})

        # Column K/J mixes URLs and free-text remarks. Split rather than merge.
        urls, remarks = [], []
        kinds = {r: v for r, v in col_values("url_kind")}
        for r, v in col_values("remark_or_url"):
            found = URL_RE.findall(v)
            if found:
                for u in found:
                    urls.append({
                        "url": u if u.startswith("http") else "https://" + u,
                        "label": kinds.get(r),
                        "row": r,
                    })
            else:
                remarks.append(v)

        first = lambda key: (col_values(key)[0][1] if col_values(key) else None)

        properties.append({
            "source_sheet": sheet_name,
            "source_company": layout["company"],
            "source_property_no": number,
            "source_rows": [row, end],
            "property_type_raw": prop_type,
            "text_lines": text_lines,          # owner / development / unit detail, verbatim
            "address_raw": first("address"),
            "tenure_raw": first("tenure"),
            "condition_raw": first("condition"),
            "sp_date": first("sp_date"),
            "purchase_price": parse_number(first("purchase_price")),
            "purchase_price_raw": first("purchase_price"),
            "maintenance_fee": parse_number(first("maintenance_fee")),
            "maintenance_fee_raw": first("maintenance_fee"),
            "fair_value": parse_number(first("fair_value")),
            "fair_value_raw": first("fair_value"),
            "market_entries": market_entries,
            "urls": urls,
            "remarks": remarks,
        })
    return properties


def main():
    path = sys.argv[1]
    out_path = None
    if "-o" in sys.argv:
        out_path = sys.argv[sys.argv.index("-o") + 1]

    wb = openpyxl.load_workbook(path, data_only=True)
    all_props = []
    for name in wb.sheetnames:
        if name in LAYOUTS:
            props = parse_sheet(wb[name], name)
            print(f"{name}: {len(props)} properties (rows {props[0]['source_rows'][0]}–{props[-1]['source_rows'][1]})")
            all_props.extend(props)

    # Numeric fields arrive as floats from openpyxl; keep integers looking integral.
    for p in all_props:
        for k in ("purchase_price",):
            if isinstance(p[k], float) and p[k].is_integer():
                p[k] = int(p[k])

    print(f"\nTOTAL: {len(all_props)} properties")

    sale = sum(1 for p in all_props if any(m["kind"] == "sale" for m in p["market_entries"]))
    rental = sum(1 for p in all_props if any(m["kind"] == "rental" for m in p["market_entries"]))
    unclear = sum(1 for p in all_props if any(m["kind"] == "unclear" for m in p["market_entries"]))
    none_val = sum(1 for p in all_props if not p["market_entries"])
    print(f"  with an explicit (For Sell) figure : {sale}")
    print(f"  with a rental figure               : {rental}")
    print(f"  with an UNCLEAR figure             : {unclear}")
    print(f"  with no market value at all        : {none_val}")
    print(f"  with at least one URL              : {sum(1 for p in all_props if p['urls'])}")
    print(f"  total URLs                         : {sum(len(p['urls']) for p in all_props)}")
    print(f"  with remarks                       : {sum(1 for p in all_props if p['remarks'])}")

    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(all_props, f, ensure_ascii=False, indent=2)
        print(f"\nwritten: {out_path}")


if __name__ == "__main__":
    main()
