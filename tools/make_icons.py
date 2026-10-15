#!/usr/bin/env python3
"""Draws the Antares V3 icon — a white-blue four-point star over a deep blue
gradient — as PNG, anti-aliased by supersampling, no dependencies.
Run: python3 tools/make_icons.py"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKY_TOP = (27, 74, 138)     # blue #1b4a8a
SKY_MID = (15, 44, 87)      # #0f2c57
SKY_LOW = (7, 21, 43)       # #07152b
GLOW = (110, 180, 255)      # blue halo
CORE = (255, 255, 255)      # white core
EDGE = (150, 205, 255)      # light-blue tips
SS = 3

STARS = [(20, 22, .9), (78, 16, .7), (16, 74, .6), (84, 80, .8), (66, 88, .5), (30, 88, .45), (88, 44, .5)]


def lerp(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


def sky(x, y):
    t = min(1, max(0, (y * 0.75 + x * 0.25) / 100))
    col = lerp(SKY_TOP, SKY_MID, t / 0.6) if t < 0.6 else lerp(SKY_MID, SKY_LOW, (t - 0.6) / 0.4)
    d2 = (x - 50) ** 2 + (y - 50) ** 2
    g = math.exp(-d2 / (2 * 19 ** 2)) * 0.45
    col = lerp(col, GLOW, g)
    for sx, sy, a in STARS:
        dd = (x - sx) ** 2 + (y - sy) ** 2
        if dd < 1.2:
            col = lerp(col, (255, 255, 255), a * (1 - dd / 1.2))
    return col


def star(x, y, cx=50, cy=50, rx=27, ry=33):
    """Astroid |x|^(2/3) + |y|^(2/3) <= 1: a four-point star with concave sides."""
    u = abs((x - cx) / rx)
    v = abs((y - cy) / ry)
    s = u ** (2 / 3) + v ** (2 / 3)
    return s


def color(x, y):
    s = star(x, y)
    if s <= 1:
        d = math.hypot(x - 50, y - 50) / 30
        return lerp(CORE, EDGE, min(1, d ** 0.8))
    # soft rim glow just outside the star
    col = sky(x, y)
    if s < 1.25:
        col = lerp(col, EDGE, (1.25 - s) / 0.25 * 0.35)
    return col


def draw(size):
    k = size / 100.0
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    c = color((px + (sx + .5) / SS) / k, (py + (sy + .5) / SS) / k)
                    acc[0] += c[0]
                    acc[1] += c[1]
                    acc[2] += c[2]
            n = SS * SS
            row += bytes((min(255, int(acc[0] / n)), min(255, int(acc[1] / n)), min(255, int(acc[2] / n)), 255))
        rows.append(bytes(row))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


os.makedirs(os.path.join(ROOT, "icons"), exist_ok=True)
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    with open(os.path.join(ROOT, "icons", name), "wb") as f:
        f.write(draw(size))
print("icons ok")
