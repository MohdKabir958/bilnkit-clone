"""Compose authentic before/after screenshots; no generated or reconstructed UI."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'Docs/ui-ux'
OUT = DOCS / 'client-demo'
OUT.mkdir(parents=True, exist_ok=True)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = lambda size: ImageFont.truetype(FONT, size)
SCREENS = {
    'customer': ['home', 'categories', 'checkout'],
    'vendor': ['dashboard', 'products', 'orders'],
    'delivery': ['home', 'delivery-offer', 'active-delivery'],
    'admin': ['dashboard', 'inventory', 'finance'],
}
pages = []
for role, screens in SCREENS.items():
    mobile = role != 'admin'
    width, height = (2400, 1220) if mobile else (2400, 2940)
    page = Image.new('RGB', (width, height), '#F6F8F6')
    draw = ImageDraw.Draw(page)
    draw.text((36, 24), f'GROZO / {role.upper()} / BEFORE + AFTER', fill='#005A26', font=font(38))
    source = 'Production Flutter widgets / isolated service fixtures / not device screenshots' if mobile else 'Actual Chromium / local API + persisted pilot catalog / no live payments'
    draw.text((36, 83), source, fill='#46534B', font=font(23))
    for index, screen in enumerate(screens):
        x, y = (30 + index * 790, 142) if mobile else (30, 140 + index * 920)
        draw.text((x, y), screen.replace('-', ' ').title(), fill='#14201A', font=font(28))
        for phase_index, phase in enumerate(['before', 'after']):
            bx = x + phase_index * (380 if mobile else 1170)
            by = y + 44
            box_w, box_h = (368, 850) if mobile else (1140, 800)
            draw.rounded_rectangle((bx, by, bx + box_w, by + box_h), radius=14, fill='white', outline='#DDE5DF', width=2)
            draw.text((bx + 12, by + 10), phase.upper(), fill='#005A26', font=font(22))
            image = Image.open(DOCS / phase / role / f'{screen}.png').convert('RGB')
            preview = ImageOps.contain(image, (box_w - 20, box_h - 58), Image.Resampling.LANCZOS)
            page.paste(preview, (bx + (box_w - preview.width) // 2, by + 48))
    footer = 'Captured implementation evidence. Missing product imagery uses an honest fallback. No hosted or physical-device claim.'
    draw.text((36, height - 65), footer, fill='#46534B', font=font(21))
    page.save(OUT / f'{role}-before-after.png', optimize=True)
    pages.append(page)
pages[0].save(OUT / 'Grozo-before-after.pdf', save_all=True, append_images=pages[1:], resolution=180, quality=90)
print('Created four contact sheets and a four-page PDF from actual captures.')
