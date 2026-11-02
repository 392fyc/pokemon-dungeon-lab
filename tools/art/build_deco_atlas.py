"""Pack the pixelized decorations into one Phaser atlas per terrain theme (8.5b spec 4.8).

Usage: python tools/art/build_deco_atlas.py
Reads tiles/deco/<name>.png (made by pixelize.py --content) and writes tiles/deco/deco-<theme>.png plus
tiles/deco/deco-<theme>.json (Phaser JSON hash). Frame names are floor-<name> or wall-<name>: the game picks floor
frames for floor cells and wall frames for wall tops. A decoration used for both kinds is stored once and named twice.
"""
import json
from PIL import Image
from common import ASSETS, load_manifest, save_manifest, record

T = 24
DECO = ASSETS / 'tiles' / 'deco'
# User choice 2026-11-02 (main's recommended set): version A of each, crack B dropped.
THEMES = {
    'moss': {'floor': ['rocks', 'grass', 'mushrooms', 'pebbles', 'crack', 'moss'], 'wall': ['moss', 'rocks']},
    'wet': {'floor': ['puddle', 'pebbles', 'rocks', 'crack', 'moss'], 'wall': ['moss']},
    'ash': {'floor': ['embers', 'crack', 'pebbles', 'rocks'], 'wall': ['embers', 'rocks']},
}


def build(theme, kinds):
    names = list(dict.fromkeys(kinds['floor'] + kinds['wall']))
    sheet = Image.new('RGBA', (T * len(names), T), (0, 0, 0, 0))
    for i, n in enumerate(names):
        sheet.paste(Image.open(DECO / f'{n}.png').convert('RGBA'), (i * T, 0))
    png = DECO / f'deco-{theme}.png'
    sheet.save(png, optimize=True)
    frames = {}
    for kind in ('floor', 'wall'):
        for n in kinds[kind]:
            i = names.index(n)
            frames[f'{kind}-{n}'] = {'frame': {'x': i * T, 'y': 0, 'w': T, 'h': T}, 'rotated': False, 'trimmed': False,
                                     'spriteSourceSize': {'x': 0, 'y': 0, 'w': T, 'h': T}, 'sourceSize': {'w': T, 'h': T}}
    meta = {'image': png.name, 'size': {'w': sheet.width, 'h': T}, 'format': 'RGBA8888', 'scale': '1'}
    js = DECO / f'deco-{theme}.json'
    js.write_text(json.dumps({'frames': frames, 'meta': meta}, indent=1) + '\n', encoding='utf-8', newline='\n')
    return png, js, names


def main():
    m = load_manifest()
    for theme, kinds in THEMES.items():
        png, js, names = build(theme, kinds)
        built_from = [f'tiles/deco/{n}.png' for n in names]
        note = 'Packed from project decorations by tools/art/build_deco_atlas.py; private build only.'
        record(m, png, source='derived', builtFrom=built_from, licence=note)
        record(m, js, source='derived', builtFrom=built_from, licence=note)
        print(png.relative_to(ASSETS).as_posix(), names)
    save_manifest(m)


if __name__ == '__main__':
    main()
