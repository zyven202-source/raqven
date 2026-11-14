#!/usr/bin/env python3
"""Build SAVO's icon set from one source image.

    python3 scripts/icons-from-image.py path/to/source.jpg

Writes public/app-icon.png (1024), icon-512.png, icon-192.png,
apple-touch-icon.png (180, opaque) and favicon.ico (48/32/16).

The source is used as-is — never redrawn. The photo's white page and grey cast
shadow are removed by a colour matte (they have no chroma; the green tile and
its mint inlay do), then the tile is centred, squared and scaled down.
Run it from the project root.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageOps

PUBLIC = Path(__file__).resolve().parent.parent / "public"
SIZES = {"app-icon.png": 1024, "icon-512.png": 512, "icon-192.png": 192}

# Chroma below FLOOR is paper or shadow (transparent); above CEIL it is the
# artwork. The ramp in between keeps the tile's anti-aliased edge smooth
# instead of stair-stepping it.
CHROMA_FLOOR = 9
CHROMA_CEIL = 30


def matte(img: Image.Image) -> Image.Image:
    """Give every pixel alpha from its colourfulness, keeping its own RGB."""
    px = img.load()
    w, h = img.size
    span = CHROMA_CEIL - CHROMA_FLOOR
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            c = max(r, g, b) - min(r, g, b)
            a = 0 if c <= CHROMA_FLOOR else min(255, int((c - CHROMA_FLOOR) * 255 / span))
            px[x, y] = (r, g, b, a)
    return img


def tint_fringe(img: Image.Image) -> Image.Image:
    """Pull the edge's colour towards the tile, so a matte never reads white.

    A shadow pixel keeps its near-white RGB but only a sliver of alpha, which
    on a dark ground shows as a pale hairline. Blending those pixels towards
    the dominant tile colour makes the fade invisible instead.
    """
    px = img.load()
    w, h = img.size
    opaque, total = [0, 0, 0], 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b, a = px[x, y]
            if a > 200:
                opaque[0] += r
                opaque[1] += g
                opaque[2] += b
                total += 1
    if not total:
        return img
    dom = [c / total for c in opaque]

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 250:
                f = 1 - a / 250
                r = int(r * (1 - f) + dom[0] * f)
                g = int(g * (1 - f) + dom[1] * f)
                b = int(b * (1 - f) + dom[2] * f)
                px[x, y] = (r, g, b, a)
    return img


def centre_and_square(img: Image.Image) -> Image.Image:
    """Crop to the matted artwork and place it, centred, on a square canvas."""
    box = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box is None:
        box = (0, 0, *img.size)

    art = img.crop(box)
    w, h = art.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(art, ((side - w) // 2, (side - h) // 2))
    return canvas


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[2].strip())
        return 2

    src = Path(sys.argv[1])
    if not src.exists():
        print(f"No such file: {src}")
        return 1

    raw = ImageOps.exif_transpose(Image.open(src)).convert("RGBA")
    icon = centre_and_square(tint_fringe(matte(raw)))
    PUBLIC.mkdir(parents=True, exist_ok=True)

    for name, size in SIZES.items():
        icon.resize((size, size), Image.LANCZOS).save(PUBLIC / name, optimize=True)

    # Home-screen icons must be opaque: iOS composites transparency onto black.
    apple = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
    apple.alpha_composite(icon.resize((180, 180), Image.LANCZOS))
    apple.convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)

    icon.save(PUBLIC / "favicon.ico", sizes=[(48, 48), (32, 32), (16, 16)])

    names = sorted([*SIZES, "apple-touch-icon.png", "favicon.ico"])
    print(f"Icons written from {src.name}: " + ", ".join(names))
    print(f"Tile cropped from {raw.size[0]}x{raw.size[1]} to {icon.size[0]}px square.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
