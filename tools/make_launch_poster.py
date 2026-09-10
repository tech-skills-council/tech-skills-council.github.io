#!/usr/bin/env python3
"""
Tech & Skills Council — Launch Day poster generator.

Renders assets/img/posters/tsc-launch-day-poster.png at A4 / 300 DPI.

The QR module matrix is stored alongside this script (qr_launch.json) rather
than generated, so the poster never depends on a QR library being installed
and the encoded URL can never drift by accident. Regenerate that file only if
the registration URL itself changes.

Usage:  python3 tools/make_launch_poster.py
"""

import json
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- geometry
# A4 at 300 DPI.
W, H = 2480, 3508
MARGIN = 200

# ---------------------------------------------------------------- palette
MAROON = (140, 29, 64)
MAROON_DEEP = (110, 22, 51)
GOLD = (255, 198, 39)
WHITE = (255, 255, 255)
INK = (17, 17, 17)
BODY = (61, 61, 66)
RULE = (208, 202, 205)
GREY = (122, 116, 120)

FONT_DIR = "/usr/share/fonts/truetype/liberation"
BOLD = os.path.join(FONT_DIR, "LiberationSans-Bold.ttf")
REG = os.path.join(FONT_DIR, "LiberationSans-Regular.ttf")

_cache = {}


