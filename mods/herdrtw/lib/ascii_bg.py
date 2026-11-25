import math
import sys
from functools import lru_cache
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont, ImageOps

RAMP = [
    [0, 0, 0, 0, 0, 4, 0],
    [0, 4, 0, 0, 4, 0, 0],
    [0, 0, 0, 14, 0, 0, 0],
    [0, 0, 14, 0, 14, 0, 0],
    [0, 4, 4, 31, 4, 4, 0],
    [0, 21, 14, 31, 14, 21, 0],
    [10, 10, 31, 10, 31, 10, 10],
    [14, 17, 23, 21, 23, 16, 14],
]
PAPER = (11, 10, 14)
THRESHOLD = 0.1
GAMMA = 0.8
VIVID = 0.5
LIFT = 0.22
STRENGTH = 0.34
GROUND = 0.3
DIM = 0.75
FADE_HEIGHT = 0.2
FADE_BOTTOM = 0.3
DENSITY = {"sparse": 0.25, "medium": 0.0, "dense": -0.2}
FRAMES = 16
FPS = 8
TAU = math.tau
ZERON_TREMBLE = 0.3
DITHER_WAVE = 0.14
ORIGINAL_WAVE = 0.06
ORIGINAL_LEVELS = 6

SKIN_RAMP = ":;t%SX8#@"
EDGE_HEAVY = ":;"
EDGE_LIGHT = ".',`"
ACCENTS = ["#e0892c", "#e03a32", "#b44ae0", "#33c8cc", "#3cb54a", "#3150e8", "#d9c14a"]
DOTS = [(48, 52, 235), (52, 205, 60), (228, 50, 44), (190, 212, 255)]
GRID = (14, 14, 14)
PALETTES = {
    "midnight": ["#030610", "#080e23", "#111d4a", "#213479", "#3e58b1", "#809ce6", "#7ec7f6", "#d8e4ff", "#ffffff"],
    "ember": ["#0a0302", "#1f0705", "#43100a", "#7a1d0f", "#b8341a", "#e0632a", "#f59a3e", "#ffd27a", "#fff4d6"],
    "moss": ["#030a06", "#071a0f", "#0f2e1b", "#1b4a2c", "#2f6b3f", "#4f9157", "#8cbf73", "#d2e8a8", "#f7fbe6"],
    "lilac": ["#0b0612", "#1a0f2b", "#2d1a4d", "#46287a", "#6440a8", "#8c66d1", "#b796ec", "#e2cffc", "#ffffff"],
    "mono": ["#000000", "#111111", "#222222", "#3a3a3a", "#5a5a5a", "#808080", "#aaaaaa", "#d6d6d6", "#ffffff"],
}
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
FONTS = [
    "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/liberation/LiberationMono-Bold.ttf",
    "/usr/share/fonts/Adwaita/AdwaitaMono-Bold.ttf",
]


def glyph_mask(rows, scale):
    mask = Image.new("L", (6, 8), 0)
    for y, bits in enumerate(rows):
        for x in range(5):
            if (bits >> (4 - x)) & 1:
                mask.putpixel((x, y), 255)
    return mask.resize((6 * scale, 8 * scale), Image.NEAREST)


def load_font(size):
    for path in FONTS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def level_of(cell, threshold):
    r, g, b = (v / 255 for v in cell)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return max(0.0, (lum - threshold) / (1 - threshold)) ** GAMMA, (r, g, b), lum


def cell_hash(x, y, k):
    n = (x * 73856093 ^ y * 19349663 ^ k * 83492791) & 0xFFFFFFFF
    n ^= n >> 13
    n = (n * 0x5BD1E995) & 0xFFFFFFFF
    n ^= n >> 15
    return n / 0xFFFFFFFF


