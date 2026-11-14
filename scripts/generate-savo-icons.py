#!/usr/bin/env python3
"""Render SAVO's icon set.

The artwork is the supplied app icon: a forest-green rounded tile carrying a
mint receipt above a small shop shelf with the SAVO wordmark on it, and a
drawer below. It is drawn here as shapes rather than shipped as one bitmap so
the 16-pixel favicon can drop the finest lines instead of turning to mud.

Outputs, all in public/:
  app-icon.png        1024 px master (stores, marketing)
  icon-512.png        512 px, PWA + Open Graph
  icon-192.png        192 px, home screen
  apple-touch-icon.png 180 px, opaque (iOS masks the corners itself)
  favicon.ico         16/32/48 px, flat

Run:  python3 scripts/generate-savo-icons.py
"""
from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public"
S = 1024  # master size

GREEN_TILE = (30, 107, 71)
GREEN_TILE_DARK = (21, 83, 55)
GREEN_INK = (27, 94, 63)
GREEN_DRAWER = (44, 126, 88)
MINT = (191, 227, 203)
MINT_LINE = (46, 125, 87)

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    # Pillow bundles a scalable face, so the wordmark is never the 10px
    # bitmap default. It needs the size passed in to scale.
    return ImageFont.load_default(size=size)


def draw_icon(size: int, detail: bool = True, opaque: bool = False) -> Image.Image:
    """Draw at master resolution, then downsample, so edges stay clean."""
    img = Image.new("RGBA", (S, S), (255, 255, 255, 0) if not opaque else (255, 255, 255, 255))
    d = ImageDraw.Draw(img)

    # The tile. Inset so the icon has breathing room inside a maskable crop.
    inset = 52
    radius = 214
    d.rounded_rectangle(
        (inset, inset, S - inset, S - inset), radius=radius, fill=GREEN_TILE
    )
    # A soft top highlight, and a hairline that keeps the edge crisp on white.
    d.rounded_rectangle(
        (inset + 10, inset + 10, S - inset - 10, S - inset - 10),
        radius=radius - 10,
        outline=GREEN_TILE_DARK,
        width=3,
    )

    # Receipt: torn top edge, mint paper, ruled lines.
    paper_x0, paper_x1 = 404, 660
    paper_top, paper_bottom = 208, 556
    teeth = 9
    step = (paper_x1 - paper_x0) / teeth
    zigzag = [(paper_x0, paper_top + 16)]
    for i in range(teeth + 1):
        x = paper_x0 + step * i
        zigzag.append((min(x, paper_x1), paper_top + (0 if i % 2 == 0 else 20)))
    d.polygon(zigzag + [(paper_x1, paper_top + 16)], fill=MINT)
    d.rectangle((paper_x0, paper_top + 16, paper_x1, paper_bottom), fill=MINT)

    if detail:
        for i, width in enumerate((188, 208, 176, 200)):
            y = 300 + i * 54
            d.rounded_rectangle((paper_x0 + 34, y, paper_x0 + 34 + width, y + 14), 7, fill=MINT_LINE)

    # The shelf stand: two mint uprights the label plate crosses.
    stand_top = 432
    d.rounded_rectangle((366, stand_top, 412, 560), 16, fill=MINT)
    d.rounded_rectangle((652, stand_top, 698, 560), 16, fill=MINT)

    # Label plate with the wordmark.
    plate = (300, 512, 764, 636)
    d.rounded_rectangle(plate, radius=26, fill=MINT)
    label = "savo"
    f = font(132)
    bbox = d.textbbox((0, 0), label, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (plate[0] + plate[2] - tw) / 2 - bbox[0]
    ty = (plate[1] + plate[3] - th) / 2 - bbox[1] - 6
    # The bundled face has one weight; drawing it twice gives the wordmark the
    # slightly heavier stroke the reference has, without shipping a font file.
    for dx, dy in ((0, 0), (3, 0), (2, 2)):
        d.text((tx + dx, ty + dy), label, font=f, fill=GREEN_INK)

    # The drawer below, ruled like a stock card.
    drawer = (336, 664, 700, 838)
    d.rounded_rectangle(drawer, radius=24, fill=GREEN_DRAWER)
    if detail:
        for i, width in enumerate((286, 240, 150)):
            y = 704 + i * 42
            d.rounded_rectangle((drawer[0] + 26, y, drawer[0] + 26 + width, y + 12), 6, fill=MINT)

    return img.resize((size, size), Image.LANCZOS)


def encode_ico(frames: list[Image.Image]) -> bytes:
    """A PNG-based .ico, which every current browser reads."""
    images = [(f.width, f) for f in frames]
    header = struct.pack("<HHH", 0, 1, len(images))
    entries, blobs, offset = b"", [], 6 + 16 * len(images)
    for side, im in images:
        from io import BytesIO

        buf = BytesIO()
        im.save(buf, format="PNG")
        png = buf.getvalue()
        entries += struct.pack(
            "<BBBBHHII", side if side < 256 else 0, side if side < 256 else 0, 0, 0, 1, 32, len(png), offset
        )
        offset += len(png)
        blobs.append(png)
    return header + entries + b"".join(blobs)


def main() -> None:
    master = draw_icon(S, detail=True)
    master.save(OUT / "app-icon.png")

    draw_icon(512, detail=True).save(OUT / "icon-512.png")
    draw_icon(192, detail=True).save(OUT / "icon-192.png")
    draw_icon(180, detail=True, opaque=True).convert("RGB").save(OUT / "apple-touch-icon.png")

    # The favicon drops the fine rules: at 16 px they are noise, not detail.
    frames = [draw_icon(n, detail=False) for n in (48, 32, 16)]
    (OUT / "favicon.ico").write_bytes(encode_ico(frames))

    print("SAVO icons written:", ", ".join(sorted(p.name for p in OUT.glob("*icon*")) + ["favicon.ico"]))


if __name__ == "__main__":
    main()
