from pathlib import Path
from PIL import Image

# Encode from originals, preserving text and artwork without cropping.
root = Path(__file__).resolve().parents[1]
originals = root / 'assets/banner-originals'
jobs = [
    ('october-sale-banner-2026', 'home', [480, 768, 1536, 2172]),
    ('product-catalog-banner-2026-v2', 'home', [480, 768, 1536, 2171]),
    ('shopping-guide-banner-2026', 'home', [480, 768, 1536, 2170]),
    ('mobile-launch-2026', 'app', [480, 720, 941]),
]
for name, folder, widths in jobs:
    image = Image.open(originals / f'{name}.png').convert('RGB')
    for width in widths:
        resized = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        for extension, options in [('avif', {'quality': 55, 'speed': 6}), ('webp', {'quality': 82, 'method': 6})]:
            target = root / f'assets/{folder}/{name}-optimized-v1-{width}.{extension}'
            resized.save(target, **options)
            print(target.name, target.stat().st_size)
image = Image.open(root / 'assets/app/header-banner-v2.png').convert('RGB')
for width in [420, 780]:
    image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS).save(
        root / f'assets/app/header-banner-optimized-v1-{width}.webp', quality=88, method=6)