def render_zeron(img, width, height, scale, threshold, t=None):
    cw, ch = 6 * scale, 8 * scale
    cols, rows = -(-width // cw), -(-height // ch)
    cells = img.resize((cols, rows), Image.BOX)
    lit_cells = Image.new("RGB", (cols, rows))
    masks = [None] + [glyph_mask(g, scale) for g in RAMP]
    stroke = Image.new("L", (cols * cw, rows * ch), 0)
    cell_px = cells.load()
    lit_px = lit_cells.load()
    for y in range(rows):
        for x in range(cols):
            level, (r, g, b), _ = level_of(cell_px[x, y], threshold)
            idx = min(int(level * 8.999), 8)
            if idx == 0:
                continue
            if t is not None and cell_hash(x, y, 1) < ZERON_TREMBLE:
                idx = max(1, min(8, idx + round(math.sin(TAU * t / FRAMES + cell_hash(x, y, 2) * TAU))))
            peak = max(r, g, b, 0.004)
            lit_px[x, y] = tuple(
                int(255 * ((c * (1 - VIVID) + (c / peak) * VIVID) * (1 - LIFT) + LIFT))
                for c in (r, g, b)
            )
            stroke.paste(masks[idx], (x * cw, y * ch))
    box = (0, 0, width, height)
    lit = lit_cells.resize((cols * cw, rows * ch), Image.NEAREST).crop(box)
    stroke = stroke.crop(box)
    paper = Image.new("RGB", (width, height), PAPER)
    ground = Image.blend(paper, img.point(lambda v: int(v * DIM)), GROUND)
    art = Image.composite(lit, ground, stroke)
    return Image.blend(img, art, STRENGTH)


def cell_hash(x, y, k):
    n = (x * 73856093 ^ y * 19349663 ^ k * 83492791) & 0xFFFFFFFF
    n ^= n >> 13
    n = (n * 0x5BD1E995) & 0xFFFFFFFF
    n ^= n >> 15
    return n / 0xFFFFFFFF


GRID_LIFT = 0.04
GRID_TONE = 0.92
GRID_EDGE = 0.72
GRID_INK_DARK = 0.52
GRID_INK_LIGHT = 1.7
GRID_ACCENT = 0.03
GRID_WHITE = 0.015
GRID_DOTS = 0.05
GRID_CYCLE = FRAMES


def scaled(color, factor, add=0):
    return tuple(max(0, min(255, int(c * factor + add))) for c in color)


def render_grid(img, width, height, scale, threshold, t=0):
    cw = 6 + 2 * scale
    ch = round(cw * 1.45)
    cols, rows = -(-width // cw), -(-height // ch)
    cells = img.resize((cols, rows), Image.BOX)
    cell_px = cells.load()
    canvas = Image.new("RGB", (cols * cw + 1, rows * ch + 1), (0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    font = load_font(round(ch * 0.74))
    dot = max(2, round(cw * 0.19))
    for y in range(rows):
        for x in range(cols):
            level, (r, g, b), lum = level_of(cell_px[x, y], threshold)
            px, py = x * cw, y * ch
            block = tuple(int(255 * (c * GRID_TONE + GRID_LIFT)) for c in (r, g, b))
            draw.rectangle([px, py, px + cw - 1, py + ch - 1], fill=block)
            edge = scaled(block, GRID_EDGE)
            draw.line([(px, py), (px + cw - 1, py)], fill=edge)
            draw.line([(px, py), (px, py + ch - 1)], fill=edge)
            if lum < 0.08 and cell_hash(x, y, 0) < GRID_DOTS * 2:
                kind = DOTS[int(cell_hash(x, y, 4) * 4) % 4]
                pulse = 0.5 + 0.5 * math.sin(TAU * t / GRID_CYCLE * (1 + int(cell_hash(x, y, 6) * 2)) + cell_hash(x, y, 7) * TAU)
                color = scaled(kind, 0.25 + 0.75 * pulse)
                cx, cy = round(px + cw * 0.66), round(py + ch * 0.64)
                draw.rectangle([cx - dot // 2, cy - dot // 2, cx - dot // 2 + dot - 1, cy - dot // 2 + dot - 1], fill=color)
                continue
            if level <= 0:
                continue
            jitter = int(cell_hash(x, y, 8) * 3) - 1
            glyph = SKIN_RAMP[max(0, min(len(SKIN_RAMP) - 1, int((1 - level) * 8.99) + jitter))]
            tick = int(((t + int(cell_hash(x, y, 3) * GRID_CYCLE)) % GRID_CYCLE) / 3)
            roll = cell_hash(x, y, 10 + tick)
            if roll < GRID_ACCENT:
                ink = ACCENTS[int(cell_hash(x, y, 20 + tick) * len(ACCENTS)) % len(ACCENTS)]
            elif roll < GRID_ACCENT + GRID_WHITE:
                ink = "#ffffff"
            elif lum > 0.35:
                ink = scaled(block, GRID_INK_DARK)
            else:
                ink = scaled(block, GRID_INK_LIGHT, 20)
            draw.text((px + cw / 2, py + ch / 2 + 1), glyph, font=font, fill=ink, anchor="mm")
    return canvas.crop((0, 0, width, height))


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def wave_at(x, y, cols, rows, t, amp):
    if t is None:
        return 0.0
    return amp * math.sin(TAU * t / FRAMES - (x / cols * 5.0 + y / rows * 3.0))


def render_dither(img, width, height, scale, palette, t=None):
    cell = 3 * scale
    cols, rows = -(-width // cell), -(-height // cell)
    out = Image.new("RGB", (cols, rows))
    dst = out.load()
    if palette == "original":
        src = img.resize((cols, rows), Image.BOX).load()
        top = ORIGINAL_LEVELS - 1
        for y in range(rows):
            for x in range(cols):
                wave = wave_at(x, y, cols, rows, t, ORIGINAL_WAVE)
                d = BAYER[y % 4][x % 4] / 16
                dst[x, y] = tuple(round(255 * max(0, min(top, int((c / 255 + wave) * top + d))) / top) for c in src[x, y])
        return out.resize((cols * cell, rows * cell), Image.NEAREST).crop((0, 0, width, height))
    ramp = [hex_rgb(h) for h in PALETTES.get(palette, PALETTES["midnight"])]
    n = len(ramp) - 1
    src = img.resize((cols, rows), Image.BOX).convert("L").load()
    for y in range(rows):
        for x in range(cols):
            v = (src[x, y] / 255) ** 0.9 + wave_at(x, y, cols, rows, t, DITHER_WAVE)
            d = BAYER[y % 4][x % 4] / 16
            dst[x, y] = ramp[max(0, min(n, int(v * n + d)))]
    return out.resize((cols * cell, rows * cell), Image.NEAREST).crop((0, 0, width, height))


@lru_cache(maxsize=2)
def load_base(src, width, height):
    return ImageOps.fit(Image.open(src).convert("RGB"), (width, height), Image.LANCZOS)


def render_frame(job):
    cfg, t = job
    src, width, height, bg_hex, opacity, scale, density, mode, palette = cfg
    threshold = max(0.0, min(0.9, THRESHOLD + DENSITY.get(density, 0.0)))
    alpha = max(0.0, min(1.0, opacity / 100))
    bg = tuple(int(bg_hex[i : i + 2], 16) for i in (0, 2, 4))
    img = load_base(src, width, height)
    if mode == "dither":
        result = render_dither(img, width, height, scale, palette, t)
    elif mode == "grid":
        result = render_grid(img, width, height, scale, threshold, 0 if t is None else t)
    else:
        result = render_zeron(img, width, height, scale, threshold, t)
    ramp = Image.linear_gradient("L").resize((width, height), Image.BILINEAR)
    start = 1 - FADE_HEIGHT
    fade = ramp.point(
        lambda v: 255 if v / 255 <= start else int(255 * (1 - (1 - FADE_BOTTOM) * (v / 255 - start) / FADE_HEIGHT))
    )
    solid = Image.new("RGB", (width, height), bg)
    result = Image.composite(result, solid, fade)
    return Image.blend(solid, result, alpha)


def save_frame(job):
    cfg, t, path = job
    render_frame((cfg, t)).save(path, compress_level=1)


def main():
    src, out, width, height, bg_hex, opacity, scale, density, mode, palette, motion = sys.argv[1:12]
    cfg = (src, int(width), int(height), bg_hex, int(opacity), max(1, min(4, int(scale))), density, mode, palette)
    if motion != "1":
        render_frame((cfg, None)).save(out)
        return
    stem = out[:-4] if out.endswith(".png") else out
    with Pool() as pool:
        pool.map(save_frame, [(cfg, t, f"{stem}-{t:02d}.png") for t in range(FRAMES)])
    print(FRAMES, FPS)


if __name__ == "__main__":
    main()
