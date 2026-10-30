#!/usr/bin/env python3
"""从官方《宝可梦不可思议的迷宫》招式数据快照生成 src/data/pmd-moves.json（阶段7.7）。

规格：docs/玩法研究/官方招式模型规格.md（第 2–5 节）。只使用 Python 标准库。
快照由 main 用内置浏览器读取 Bulbapedia 各招式页 “Pokémon Mystery Dungeon series” 一节的表格得到，
存于主 checkout 被忽略的 .artifacts/pmd/；先校验文件 sha256 与表格行的 sha256，不一致就退出。

用法：
  python -I tools/data/import_pmd.py [--src 文件] [--out 文件]
默认 --src 指向主 checkout 的 .artifacts/pmd/moves-2026-10-30.json（由 git rev-parse --git-common-dir 定位）。
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

# ---- 固定来源（2026-10-30 读取） ----
SNAPSHOT_NAME = "moves-2026-10-30.json"
EXPECTED_SHA256 = "9dc017d8964cce9785988236c1dd56417cae3ecfd38ea3213d7969d47d81c683"
EXPECTED_ROWS_SHA256 = "f4cf84fbc455924f019f57496dd69fd0d3b4eb07fde7851738af496052b4d406"
COLUMNS = ["Game", "BasePower", "MaxPower", "BasePP", "MaxPP", "BaseAccuracy", "MaxAccuracy", "Range", "Target", "Cutscorners"]

# 作品优先级：探险队（时／暗 MDTDS、空 BSL）优先；探险队没有的取之后的作品（执行理解，见规格第 1 节）。
GAME_PRIORITY = ["MDTDS", "BSL", "MDGtI", "SMD"]
GAME_NAMES = {"MDTDS": "时／暗之探险队", "BSL": "空之探险队", "MDGtI": "无限迷宫", "SMD": "超不可思议的迷宫"}
RANGE = {"Front": "front", "2 tiles away": "front2", "10 tiles away": "line10", "1 tile around user": "around",
         "Entire room": "room", "Enitre room": "room", "User": "user"}
TARGET = {"Enemy": "enemy", "User": "user", "Teammates": "teammates", "Party": "party", "All": "all"}

# 首批 25 招（规格第 4 节）。效果是规格对官方效果的取舍；数值规则见规格第 3 节。
FIRST_BATCH = {
    "bite": (["damage"], "省略畏缩"),
    "poisonfang": (["damage"], "省略剧毒"),
    "pound": (["damage"], ""),
    "pursuit": (["counter"], "探险队里是反击状态（7–12 回合），本作持续 3"),
    "quickattack": (["damage"], "本作 4 方向网格，无斜角"),
    "scratch": (["damage"], ""),
    "slam": (["damage"], "官方命中 78%，本作必中"),
    "tackle": (["damage"], ""),
    "absorb": (["damage", "drain"], ""),
    "ember": (["damage"], "省略灼伤；本作 4 方向网格，无斜角"),
    "gust": (["damage"], "省略对空中双倍（本作无飞空）"),
    "magicalleaf": (["damage"], "本作 4 方向网格，无斜角"),
    "seedbomb": (["damage"], "本作 4 方向网格，无斜角"),
    "thundershock": (["damage"], "省略麻痹"),
    "watergun": (["damage"], "本作 4 方向网格，无斜角"),
    "mudslap": (["damage"], "省略降命中"),
    "defensecurl": (["stage:def:+1"], "“每级 −1 伤害”为本作换算"),
    "harden": (["stage:def:+1"], "“每级 −1 伤害”为本作换算"),
    "protect": (["protect"], "持续固定 3（官方 3–6）；连续使用被拒（官方为概率失败）"),
    "helpinghand": (["stage:atk:+1"], "官方同时加特攻；“每级 +1 伤害”为本作换算"),
    "dragontail": (["damage", "blowaway"], "探险队没有此招，取无限迷宫数据"),
    "roar": (["blowaway"], ""),
    "whirlwind": (["blowaway"], ""),
}
# 每招预期的作品与射程：数据回退到别的作品或射程变了就报错，避免效果选择与官方数据悄悄脱节。
EXPECTED = {m: ("MDGtI" if m == "dragontail" else "MDTDS",
                {"pursuit": "user", "quickattack": "front2", "defensecurl": "user", "harden": "user", "protect": "user",
                 "helpinghand": "room"}.get(m, "front")) for m in FIRST_BATCH}
# 官方迷宫系列没有的招式：本作自定（规格第 4 节）。
SELF_DEFINED = {
    "leafage": {"range": "front", "target": "enemy", "power": 6, "effects": ["damage"],
                "note": "官方迷宫没有此招；按草系近身小招设定，威力取与撞击相同的 6"},
    "terablast": {"range": "front", "target": "enemy", "power": 12, "effects": ["damage"],
                  "note": "官方迷宫没有此招；作为招式机的较强近身招，威力取与魔法叶相同的 12"},
}
# 7.7b 候选（团队保护与增益），只记录官方数据，不进首批（规格第 8 节问题 3）。
CANDIDATES_77B = ["wideguard", "quickguard", "reflect", "lightscreen", "safeguard", "mist"]


def default_src():
    common = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"], cwd=REPO, check=True,
        capture_output=True, text=True).stdout.strip()
    common = (REPO / common).resolve()
    return common.parent / ".artifacts" / "pmd" / SNAPSHOT_NAME


def fail(msg):
    print(f"import_pmd: {msg}", file=sys.stderr)
    sys.exit(1)


def load(src):
    raw = src.read_bytes()
    got = hashlib.sha256(raw).hexdigest()
    if got != EXPECTED_SHA256:
        fail(f"{src} 的 sha256 是 {got}，预期 {EXPECTED_SHA256}")
    snap = json.loads(raw.decode("utf-8"))
    rows = json.dumps(snap["moves"], separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if hashlib.sha256(rows).hexdigest() != EXPECTED_ROWS_SHA256:
        fail("快照中表格行的 sha256 与读取时记录的不一致")
    if snap.get("columns") != COLUMNS:
        fail("快照的列定义与预期不同")
    return snap


def pick(rows):
    by = {}
    for r in rows:
        if r[0] in by:
            fail(f"同一招式有两行 {r[0]} 数据")
        by[r[0]] = dict(zip(COLUMNS, r))
    for g in GAME_PRIORITY:
        if g in by:
            return g, by[g]
    return None, None


def official(move_id, rows):
    game, row = pick(rows)
    if row is None:
        fail(f"{move_id} 在快照里没有迷宫数据")
    if row["Range"] not in RANGE or row["Target"] not in TARGET:
        fail(f"{move_id} 的射程或目标无法识别：{row['Range']} / {row['Target']}")
    power = int(row["BasePower"]) if row["BasePower"].isdigit() else None
    return {
        "range": RANGE[row["Range"]], "target": TARGET[row["Target"]], "power": power,
        "game": game, "gameName": GAME_NAMES[game],
        "official": {"basePp": row["BasePP"], "accuracy": row["BaseAccuracy"], "cutsCorners": row["Cutscorners"]},
    }


def build(snap):
    moves = snap["moves"]
    out = {}
    for move_id, (effects, note) in FIRST_BATCH.items():
        if move_id not in moves:
            fail(f"快照里没有 {move_id}")
        rec = official(move_id, moves[move_id])
        if (rec["game"], rec["range"]) != EXPECTED[move_id]:
            fail(f"{move_id} 取到 {rec['game']}／{rec['range']}，预期 {EXPECTED[move_id]}")
        if ("damage" in effects) != (rec["power"] is not None):
            fail(f"{move_id} 的威力 {rec['power']} 与效果 {effects} 不一致")
        rec.update({"effects": effects, "source": "Bulbapedia", "note": note})
        out[move_id] = rec
    for move_id, rec in SELF_DEFINED.items():
        if moves.get(move_id):
            fail(f"{move_id} 现在有官方迷宫数据，不应再按本作自定处理")
        out[move_id] = {**rec, "game": None, "gameName": None, "official": None, "source": "本作自定"}
    missing = [m for m in CANDIDATES_77B if m not in moves]
    if missing:
        fail(f"快照里没有 7.7b 候选 {missing}")
    candidates = {m: official(m, moves[m]) for m in CANDIDATES_77B}
    return {
        "note": "阶段7.7 官方招式模型的数据（规格：docs/玩法研究/官方招式模型规格.md）。由 tools/data/import_pmd.py 生成，勿手改。仅用于私有构建。",
        "source": snap["source"], "retrieved": snap["retrieved"], "snapshotSha256": EXPECTED_SHA256,
        "gamePriority": GAME_PRIORITY,
        "moves": dict(sorted(out.items())),
        "candidates77b": candidates,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=REPO / "src" / "data" / "pmd-moves.json")
    a = ap.parse_args()
    data = build(load(a.src or default_src()))
    a.out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"import_pmd: 写出 {a.out}（首批 {len(data['moves'])} 招，7.7b 候选 {len(data['candidates77b'])} 招）")


if __name__ == "__main__":
    main()
