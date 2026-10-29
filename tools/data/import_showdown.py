#!/usr/bin/env python3
"""从 Pokémon Showdown 的 JSON 数据生成首批伙伴的本作数据 src/data/roster.json。

只使用 Python 标准库。输入文件只当数据读取，先校验 sha256，不一致就退出。
规则说明见 docs/制作流程/数据导入与招式映射.md。

用法：
  python -I tools/data/import_showdown.py [--src 目录] [--out 文件]
默认 --src 指向主 checkout 的 .artifacts/showdown/（由 git rev-parse --git-common-dir 定位）。
"""
import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

# ---- 固定来源（2026-10-30 下载） ----
EXPECTED_SHA256 = {
    "pokedex.json": "e74d0364b230001fc086cefb4259e051f1d16a4730eb89f7d6336a88a0d9a47e",
    "moves.json": "26909a321a7e4528d14a7dffd24173aa03a6845776cf41c39cc3d76f8e14616b",
    "learnsets.json": "cedbe661968e2d69abe9f317e9a3f5d4f2dcf989e1f937cb0cdd72e7af29ab8f",
}
SOURCE_URL = "https://play.pokemonshowdown.com/data/<name>.json"
SOURCE_DATE = "2026-10-30"
SOURCE_COMMIT = "ccfaa20f32af363569cd21a9d501b2bc1ded26b1"

# ---- 名单（工作候选）：(Showdown id, 图鉴编号, 是否可选主控) ----
ROSTER = [
    ("bulbasaur", 1, True),
    ("charmander", 4, True),
    ("squirtle", 7, True),
    ("pidgey", 16, False),
    ("rattata", 19, False),
    ("spearow", 21, False),
    ("pikachu", 25, False),
    ("zubat", 41, False),
    ("geodude", 74, False),
    # 阶段7.1：第二、第三世代御三家。追加在原 9 种之后，原 9 种的生成结果逐字节不变。
    ("chikorita", 152, True),
    ("cyndaquil", 155, True),
    ("totodile", 158, True),
    ("treecko", 252, True),
    ("torchic", 255, True),
    ("mudkip", 258, True),
]

BEHAVIORS = ["strong", "line", "guard", "push"]  # 与 src/core/engine.ts 的 Skill 一致

# ---- 覆盖表（显式规则，优先于自动规则） ----
# 保护类：本作改编，在本作中保护相邻的另一名同行（Showdown 中多数是保护自己）。
GUARD_OVERRIDE = ["protect", "detect", "withdraw", "defensecurl", "harden", "irondefense", "helpinghand"]
# 推退类：Showdown 带 forceSwitch 的招式自动算 push；下列为额外列入的招式。
PUSH_OVERRIDE = ["whirlwind", "roar", "dragontail", "circlethrow"]
# 不进入本作的招式：Z 招式、极巨招式，以及这些 isNonstandard 值。
EXCLUDED_NONSTANDARD = {"CAP", "Future", "Gmax", "LGPE", "Unobtainable"}

# 四种功能配置（核心玩法第 2 节），顺序即并列时的优先顺序。
CONFIGS = [
    ("守护", {"strong", "guard"}),
    ("射手", {"strong", "line"}),
    ("牵制", {"strong", "push"}),
    ("调位", {"line", "push"}),
]


def sha256_of(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def default_src():
    common = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"], cwd=REPO, check=True,
        capture_output=True, text=True).stdout.strip()
    common = (REPO / common).resolve()
    return common.parent / ".artifacts" / "showdown"


def load(src):
    data = {}
    for name, want in EXPECTED_SHA256.items():
        path = src / name
        if not path.is_file():
            sys.exit(f"缺少输入文件：{path}")
        got = sha256_of(path)
        if got != want:
            sys.exit(f"sha256 不一致：{name}\n  期望 {want}\n  实际 {got}")
        with path.open(encoding="utf-8") as f:
            data[name.split(".")[0]] = json.load(f)
    return data


def classify(move_id, mv):
    """返回本作行为名，或 None（未映射）。"""
    if mv.get("isZ") or mv.get("isMax"):
        return None
    if mv.get("isNonstandard") in EXCLUDED_NONSTANDARD:
        return None
    if move_id in GUARD_OVERRIDE:
        return "guard"
    if move_id in PUSH_OVERRIDE or "forceSwitch" in mv:
        return "push"
    if mv.get("selfSwitch"):  # 换人类（回身等）：不是击退，也不当作强击
        return None
    cat, bp = mv.get("category"), mv.get("basePower", 0)
    flags, target = mv.get("flags", {}), mv.get("target")
    if cat == "Physical" and bp >= 40 and flags.get("contact") and target == "normal":
        return "strong"
    if cat != "Status" and bp >= 20 and not flags.get("contact") and target in ("normal", "any"):
        return "line"
    return None


