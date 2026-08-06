"""Extract the AG monogram from the dark banner and build app icon assets.

Technique: the banner is metallic artwork on near-black, so we recover alpha by
"unmultiplying from black": alpha = max(R,G,B), colour = colour / alpha. A soft
threshold suppresses the faint globe/swirl background around the letters.
Originals are kept untouched in source/ (spec: never destroy source assets).
"""
from PIL import Image
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source", "banner-dark-v1.png")
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGB")

# --- 1. Crop the AG monogram region (letters only, generous margins) ---
crop = im.crop((640, 40, 1370, 540))
a = np.asarray(crop).astype(np.float32)

# --- 2. Alpha from luminance-max, with soft threshold to drop faint bg art ---
alpha = a.max(axis=2)
LOW, HIGH = 70.0, 200.0          # below LOW -> transparent, above HIGH -> opaque
alpha_soft = np.clip((alpha - LOW) / (HIGH - LOW), 0, 1) ** 0.8 * 255

# --- 3. Un-premultiply colour so edges stay clean on light backgrounds ---
safe = np.maximum(alpha[..., None], 1.0)
rgb = np.clip(a * 255.0 / safe, 0, 255)

rgba = np.dstack([rgb, alpha_soft]).astype(np.uint8)
mark = Image.fromarray(rgba, "RGBA")

# --- 4. Trim to content bounding box with padding ---
bbox = Image.fromarray((alpha_soft > 8).astype(np.uint8) * 255, "L").getbbox()
pad = 20
l, t, r, b = bbox
mark = mark.crop((max(0, l - pad), max(0, t - pad),
                  min(mark.width, r + pad), min(mark.height, b + pad)))
mark.save(os.path.join(OUT, "ag-mark.png"))
print("ag-mark:", mark.size)

# --- 5. Preview strip: white / silver / charcoal backgrounds ---
pw = 360
ph = int(pw * mark.height / mark.width)
small = mark.resize((pw, ph), Image.LANCZOS)
prev = Image.new("RGB", (pw * 3 + 40, ph + 20), "#ffffff")
for i, bg in enumerate(["#ffffff", "#C0C0C0", "#1F1F1F"]):
    tile = Image.new("RGBA", (pw, ph), bg)
    tile.alpha_composite(small)
    prev.paste(tile.convert("RGB"), (i * (pw + 20), 10))
prev.save(os.path.join(OUT, "preview-backgrounds.png"))

# --- 6. Icon tiles: charcoal rounded square, mark centred ---
def tile(size: int, radius_frac=0.18) -> Image.Image:
    t = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    from PIL import ImageDraw
    d = ImageDraw.Draw(t)
    d.rounded_rectangle([0, 0, size - 1, size - 1], int(size * radius_frac), fill="#1F1F1F")
    m = mark.copy()
    m.thumbnail((int(size * 0.78), int(size * 0.62)), Image.LANCZOS)
    t.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return t

for s, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-icon.png")]:
    tile(s).save(os.path.join(OUT, name))

# favicon.ico (square, no rounding needed at tiny sizes)
tile(64, 0.12).save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])

# --- 7. Optimised banner for web use ---
banner = im.resize((1536, 1024), Image.LANCZOS)
banner.save(os.path.join(OUT, "banner-dark-v1.webp"), quality=82, method=6)
print("done:", sorted(os.listdir(OUT)))
