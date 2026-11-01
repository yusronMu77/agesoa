"""Android launcher icons for the Witness APK, made from the AGESOA logo.

Usage (from apps/witness): uv run --no-project --with pillow python scripts/app_icon.py <logo.png>

The logo is the design repository's `assets/logo-agesoa-source.png`: the "A" mark above the "AGESOA" wordmark on a
cream background. A launcher icon is 48 dp, too small for the wordmark, so only the mark is used. The script writes
the layout Android Studio's Image Asset tool uses: an adaptive icon (108 dp foreground with the mark inside the
66 dp safe circle, cream background colour) and legacy square and round icons for Android 7 and older.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

RES = Path(__file__).resolve().parent.parent / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
# Share of the layer taken by the mark's longer side. Foreground: the mark's corners stay inside the 66/108 safe
# circle of every launcher mask. Legacy: the corners stay inside the round icon's circle.
FOREGROUND_SCALE = 0.46
LEGACY_SCALE = 0.72


def distance(c, bg):
    return max(abs(c[0] - bg[0]), abs(c[1] - bg[1]), abs(c[2] - bg[2]))


def extract_mark(logo):
    """Crop the mark (the rows above the wordmark) and key the background out with soft, decontaminated edges."""
    img = logo.convert("RGB")
    w, h = img.size
    bg = img.getpixel((10, 10))
    px = img.load()
    rows = [any(distance(px[x, y], bg) > 40 for x in range(0, w, 2)) for y in range(h)]
    top = rows.index(True)
    bottom = top
    while bottom < h and rows[bottom]:
        bottom += 1
    cols = [x for x in range(w) if any(distance(px[x, y], bg) > 40 for y in range(top, bottom, 2))]
    mark = img.crop((min(cols), top, max(cols) + 1, bottom))

    out = Image.new("RGBA", mark.size)
    mp, op = mark.load(), out.load()
    for y in range(mark.size[1]):
        for x in range(mark.size[0]):
            c = mp[x, y]
            a = min(1.0, max(0.0, (distance(c, bg) - 8) / 48))
            if a:
                op[x, y] = (
                    *(max(0, min(255, round((c[i] - (1 - a) * bg[i]) / a))) for i in range(3)),
                    round(a * 255),
                )
    return out, bg


def layer(mark, size, scale, bg=None):
    """A size x size layer with the mark centred, its longer side `scale` of the layer."""
    k = scale * size / max(mark.size)
    m = mark.resize((round(mark.size[0] * k), round(mark.size[1] * k)), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (*bg, 255) if bg else (0, 0, 0, 0))
    canvas.alpha_composite(m, ((size - m.size[0]) // 2, (size - m.size[1]) // 2))
    return canvas


def main(logo_path):
    mark, bg = extract_mark(Image.open(logo_path))
    for name, density in DENSITIES.items():
        folder = RES / f"mipmap-{name}"
        foreground = round(108 * density)
        legacy = round(48 * density)
        layer(mark, foreground, FOREGROUND_SCALE).save(folder / "ic_launcher_foreground.png", optimize=True)
        square = layer(mark, legacy, LEGACY_SCALE, bg)
        square.convert("RGB").save(folder / "ic_launcher.png", optimize=True)
        # Round icon: the same square cut to a circle, drawn at 4x for a smooth edge.
        circle = Image.new("L", (legacy * 4, legacy * 4), 0)
        ImageDraw.Draw(circle).ellipse((0, 0, legacy * 4 - 1, legacy * 4 - 1), fill=255)
        rounded = square.copy()
        rounded.putalpha(circle.resize((legacy, legacy), Image.LANCZOS))
        rounded.save(folder / "ic_launcher_round.png", optimize=True)
    colour = "#{:02X}{:02X}{:02X}".format(*bg)
    (RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{colour}</color>\n</resources>\n',
        encoding="utf-8",
        newline="\n",
    )
    print(f"icons written to {RES} (background {colour})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
