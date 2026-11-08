/**
 * Collect candidate photographs for imported properties, for human review.
 *
 *   node fetch-media-candidates.mjs [--limit N]
 *
 * Downloads nothing into the platform. It fetches the source pages, picks out
 * plausible property photographs, saves them to ./media-candidates/ and writes
 * a contact sheet at ./media-candidates/review.html.
 *
 * WHY A REVIEW STEP RATHER THAN A DIRECT UPLOAD
 *   Kamal's instruction is that watermarked pictures must not be used.
 *   Watermarks cannot be detected reliably by code — they are semi-transparent
 *   text or a logo composited anywhere in the frame, at any opacity, often over
 *   busy detail. Heuristics catch the obvious ones and quietly pass the rest,
 *   which is the worst outcome: a watermarked competitor image published under
 *   our name because a script "checked".
 *
 *   So the script does what a script is reliable at — fetching, filtering out
 *   assets that are plainly not photographs, deduplicating — and a person does
 *   the part that needs eyes. Tick the ones to keep in review.html; the upload
 *   step reads that back.
 *
 * WHAT IT REJECTS WITHOUT ASKING
 *   · anything under 500x350 — icons, avatars, tracking pixels, badges
 *   · URLs whose path names them as logo/banner/icon/avatar/placeholder/ad
 *   · duplicates, by SHA-256 of the bytes
 *   · non-image responses
 *
 * WHAT IT CANNOT DO
 *   Confirm the photograph is of the right property, or that we hold any right
 *   to republish it. Both are review questions, and the contact sheet shows the
 *   source page against each image so they can be answered.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "media-candidates");
const LIMIT = process.argv.includes("--limit")
  ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10) : Infinity;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const REJECT_PATH = /logo|banner|icon|avatar|placeholder|sprite|watermark|badge|ads?[-_/]|pixel|thumb_small/i;
const MIN_BYTES = 20_000;   // below this it is not a photograph worth showing

const props = JSON.parse(readFileSync(join(HERE, "ifca-normalized.json"), "utf8"));
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

async function get(url, asBuffer = false) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: asBuffer ? "image/*" : "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return asBuffer
    ? { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "" }
    : await res.text();
}

/** Candidate image URLs from a listing page, best-first. */
function extractImageUrls(html, pageUrl) {
  const out = [];
  const push = (u) => {
    if (!u) return;
    try {
      const abs = new URL(u, pageUrl).toString().split("?")[0];
      if (/\.(jpe?g|png|webp)$/i.test(abs) && !REJECT_PATH.test(abs)) out.push(abs);
    } catch { /* malformed src */ }
  };

  // og:image is the page's own choice of hero shot — the most reliable signal
  // that an image belongs to THIS listing rather than a recommendation card.
  for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/<img[^>]+(?:data-src|data-lazy|src)=["']([^"']+)["']/gi)) push(m[1]);
  return [...new Set(out)];
}

/** Dimensions from the file header, so tiny assets are dropped before review. */
function dimensions(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };            // PNG
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {                                  // JPEG
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (buf.length > 30 && buf.toString("ascii", 8, 12) === "WEBP") {
    if (buf.toString("ascii", 12, 16) === "VP8X") {
      return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    }
  }
  return null;
}

const seen = new Set();
const rows = [];
const hostStats = {};

let count = 0;
for (const p of props) {
  if (count >= LIMIT) break;
  for (const u of p.urls) {
    if (count >= LIMIT) break;
    const host = (() => { try { return new URL(u.url).hostname.replace("www.", ""); } catch { return "?"; } })();
    hostStats[host] ??= { pages: 0, blocked: 0, images: 0 };
    hostStats[host].pages++;

    let html;
    try {
      html = await get(u.url);
    } catch (e) {
      hostStats[host].blocked++;
      rows.push({ ref: `${p.source_sheet.includes("PICI") ? "PICI" : "P365"} #${p.source_property_no}`,
                  page: u.url, host, error: e.message });
      continue;
    }

    for (const imgUrl of extractImageUrls(html, u.url).slice(0, 6)) {
      let img;
      try {
        img = await get(imgUrl, true);
      } catch { continue; }
      if (!img.type.startsWith("image/") || img.buf.length < MIN_BYTES) continue;

      const dim = dimensions(img.buf);
      if (dim && (dim.w < 500 || dim.h < 350)) continue;

      const hash = createHash("sha256").update(img.buf).digest("hex");
      if (seen.has(hash)) continue;
      seen.add(hash);

      const ext = img.type.includes("png") ? "png" : img.type.includes("webp") ? "webp" : "jpg";
      const file = `${hash.slice(0, 16)}.${ext}`;
      writeFileSync(join(OUT, file), img.buf);
      hostStats[host].images++;
      count++;

      rows.push({
        ref: `${p.source_sheet.includes("PICI") ? "PICI" : "P365"} #${p.source_property_no}`,
        sheet: p.source_sheet, no: p.source_property_no,
        page: u.url, image: imgUrl, file, hash,
        bytes: img.buf.length, dim: dim ? `${dim.w}x${dim.h}` : "?",
      });
    }
  }
}

writeFileSync(join(OUT, "candidates.json"), JSON.stringify(rows, null, 2));

/* Contact sheet — the whole point is that a person looks at these. */
const usable = rows.filter((r) => r.file);
const html = `<!doctype html><meta charset="utf-8"><title>Media review</title>
<style>
 body{font:14px/1.5 system-ui;margin:24px;background:#fafafa}
 h1{margin:0 0 4px} .note{background:#fff8e1;border:1px solid #ffe082;padding:12px;border-radius:8px;max-width:70ch}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-top:20px}
 .card{background:#fff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden}
 .card img{width:100%;height:200px;object-fit:cover;display:block;background:#eee}
 .meta{padding:10px;font-size:12px} .meta a{color:#0a58ca;word-break:break-all}
 label{display:flex;gap:8px;align-items:center;padding:8px 10px;border-top:1px solid #eee;font-weight:600}
 .ref{font-weight:700}
</style>
<h1>Media review — ${usable.length} candidate image(s)</h1>
<div class="note">
 <b>Tick only the images you want used.</b> Reject anything carrying a watermark,
 anything that is not this property, and anything you are not comfortable
 republishing. Nothing is uploaded until you save this list.
 <br><br>Then run: <code>node upload-media.mjs --approved approved.json</code>
</div>
<div class="grid">
${usable.map((r, i) => `<div class="card">
  <img src="${r.file}" loading="lazy">
  <div class="meta">
    <div class="ref">${r.ref}</div>
    <div>${r.dim} · ${Math.round(r.bytes / 1024)} KB</div>
    <div><a href="${r.page}" target="_blank" rel="noopener">source page</a></div>
  </div>
  <label><input type="checkbox" class="pick" data-i="${i}"> use this image</label>
</div>`).join("\n")}
</div>
<p><button onclick="save()">Save selection to approved.json</button></p>
<script>
const rows = ${JSON.stringify(usable)};
function save(){
  const picked = [...document.querySelectorAll('.pick:checked')].map(c => rows[+c.dataset.i]);
  const blob = new Blob([JSON.stringify(picked, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'approved.json'; a.click();
}
</script>`;
writeFileSync(join(OUT, "review.html"), html);

console.log(`\ncandidate images saved: ${usable.length}`);
console.table(hostStats);
console.log(`\nreview them:  ${join(OUT, "review.html")}`);
console.log("Tick the ones to keep, save approved.json, then run upload-media.mjs.\n");
