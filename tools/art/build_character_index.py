"""Write src/render/characters.json from the downloaded AnimData.xml files (frame sizes and durations).

Durations in AnimData.xml are counted in 1/60 s game frames. Rows in each sheet are the eight directions
in PMD order: down, down-right, right, up-right, up, up-left, left, down-left.
"""
import json, xml.etree.ElementTree as ET
from common import ASSETS, ROOT

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
        anims[name] = {'file': f'characters/{folder.name}/{file}', 'w': int(target.findtext('FrameWidth')),
                       'h': int(target.findtext('FrameHeight')),
                       'durations': [int(d.text) for d in target.find('Durations')]}
    index[folder.name] = anims
out = ROOT / 'src' / 'render' / 'characters.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(index, indent=1) + '\n', encoding='utf-8', newline='\n')
print(out.relative_to(ROOT).as_posix(), len(index), 'characters')
