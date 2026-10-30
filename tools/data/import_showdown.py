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
    # 阶段7.3：新增 8 种非御三家，追加在末尾，前 15 种的生成结果逐字节不变。区域首领风速狗不进名单（见 BOSS_SPECIES）。
    ("sandshrew", 27, False),
    ("growlithe", 58, False),
    ("magnemite", 81, False),
    ("onix", 95, False),
    ("dratini", 147, False),
    ("wooper", 194, False),
    ("houndour", 228, False),
    ("makuhita", 296, False),
]

# ---- 冻结的初始招式：来自 7.6 roster.json 的原 kit ----
# 旧行为语义不再参与生成。迁移用的 behavior -> move 对照保存在
# src/core/legacy-moves.ts；这里仅保留原招式与 PP，避免新数据改变开局。
FROZEN_KITS = {
    "bulbasaur": [("tackle", 3), ("seedbomb", 1)],
    "charmander": [("scratch", 3), ("ember", 2)],
    "squirtle": [("tackle", 3), ("watergun", 2)],
    "pidgey": [("tackle", 3), ("gust", 3)],
    "rattata": [("tackle", 3)],
    "spearow": [("pursuit", 2)],
    "pikachu": [("quickattack", 3), ("thundershock", 3)],
    "zubat": [("absorb", 2), ("poisonfang", 1)],
    "geodude": [("tackle", 3), ("defensecurl", 4)],
    "chikorita": [("tackle", 3), ("magicalleaf", 2)],
    "cyndaquil": [("tackle", 3), ("ember", 2)],
    "totodile": [("scratch", 3), ("watergun", 2)],
    "treecko": [("pound", 3), ("leafage", 4)],
    "torchic": [("scratch", 3), ("ember", 2)],
    "mudkip": [("tackle", 3), ("watergun", 2)],
    "sandshrew": [("scratch", 3), ("defensecurl", 4)],
    "growlithe": [("ember", 2), ("bite", 2)],
    "magnemite": [("tackle", 3), ("thundershock", 3)],
    "onix": [("tackle", 3), ("harden", 3)],
    "dratini": [("dragontail", 1), ("slam", 2)],
    "wooper": [("watergun", 2), ("slam", 2)],
    "houndour": [("ember", 2), ("roar", 2)],
    "makuhita": [("tackle", 3), ("whirlwind", 2)],
}
TM_MOVES = ("protect", "whirlwind", "roar", "dragontail", "helpinghand", "mudslap", "terablast")


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


def build(data):
    dex, moves, learn = data["pokedex"], data["moves"], data["learnsets"]
    species, report = [], []
    for sid, num, starter in ROSTER:
        entry = dex[sid]
        if entry["num"] != num:
            sys.exit(f"{sid} 的图鉴编号 {entry['num']} 与名单 {num} 不符")
        if sid not in FROZEN_KITS:
            sys.exit(f"{sid} 没有冻结的初始招式表")
        parsed = {mid: parse_codes(cs) for mid, cs in learn[sid]["learnset"].items()}
        # 时代：该物种存在 level-up（L）条目的最新世代
        era = max(g for ps in parsed.values() for g, k, _ in ps if k == "L")
        kit = [{"move": mid, "pp": pp} for mid, pp in FROZEN_KITS[sid]]
        learnable_by_id = {m["move"]: dict(m) for m in kit}
        # 招式机以该物种第九世代 learnset 中存在任一学习方式作为可学依据；初始招式无条件冻结保留。
        for mid, ps in parsed.items():
            if mid not in TM_MOVES or mid not in moves or not any(g == era for g, _, _ in ps):
                continue
            learnable_by_id.setdefault(mid, {"move": mid, "pp": game_pp(moves[mid]["pp"])})
        learnable = list(learnable_by_id.values())
        learnable.sort(key=lambda e: e["move"])
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
        report.append((sid, era, kit, len(learnable)))
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
            "note": "工作候选：名单、maxHp 公式与 PP 换算待后续平衡决定；初始招式按7.6名单冻结，learnable仅含初始招式与首批招式机",
        },
        "species": species,
    }
    text = json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    for sid, era, kit, nl in report:
        print(f"{sid}: 第{era}世代 kit={[(k['move'], k['pp']) for k in kit]} 可学={nl}")
    print(f"已写入 {args.out}")


if __name__ == "__main__":
    main()
