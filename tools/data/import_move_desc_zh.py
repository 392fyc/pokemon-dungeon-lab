#!/usr/bin/env python3
"""Import official Simplified-Chinese move descriptions from 神奇宝贝百科 (wiki.52poke.com).

Usage (stdlib only):
  python -I tools/data/import_move_desc_zh.py [--cache DIR] [--out PATH] [--offline] [--date YYYY-MM-DD]

What it does
  1. Collects every move id the game can show: roster.json (kit + learnable of every species),
     the TM moves listed under names-zh.json "tms", and boss.json (bosses are roster species,
     so their moves are already covered; the script still checks that).
  2. Reads the Chinese move names from names-zh.json "moves".
  3. Asks the MediaWiki API (action=query, 25 moves = 50 titles per request) for the revision
     ids of "<名>（招式）" and "Template:<名>".
  4. The description text is not in the move page itself: the page includes
     {{招式说明|<属性>|1}}, which calls the template "Template:<名>" once per game version.
     The script expands "{{<名>|ZA}}" (传说Z-A) through action=expandtemplates, and falls back to
     SV (朱紫), then SWSH (剑盾) when the newer game has no text. The game code used is stored.
  5. Applies tools/data/move-desc-zh-overrides.json for project-specific effects, preserving
     the official text/version and attaching the current rule/data sources.
  6. Writes src/data/move-desc-zh.json (sorted keys, UTF-8, LF).

Cache and offline use
  Every API response is stored under .tmp/move-desc-raw/ (ignored by Git), one file per request,
  named by a hash of the request. When a cache file exists the script does not touch the network,
  so a second run is fully offline and byte-identical (without --date the date of the existing
  output is kept). --offline fails instead of fetching.
  Delete the cache to refetch. Raw files are read only as JSON data, never executed.
  Requests: only wiki.52poke.com, >= 1 s apart, fixed User-Agent, 30 s timeout.
"""
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
API = "https://wiki.52poke.com/api.php"
UA = "PokemonDungeonLab-private-import/1.0 (private build)"
GAMES = [("ZA", "传说Z-A"), ("SV", "朱紫"), ("SWSH", "剑盾")]
# Moves whose Chinese name is deliberately absent from names-zh.json (documented PokeAPI spelling exception:
# PokeAPI has "vice-grip", Showdown "visegrip"). Only used to locate the 52poke page; names-zh.json is untouched.
NAME_OVERRIDES = {"visegrip": "夹住"}
LICENSE = "私有构建内使用（D-20261103-05）"
_last = [0.0]


def cache_dir(arg):
    if arg:
        return Path(arg)
    # task worktrees keep their own ignored .tmp; use it so runs stay inside the worktree
    return REPO / ".tmp" / "move-desc-raw"