def f(path, size):
    key = (path, size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(path, size)
    return _cache[key]


# ---------------------------------------------------------------- helpers
def text(d, xy, s, font, fill, tracking=0, anchor="la"):
    """Draw text, optionally with manual letter-spacing."""
    if not tracking:
        d.text(xy, s, font=font, fill=fill, anchor=anchor)
        return d.textlength(s, font=font)
    x, y = xy
    for ch in s:
        d.text((x, y), ch, font=font, fill=fill, anchor=anchor)
        x += d.textlength(ch, font=font) + tracking
    return x - xy[0]


def measure(d, s, font, tracking=0):
    if not tracking:
        return d.textlength(s, font=font)
    return sum(d.textlength(c, font=font) for c in s) + tracking * max(len(s) - 1, 0)


def wrap(d, s, font, max_w):
    words, lines, cur = s.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if d.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def para(d, xy, s, font, fill, max_w, leading):
    """Draw a wrapped paragraph. Returns the y just past the last line."""
    x, y = xy
    for line in wrap(d, s, font, max_w):
        d.text((x, y), line, font=font, fill=fill)
        y += leading
    return y


def para_h(d, s, font, max_w, leading):
    """Height `para` would occupy, without drawing. Used to size rows so that
    nothing is positioned by a hard-coded offset that copy changes can break."""
    return len(wrap(d, s, font, max_w)) * leading


def qr_image(px):
    """Render the stored QR matrix to a crisp `px`-wide black/white image."""
    here = os.path.dirname(os.path.abspath(__file__))
    grid = np.array(json.load(open(os.path.join(here, "qr_launch.json")))["matrix"], np.uint8)
    n = grid.shape[0]
    scale = max(1, px // n)
    art = (1 - np.kron(grid, np.ones((scale, scale), np.uint8))) * 255
    return Image.fromarray(art, "L").convert("RGB")


# ---------------------------------------------------------------- content
DATE_LINE = "Friday, 18 September 2026"
URL = "tech-skills-council.github.io/launch.html"
EMAIL = "techskillscouncil@gmail.com"

FACTS = [
    ("When", DATE_LINE,
     "Approximately two hours, in one sitting. Exact start time and campus "
     "venue are confirmed by email after you register."),
    ("Where", "All three campuses",
     "Held on the ground at REC, Shiv Nadar and Anurag simultaneously, "
     "joined on a single live stream."),
    ("Who", "Every branch, every year",
     "Open to students on the Cintana Alliance / ASU pathway. No prior "
     "coding experience is assumed or required."),
    ("Cost", "Free",
     "Registration is required so that campus seating and materials can be "
     "planned in advance."),
]

BLOCKS = [
    ("01", "Opening address",
     "What the council is and why it exists, the pathway to Arizona State, "
     "the six standing pillars, and how membership works."),
    ("02", "A short technical activity",
     "One guided introductory exercise in mixed teams across the three "
     "universities. Nothing to install, nothing to prepare."),
    ("03", "What happens next",
     "Enrolment in Coding Foundations and the first Skill Track, when Build "
     "Nights begin, and how council applications are read."),
]


# ---------------------------------------------------------------- render
def build():
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    # ---------- masthead -------------------------------------------------
    head_h = 1000
    d.rectangle([0, 0, W, head_h], fill=MAROON)

    y = 168
    text(d, (MARGIN, y), "POWERED BY ASU  ·  CINTANA ALLIANCE",
         f(BOLD, 34), GOLD, tracking=7)
    right = "REC  ·  SNU  ·  AU"
    fr = f(BOLD, 34)
    text(d, (W - MARGIN - measure(d, right, fr, 7), y), right, fr, WHITE, tracking=7)

    # Title. Two lines, set tight, gold on maroon.
    ft = f(BOLD, 248)
    y = 268
    d.text((MARGIN - 14, y), "LAUNCH", font=ft, fill=GOLD)
    d.text((MARGIN - 14, y + 222), "DAY", font=ft, fill=GOLD)

    # Rule + standfirst.
    y = 760
    d.rectangle([MARGIN, y + 26, MARGIN + 140, y + 32], fill=WHITE)
    d.text((MARGIN + 190, y), "Three campuses. One opening session.",
           font=f(BOLD, 54), fill=WHITE)

    # Date, stated once, loudly, in the masthead where it cannot be missed.
    y = 852
    d.text((MARGIN + 190, y), DATE_LINE, font=f(REG, 46), fill=(246, 222, 231))

    # Gold seam under the masthead.
    d.rectangle([0, head_h, W, head_h + 22], fill=GOLD)

    # ---------- lede -----------------------------------------------------
    y = head_h + 120
    fl = f(BOLD, 70)
    for line in wrap(d,
                     "An introduction to the council, the pathway, and the "
                     "year ahead.", fl, W - 2 * MARGIN):
        d.text((MARGIN, y), line, font=fl, fill=INK)
        y += 86

    y += 22
    y = para(d, (MARGIN, y),
             "Not a hackathon and not a workshop series — the council's first "
             "public session, closing with one short guided technical activity.",
             f(REG, 42), BODY, W - 2 * MARGIN, 56)

    # ---------- fact grid (2 x 2) ---------------------------------------
    # Row heights are measured, not assumed, so editing the copy above can
    # never push a later section underneath an earlier one.
    y += 74
    gutter = 90
    col_w = (W - 2 * MARGIN - gutter) // 2
    fk, fv, fb = f(BOLD, 30), f(BOLD, 54), f(REG, 36)
    VAL_LEAD, NOTE_LEAD = 66, 48

    def fact_h(value, note):
        return (92 + para_h(d, value, fv, col_w, VAL_LEAD)
                + 14 + para_h(d, note, fb, col_w, NOTE_LEAD))

    for row in range(0, len(FACTS), 2):
        pair = FACTS[row:row + 2]
        row_h = max(fact_h(v, n) for _, v, n in pair)
        for i, (label, value, note) in enumerate(pair):
            cx = MARGIN + (col_w + gutter) * i
            d.rectangle([cx, y, cx + col_w, y + 7], fill=MAROON)
            text(d, (cx, y + 44), label.upper(), fk, GREY, tracking=6)
            vy = para(d, (cx, y + 92), value, fv, MAROON, col_w, VAL_LEAD) + 14
            para(d, (cx, vy), note, fb, BODY, col_w, NOTE_LEAD)
        y += row_h + 58

    # ---------- three blocks --------------------------------------------
    y += 26
    text(d, (MARGIN, y), "THE SESSION, IN THREE BLOCKS", f(BOLD, 30), GREY, tracking=6)
    y += 74

    bw = (W - 2 * MARGIN - 60) // 3
    fn, fh, fp = f(BOLD, 64), f(BOLD, 38), f(REG, 31)
    HEAD_LEAD, NOTE_LEAD_B = 46, 42
    inner = bw - 80

    bh = max(128 + para_h(d, h, fh, inner, HEAD_LEAD) + 16
             + para_h(d, n, fp, inner, NOTE_LEAD_B) for _, h, n in BLOCKS) + 44

    for i, (num, head, note) in enumerate(BLOCKS):
        bx = MARGIN + (bw + 30) * i
        d.rectangle([bx, y, bx + bw, y + bh], fill=(246, 244, 245))
        d.rectangle([bx, y, bx + bw, y + 6], fill=GOLD)
        d.text((bx + 40, y + 42), num, font=fn, fill=MAROON)
        hy = para(d, (bx + 40, y + 128), head, fh, INK, inner, HEAD_LEAD) + 16
        para(d, (bx + 40, hy), note, fp, BODY, inner, NOTE_LEAD_B)

    y += bh + 48

    # ---------- honesty strip -------------------------------------------
    note_txt = ("No certificate, credential or prize is issued on the day. "
                "Recognition is earned afterwards, through the tracks.")
    fnote = f(REG, 34)
    strip_h = 96 + para_h(d, note_txt, fnote, W - 2 * MARGIN - 88, 46)
    d.rectangle([MARGIN, y, W - MARGIN, y + strip_h], fill=WHITE,
                outline=RULE, width=3)
    text(d, (MARGIN + 44, y + 34), "PLEASE NOTE", f(BOLD, 28), MAROON, tracking=6)
    para(d, (MARGIN + 44, y + 82), note_txt, fnote, BODY,
         W - 2 * MARGIN - 88, 46)
    content_bottom = y + strip_h

    # ---------- footer ---------------------------------------------------
    foot_h = 560
    foot_y = H - foot_h
    if content_bottom > foot_y - 60:
        raise SystemExit(
            "Poster overflow: content ends at y=%d but the footer starts at "
            "y=%d. Shorten the copy or raise H." % (content_bottom, foot_y))
    d.rectangle([0, foot_y, W, H], fill=MAROON_DEEP)

    qr_px = 356
    qr = qr_image(qr_px)
    pad = 34
    card = qr.size[0] + pad * 2
    qx, qy = MARGIN, foot_y + (foot_h - card) // 2
    d.rectangle([qx, qy, qx + card, qy + card], fill=WHITE)
    img.paste(qr, (qx + pad, qy + pad))

    tx = qx + card + 96
    d.text((tx, qy + 22), "REGISTER NOW", font=f(BOLD, 86), fill=GOLD)
    d.text((tx, qy + 140), URL, font=f(BOLD, 44), fill=WHITE)
    d.text((tx, qy + 212),
           "Scan the code or type the address. Two minutes, no attachments.",
           font=f(REG, 36), fill=(228, 196, 209))
    d.text((tx, qy + 272), "Questions: " + EMAIL,
           font=f(REG, 36), fill=(228, 196, 209))

    motto = ["LEARN BY", "BUILDING"]
    fm = f(BOLD, 60)
    my = qy + 96
    for line in motto:
        d.text((W - MARGIN, my), line, font=fm, fill=WHITE, anchor="ra")
        my += 74

    return img


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "assets", "img", "posters",
                       "tsc-launch-day-poster.png")
    im = build()
    im.save(os.path.normpath(out), "PNG", optimize=True)
    print("wrote", os.path.normpath(out), im.size)
