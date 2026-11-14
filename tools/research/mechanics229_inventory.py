#!/usr/bin/env python3
"""Extract issue #229 move categories from pinned snapshots and hash-bound local data.

Uses Python standard-library JSON parsing only. It does not import or execute
Pokémon Showdown TypeScript or JavaScript.
"""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_ROOT = ROOT
OUT_DIR = ROOT / ".artifacts" / "research229"
SNAPSHOT_COMMIT = "ccfaa20f32af363569cd21a9d501b2bc1ded26b1"
EXPECTED_SHA256 = {
    ".artifacts/showdown/pokedex.json": "e74d0364b230001fc086cefb4259e051f1d16a4730eb89f7d6336a88a0d9a47e",
    ".artifacts/showdown/moves.json": "26909a321a7e4528d14a7dffd24173aa03a6845776cf41c39cc3d76f8e14616b",
    ".artifacts/showdown/learnsets.json": "cedbe661968e2d69abe9f317e9a3f5d4f2dcf989e1f937cb0cdd72e7af29ab8f",
}
EXPECTED_LOCAL_SHA256 = {
    "src/data/roster.json": "79c9935b8e8178066dc21c08fcafc37db17214a459a4b886064dc0b75a28acdf",
    "src/data/names-zh.json": "ff19e5b9668a933c206daca71588bd4593f3dede6e3cc4d19804c413699427b5",
    "src/data/pmd-moves.json": "e1c1000889d233fbe2124aa341e435399a546f86443db0f24af7511e3ea20bfe",
    "src/data/move-effects.json": "4a8aaa96cac79a2e0dc9d84198cd6bcc260a0bb5b1c42eddc8dd5b9203c9c516",
}
CODE = re.compile(r"^(\d+)([A-Z])(\d*)$")
CATEGORY_ORDER = ["B2", "B3", "B4", "B5", "B6", "B7", "B9"]
CATEGORY_TITLES = {
    "B2": "蓄力两回合",
    "B3": "需要休息",
    "B5": "多段",
    "B6": "固定伤害",
    "B7": "地震",
}
CATEGORY_LIMITS = {
    "B2": "Showdown flags.charge 命中只是一类字段识别；原版候选覆盖是否完整仍待云核。8.9 对蓄力期间的行动、受击、中断与自动选招仍未定。",
    "B3": "flags.recharge 或 self.volatileStatus 只标记需要休息；8.9 对休息回合推进、状态与自动选招仍未定。",
    "B5": "multihit 是快照中的段数或范围字段；每段是否分别判附加效果、吸取与反击由 8.9 明列待定。",
    "B6": "这里只按 JSON 中实际保留的 damage 或 damageCallback 字段识别；缺少 damageCallback 不能证明来源没有回调机制。",
    "B7": "按 id=earthquake 识别；Showdown JSON 的 target 字段不自动等同于 8.9 所述的原版目标，误伤和自动选招仍未定。",
}
SOURCE_CANDIDATES = {
    "focuspunch": {
        "category": "B2",
        "source": "https://bulbapedia.bulbagarden.net/w/index.php?title=Status_condition_(Mystery_Dungeon)&oldid=4663460",
        "status": "二手资料候选，待云端原版核实",
        "note": "二手资料记载 Focus Punch 的状态会因受到伤害取消；此处仅将其列为 B2 接口候选，不确认原版完整行为。",
    },
}
NON_MOVE_ITEMS = [
    {
        "code": "B4",
        "name": "投掷（道具投掷行动）",
        "reason": "8.9 把它定义为新行动与投掷物，不属于 Pokémon Showdown 招式学习表并集。",
        "open_fields": "投掷射程、目标、伤害、消耗与界面仍待定。",
    },
    {
        "code": "B9",
        "name": "喜悦种子（道具）",
        "reason": "8.9 把它定义为队伍等级 +1 的道具，不属于招式学习表并集。",
        "open_fields": "如何接入经验门槛、轮末升级、进化与学招仍待定。",
    },
]


