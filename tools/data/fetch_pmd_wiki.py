#!/usr/bin/env python3
"""从 Bulbapedia MediaWiki API 批量抓取招式页中的官方迷宫数据行，存为快照（图鉴批量导入规格第 3 节）。

只抓取、不解释：每个招式保存页面版本号与源码中全部 {{MDMoveRow|...}}、{{MDMovefoot|...}} 原文，
解析与取舍由离线导入脚本完成。只使用 Python 标准库；带明确 User-Agent，每次请求间隔 ≥ 1 秒，带 maxlag。

用法：
  python -I tools/data/fetch_pmd_wiki.py --moves 文件 [--out 文件]
--moves 是每行一个 Showdown 招式 id 的文本文件；招式名从主 checkout 的 .artifacts/showdown/moves.json 读取。
默认 --out 为主 checkout 的 .artifacts/pmd/wiki-<今天>.json，并在同目录写 <文件名>.sha256。
"""
import argparse
import datetime
import hashlib
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
API = "https://bulbapedia.bulbagarden.net/w/api.php"
USER_AGENT = "pokemon-dungeon-lab-private-import/0.1 (private, non-commercial; batch of <=10 pages, 1 req/s)"
BATCH = 10
# 允许一层嵌套模板，例如 range={{tt|Front|Indicated as Others in-game}}；更深的嵌套由下方计数核对拦下。
ROW = re.compile(r"\{\{MDMove(?:Row|foot)\|(?:[^{}]|\{\{[^{}]*\}\})*\}\}")


def common_root():
    out = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
                         cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()
    return Path(out).parent


def get(titles):
    q = {"action": "query", "prop": "revisions", "rvprop": "ids|content", "rvslots": "main", "redirects": "1",
         "titles": "|".join(titles), "format": "json", "formatversion": "2", "maxlag": "5"}
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(q), headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
        if data.get("error", {}).get("code") == "maxlag":
            time.sleep(5 * (attempt + 1))
            continue
        if "error" in data:
            sys.exit(f"API 错误：{data['error']}")
        return data["query"]
    sys.exit("服务器持续繁忙（maxlag），稍后重跑")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--moves", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    root = common_root()
    names = {k: v["name"] for k, v in json.loads((root / ".artifacts/showdown/moves.json").read_text(encoding="utf-8")).items()}
    ids = sorted({line.strip() for line in Path(a.moves).read_text(encoding="utf-8").splitlines() if line.strip()})
    unknown = [i for i in ids if i not in names]
    if unknown:
        sys.exit(f"Showdown 中没有这些招式 id：{unknown}")
    title_of = {i: names[i] + " (move)" for i in ids}
    by_title = {}
    for n in range(0, len(ids), BATCH):
        chunk = [title_of[i] for i in ids[n:n + BATCH]]
        q = get(chunk)
        alias = {x["from"]: x["to"] for x in q.get("normalized", []) + q.get("redirects", [])}
        pages = {p["title"]: p for p in q["pages"]}
        for t in chunk:
            final = alias.get(alias.get(t, t), alias.get(t, t))
            by_title[t] = pages.get(final, {"title": final, "missing": True})
        print(f"{min(n + BATCH, len(ids))}/{len(ids)}", file=sys.stderr)
        time.sleep(1.1)
    moves, missing = {}, []
    for i in ids:
        p = by_title[title_of[i]]
        if p.get("missing") or "revisions" not in p:
            missing.append(i)
            continue
        rev = p["revisions"][0]
        text = rev["slots"]["main"]["content"]
        rows = ROW.findall(text)
        # 行内若嵌套模板，正则会漏掉整行；以原文中的模板起始次数核对，不等就停下而不是静默少行。
        if len(rows) != text.count("{{MDMoveRow") + text.count("{{MDMovefoot"):
            sys.exit(f"{i}（{p['title']}）有 MDMoveRow／MDMovefoot 行未能完整匹配，需更新解析规则")
        moves[i] = {"title": p["title"], "revid": rev["revid"], "rows": rows}
    today = datetime.date.today().isoformat()
    snap = {"source": API, "retrieved": today, "userAgent": USER_AGENT,
            "note": "每招保存 Bulbapedia 页面版本号与源码中的 MDMoveRow／MDMovefoot 原文；未经解析。",
            "requestedIds": ids, "moves": moves, "missingPages": missing}
    out = Path(a.out) if a.out else root / ".artifacts/pmd" / f"wiki-{today}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(snap, ensure_ascii=False, indent=1, sort_keys=True).encode("utf-8") + b"\n"
    out.write_bytes(body)
    digest = hashlib.sha256(body).hexdigest()
    out.with_name(out.name + ".sha256").write_text(f"{digest}  {out.name}\n", encoding="utf-8")
    no_rows = [i for i, m in moves.items() if not any(r.startswith("{{MDMoveRow") for r in m["rows"])]
    print(f"写入 {out}（sha256 {digest}）：{len(moves)} 页，缺页 {len(missing)}，有页无迷宫数据 {len(no_rows)}")


if __name__ == "__main__":
    main()
