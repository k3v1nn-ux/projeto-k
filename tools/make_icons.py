#!/usr/bin/env python3
"""Draws the app icon — a bold "K" monogram in lime over a dark green gradient — as PNG,
anti-aliased by supersampling, with no dependencies. Run: python3 tools/make_icons.py"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOP = (11, 31, 21)       # #0b1f15
BOTTOM = (22, 83, 48)    # #165330
GLOW = (163, 230, 53)    # lime glow
LIME = (190, 242, 100)   # #bef264
WHITE = (236, 252, 203)

SS = 3  # supersampling per axis


def thick_line(x0, y0, x1, y1, w):
    dx, dy = x1 - x0, y1 - y0
    n = math.hypot(dx, dy)
    ox, oy = -dy / n * w / 2, dx / n * w / 2
    return [(x0 + ox, y0 + oy), (x1 + ox, y1 + oy), (x1 - ox, y1 - oy), (x0 - ox, y0 - oy)]


def inside(poly, x, y):
    sign = 0
    for i in range(len(poly)):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % len(poly)]
        c = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
        if c != 0:
            s = 1 if c > 0 else -1
            if sign == 0:
                sign = s
            elif s != sign:
                return False
    return True


# "K" in a 100x100 grid: stem plus two arms with flat (horizontal) terminals
STEM = [(28, 22), (41.5, 22), (41.5, 78), (28, 78)]
UPPER = [(41.5, 47), (58.5, 22), (74.5, 22), (41.5, 68)]
LOWER = [(47, 56), (56, 45), (76, 78), (60.5, 78)]
SHAPES = [STEM, UPPER, LOWER]


def k_cover(x, y):
    return any(inside(s, x, y) for s in SHAPES)


def background(x, y):
    t = min(1, max(0, (x + y) / 200))
    base = [TOP[i] + (BOTTOM[i] - TOP[i]) * t for i in range(3)]
    d = math.hypot(x - 92, y - 6) / 70
    g = max(0.0, 1 - d) ** 2 * 0.28
    return [base[i] * (1 - g) + GLOW[i] * g for i in range(3)]


def draw(size):
    s = size / 100.0
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / s
                    y = (py + (sy + 0.5) / SS) / s
                    if k_cover(x, y):
                        # subtle vertical highlight on the letter
                        t = (y - 22) / 56
                        col = [WHITE[i] * (1 - t) * 0.25 + LIME[i] * (0.75 + 0.25 * t) for i in range(3)]
                    else:
                        col = background(x, y)
                    for i in range(3):
                        acc[i] += col[i]
            n = SS * SS
            row += bytes((int(acc[0] / n), int(acc[1] / n), int(acc[2] / n), 255))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


os.makedirs(os.path.join(ROOT, "icons"), exist_ok=True)
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    with open(os.path.join(ROOT, "icons", name), "wb") as f:
        f.write(draw(size))
print("icons ok")
