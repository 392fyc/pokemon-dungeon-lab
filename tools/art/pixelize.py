"""Turn a generated 1024 px image into a pixel-art asset and record it in the asset manifest.

Usage: python tools/art/pixelize.py <raw.png> <out relative to public/assets> --size 24 [--colors 16]
       [--crop x,y,w,h] [--trim] [--card cards/<card>.json]
The raw image is box-downsampled to --size x --size pixels (the image is cropped first when --crop is given),
then quantised to --colors colours. Everything needed to reproduce the result goes into the manifest.
"""
import argparse, json
from pathlib import Path
from PIL import Image
from common import ASSETS, load_manifest, save_manifest, record, sha256


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('raw')
    ap.add_argument('out')
    ap.add_argument('--size', type=int, default=24)
    ap.add_argument('--colors', type=int, default=16)
    ap.add_argument('--crop')
    ap.add_argument('--card')
    ap.add_argument('--trim', action='store_true', help='crop to the opaque area, padded to a square')
    a = ap.parse_args()
    raw = Path(a.raw)
    img = Image.open(raw).convert('RGBA')
    if a.crop:
        x, y, w, h = map(int, a.crop.split(','))
        img = img.crop((x, y, x + w, y + h))
    if a.trim:
        l, t, r, b = img.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
        side = int(max(r - l, b - t) * 1.12)
        cx, cy = (l + r) // 2, (t + b) // 2
        square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        square.paste(img.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)), (0, 0))
        img = square
    small = img.resize((a.size, a.size), Image.Resampling.BOX)
    alpha = small.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    rgb = small.convert('RGB').quantize(colors=a.colors, method=Image.Quantize.MEDIANCUT).convert('RGBA')
    rgb.putalpha(alpha)
    out = ASSETS / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    rgb.save(out, optimize=True)
    m = load_manifest()
    card = json.loads(Path(a.card).read_text(encoding='utf-8')) if a.card else {}
    record(m, out, source='generated', model=raw.stem.split('-', 1)[1].rsplit('-', 1)[0] if '-' in raw.stem else None,
           card=card.get('id'), prompt=card.get('prompt'), rawSha256=sha256(raw.read_bytes()),
           postprocess={'crop': a.crop, 'trim': a.trim, 'size': a.size, 'colors': a.colors, 'resample': 'box', 'quantize': 'mediancut'},
           licence='Original image generated for this project with OpenAI gpt-image; private build only.')
    save_manifest(m)
    print(out.relative_to(ASSETS).as_posix())


if __name__ == '__main__':
    main()
