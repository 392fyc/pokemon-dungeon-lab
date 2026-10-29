"""Download selected SpriteCollab character sheets at a pinned commit and record their provenance.

Usage: python tools/art/fetch_spritecollab.py <commit> <dex>[,<dex>...] [--anims Walk,Idle,...]
Only the listed animations (plus AnimData.xml and credits.txt) are fetched; CopyOf entries are followed.
"""
import argparse, urllib.request, xml.etree.ElementTree as ET
from common import ASSETS, load_manifest, save_manifest, record

BASE = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/{commit}/sprite/{dex}/{name}'
LICENCE = ('Community submissions: CC BY-NC 4.0 (non-commercial, attribution). Files credited to CHUNSOFT are '
           'official game sprites with no licence granted. Pokemon IP is not licensed. Private build only.')


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('commit')
    ap.add_argument('dex')
    ap.add_argument('--anims', default='Walk,Idle,Attack,Hurt,Shoot')
    a = ap.parse_args()
    m = load_manifest()
    for dex in a.dex.split(','):
        out = ASSETS / 'characters' / dex
        out.mkdir(parents=True, exist_ok=True)
        meta = {}
        for name in ('AnimData.xml', 'credits.txt'):
            (out / name).write_bytes(get(BASE.format(commit=a.commit, dex=dex, name=name)))
        credits = (out / 'credits.txt').read_text(encoding='utf-8').splitlines()
        authors = sorted({line.split('\t')[1] for line in credits if '\t' in line})
        meta = dict(source='PMDCollab/SpriteCollab', commit=a.commit, sourcePath=f'sprite/{dex}', authors=authors, licence=LICENCE)
        root = ET.fromstring((out / 'AnimData.xml').read_text(encoding='utf-8'))
        anims = {n.findtext('Name'): n for n in root.iter('Anim')}
        for want in a.anims.split(','):
            node = anims[want]
            target = node.findtext('CopyOf') or want
            for kind in ('Anim', 'Shadow'):
                name = f'{target}-{kind}.png'
                (out / name).write_bytes(get(BASE.format(commit=a.commit, dex=dex, name=name)))
                record(m, out / name, **meta)
        for name in ('AnimData.xml', 'credits.txt'):
            record(m, out / name, **meta)
        print(dex, 'authors', authors)
    save_manifest(m)


if __name__ == '__main__':
    main()