def call(params, cache, offline):
    params = dict(params, format="json", formatversion="2")
    key = hashlib.sha1(json.dumps(params, sort_keys=True, ensure_ascii=False).encode("utf8")).hexdigest()[:16]
    f = cache / f"{params['action']}-{key}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf8"))
    if offline:
        raise SystemExit(f"offline and no cache for {params['action']} request {key}")
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(API, data=urllib.parse.urlencode(params).encode("utf8"), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf8")
    _last[0] = time.time()
    data = json.loads(body)
    if "error" in data:
        raise SystemExit(f"API error: {data['error']}")
    cache.mkdir(parents=True, exist_ok=True)
    f.write_text(body, encoding="utf8", newline="\n")
    return data


def collect():
    roster = json.loads((REPO / "src/data/roster.json").read_text(encoding="utf8"))
    names = json.loads((REPO / "src/data/names-zh.json").read_text(encoding="utf8"))
    ids = set()
    for s in roster["species"]:
        for k in ("kit", "learnable"):
            ids.update(m["move"] for m in s.get(k, []))
    ids.update(names.get("tms", {}))
    boss = json.loads((REPO / "src/data/boss.json").read_text(encoding="utf8"))
    for b in boss.get("bosses", {}):
        if b not in {s["id"] for s in roster["species"]}:
            raise SystemExit(f"boss {b} not in roster")
    return sorted(ids), names["moves"]


def clean(raw):
    """Template output -> text as the page shows it (Simplified variant)."""
    t = re.sub(r"-\{(?:[^;{}]*?;)*?zh-hans:(.*?)(?:;zh-hant:.*?)?\}-", r"\1", raw, flags=re.S)
    t = re.sub(r"-\{([^{}]*)\}-", r"\1", t)           # variant block without language tags
    t = re.sub(r"<br\s*/?>", "\n", t)                  # <br> shows as a line break
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = t.replace("'''", "").replace("''", "")
    return t.strip()


def apply_overrides(moves):
    relative = "tools/data/move-desc-zh-overrides.json"
    doc = json.loads((REPO / relative).read_text(encoding="utf8"))
    for move_id, override in doc["moves"].items():
        if move_id not in moves:
            raise SystemExit(f"override has no imported source: {move_id}")
        if not override["desc"].strip() or not override["source"].get("rules"):
            raise SystemExit(f"override has no description or rule source: {move_id}")
        row = moves[move_id]
        row["originalDesc"], row["originalGame"] = row["desc"], row["game"]
        row["desc"], row["game"] = override["desc"], "本作"
        row["overrideSource"] = {"file": relative, **override["source"]}
    return {"file": relative, **doc["source"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache")
    ap.add_argument("--out", default=str(REPO / "src/data/move-desc-zh.json"))
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--date")
    a = ap.parse_args()
    if not a.date:
        # keep the date of the existing output so an offline rerun stays byte-identical
        old = Path(a.out)
        a.date = json.loads(old.read_text(encoding="utf8"))["source"]["date"] if old.exists() else time.strftime("%Y-%m-%d")
    cache = cache_dir(a.cache)
    ids, zh = collect()

    moves, missing = {}, {}
    todo = {}
    for i in ids:
        if i not in zh and i in NAME_OVERRIDES:
            todo[i] = NAME_OVERRIDES[i]
        elif i not in zh:
            missing[i] = {"name": None, "reason": "名称对不上：names-zh.json 的 moves 没有这个招式的中文名，无法定位页面"}
        else:
            todo[i] = zh[i]

    # step 1: page and template revisions
    info = {}
    items = sorted(todo.items())
    for n in range(0, len(items), 25):
        part = items[n:n + 25]
        titles = [f"{nm}（招式）" for _, nm in part] + [f"Template:{nm}" for _, nm in part]
        d = call({"action": "query", "prop": "revisions", "rvprop": "ids", "titles": "|".join(titles)}, cache, a.offline)
        norm = {x["from"]: x["to"] for x in d["query"].get("normalized", [])}
        pages = {p["title"]: p for p in d["query"]["pages"]}
        for _, nm in part:
            for kind, t in (("page", f"{nm}（招式）"), ("tpl", f"Template:{nm}")):
                p = pages.get(norm.get(t, t))
                rev = None if not p or p.get("missing") else p["revisions"][0]["revid"]
                info.setdefault(nm, {})[kind] = rev

    # step 2: expand "{{名|GAME}}" for each game, newest first
    text, game = {}, {}
    pending = [i for i, nm in sorted(todo.items()) if info[nm]["tpl"]]
    for code, label in GAMES:
        for n in range(0, len(pending), 40):
            part = pending[n:n + 40]
            body = "".join(f"@@{i}@@{{{{{todo[i]}|{code}}}}}" for i in part)
            d = call({"action": "expandtemplates", "prop": "wikitext", "text": body}, cache, a.offline)
            for i, raw in re.findall(r"@@([a-z0-9]+)@@(.*?)(?=@@[a-z0-9]+@@|\Z)", d["expandtemplates"]["wikitext"], flags=re.S):
                if "[[:Template:" in raw or "{{" in raw:
                    continue
                c = clean(raw)
                if c:
                    text[i], game[i] = c, label
        pending = [i for i in pending if i not in text]

    for i, nm in sorted(todo.items()):
        r = info[nm]
        if i in text:
            moves[i] = {"name": nm, "desc": text[i], "page": f"{nm}（招式）", "revid": r["page"], "game": game[i]}
            moves[i]["tplRevid"] = r["tpl"]
            if r["page"] is None:
                moves[i]["pageNote"] = "招式页不存在于 API 返回，说明取自模板"
        elif r["page"] is None:
            missing[i] = {"name": nm, "reason": "页面不存在：" + f"{nm}（招式）"}
        else:
            missing[i] = {"name": nm, "reason": "没有说明栏位：说明模板不存在或在 ZA、SV、SWSH 三个版本都没有文字"}

    overrides = apply_overrides(moves)
    out = {
        "source": {
            "site": "神奇宝贝百科 wiki.52poke.com",
            "api": API,
            "date": a.date,
            "license": LICENSE,
            "overrides": overrides,
            "method": "action=query 取页面与模板修订号；action=expandtemplates 展开 {{<名>|<版本>}}，取简体变体；版本顺序 ZA（传说Z-A）、SV（朱紫）、SWSH（剑盾）",
        },
        "moves": moves,
        "missing": missing,
    }
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf8", newline="\n")
    print(f"total {len(ids)}, got {len(moves)}, missing {len(missing)}")


if __name__ == "__main__":
    sys.exit(main())
