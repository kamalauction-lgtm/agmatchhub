"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Story/feed poster for one listing (module design §3.3): the cover photo with
 * price, location, specs and the agent's name drawn over it. 1080×1080 for
 * feed, 1080×1920 for story.
 *
 * Rendered on a client canvas, following the win-poster precedent: no server
 * rendering pipeline, no wasm, works offline once the photo is loaded. The
 * accent colour is read from the theme's CSS variable at draw time — nothing
 * hard-coded (hub rule 6).
 *
 * Same fact discipline as the text tabs: everything drawn comes from the
 * listing row. A listing without a cover photo still gets a clean text-only
 * poster rather than a broken image.
 */

export type PosterData = {
  imageUrl: string | null;
  /** DIJUAL / DISEWAKAN (or FOR SALE / FOR RENT for en listings). */
  badge: string;
  price: string;
  title: string;
  place: string;
  specs: string;
  agentName: string;
  /** Download filename base — the listing's human-readable id. */
  fileBase: string;
};

export type PosterLabels = {
  presetFeed: string;
  presetStory: string;
  download: string;
  shareImage: string;
  noCoverNote: string;
  exportFailed: string;
  styleDark: string;
  styleLight: string;
  styleBand: string;
};

/** Poster Designer templates (00098): the classic dark gradient, a light card, an accent band. */
type Style = "dark" | "light" | "band";

type Preset = "feed" | "story";
const SIZES: Record<Preset, { w: number; h: number }> = {
  feed: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
};

function accentColor(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--crimson").trim();
  return v || "#b11226";
}