def fail(message):
    raise SystemExit(message)


def load_pinned_json(relative_path):
    path = SNAPSHOT_ROOT / relative_path
    raw = path.read_bytes()
    actual = hashlib.sha256(raw).hexdigest()
    expected = EXPECTED_SHA256[relative_path]
    if actual != expected:
        fail(f"快照哈希不匹配：{relative_path} expected={expected} actual={actual}")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"快照不是有效 UTF-8 JSON：{relative_path}: {exc}")
    return value, actual


def verify_local_input_bytes(relative_path, raw):
    expected = EXPECTED_LOCAL_SHA256.get(relative_path)
    if expected is None:
        raise ValueError(f"本作输入未登记哈希：{relative_path}")
    actual = hashlib.sha256(raw).hexdigest()
    if actual != expected:
        raise ValueError(f"本作输入哈希不匹配：{relative_path} expected={expected} actual={actual}")
    return actual


def load_local_json(relative_path):
    raw = (ROOT / relative_path).read_bytes()
    try:
        actual = verify_local_input_bytes(relative_path, raw)
    except ValueError as exc:
        fail(str(exc))
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"本作输入不是有效 UTF-8 JSON：{relative_path}: {exc}")
    return value, actual


def field_state(obj, key):
    if key not in obj:
        return {"present_in_json": False}
    return {"present_in_json": True, "value": obj[key]}


def raw_identification_fields(move):
    flags = move.get("flags") or {}
    own = move.get("self") or {}
    return {
        "category": field_state(move, "category"),
        "basePower": field_state(move, "basePower"),
        "target": field_state(move, "target"),
        "flags.charge": field_state(flags, "charge"),
        "flags.recharge": field_state(flags, "recharge"),
        "self.volatileStatus": field_state(own, "volatileStatus"),
        "condition.duration": field_state(move.get("condition") or {}, "duration"),
        "multihit": field_state(move, "multihit"),
        "damage": field_state(move, "damage"),
        "damageCallback": field_state(move, "damageCallback"),
        "basePowerCallback": field_state(move, "basePowerCallback"),
    }


def selected_learnset(learnset):
    generations = []
    parsed = {}
    for move_id, codes in learnset.items():
        entries = []
        for code in codes:
            match = CODE.fullmatch(code)
            if not match:
                continue
            generation, method, level = int(match.group(1)), match.group(2), match.group(3)
            entries.append((method, generation, int(level) if level else None))
            if method == "L":
                generations.append(generation)
        parsed[move_id] = entries
    eligible = [generation for generation in generations if generation <= 9]
    if not eligible:
        fail("物种学习表没有可选世代的升级条目")
    era = max(eligible)
    selected = {
        move_id: [
            (method, level)
            for method, generation, level in entries
            if generation == era and method != "V"
        ]
        for move_id, entries in parsed.items()
    }
    return era, selected


