#!/usr/bin/env python3
"""Build SAVO's icon set from one source image.

    python3 scripts/icons-from-image.py path/to/source.jpg

Writes public/app-icon.png (1024), icon-512.png, icon-192.png,
apple-touch-icon.png (180, opaque) and favicon.ico (48/32/16).

The source is used as-is: no redrawing. It is squared up, cleared of a flat
white surround if it has one, and scaled. Run it from the project root.
"""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageOps

PUBLIC = Path(__file__).resolve().parent.parent / "public"
SIZES = {"app-icon.png": 1024, "icon-512.png": 512, "icon-192.png": 192}


def load_square(path: Path) -> Image.Image:
    """Open the source, honour its EXIF rotation, and make it square."""
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGBA")
    w, h = img.size
    side = min(w, h)
    # Centre crop: an icon is a square's worth of the picture, and the corners
    # the source loses are almost always empty surround.
    left, top = (w - side) // 2, (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def drop_white_surround(img: Image.Image, tolerance: int = 26) -> Image.Image:
    """Make a flat pale border transparent, so the tile's own corners show.

    Flood-fills inward from the four corners only, so white *inside* the
    artwork (a receipt, a price tag) is left alone.
    """
    img = img.copy()
    px = img.load()
    w, h = img.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    base = [px[x, y] for x, y in seeds]

    def matches(c: tuple[int, int, int, int]) -> bool:
        if c[3] == 0:
            return True
        return all(
            abs(c[0] - b[0]) <= tolerance and abs(c[1] - b[1]) <= tolerance
            and abs(c[2] - b[2]) <= tolerance
            for b in base
        )

    seen = bytearray(w * h)
    queue = deque(seeds)
    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        c = px[x, y]
        if not matches(c):
            continue
        if c[0] > 244 and c[1] > 244 and c[2] > 244:
            px[x, y] = (c[0], c[1], c[2], 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[2].strip())
        return 2

    src = Path(sys.argv[1])
    if not src.exists():
        print(f"No such file: {src}")
        return 1

    icon = drop_white_surround(load_square(src))
    PUBLIC.mkdir(parents=True, exist_ok=True)

    for name, size in SIZES.items():
        icon.resize((size, size), Image.LANCZOS).save(PUBLIC / name, optimize=True)

    # Home-screen icons must be opaque: iOS composites transparency onto black.
    apple = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
    apple.alpha_composite(icon.resize((180, 180), Image.LANCZOS))
    apple.convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)

    icon.save(
        PUBLIC / "favicon.ico",
        sizes=[(48, 48), (32, 32), (16, 16)],
    )

    written = ["app-icon.png", "apple-touch-icon.png", "favicon.ico", "icon-192.png", "icon-512.png"]
    print("Icons written from " + src.name + ": " + ", ".join(sorted(written)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
