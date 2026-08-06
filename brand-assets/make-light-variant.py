"""Light-background variant: soft charcoal halo behind the mark so the silver
G stays legible on white (spec §70 requires light-bg + dark-bg versions)."""
from PIL import Image, ImageFilter
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

mark = Image.open(os.path.join(OUT, "ag-mark.png")).convert("RGBA")
a = np.asarray(mark)

# Halo: blurred alpha silhouette in charcoal, slightly dilated
alpha = Image.fromarray(a[..., 3], "L").filter(ImageFilter.MaxFilter(7)).filter(
    ImageFilter.GaussianBlur(6)
)
halo = Image.new("RGBA", mark.size, (31, 31, 35, 0))
halo.putalpha(alpha.point(lambda v: int(v * 0.82)))

light = Image.new("RGBA", mark.size, (0, 0, 0, 0))
light.alpha_composite(halo)
light.alpha_composite(mark)
light.save(os.path.join(OUT, "ag-mark-light.png"))

# preview on white
pw = 420
ph = int(pw * light.height / light.width)
tile = Image.new("RGBA", (pw, ph), "#ffffff")
tile.alpha_composite(light.resize((pw, ph), Image.LANCZOS))
tile.convert("RGB").save(os.path.join(OUT, "preview-light-variant.png"))
print("ok")
