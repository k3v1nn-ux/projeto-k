#!/usr/bin/env python3
"""Draws the app icon (a dumbbell on a green rounded square) as PNG with no dependencies."""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = (21, 128, 61)
FG = (240, 253, 244)


def inside_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def draw(size, rounded):
    s = size / 100.0
    shapes = [  # dumbbell, in a 100x100 design grid: (x0, y0, x1, y1, radius)
        (18, 34, 28, 66, 3), (29, 26, 39, 74, 3),  # left plates
        (61, 26, 71, 74, 3), (72, 34, 82, 66, 3),  # right plates
        (38, 46, 62, 54, 1.5),                      # bar
    ]
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            x, y = (px + 0.5) / s, (py + 0.5) / s
            if rounded and not inside_round_rect(x, y, 0, 0, 100, 100, 22):
                row += bytes((0, 0, 0, 0))
                continue
            fg = any(inside_round_rect(x, y, *sh) for sh in shapes)
            row += bytes((*(FG if fg else BG), 255))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


os.makedirs(os.path.join(ROOT, "icons"), exist_ok=True)
for name, size, rounded in [("icon-192.png", 192, False), ("icon-512.png", 512, False), ("apple-touch-icon.png", 180, False)]:
    with open(os.path.join(ROOT, "icons", name), "wb") as f:
        f.write(draw(size, rounded))
print("icons ok")