/** Cover-crop an image onto the full canvas, centre-weighted. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Greedy word wrap, capped at maxLines with an ellipsis on the last line. */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.replace(/\s*\S+$/, "");
    }
    const rest = words.join(" ");
    if (ctx.measureText(rest).width > maxWidth * maxLines) lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export function PosterCanvas({ data, labels }: { data: PosterData; labels: PosterLabels }) {
  const [preset, setPreset] = useState<Preset>("feed");
  const [style, setStyle] = useState<Style>("dark");
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const draw = useCallback(
    (img: HTMLImageElement | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { w, h } = SIZES[preset];
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const accent = accentColor();
      const margin = 64;
      // Story posters leave room for Instagram's UI at both ends.
      const topSafe = preset === "story" ? 180 : margin;
      const bottomSafe = preset === "story" ? 220 : margin;

      if (style === "light") {
        // Photo on the upper two thirds, a white card with dark text below.
        const cardTop = Math.round(h * 0.62);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, w, cardTop); ctx.clip();
        ctx.fillStyle = "#e9e9ee"; ctx.fillRect(0, 0, w, cardTop);
        if (img) drawCover(ctx, img, w, cardTop);
        ctx.restore();
        ctx.font = `700 34px ${FONT}`;
        const bt = data.badge.toUpperCase();
        const bw = ctx.measureText(bt).width + 48;
        ctx.fillStyle = accent; roundRect(ctx, margin, topSafe, bw, 64, 14); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.textBaseline = "middle"; ctx.fillText(bt, margin + 24, topSafe + 34);
        ctx.textBaseline = "alphabetic";
        const maxWidth = w - margin * 2;
        let y = cardTop + 96;
        if (data.price) { ctx.font = `800 72px ${FONT}`; ctx.fillStyle = accent; ctx.fillText(data.price, margin, y); y += 72; }
        ctx.font = `600 42px ${FONT}`; ctx.fillStyle = "#15151a";
        for (const line of wrapLines(ctx, data.title, maxWidth, 2)) { ctx.fillText(line, margin, y); y += 54; }
        y += 8;
        if (data.specs) { ctx.font = `500 32px ${FONT}`; ctx.fillStyle = "#4a4a55"; ctx.fillText(data.specs, margin, y); y += 50; }
        if (data.place) { ctx.font = `500 32px ${FONT}`; ctx.fillStyle = "#4a4a55"; ctx.fillText(`📍 ${data.place}`, margin, y); y += 50; }
        if (data.agentName) { ctx.font = `500 28px ${FONT}`; ctx.fillStyle = "#6a6a75"; ctx.fillText(data.agentName, margin, Math.min(y + 10, h - bottomSafe)); }
        return;
      }

      // Backdrop — also the whole design when there is no photo.
      ctx.fillStyle = "#101014";
      ctx.fillRect(0, 0, w, h);
      if (img) drawCover(ctx, img, w, h);

      if (style === "band") {
        // An accent band across the top carries the badge and the price.
        const bandH = 190;
        ctx.fillStyle = accent; ctx.fillRect(0, topSafe - 24, w, bandH);
        ctx.fillStyle = "#ffffff"; ctx.textBaseline = "middle";
        ctx.font = `700 34px ${FONT}`; ctx.fillText(data.badge.toUpperCase(), margin, topSafe + 30);
        if (data.price) { ctx.font = `800 70px ${FONT}`; ctx.fillText(data.price, margin, topSafe + 108); }
        ctx.textBaseline = "alphabetic";
      }

      // Legibility gradient over the lower part.
      const grad = ctx.createLinearGradient(0, h * 0.42, 0, h);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.9)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Listing-type badge, top-left (the band style already carries it).
      if (style === "dark") {
        ctx.font = `700 34px ${FONT}`;
        const badgeText = data.badge.toUpperCase();
        const bw = ctx.measureText(badgeText).width + 48;
        ctx.fillStyle = accent;
        roundRect(ctx, margin, topSafe, bw, 64, 14);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, margin + 24, topSafe + 34);
      }

      // Facts stack, drawn bottom-up so spacing stays right on both presets.
      ctx.textBaseline = "alphabetic";
      let y = h - bottomSafe;
      const maxWidth = w - margin * 2;

      if (data.agentName) {
        ctx.font = `500 30px ${FONT}`;
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(data.agentName, margin, y);
        y -= 52;
      }

      if (data.place) {
        ctx.font = `500 34px ${FONT}`;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(`📍 ${data.place}`, margin, y);
        y -= 56;
      }

      if (data.specs) {
        ctx.font = `500 32px ${FONT}`;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText(data.specs, margin, y);
        y -= 60;
      }

      ctx.font = `600 44px ${FONT}`;
      ctx.fillStyle = "#ffffff";
      const titleLines = wrapLines(ctx, data.title, maxWidth, 2);
      for (let i = titleLines.length - 1; i >= 0; i--) {
        ctx.fillText(titleLines[i], margin, y);
        y -= 56;
      }
      y -= 14;

      if (data.price && style === "dark") {
        ctx.font = `800 76px ${FONT}`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(data.price, margin, y);
      }
    },
    [preset, style, data]
  );

  useEffect(() => {
    if (!data.imageUrl) {
      imgRef.current = null;
      draw(null);
      return;
    }
    const img = new Image();
    // Supabase public storage sends CORS headers, so the canvas stays
    // exportable. If the photo fails, draw the text-only version instead.
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      draw(img);
    };
    img.onerror = () => {
      imgRef.current = null;
      draw(null);
    };
    img.src = data.imageUrl;
  }, [data.imageUrl, draw]);

  useEffect(() => {
    draw(imgRef.current);
  }, [preset, style, draw]);

  async function toBlob(): Promise<Blob | null> {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  async function download() {
    setFailed(false);
    try {
      const blob = await toBlob();
      if (!blob) throw new Error("no blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.fileBase}-${preset}-${style}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    }
  }

  async function share() {
    try {
      const blob = await toBlob();
      if (!blob) throw new Error("no blob");
      const file = new File([blob], `${data.fileBase}-${preset}-${style}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        await download();
      }
    } catch {
      /* user closed the sheet, or export failed — download() already flags it */
    }
  }

  const presetBtn = (key: Preset, label: string) => (
    <button
      type="button"
      onClick={() => setPreset(key)}
      aria-pressed={preset === key}
      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
        preset === key ? "bg-crimson text-white" : "border border-line hover:bg-surface"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {presetBtn("feed", labels.presetFeed)}
        {presetBtn("story", labels.presetStory)}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["dark", "light", "band"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStyle(s)} aria-pressed={style === s}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${style === s ? "bg-indigo text-white" : "border border-line hover:bg-surface"}`}>
            {s === "dark" ? labels.styleDark : s === "light" ? labels.styleLight : labels.styleBand}
          </button>
        ))}
      </div>

      {!data.imageUrl && (
        <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          {labels.noCoverNote}
        </p>
      )}

      <canvas
        ref={canvasRef}
        className="mt-3 w-full max-w-sm rounded-xl border border-line"
        aria-label={data.title}
      />

      {failed && (
        <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
          {labels.exportFailed}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={download}
          className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
        >
          {labels.download}
        </button>
        <button
          type="button"
          onClick={share}
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface"
        >
          {labels.shareImage}
        </button>
      </div>
    </div>
  );
}
