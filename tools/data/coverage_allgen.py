"""Per-generation coverage of the frozen data snapshots, using the batch import rules
(docs/制作流程/图鉴批量导入规格.md 2.2–2.4, 7.8 spec 13.2). Read-only; prints Markdown."""
import csv, json, re, sys, collections
from pathlib import Path

A = Path(sys.argv[1])
D = json.load(open(A / 'showdown/pokedex.json', encoding='utf8'))
L = json.load(open(A / 'showdown/learnsets.json', encoding='utf8'))
M = json.load(open(A / 'showdown/moves.json', encoding='utf8'))
W = {}
for f in ['pmd/wiki-2026-10-30.json', 'pmd/wiki-2026-10-30-extra.json', 'pmd/wiki-2026-10-31-allgen.json']:
    W.update(json.load(open(A / f, encoding='utf8'))['moves'])
T = json.load(open(A / 'spritecollab/tracker.json', encoding='utf8'))
lang = '12'
names = {int(r['pokemon_species_id']) for r in csv.DictReader(open(A / 'pokeapi/pokemon_species_names.csv', encoding='utf8')) if r['local_language_id'] == lang}
mid = {r['id']: r['identifier'].replace('-', '') for r in csv.DictReader(open(A / 'pokeapi/moves.csv', encoding='utf8'))}
mnames = {mid[r['move_id']] for r in csv.DictReader(open(A / 'pokeapi/move_names.csv', encoding='utf8')) if r['local_language_id'] == lang and r['move_id'] in mid}

RANGE = {'front', '2 tiles away', '10 tiles away', '1 tile around user', 'entire room', 'enitre room', 'user'}
TARGET = {'enemy', 'user', 'teammates', 'teammate(s)', 'party', 'all'}
PRI = ('TDS', 'S', 'TD', 'GTI', 'SMD', 'RTDX')
BAD = {'CAP', 'Future', 'Gmax', 'LGPE', 'Unobtainable'}
TT = re.compile(r"\{\{tt\|([^|{}]*)\|[^{}]*\}\}")


def official(m):
    rs = {}
    for r in W.get(m, {}).get('rows', []):
        if r.startswith('{{MDMoveRow'):
            r = TT.sub(lambda x: x.group(1), r)
            f = dict(x.split('=', 1) for x in r[2:-2].split('|')[1:] if '=' in x)
            rs.setdefault(f.get('game'), f)
    for g in PRI:
        if g in rs:
            return rs[g]
    return None


def classify(m):
    v = M[m]
    if v.get('isZ') or v.get('isMax') or v.get('isNonstandard') in BAD:
        return 'nonstandard'
    if m not in W:
        return 'not-fetched'
    o = official(m)
    if not o:
        return 'no-official'
    if o.get('range', '').strip().lower() not in RANGE:
        return 'range'
    if o.get('target', '').strip().lower() not in TARGET:
        return 'target'
    if v.get('selfdestruct') or v.get('flags', {}).get('recharge') or (v.get('self') or {}).get('volatileStatus') or v.get('hasCrashDamage') or v.get('mindBlownRecoil') or v.get('chloroblastRecoil') or v.get('sleepUsable') or m == 'dreameater':
        return 'self-cost'
    if v['category'] != 'Status':
        for k in ('ohko', 'damage', 'multihit', 'recoil', 'selfSwitch', 'basePowerCallback'):
            if v.get(k):
                return 'mechanic'
        if not v.get('basePower') or v.get('flags', {}).get('charge'):
            return 'mechanic'
        if not re.fullmatch(r'\d+', (o.get('pow') or '').strip()):
            return 'no-power'
        return 'damage'
    if v.get('forceSwitch'):
        return 'damage'
    b = v.get('boosts') or {}
    if v.get('target') == 'self' and b and set(b) <= {'atk', 'def'}:
        return 'support'
    return 'status'


gen = lambda n: 1 if n <= 151 else 2 if n <= 251 else 3 if n <= 386 else 4 if n <= 493 else 5 if n <= 649 else 6 if n <= 721 else 7 if n <= 809 else 8 if n <= 905 else 9
species = [k for k, v in D.items() if 1 <= v.get('num', 0) <= 1025 and not v.get('forme') and v.get('isNonstandard') in (None, 'Past')]
cache = {}
rows = []
for g in range(1, 10):
    sp = [k for k in species if gen(D[k]['num']) == g]
    lg = collections.Counter()
    moves = set()
    weak = 0
    legend = sum(1 for k in sp if D[k].get('tags'))
    art = sum(1 for k in sp if (T.get(f"{D[k]['num']:04d}") or {}).get('sprite_complete', 0) > 0)
    zh = sum(1 for k in sp if D[k]['num'] in names)
    for k in sp:
        ls = L[k]['learnset']
        lgen = max(int(x[0]) for s in ls.values() for x in s if re.match(r'^\dL\d+$', x))
        lg[lgen] += 1
        sel = {m: s for m, s in ls.items() if any(x[0] == str(lgen) and x[1] != 'V' for x in s)}
        moves |= set(sel)
        lv = [m for m, s in sel.items() if any(x.startswith(f'{lgen}L') for x in s)]
        cls = [cache.setdefault(m, classify(m)) for m in lv]
        if not any(c == 'damage' for c in cls) or sum(c in ('damage', 'support') for c in cls) < 2:
            weak += 1
    c = collections.Counter(cache.setdefault(m, classify(m)) for m in moves)
    adm = c['damage'] + c['support']
    rows.append((g, len(sp), dict(sorted(lg.items(), reverse=True)), len(moves), adm, c['not-fetched'], weak, legend, art, zh))

print('| 世代 | 物种 | 学习表世代分布 | 可学招式并集 | 按模板可准入（预演） | 未抓取 | 招式不足（暂不出场候选） | 传说／幻 | SpriteCollab 有精灵 | 有简体中文名 |')
print('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for r in rows:
    dist = '、'.join(f'第{k}代 {v}' for k, v in r[2].items())
    print(f'| 第 {r[0]} 代 | {r[1]} | {dist} | {r[3]} | {r[4]} | {r[5]} | {r[6]} | {r[7]} | {r[8]} | {r[9]} |')
allm = set()
for k in species:
    ls = L[k]['learnset']
    lgen = max(int(x[0]) for s in ls.values() for x in s if re.match(r'^\dL\d+$', x))
    allm |= {m for m, s in ls.items() if any(x[0] == str(lgen) and x[1] != 'V' for x in s)}
c = collections.Counter(cache.setdefault(m, classify(m)) for m in allm)
print()
print(f'全世代招式并集 {len(allm)}：' + '、'.join(f'{k} {v}' for k, v in sorted(c.items(), key=lambda t: -t[1])))
print(f'全世代招式简体中文名：{sum(1 for m in allm if m in mnames)}/{len(allm)}')
