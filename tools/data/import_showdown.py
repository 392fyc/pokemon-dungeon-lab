#!/usr/bin/env python3
"""从 Pokémon Showdown 的 JSON 数据生成首批伙伴的本作数据 src/data/roster.json。

只使用 Python 标准库。输入文件只当数据读取，先校验 sha256，不一致就退出。
规则说明见 https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/05-%E5%88%B6%E4%BD%9C%E6%B5%81%E7%A8%8B/%E6%95%B0%E6%8D%AE%E5%AF%BC%E5%85%A5%E4%B8%8E%E6%8B%9B%E5%BC%8F%E6%98%A0%E5%B0%84.md。

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
# src/core/legacy-moves.ts；这里仅保留原招式，避免新数据改变开局。
# 8.8（#165）：PP 不再冻结，一律取探险队官方 basePp（见 pp_from_specs）。
FROZEN_KITS = {
    "bulbasaur": ["tackle", "seedbomb"],
    "charmander": ["scratch", "ember"],
    "squirtle": ["tackle", "watergun"],
    "pidgey": ["tackle", "gust"],
    "rattata": ["tackle"],
    "spearow": ["pursuit"],
    "pikachu": ["quickattack", "thundershock"],
    "zubat": ["absorb", "poisonfang"],
    "geodude": ["tackle", "defensecurl"],
    "chikorita": ["tackle", "magicalleaf"],
    "cyndaquil": ["tackle", "ember"],
    "totodile": ["scratch", "watergun"],
    "treecko": ["pound", "leafage"],
    "torchic": ["scratch", "ember"],
    "mudkip": ["tackle", "watergun"],
    "sandshrew": ["scratch", "defensecurl"],
    "growlithe": ["ember", "bite"],
    "magnemite": ["tackle", "thundershock"],
    "onix": ["tackle", "harden"],
    "dratini": ["dragontail", "slam"],
    "wooper": ["watergun", "slam"],
    "houndour": ["ember", "roar"],
    "makuhita": ["tackle", "whirlwind"],
}
# 8.8（#165）：太晶爆发（terablast）已从招式机与可学招式中去除。
TM_MOVES = ("protect", "whirlwind", "roar", "dragontail", "helpinghand", "mudslap")


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


def pp_from_specs(specs, showdown_moves):
    """8.8（#165）：每招最大 PP＝探险队官方 basePp；没有官方数据的招式（叶影）取 Showdown 的基础 PP（40）。返回 move_id -> int。"""
    def pp_of(move_id):
        official = (specs.get(move_id) or {}).get("official")
        base = official.get("basePp") if isinstance(official, dict) else None
        if isinstance(base, str) and base.isdigit() and int(base) > 0:
            return int(base)
        move = showdown_moves.get(move_id)
        pp = move.get("pp") if isinstance(move, dict) else None
        if not isinstance(pp, int) or pp <= 0:
            sys.exit(f"招式 {move_id} 既没有官方 basePp，也没有有效的 Showdown PP：{pp!r}")
        return pp
    return pp_of


CODE = re.compile(r"^(\d+)([A-Z])(\d*)$")


def parse_codes(codes):
    out = []
    for c in codes:
        m = CODE.match(c)
        if m:
            out.append((int(m.group(1)), m.group(2), int(m.group(3)) if m.group(3) else None))
    return out


def build(data, pp_of):
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
        kit = [{"move": mid, "pp": pp_of(mid)} for mid in FROZEN_KITS[sid]]
        learnable_by_id = {m["move"]: dict(m) for m in kit}
        # 招式机以该物种第九世代 learnset 中存在任一学习方式作为可学依据；初始招式无条件冻结保留。
        for mid, ps in parsed.items():
            if mid not in TM_MOVES or mid not in moves or not any(g == era for g, _, _ in ps):
                continue
            learnable_by_id.setdefault(mid, {"move": mid, "pp": pp_of(mid)})
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
    pmd = json.loads((REPO / "src" / "data" / "pmd-moves.json").read_text(encoding="utf-8"))
    species, report = build(data, pp_from_specs(pmd["moves"], data["moves"]))
    doc = {
        "source": {
            "project": "Pokémon Showdown",
            "files": dict(sorted(EXPECTED_SHA256.items())),
            "url": SOURCE_URL,
            "downloaded": SOURCE_DATE,
            "githubCommit": SOURCE_COMMIT,
            "license": "代码 MIT；宝可梦数据知识产权不在许可之内，仅私有构建",
            "note": "工作候选：名单与 maxHp 公式待后续平衡决定；初始招式按7.6名单冻结，PP 取探险队官方 basePp（8.8），learnable仅含初始招式与首批招式机",
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
