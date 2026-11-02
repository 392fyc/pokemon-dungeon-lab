"""Turn a generated 1024 px image into a pixel-art asset and record it in the asset manifest.

Usage: python tools/art/pixelize.py <raw.png> <out relative to public/assets> --size 24 [--colors 16]
       [--crop x,y,w,h] [--trim] [--content N] [--card cards/<card>.json]
The raw image is box-downsampled to --size x --size pixels (the image is cropped first when --crop is given),
then quantised to --colors colours. With --content N (implies --trim) the object is shrunk so its longer side is
N px and placed bottom-centre on the --size cell, 2 px above the bottom edge (decorations, 8.5b spec 4.8).
Everything needed to reproduce the result goes into the manifest.
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
    ap.add_argument('--content', type=int, help='longer side of the object in px; placed bottom-centre on the cell')
    a = ap.parse_args()
    if a.content is not None and not 0 < a.content <= a.size - 2:
        ap.error('--content must be between 1 and --size minus 2')
    raw = Path(a.raw)
    img = Image.open(raw).convert('RGBA')
    if a.crop:
        x, y, w, h = map(int, a.crop.split(','))
        img = img.crop((x, y, x + w, y + h))
    if a.trim or a.content:
        l, t, r, b = img.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
        side = max(r - l, b - t) if a.content else int(max(r - l, b - t) * 1.12)
        cx, cy = (l + r) // 2, (t + b) // 2
        square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        square.paste(img.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)), (0, 0))
        img = square
    target = a.content or a.size
    small = img.resize((target, target), Image.Resampling.BOX)
    alpha = small.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    rgb = small.convert('RGB').quantize(colors=a.colors, method=Image.Quantize.MEDIANCUT).convert('RGBA')
    rgb.putalpha(alpha)
    if a.content:
        box = alpha.getbbox()
        if box is None:
            raise SystemExit('nothing opaque left after shrinking; use a larger --content')
        rgb = rgb.crop(box)
        cell = Image.new('RGBA', (a.size, a.size), (0, 0, 0, 0))
        cell.paste(rgb, ((a.size - rgb.width) // 2, a.size - 2 - rgb.height), rgb)
        rgb = cell
    out = ASSETS / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    rgb.save(out, optimize=True)
    m = load_manifest()
    card = json.loads(Path(a.card).read_text(encoding='utf-8')) if a.card else {}
    record(m, out, source='generated', model=raw.stem.split('-', 1)[1].rsplit('-', 1)[0] if '-' in raw.stem else None,
           card=card.get('id'), prompt=card.get('prompt'), rawSha256=sha256(raw.read_bytes()),
           postprocess={'crop': a.crop, 'trim': a.trim or bool(a.content), 'content': a.content, 'size': a.size, 'colors': a.colors, 'resample': 'box', 'quantize': 'mediancut'},
           licence='Original image generated for this project with OpenAI gpt-image; private build only.')
    save_manifest(m)
    print(out.relative_to(ASSETS).as_posix())


if __name__ == '__main__':
    main()
