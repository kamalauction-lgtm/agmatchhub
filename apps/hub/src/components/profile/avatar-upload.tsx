"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALPHA_THRESHOLD, cropRect, scaleBox, scanAlphaBox, type Box, type CropMode,
} from "@/lib/profile/avatar-crop";

/**
 * Profile photo upload that crops to the person before it uploads.
 *
 * WHY THIS EXISTS. Agent photos are overwhelmingly full-length studio shots on
 * a transparent background, with the subject standing off to one side. Kamal's
 * is 1024×1536 with the subject occupying x 392–1024 — 392 columns of empty
 * transparency down the left. Rendered into a 96px circle with a centre crop,
 * the result is half empty space and a body sliced off at the edge. No amount
 * of `object-position` fixes that, because CSS cannot know where the person is.
 *
 * The alpha channel does know. Cut-outs carry an exact silhouette, so the
 * subject's bounding box is a measurement rather than a guess, and the head is
 * reliably at the top of it.
 *
 * DONE IN THE BROWSER, deliberately:
 *   · a Worker image library would cost bundle size and CPU on every upload
 *   · canvas is already there, and the agent gets to SEE the crop before
 *     committing to it — a heuristic somebody can check beats one they cannot
 *   · re-encoding strips EXIF, so the GPS coordinates phones bury in photos
 *     never reach a public bucket. That leak was noted in the listing upload
 *     and this closes it for profile photos.
 *   · the upload shrinks from megabytes to a few hundred kilobytes
 *
 * If anything here throws, the ORIGINAL file is left on the input and uploads
 * unchanged. A failed nicety must never cost the agent their photo.
 */

const OUTPUT_SIZE = 512;
/** Scan at reduced resolution; the box only needs to be roughly right. */
const SCAN_MAX = 900;


/** Rasterise, read the alpha channel, and hand the numbers to the tested lib. */
function subjectBox(img: HTMLImageElement): { box: Box; hasAlpha: boolean } {
  const scale = Math.min(1, SCAN_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0, w, h);

  const found = scanAlphaBox(ctx.getImageData(0, 0, w, h).data, w, h, ALPHA_THRESHOLD);
  if (!found) {
    return {
      box: { x0: 0, y0: 0, x1: img.naturalWidth, y1: img.naturalHeight },
      hasAlpha: false,
    };
  }
  return { box: scaleBox(found, 1 / scale), hasAlpha: true };
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
  } finally {
    // Revoked after decode; the bitmap is already in memory.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function AvatarUpload({
  currentPhotoUrl,
  labels,
}: {
  currentPhotoUrl: string | null;
  labels: {
    photo: string;
    hint: string;
    choose: string;
    change: string;
    modeHead: string;
    modeFull: string;
    nudge: string;
    autoCropped: string;
    cropFailed: string;
  };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [original, setOriginal] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<CropMode>("head");
  const [nudge, setNudge] = useState(0);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Re-crop and put the result on the real file input. */
  const render = useCallback(async (file: File, m: CropMode, n: number) => {
    setBusy(true);
    try {
      const img = await loadImage(file);
      const { box, hasAlpha } = subjectBox(img);
      const { x, y, side } = cropRect(img.naturalWidth, img.naturalHeight, box, m, n);

      const out = document.createElement("canvas");
      out.width = OUTPUT_SIZE;
      out.height = OUTPUT_SIZE;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      /* Scale the WHOLE image and position it so the crop window lands on the
         canvas, rather than passing a source rectangle. In "full" mode that
         window deliberately extends past the edge of the photo, and a source
         rectangle outside the image is the one case browsers disagree about —
         this way the margin is simply canvas that never gets drawn on. */
      const k = OUTPUT_SIZE / side;
      ctx.drawImage(img, -x * k, -y * k, img.naturalWidth * k, img.naturalHeight * k);

      // Keep transparency for cut-outs — the card's background shows through
      // and looks better than a white square. Photographs go to JPEG, which is
      // far smaller for the same quality.
      const type = hasAlpha ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob | null>((res) =>
        out.toBlob(res, type, type === "image/jpeg" ? 0.9 : undefined),
      );
      if (!blob) throw new Error("encode failed");

      const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".jpg");
      const cropped = new File([blob], name, { type });

      const dt = new DataTransfer();
      dt.items.add(cropped);
      if (inputRef.current) inputRef.current.files = dt.files;

      setPreview(URL.createObjectURL(cropped));
      setFailed(false);
    } catch {
      // Leave whatever the user picked on the input, untouched.
      setFailed(true);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }, []);

  /* Cropping is driven from the controls, not from an effect. An effect that
     calls setState on every render of its deps is a cascading render, and the
     work here is a direct consequence of a click — which is exactly what an
     event handler is for. */
  const recrop = useCallback((m: CropMode, n: number) => {
    if (!original) return;
    if (timer.current) clearTimeout(timer.current);
    // The slider fires continuously while dragging; a short debounce keeps it
    // to one crop per gesture rather than one per pixel.
    timer.current = setTimeout(() => void render(original, m, n), 120);
  }, [original, render]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const shown = preview ?? currentPhotoUrl;

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-line bg-surface">
        {shown ? (
          /* A blob: URL for the live crop preview — there is no remote host
             for next/image to optimise, and it changes on every slider move. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <span className="grid h-full w-full place-items-center text-xs text-muted">—</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span className="mb-1 block text-sm font-medium">{labels.photo}</span>

        {/* The real field. Kept in the DOM so the server action is unchanged —
            what changes is the File sitting on it. */}
        <input
          ref={inputRef}
          type="file"
          name="photo"
          accept=".jpg,.jpeg,.png,.webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setOriginal(f);
            setNudge(0);
            setMode("head");
            if (f) void render(f, "head", 0);
            else setPreview(null);
          }}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line px-4 text-sm font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
        >
          {original ? labels.change : labels.choose}
        </button>

        <p className="mt-1 text-xs text-muted">{labels.hint}</p>

        {original && !failed && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-xs">
              {(["head", "full"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); recrop(m, nudge); }}
                  aria-pressed={mode === m}
                  className={`min-h-9 flex-1 cursor-pointer rounded-md px-3 font-semibold transition-colors duration-200 ${
                    mode === m ? "bg-crimson text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  {m === "head" ? labels.modeHead : labels.modeFull}
                </button>
              ))}
            </div>

            <label className="block text-xs text-muted">
              {labels.nudge}
              <input
                type="range"
                min={-1}
                max={1}
                step={0.1}
                value={nudge}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setNudge(n);
                  recrop(mode, n);
                }}
                className="mt-1 w-full accent-crimson"
              />
            </label>

            <p className="text-xs text-muted">{busy ? "…" : labels.autoCropped}</p>
          </div>
        )}

        {failed && <p className="mt-2 text-xs text-warning">{labels.cropFailed}</p>}
      </div>
    </div>
  );
}