def write_outputs(snapshot_hashes, local_input_hashes, species, category_moves, names, callback_stats, current_sets, generations, union):
    csv_path = OUT_DIR / "affected-moves.csv"
    fieldnames = [
        "scope_code",
        "move_id",
        "move_name_zh",
        "showdown_name",
        "categories",
        "field_scan_categories",
        "classification_basis",
        "selected_gen_species_count",
        "selected_gen_species",
        "currently_admitted",
        "current_admission_evidence",
        "raw_identification_fields",
        "classification_limit",
    ]
    rows = []
    for move_id in sorted(category_moves):
        move = category_moves[move_id]["move"]
        affected_species = category_moves[move_id]["species"]
        categories = sorted(category_moves[move_id]["categories"], key=CATEGORY_ORDER.index)
        field_scan_categories = sorted(category_moves[move_id]["field_scan_categories"], key=CATEGORY_ORDER.index)
        source_candidate = category_moves[move_id]["source_candidate"]
        admitted = move_id in current_sets["active_effects"]
        current_evidence = (
            "在 src/data/move-effects.json 的 moves 键中"
            if admitted
            else "不在 src/data/move-effects.json 的 moves 键中"
        )
        if move_id in current_sets["pmd_only"]:
            current_evidence += "；只在 pmd-moves 迁移数据中保留"
        species_values = [
            {
                "id": item["id"],
                "name_zh": names["species"].get(item["id"], item["name"]),
                "learnset_gen": item["learnsetGen"],
            }
            for item in affected_species
        ]
        limits = "；".join(CATEGORY_LIMITS[code] for code in categories)
        if source_candidate:
            limits = source_candidate["note"] + "；" + limits
            classification_basis = source_candidate["status"] + "；不是 Showdown flags.charge 字段命中"
        else:
            classification_basis = "Showdown JSON 可见字段命中"
        rows.append({
            "sort": min(CATEGORY_ORDER.index(code) for code in categories),
            "scope_code": "/".join(categories),
            "move_id": move_id,
            "move_name_zh": names["moves"].get(move_id, move.get("name", move_id)),
            "showdown_name": move.get("name", move_id),
            "categories": "/".join(categories),
            "field_scan_categories": "/".join(field_scan_categories),
            "classification_basis": classification_basis,
            "selected_gen_species_count": len(affected_species),
            "selected_gen_species": json.dumps(species_values, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            "currently_admitted": "是" if admitted else "否",
            "current_admission_evidence": current_evidence,
            "raw_identification_fields": json.dumps(raw_identification_fields(move), ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            "classification_limit": limits,
        })
    rows.sort(key=lambda row: (row["sort"], row["move_id"]))

    for item in NON_MOVE_ITEMS:
        rows.append({
            "sort": CATEGORY_ORDER.index(item["code"]),
            "scope_code": item["code"],
            "move_id": "",
            "move_name_zh": item["name"],
            "showdown_name": "",
            "categories": "非招式池项",
            "field_scan_categories": "",
            "classification_basis": "8.9 非招式池范围，单独列示",
            "selected_gen_species_count": "",
            "selected_gen_species": "",
            "currently_admitted": "不适用（非招式）",
            "current_admission_evidence": item["reason"],
            "raw_identification_fields": json.dumps(
                {"not_applicable": True, "out_of_move_pool_reason": item["reason"]},
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ),
            "classification_limit": item["open_fields"],
        })
    rows.sort(key=lambda row: (row["sort"], row["move_id"]))

    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            row.pop("sort", None)
            writer.writerow(row)

    category_summary = {}
    for code in ["B2", "B3", "B5", "B6", "B7"]:
        ids = sorted(move_id for move_id, entry in category_moves.items() if code in entry["categories"])
        species_union = sorted({
            item["id"]
            for move_id in ids
            for item in category_moves[move_id]["species"]
        })
        category_summary[code] = {
            "title": CATEGORY_TITLES[code],
            "move_count": len(ids),
            "snapshot_field_match_move_count": sum(code in category_moves[move_id]["field_scan_categories"] for move_id in ids),
            "secondary_source_candidate_move_count": sum(category_moves[move_id]["source_candidate"] is not None and code in category_moves[move_id]["categories"] for move_id in ids),
            "move_species_pair_count": sum(len(category_moves[move_id]["species"]) for move_id in ids),
            "unique_species_count": len(species_union),
            "currently_admitted_move_count": sum(move_id in current_sets["active_effects"] for move_id in ids),
            "moves": [
                {
                    "id": move_id,
                    "name_zh": names["moves"].get(move_id, category_moves[move_id]["move"].get("name", move_id)),
                    "selected_gen_species_count": len(category_moves[move_id]["species"]),
                    "currently_admitted": move_id in current_sets["active_effects"],
                    "field_scan_match": code in category_moves[move_id]["field_scan_categories"],
                    "source_candidate": category_moves[move_id]["source_candidate"],
                }
                for move_id in ids
            ],
        }

    summary = {
        "task_id": "#229 local fixed-snapshot inventory",
        "target_head": "32a07d8c0a52253f4775f6c73b60437b016e0eb7",
        "snapshot_commit": SNAPSHOT_COMMIT,
        "snapshot_hashes_verified": snapshot_hashes,
        "local_input_hashes_verified": local_input_hashes,
        "local_input_binding": {
            "method": "原文件字节 SHA-256；在 UTF-8 解码与 JSON 解析之前校验。",
            "inputs": sorted(EXPECTED_LOCAL_SHA256),
            "target_head_recorded_not_enforced": "32a07d8c0a52253f4775f6c73b60437b016e0eb7",
            "rule": "脚本不强制当前 Git HEAD；四个相关本作输入字节与登记值一致时可以复算，任一不同即失败。",
        },
        "selection": {
            "species_count": len(species),
            "learnset_generation_counts": generations,
            "move_union_count": len(union),
            "rule": "按 tools/data/import_pokedex.py 的规则，选择有升级条目的最新世代（最高第9代），取该世代全部学习方式但排除 V；并集只计所选世代至少有一条非 V 记录的招式。",
        },
        "current_admission": {
            "active_move_source": "src/data/move-effects.json 的 moves 键",
            "active_move_count": len(current_sets["active_effects"]),
            "pmd_move_source": "src/data/pmd-moves.json 的 moves 键",
            "pmd_move_count": len(current_sets["pmd_moves"]),
            "pmd_only_move_ids": sorted(current_sets["pmd_only"]),
            "note": "现行准入按运行效果表判断；pmd-moves 中额外保留的迁移行不视为当前准入。",
        },
        "callback_field_limit": {
            "showdown_json_move_count": callback_stats["move_count"],
            "damage_key_count": callback_stats["damage_key_count"],
            "damageCallback_key_count": callback_stats["damageCallback_key_count"],
            "basePowerCallback_key_count": callback_stats["basePowerCallback_key_count"],
            "importer_observation": "import_pokedex.py 检查 damage、multihit、basePowerCallback、flags.charge 与 flags.recharge 等可见 JSON 字段，但没有检查 damageCallback。JSON 不可表达函数值，缺少 damageCallback 只表示固定 JSON 未提供该字段；本清单不据此断定原始源码没有回调或机制。",
        },
        "raw_field_scan_counts": {
            code: sum(code in entry["field_scan_categories"] for entry in category_moves.values())
            for code in ["B2", "B3", "B5", "B6", "B7"]
        },
        "secondary_source_candidates": [
            {
                "id": move_id,
                "category": entry["source_candidate"]["category"],
                "source": entry["source_candidate"]["source"],
                "status": entry["source_candidate"]["status"],
                "field_scan_match": False,
                "currently_admitted": move_id in current_sets["active_effects"],
                "current_pmd_entry": {
                    "power": current_sets["focuspunch_pmd_record"].get("power"),
                    "effects": current_sets["focuspunch_pmd_record"].get("effects"),
                    "note": current_sets["focuspunch_pmd_record"].get("note"),
                } if move_id == "focuspunch" else None,
                "current_move_effect_entry_keys": sorted(current_sets["focuspunch_effect_record"]) if move_id == "focuspunch" else None,
                "selected_gen_species_count": len(entry["species"]),
                "selected_gen_species_ids": [item["id"] for item in entry["species"]],
            }
            for move_id, entry in sorted(category_moves.items())
            if entry["source_candidate"] is not None
        ],
        "categories": category_summary,
        "outside_move_pool": NON_MOVE_ITEMS,
        "scope_limits": [
            "只解析已登记哈希匹配的 Showdown JSON 和本作生成数据；没有执行第三方 TypeScript 或 JavaScript，也没有调用本作导入器。",
            "名单清单按 175 物种所选学习世代、排除 V 后的全部学习方式并集计算，不是只数升级招式。",
            "四个本作输入在解码前逐一校验原字节 SHA-256；只绑定相关输入，不强制整个 Git HEAD。",
            "B2 的 focuspunch 只作为二手公开资料候选另列，未由 Showdown flags.charge 命中，也未核实原版行为；其他原版差异没有在本机补查，完整性待云端核实。",
            "本地接口冲突只标出与现行 G 规则相接的位置；未定机制没有在此定规则。",
        ],
    }
    (OUT_DIR / "affected-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="",
    )

    print(json.dumps({
        "status": "ok",
        "species": len(species),
        "move_union": len(union),
        "categories": {code: entry["move_count"] for code, entry in category_summary.items()},
        "active_move_count": len(current_sets["active_effects"]),
        "outputs": ["affected-moves.csv", "affected-summary.json"],
    }, sort_keys=True))


def main():
    global SNAPSHOT_ROOT, OUT_DIR
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot-root", type=Path, default=ROOT,
                        help="存放 .artifacts/showdown 的 checkout 根；只读取固定哈希输入")
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR,
                        help="研究产物目录，默认当前 checkout 的 .artifacts/research229")
    args = parser.parse_args()
    SNAPSHOT_ROOT = args.snapshot_root.resolve()
    OUT_DIR = args.out_dir.resolve()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_data = {}
    snapshot_hashes = {}
    for relative_path in EXPECTED_SHA256:
        snapshot_data[relative_path], snapshot_hashes[relative_path] = load_pinned_json(relative_path)

    pokedex = snapshot_data[".artifacts/showdown/pokedex.json"]
    moves = snapshot_data[".artifacts/showdown/moves.json"]
    learnsets = snapshot_data[".artifacts/showdown/learnsets.json"]
    if not isinstance(moves, dict) or not isinstance(learnsets, dict):
        fail("Showdown moves.json 或 learnsets.json 顶层不是对象")

    roster_root, roster_sha = load_local_json("src/data/roster.json")
    species = roster_root.get("species")
    if not isinstance(species, list) or len(species) != 175:
        fail("当前 roster.json 不是 175 物种名单")
    if len({item.get("id") for item in species}) != len(species):
        fail("当前 roster.json 有重复物种 id")
    names_root, names_sha = load_local_json("src/data/names-zh.json")
    names = {
        "species": names_root.get("species") or {},
        "moves": names_root.get("moves") or {},
    }
    pmd_root, pmd_sha = load_local_json("src/data/pmd-moves.json")
    pmd_moves = pmd_root.get("moves") or {}
    effects_root, effects_sha = load_local_json("src/data/move-effects.json")
    local_input_hashes = {
        "src/data/roster.json": roster_sha,
        "src/data/names-zh.json": names_sha,
        "src/data/pmd-moves.json": pmd_sha,
        "src/data/move-effects.json": effects_sha,
    }
    active_effects = effects_root.get("moves") or {}
    active_set, pmd_set = set(active_effects), set(pmd_moves)
    if not active_set <= pmd_set:
        fail("当前活动效果表含 pmd-moves 中没有的数据")
    pmd_only = pmd_set - active_set

    selected_by_species = {}
    generation_counts = {}
    union = set()
    for item in species:
        species_id = item["id"]
        if species_id not in pokedex or species_id not in learnsets:
            fail(f"固定快照缺少当前物种：{species_id}")
        learnset = learnsets[species_id].get("learnset")
        if not isinstance(learnset, dict):
            fail(f"固定快照缺少物种学习表：{species_id}")
        era, selected = selected_learnset(learnset)
        if item.get("learnsetGen") != era:
            fail(f"roster 学习世代与固定学习表不符：{species_id} roster={item.get('learnsetGen')} snapshot={era}")
        selected_by_species[species_id] = (era, selected)
        generation_counts[str(era)] = generation_counts.get(str(era), 0) + 1
        union.update(move_id for move_id, rows in selected.items() if rows)
    generation_counts = dict(sorted(generation_counts.items(), key=lambda pair: int(pair[0])))
    if len(union) != 522:
        fail(f"175 物种选定世代学习表并集预期 522 招，实际 {len(union)}")

    callback_stats = {
        "move_count": len(moves),
        "damage_key_count": sum("damage" in move for move in moves.values() if isinstance(move, dict)),
        "damageCallback_key_count": sum("damageCallback" in move for move in moves.values() if isinstance(move, dict)),
        "basePowerCallback_key_count": sum("basePowerCallback" in move for move in moves.values() if isinstance(move, dict)),
    }

    category_moves = {}
    for move_id in sorted(union):
        move = moves.get(move_id)
        if not isinstance(move, dict):
            fail(f"固定学习表引用了不存在的招式：{move_id}")
        flags = move.get("flags") or {}
        own = move.get("self") or {}
        categories = []
        if flags.get("charge"):
            categories.append("B2")
        if flags.get("recharge") or own.get("volatileStatus") == "mustrecharge":
            categories.append("B3")
        if move.get("multihit") is not None:
            categories.append("B5")
        if move.get("damage") is not None or move.get("damageCallback") is not None:
            categories.append("B6")
        if move_id == "earthquake":
            categories.append("B7")
        field_scan_categories = list(categories)
        source_candidate = SOURCE_CANDIDATES.get(move_id)
        if source_candidate and source_candidate["category"] not in categories:
            categories.append(source_candidate["category"])
        if not categories:
            continue
        affected = []
        for item in species:
            era, selected = selected_by_species[item["id"]]
            if selected.get(move_id):
                affected.append({
                    "id": item["id"],
                    "name": item.get("name", item["id"]),
                    "learnsetGen": era,
                })
        category_moves[move_id] = {
            "move": move,
            "categories": categories,
            "field_scan_categories": field_scan_categories,
            "source_candidate": source_candidate,
            "species": affected,
        }

    if "earthquake" not in category_moves:
        fail("earthquake 不在本次 175 物种的所选学习表并集中")
    category_codes_present = {code for entry in category_moves.values() for code in entry["categories"]}
    required = {"B2", "B3", "B5", "B6", "B7"}
    if not required <= category_codes_present:
        fail(f"固定快照的本次并集未覆盖预期机制类别：{sorted(required - category_codes_present)}")
    focuspunch = category_moves.get("focuspunch")
    if focuspunch is None or len(focuspunch["species"]) != 50:
        fail("focuspunch 候选未按固定并集解析为 50 个物种")
    if (moves["focuspunch"].get("flags") or {}).get("charge"):
        fail("focuspunch 当前快照出现 flags.charge；请复核候选与字段扫描是否重叠")
    focuspunch_pmd_record = pmd_moves.get("focuspunch")
    focuspunch_effect_record = active_effects.get("focuspunch")
    if (
        not isinstance(focuspunch_pmd_record, dict)
        or focuspunch_pmd_record.get("power") != 55
        or focuspunch_pmd_record.get("effects") != ["damage"]
        or focuspunch_pmd_record.get("note") != "省略次要效果"
        or not isinstance(focuspunch_effect_record, dict)
        or set(focuspunch_effect_record) != {"acc", "source"}
    ):
        fail("focuspunch 的当前准入数据形状变化，需要重新核对待核差异")

    write_outputs(
        snapshot_hashes,
        local_input_hashes,
        species,
        category_moves,
        names,
        callback_stats,
        {
            "active_effects": active_set,
            "pmd_moves": pmd_set,
            "pmd_only": pmd_only,
            "focuspunch_pmd_record": focuspunch_pmd_record,
            "focuspunch_effect_record": focuspunch_effect_record,
        },
        generation_counts,
        union,
    )


if __name__ == "__main__":
    main()
