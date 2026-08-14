"""Generate public/og-cover.png, the default Open Graph / Twitter card image.

Kept in the repo so the asset is reproducible rather than a mystery binary:
run `python scripts/generate-og-cover.py` to regenerate it.

The image is a placeholder built from the brand tokens in
src/components/shared/brand.jsx, and is intentionally simple — a designed cover
should replace it when one exists. What matters for now is that every shared
link has a valid 1200x630 image instead of a broken card.
"""

import logging
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

W, H = 1200, 630

INK = (31, 26, 34)
CREAM = (248, 244, 237)
CORAL = (237, 106, 74)
LIME = (201, 238, 111)
LILAC = (200, 176, 223)

OUT = Path(__file__).resolve().parent.parent / "public" / "og-cover.png"


def font(size, bold=False):
    """Bricolage Grotesque/Geist are not installed system-wide, so fall back to
    the closest grotesque macOS ships with, then to PIL's default."""
    for candidate in (
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNS.ttf",
    ):
        try:
            return ImageFont.truetype(candidate, size, index=1 if bold else 0)
        except (OSError, ValueError):
            continue
    return ImageFont.load_default(size)


def main():
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)

    # Week-grid motif on the right: five day columns, with one slot lit up in
    # lime to stand for the free time everyone shares.
    grid_x, grid_y = 800, 150
    col_w, gap, row_h = 58, 13, 44
    for col in range(5):
        for row in range(7):
            x = grid_x + col * (col_w + gap)
            y = grid_y + row * (row_h + gap)
            busy = (col + row * 3) % 4 == 0
            if col == 2 and row in (3, 4):
                colour = LIME
            elif busy:
                colour = LILAC
            else:
                colour = (44, 38, 48)
            d.rounded_rectangle([x, y, x + col_w, y + row_h], radius=10, fill=colour)

    d.text((80, 96), "timetify", font=font(40), fill=CORAL)

    headline_font = font(66, bold=True)
    d.text((80, 220), "share your schedule.", font=headline_font, fill=CREAM)
    d.text((80, 300), "find time that", font=headline_font, fill=CREAM)
    d.text((80, 380), "actually works.", font=headline_font, fill=LIME)

    d.text(
        (80, 508),
        "free class-schedule sharing for students",
        font=font(30),
        fill=(168, 160, 175),
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    logger.info("wrote %s (%d x %d)", OUT, W, H)


if __name__ == "__main__":
    main()
