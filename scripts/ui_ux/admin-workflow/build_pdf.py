#!/usr/bin/env python3
"""Build a labelled review PDF from genuine capture-harness PNGs (requires reportlab)."""
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[3]
DOCS = ROOT / "Docs/admin-workflow-fixes"
MANIFEST = json.loads((DOCS / "screenshots/manifest.json").read_text())
OUT = DOCS / "client-review.pdf"
WIDTH, HEIGHT = landscape(A4)
pdf = canvas.Canvas(str(OUT), pagesize=(WIDTH, HEIGHT))
pdf.setTitle("Grozo admin workflow review — actual fixture-rendered screens")

def picture(file, x, y, width, height):
    source = ImageReader(str(file))
    sw, sh = source.getSize()
    scale = min(width / sw, height / sh)
    pdf.drawImage(source, x + (width-sw*scale)/2, y + (height-sh*scale)/2,
                  width=sw*scale, height=sh*scale, preserveAspectRatio=True)

def heading(title, subtitle):
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(24, HEIGHT-30, title)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(24, HEIGHT-47, subtitle)

for title, old, new in [
    ("Overview", "01-overview.png", "01-overview.png"),
    ("Vendor directory", "02-vendors.png", "02-vendor-directory.png"),
]:
    heading(title + " - before / after", "Actual implemented UI; explicit synthetic fixtures. Historical baseline is not the current app.")
    pdf.drawString(24, HEIGHT-65, "Before - historical marketplace gallery")
    pdf.drawString(WIDTH/2+12, HEIGHT-65, "After - current workflow implementation")
    picture(ROOT / "Docs/marketplace-workflow/screenshots" / old, 24, 24, WIDTH/2-36, HEIGHT-100)
    picture(DOCS / "screenshots" / new, WIDTH/2+12, 24, WIDTH/2-36, HEIGHT-100)
    pdf.showPage()

for index, row in enumerate(MANIFEST["screens"], 1):
    heading(row["name"].replace("-", " "), "LOCAL CHROMIUM CAPTURE - SYNTHETIC FIXTURES - NO PERSONAL ACCOUNT - NOT HOSTED/PHYSICAL-DEVICE ACCEPTANCE")
    picture(DOCS / "screenshots" / (row["name"] + ".png"), 24, 36, WIDTH-48, HEIGHT-100)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(24, 18, f"Captured {MANIFEST['capturedAt']} | Width {row['width']} px | Overflow {row['overflow']} | {index}/{len(MANIFEST['screens'])}")
    pdf.showPage()
pdf.save()
print(OUT)
