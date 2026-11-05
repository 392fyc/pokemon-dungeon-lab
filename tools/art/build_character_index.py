"""Write src/render/characters.json from the downloaded AnimData.xml files (frame sizes and durations).

Durations in AnimData.xml are counted in 1/60 s game frames. Rows in each sheet are the eight directions
in PMD order: down, down-right, right, up-right, up, up-left, left, down-left.
"""
import json, xml.etree.ElementTree as ET
from common import ASSETS, ROOT
from PIL import Image


def visible_union(path, frame_width, frame_height, frame_count):
    """Union the nontransparent pixels in the first (down-facing) Idle row."""
    with Image.open(path) as source:
        image = source.convert('RGBA')
        if image.width != frame_width * frame_count or image.height < frame_height:
            raise ValueError(f'{path}: unexpected Idle sheet size {image.size}')
        bounds = None
        for frame in range(frame_count):
            left = frame * frame_width
            alpha = image.crop((left, 0, left + frame_width, frame_height)).getchannel('A')
            frame_bounds = alpha.getbbox()
            if frame_bounds is None:
                continue
            if bounds is None:
                bounds = frame_bounds
            else:
                bounds = (min(bounds[0], frame_bounds[0]), min(bounds[1], frame_bounds[1]),
                          max(bounds[2], frame_bounds[2]), max(bounds[3], frame_bounds[3]))
        if bounds is None:
            raise ValueError(f'{path}: first Idle row has no visible pixels')
        return {'x': bounds[0], 'y': bounds[1], 'w': bounds[2] - bounds[0], 'h': bounds[3] - bounds[1]}

index = {}
for folder in sorted((ASSETS / 'characters').iterdir()):
    root = ET.fromstring((folder / 'AnimData.xml').read_text(encoding='utf-8'))
    nodes = {n.findtext('Name'): n for n in root.iter('Anim')}
    anims = {}
    for name in ('Idle', 'Walk', 'Attack', 'Hurt'):
        node = nodes[name]
        target = nodes[node.findtext('CopyOf')] if node.findtext('CopyOf') else node
        file = f'{target.findtext("Name")}-Anim.png'
        if not (folder / file).exists():
            continue
        metadata = {'file': f'characters/{folder.name}/{file}', 'w': int(target.findtext('FrameWidth')),
                    'h': int(target.findtext('FrameHeight')),
                    'durations': [int(d.text) for d in target.find('Durations')]}
        if name == 'Idle':
            metadata['visible'] = visible_union(folder / file, metadata['w'], metadata['h'],
                                                len(metadata['durations']))
        anims[name] = metadata
    index[folder.name] = anims
out = ROOT / 'src' / 'render' / 'characters.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(index, indent=1) + '\n', encoding='utf-8', newline='\n')
print(out.relative_to(ROOT).as_posix(), len(index), 'characters')