def game_pp(showdown_pp):
    return max(1, min(4, math.floor(showdown_pp / 10)))


CODE = re.compile(r"^(\d+)([A-Z])(\d*)$")


def parse_codes(codes):
    out = []
    for c in codes:
        m = CODE.match(c)
        if m:
            out.append((int(m.group(1)), m.group(2), int(m.group(3)) if m.group(3) else None))
    return out


def pick_kit(levelups):
    """levelups: {行为: (等级, 招式id)}，每种行为已取等级最低者。返回 (行为列表, 配置名或None)。"""
    avail = set(levelups)

    def key(pair):
        lv = [levelups[b][0] for b in pair]
        return (max(lv), sum(lv))

    def order(pair):
        return sorted(pair, key=lambda b: (levelups[b][0], BEHAVIORS.index(b)))

    full = [(key(req), i, name, req) for i, (name, req) in enumerate(CONFIGS) if req <= avail]
    if full:
        _, _, name, req = min(full, key=lambda t: (t[0], t[1]))
        return order(req), name
    if len(avail) >= 2:
        pairs = [(b1, b2) for i, b1 in enumerate(BEHAVIORS) for b2 in BEHAVIORS[i + 1:] if {b1, b2} <= avail]
        best = min(pairs, key=lambda p: (key(p), BEHAVIORS.index(p[0]), BEHAVIORS.index(p[1])))
        return order(best), None
    return sorted(avail), None


def build(data):
    dex, moves, learn = data["pokedex"], data["moves"], data["learnsets"]
    species, report = [], []
    for sid, num, starter in ROSTER:
        entry = dex[sid]
        if entry["num"] != num:
            sys.exit(f"{sid} 的图鉴编号 {entry['num']} 与名单 {num} 不符")
        parsed = {mid: parse_codes(cs) for mid, cs in learn[sid]["learnset"].items()}
        # 时代：该物种存在 level-up（L）条目的最新世代
        era = max(g for ps in parsed.values() for g, k, _ in ps if k == "L")
        levelups = {}
        for mid, ps in parsed.items():
            lv = [n for g, k, n in ps if g == era and k == "L"]
            if not lv or mid not in moves:
                continue
            b = classify(mid, moves[mid])
            if b is None:
                continue
            cand = (min(lv), mid)
            if b not in levelups or cand < levelups[b]:
                levelups[b] = cand
        chosen, config = pick_kit(levelups)
        kit = [{"move": levelups[b][1], "behavior": b, "pp": game_pp(moves[levelups[b][1]]["pp"])} for b in chosen]
        # learnable：该世代任何学习方式
        learnable, unmapped = [], 0
        for mid, ps in parsed.items():
            if mid not in moves or not any(g == era for g, _, _ in ps):
                continue
            b = classify(mid, moves[mid])
            if b is None:
                unmapped += 1
                continue
            learnable.append({"move": mid, "behavior": b, "pp": game_pp(moves[mid]["pp"])})
        learnable.sort(key=lambda e: (BEHAVIORS.index(e["behavior"]), e["move"]))
        species.append({
            "id": sid,
            "dex": f"{num:04d}",
            "name": entry["name"],
            "starter": starter,
            "types": entry["types"],
            "baseStats": entry["baseStats"],
            "maxHp": 12 + entry["baseStats"]["hp"] // 5,
            "kit": kit,
            "learnable": learnable,
            "source": f"pokedex.json[{sid}]; learnsets.json[{sid}] 第{era}世代; moves.json",
        })
        report.append((sid, era, config, kit, len(learnable), unmapped))
    return species, report


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, help="含三个 Showdown JSON 的目录")
    ap.add_argument("--out", type=Path, default=REPO / "src" / "data" / "roster.json")
    args = ap.parse_args()
    src = args.src or default_src()
    data = load(src)
    species, report = build(data)
    doc = {
        "source": {
            "project": "Pokémon Showdown",
            "files": dict(sorted(EXPECTED_SHA256.items())),
            "url": SOURCE_URL,
            "downloaded": SOURCE_DATE,
            "githubCommit": SOURCE_COMMIT,
            "license": "代码 MIT；宝可梦数据知识产权不在许可之内，仅私有构建",
            "note": "工作候选：名单、maxHp 公式、pp 换算与行为映射均待后续平衡决定",
        },
        "species": species,
    }
    text = json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    for sid, era, config, kit, nl, nu in report:
        print(f"{sid}: 第{era}世代 配置={config or '无'} kit={[(k['move'], k['behavior'], k['pp']) for k in kit]} 可学映射={nl} 未映射={nu}")
    print(f"已写入 {args.out}")


if __name__ == "__main__":
    main()
