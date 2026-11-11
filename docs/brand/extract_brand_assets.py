"""Cut the AWID logo and app icon out of docs/brand/awid-reference.jpg with transparency.

The artwork is Mahdi's; this only removes the board's background. Run with:
    python3 -I docs/brand/extract_brand_assets.py
Writes apps/web/public/brand/awid-logo.png, awid-wordmark.png and awid-icon.png.
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "docs/brand/awid-reference.jpg"
OUT = ROOT / "apps/web/public/brand"
BG_TOLERANCE = 14  # board background is a flat warm white (≈ 247, 243, 240)


def background_mask(image: Image.Image) -> Image.Image:
    """Pixels connected to the crop's border that look like the board background."""
    width, height = image.size
    pixels = image.load()
    reference = pixels[1, 1]
    seen = Image.new("L", image.size, 0)
    marks = seen.load()
    queue = deque((x, y) for x in range(width) for y in (0, height - 1))
    queue.extend((x, y) for y in range(height) for x in (0, width - 1))
    while queue:
        x, y = queue.popleft()
        if marks[x, y]:
            continue
        r, g, b = pixels[x, y][:3]
        if max(abs(r - reference[0]), abs(g - reference[1]), abs(b - reference[2])) > BG_TOLERANCE:
            continue
        marks[x, y] = 255
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < width and 0 <= ny < height and not marks[nx, ny]:
                queue.append((nx, ny))
    return seen


def cut(box: tuple[int, int, int, int]) -> Image.Image:
    crop = Image.open(BOARD).convert("RGB").crop(box)
    mask = background_mask(crop)
    # Feather one pixel so anti-aliased edges blend instead of showing a halo.
    alpha = Image.eval(mask.filter(ImageFilter.GaussianBlur(0.8)), lambda value: 255 - value)
    result = crop.convert("RGBA")
    result.putalpha(alpha)
    return result.crop(result.getbbox())


def rounded_icon(box: tuple[int, int, int, int], radius_ratio: float = 0.24) -> Image.Image:
    crop = Image.open(BOARD).convert("RGB").crop(box)
    # The tile is the area where green clearly dominates; this drops the board's bevel and shadow.
    green = Image.eval(crop.split()[1], lambda value: 0)
    pixels, marks = crop.load(), green.load()
    for x in range(crop.size[0]):
        for y in range(crop.size[1]):
            r, g, b = pixels[x, y]
            if g > r + 40 and g > b + 10:
                marks[x, y] = 255
    left, top, right, bottom = green.getbbox() or (0, 0, *crop.size)
    inset = 5  # stay inside the anti-aliased rim and bevel
    tile = crop.crop((left + inset, top + inset, right - inset, bottom - inset))
    size = tile.size
    mask = Image.new("L", (size[0] * 4, size[1] * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] * 4 - 1, size[1] * 4 - 1), radius=int(min(size) * 4 * radius_ratio), fill=255)
    tile = tile.convert("RGBA")
    tile.putalpha(mask.resize(size, Image.LANCZOS))
    return tile


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cut((30, 95, 630, 420)).save(OUT / "awid-logo.png", optimize=True)  # with tagline
    cut((30, 95, 630, 330)).save(OUT / "awid-wordmark.png", optimize=True)  # header logo
    rounded_icon((655, 110, 930, 390)).save(OUT / "awid-icon.png", optimize=True)


if __name__ == "__main__":
    main()
