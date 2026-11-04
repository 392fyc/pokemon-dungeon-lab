#!/usr/bin/env python3
"""从 Pokémon Showdown 招式数据与 src/data/pmd-moves.json 生成 src/data/move-effects.json（8.8，#165）。

规格：docs/02-进度/计划/8.8命中状态与PP规格.md 第 2、3、4 节。只使用 Python 标准库。
输入文件只当数据读取，先校验 Showdown moves.json 的 sha256，不一致就退出。

每招输出：
  acc      命中率（百分数，可含小数）；null 表示必中。顺序：Showdown accuracy 为 true 的必中；
           探险队 official.accuracy 为 “—%”（原版必中）的必中；否则取探险队百分比；
           叶影等没有探险队数据的招式取 Showdown 的 accuracy。
  fx       附加效果列表（Showdown secondary / secondaries），每项独立判定：
           chance 概率；status 为 brn frz par psn tox confusion flinch 之一；
           foe 为降低对方能力的阶段变化，self 为提高自己能力的阶段变化。
  cost     用完后降低自己能力的代价（Showdown self.boosts），招式至少命中一个目标时生效。
  thaw     true 表示命中时让冰冻的目标解冻：火系招式，或 Showdown 标记 thawsTarget 的招式（热水）。
阶段键：atk def spa spd spe acc eva（spe 在本作不生效，见规格第 4 节）。

用法：
  python -I tools/data/import_move_effects.py [--src 目录] [--out 文件]
默认 --src 指向主 checkout 的 .artifacts/showdown/（由 git rev-parse --git-common-dir 定位）。
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MOVES_SHA256 = "26909a321a7e4528d14a7dffd24173aa03a6845776cf41c39cc3d76f8e14616b"
SOURCE_COMMIT = "ccfaa20f32af363569cd21a9d501b2bc1ded26b1"
# 本作没有太晶化，不生成它的数据（pmd-moves.json 仍保留数据行以便读取旧档）。
SKIPPED = {"terablast"}
STAGE_KEYS = {"atk": "atk", "def": "def", "spa": "spa", "spd": "spd", "spe": "spe", "accuracy": "acc", "evasion": "eva"}
STATUS_KEYS = {"brn", "frz", "par", "psn", "tox"}
VOLATILE_KEYS = {"confusion": "confusion", "flinch": "flinch"}


def default_src():
    common = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"], cwd=REPO, check=True,
        capture_output=True, text=True).stdout.strip()
    return (REPO / common).resolve().parent / ".artifacts" / "showdown"


def stages(boosts, move_id):
    out = {}
    for key, value in boosts.items():
        if key not in STAGE_KEYS or not isinstance(value, int) or value == 0:
            sys.exit(f"{move_id} 的阶段变化无法识别：{key}={value!r}")
        out[STAGE_KEYS[key]] = value
    return dict(sorted(out.items()))


def official_accuracy(official):
    """返回 ('always', None)、('percent', 数值) 或 ('unknown', None)。"""
    if not isinstance(official, dict):
        return ("unknown", None)
    text = official.get("accuracy", "")
    if text == "—%":
        return ("always", None)
    if text.endswith("%") and text[:-1]:
        value = float(text[:-1])
        return ("percent", int(value) if value == int(value) else value)
    return ("unknown", None)


def build(showdown, pmd):
    result = {}
    template_sources = json.loads((REPO / "tools/data/moves-items-191-sources.json").read_text(encoding="utf-8"))["moves"]
    for move_id, spec in sorted(pmd["moves"].items()):
        if move_id in SKIPPED:
            continue
        sd = showdown.get(move_id)
        if not isinstance(sd, dict):
            sys.exit(f"Showdown 数据里没有 {move_id}")
        kind, percent = official_accuracy(spec.get("official"))
        if sd.get("accuracy") is True or kind == "always":
            acc = None
        elif kind == "percent":
            acc = percent
        elif isinstance(sd.get("accuracy"), int):
            acc = sd["accuracy"]
        else:
            sys.exit(f"{move_id} 的命中率无法确定：官方 {spec.get('official')!r}，Showdown {sd.get('accuracy')!r}")
        fx = []
        secondaries = sd.get("secondaries") or ([sd["secondary"]] if sd.get("secondary") else [])
        for sec in secondaries:
            chance = sec.get("chance")
            if not isinstance(chance, int) or not 1 <= chance <= 100:
                sys.exit(f"{move_id} 的附加效果概率无效：{chance!r}")
            entry = {"chance": chance}
            if sec.get("status") is not None:
                if sec["status"] not in STATUS_KEYS:
                    sys.exit(f"{move_id} 的状态无法识别：{sec['status']!r}")
                entry["status"] = sec["status"]
            elif sec.get("volatileStatus") is not None:
                if sec["volatileStatus"] not in VOLATILE_KEYS:
                    sys.exit(f"{move_id} 的临时状态无法识别：{sec['volatileStatus']!r}")
                entry["status"] = VOLATILE_KEYS[sec["volatileStatus"]]
            elif sec.get("boosts"):
                entry["foe"] = stages(sec["boosts"], move_id)
            elif sec.get("self", {}).get("boosts"):
                entry["self"] = stages(sec["self"]["boosts"], move_id)
            else:
                # 带自定义回调的附加效果（三重攻击、封喉）不在规格范围，不生成。
                continue
            fx.append(entry)
        row = {"acc": acc}
        if sd.get("type") == "Fire" or sd.get("thawsTarget"):
            row["thaw"] = True
        if fx:
            row["fx"] = fx
        cost = (sd.get("self") or {}).get("boosts")
        if cost:
            row["cost"] = stages(cost, move_id)
        if "recoil" in spec.get("effects", []):
            recoil = sd.get("recoil")
            if not isinstance(recoil, list) or len(recoil) != 2 or not all(isinstance(v, int) and v > 0 for v in recoil):
                sys.exit(f"{move_id} 的反作用比例无效：{recoil!r}")
            row["recoil"] = recoil
        row["source"] = {
            "showdown": f"https://github.com/smogon/pokemon-showdown/blob/{SOURCE_COMMIT}/data/moves.ts",
            "id": move_id,
            "fields": [key for key in ("accuracy", "boosts", "status", "volatileStatus", "recoil", "heal", "secondary", "secondaries", "self") if key in sd],
            "pmd": spec.get("official", {}),
        }
        if move_id in template_sources:
            row["source"]["template"] = template_sources[move_id]
        result[move_id] = row
    return result


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, help="含 moves.json 的 Showdown 快照目录")
    ap.add_argument("--out", type=Path, default=REPO / "src" / "data" / "move-effects.json")
    args = ap.parse_args()
    src = args.src or default_src()
    raw = (src / "moves.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != MOVES_SHA256:
        sys.exit("Showdown moves.json 的 sha256 与固定输入不一致")
    showdown = json.loads(raw.decode("utf-8"))
    pmd = json.loads((REPO / "src" / "data" / "pmd-moves.json").read_text(encoding="utf-8"))
    doc = {
        "source": {
            "project": "Pokémon Showdown", "file": "moves.json", "sha256": MOVES_SHA256,
            "githubCommit": SOURCE_COMMIT,
            "accuracy": "探险队 official.accuracy（Bulbapedia）；Showdown accuracy 为 true 或探险队为“—%”时必中",
            "license": "代码 MIT；宝可梦数据知识产权不在许可之内，仅私有构建",
        },
        "moves": build(showdown, pmd),
    }
    text = json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"已写入 {args.out}（{len(doc['moves'])} 招）")


if __name__ == "__main__":
    main()
