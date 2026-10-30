#!/usr/bin/env python3
"""Import the pinned Pokédex, learnsets, PMD move rows and names without network access.

Usage (isolated stdlib run):
  python -I tools/data/import_pokedex.py [--snapshot-root PATH] [--out-dir PATH]

The default snapshot root is the main checkout's ignored .artifacts directory,
located through git-common-dir. The default output root is this worktree.
"""
import argparse
import csv
import hashlib
import importlib.util
import json
import math
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LANGUAGE_ID = "12"
POKEAPI_COMMIT = "2bf639e5572812a67d2b94903fdcb9d095f5aeb2"
SPRITECOLLAB_COMMIT = "42a63b0757b3d55ebca29b27e62cd444cd29047b"
PMD_NAME = "wiki-2026-10-30.json"
PMD_SHA = "12436b4fd16aa726e2d06e1ccfdf3f9836c4c63ce5f82a853825494f5d4fda0f"
PMD_EXTRA_NAME = "wiki-2026-10-30-extra.json"
PMD_EXTRA_SHA = "ca1883a2005e2e57c9347001a72d24be649e99a6cd1607723650cc88fa72ec49"
NAMES_BASE_SHA = "fafe297e861d44fe886a76cc93a5e15216a5d752a55a66080f764b2de4792923"
OLD_PMD_BASE_NAME = "moves-2026-10-30.json"
OLD_PMD_BASE_SHA = "9dc017d8964cce9785988236c1dd56417cae3ecfd38ea3213d7969d47d81c683"
LEGACY_NAMES_PATH = Path(__file__).with_name("pokedex-legacy-names.json")

INPUT_SHA = {
    "showdown/pokedex.json": "e74d0364b230001fc086cefb4259e051f1d16a4730eb89f7d6336a88a0d9a47e",
    "showdown/moves.json": "26909a321a7e4528d14a7dffd24173aa03a6845776cf41c39cc3d76f8e14616b",
    "showdown/learnsets.json": "cedbe661968e2d69abe9f317e9a3f5d4f2dcf989e1f937cb0cdd72e7af29ab8f",
    "pmd/" + PMD_NAME: PMD_SHA,
    "pmd/" + PMD_EXTRA_NAME: PMD_EXTRA_SHA,
    "pmd/" + OLD_PMD_BASE_NAME: OLD_PMD_BASE_SHA,
    "pokeapi/languages.csv": "fbb60019a6a461783d5671a995d5f590db61792a273e90faa0ed630d102a19b8",
    "pokeapi/pokemon_species_names.csv": "820cde17074cdb1c2b0595c997fb8f998e773bd5da3bb525dec85703c86c5fd9",
    "pokeapi/move_names.csv": "99e23ee38ea53d1473474d463b87651deac3cd4928750f8186feae66da45c147",
    "pokeapi/moves.csv": "8aafd37bf78f19471495c05b201545180f50f0a08a2a2a844d69f9837dd39ac9",
    "spritecollab/tracker.json": "c2ffd7ac79f6bbcaf8e33244d4e0341abde4c90410f025ef3144ac0f8ba6276a",
}

LEGACY_SPECIES_IDS = (
    "bulbasaur", "charmander", "squirtle", "pidgey", "rattata", "spearow",
    "pikachu", "zubat", "geodude", "chikorita", "cyndaquil", "totodile",
    "treecko", "torchic", "mudkip", "sandshrew", "growlithe", "magnemite",
    "onix", "dratini", "wooper", "houndour", "makuhita",
)
LEGACY_EXTRA_IDS = (
    "chikorita", "cyndaquil", "totodile", "treecko", "torchic", "mudkip",
    "wooper", "houndour", "makuhita",
)
LEGACY_EVOLUTION_IDS = (
    "bayleef", "meganium", "quilava", "typhlosion", "croconaw", "feraligatr",
    "grovyle", "sceptile", "combusken", "blaziken", "marshtomp", "swampert",
    "quagsire", "houndoom", "hariyama",
)
EVOLUTION_FIELDS = ("evoLevel", "prevo", "evos", "legendary")
LEGACY_MOVE_IDS = (
    "absorb", "bite", "defensecurl", "dragontail", "ember", "gust", "harden",
    "helpinghand", "leafage", "magicalleaf", "mudslap", "poisonfang", "pound",
    "protect", "pursuit", "quickattack", "roar", "scratch", "seedbomb", "slam",
    "tackle", "terablast", "thundershock", "watergun", "whirlwind",
)
TEAM_PROTECTION_MOVE_IDS = ("quickguard", "reflect", "lightscreen")
TEAM_PROTECTION_NOTES = {
    "quickguard": "固定取无限迷宫（GTI）同房间全队版；官方持续1回合，本作仅持续至本回合敌方阶段结束。",
    "reflect": "固定取无限迷宫（GTI）同房间全队版；本作持续10个敌方阶段，官方无限迷宫起为21回合。",
    "lightscreen": "固定取无限迷宫（GTI）同房间全队版；本作持续10个敌方阶段，官方无限迷宫起为21回合。",
}
TEAM_PROTECTION_EFFECTS = {move_id: move_id for move_id in TEAM_PROTECTION_MOVE_IDS}

GAME_PRIORITY = ("TDS", "S", "TD", "GTI", "SMD", "RTDX")
GAME_OUTPUT = {
    "TDS": ("MDTDS", "时／暗／空之探险队"),
    "S": ("MDSky", "空之探险队"),
    "TD": ("MDTD", "时／暗之探险队"),
    "GTI": ("MDGtI", "无限之迷宫"),
    "SMD": ("SMD", "超不可思议的迷宫"),
    "RTDX": ("RTDX", "救助队 DX"),
}
ADMISSION_KEYS = ("existingMoveRule", "blowaway", "drain", "pureDamage", "selfStages", "teamProtection")
EXCLUSION_KEYS = (
    "nonstandard", "noOfficialData", "unsupportedRange", "unsupportedTarget",
    "selfCostOrCondition", "ohko", "fixedDamage", "multihit", "recoil",
    "selfSwitch", "basePowerCallback", "zeroBasePower", "charge", "officialPowerUnavailable", "changeMoveNoTemplate",
)
RANGE_MAP = {
    "front": "front", "2 tiles away": "front2", "10 tiles away": "line10",
    "1 tile around user": "around", "entire room": "room", "enitre room": "room", "user": "user",
}
TARGET_MAP = {
    "enemy": "enemy", "user": "user", "teammates": "teammates",
    "teammate(s)": "teammates", "party": "party", "all": "all",
}
UNSUPPORTED_RANGES = {
    "entire floor", "tile below user", "others", "varies", "2 tiles around user",
    "4 tiles away", "random adjacent tile",
    "user<sup>non-ghost</sup><br>front<sup>ghost</sup>",
}
UNSUPPORTED_TARGETS = {
    "all except user", "teammate", "others", "wall", "floor", "varies",
    "user<sup>non-ghost</sup><br>enemy<sup>ghost</sup>",
    "user <sup>non-ghost</sup><br>enemy<sup>ghost</sup>",
}
RANGE_REASON = {
    "现有招式规则": "existingMoveRule", "射程暂不支持": "unsupportedRange",
    "目标暂不支持": "unsupportedTarget", "自身代价／使用条件": "selfCostOrCondition",
    "一击必杀": "ohko", "固定伤害": "fixedDamage", "多段": "multihit",
    "反作用": "recoil", "换人": "selfSwitch", "威力由回调决定": "basePowerCallback",
    "basePower 为 0": "zeroBasePower", "蓄力": "charge",
    "变化招式暂无模板": "changeMoveNoTemplate", "无官方迷宫数据": "noOfficialData",
    "非标准／Z／极巨招式": "nonstandard", "官方威力不可用": "officialPowerUnavailable",
}

class ImportFailure(Exception):
    pass


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def fail(message: str) -> None:
    raise ImportFailure(message)


def main_checkout_root() -> Path:
    try:
        common = subprocess.run(
            ["git", "rev-parse", "--git-common-dir"], cwd=REPO,
            check=True, capture_output=True, text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        fail(f"无法通过 git-common-dir 定位主 checkout：{exc}")
    common_path = Path(common)
    if not common_path.is_absolute():
        common_path = (REPO / common_path).resolve()
    return common_path.parent


def verify_and_load(snapshot_root: Path) -> dict:
    raw_files = {}
    # All bytes and hashes are checked before any output directory is created.
    for relative, expected in INPUT_SHA.items():
        path = snapshot_root / relative
        if not path.is_file():
            fail(f"缺少输入：{relative}")
        raw = path.read_bytes()
        actual = sha256(raw)
        if actual != expected:
            fail(f"sha256 不一致：{relative}\n  预期 {expected}\n  实际 {actual}")
        raw_files[relative] = raw

    poke_commit = (snapshot_root / "pokeapi" / "COMMIT").read_text(encoding="ascii").strip()
    sprite_commit = (snapshot_root / "spritecollab" / "COMMIT").read_text(encoding="ascii").strip()
    if poke_commit != POKEAPI_COMMIT:
        fail(f"PokeAPI COMMIT 不一致：预期 {POKEAPI_COMMIT}，实际 {poke_commit}")
    if sprite_commit != SPRITECOLLAB_COMMIT:
        fail(f"SpriteCollab COMMIT 不一致：预期 {SPRITECOLLAB_COMMIT}，实际 {sprite_commit}")
    for name, expected in ((PMD_NAME, PMD_SHA), (PMD_EXTRA_NAME, PMD_EXTRA_SHA)):
        sidecar = (snapshot_root / "pmd" / (name + ".sha256")).read_text(encoding="ascii").strip()
        if not sidecar.startswith(expected + " "):
            fail(f"PMD sha256 sidecar 与固定输入不符：{name}.sha256 / {sidecar}")

    data = {name: json.loads(raw_files[relative].decode("utf-8")) for name, relative in {
        "pokedex": "showdown/pokedex.json", "moves": "showdown/moves.json",
        "learnsets": "showdown/learnsets.json", "pmd": "pmd/" + PMD_NAME,
        "pmdExtra": "pmd/" + PMD_EXTRA_NAME,
        "tracker": "spritecollab/tracker.json",
    }.items()}
    for name in ("pmd", "pmdExtra"):
        pmd = data[name]
        if pmd.get("missingPages") not in ([], None):
            fail(f"PMD 快照 {name} 记录了缺页：{pmd.get('missingPages')}")
        requested = pmd.get("requestedIds")
        moves = pmd.get("moves")
        if not isinstance(requested, list) or len(requested) != len(set(requested)):
            fail(f"PMD 快照 {name} 的 requestedIds 缺失、重复或格式错误")
        if not isinstance(moves, dict) or set(requested) != set(moves):
            fail(f"PMD 快照 {name} 的 requestedIds 与招式页集合不同")
    extra = data["pmdExtra"]
    if tuple(extra["requestedIds"]) != ("headlongrush", "shedtail"):
        fail(f"PMD 附加快照招式清单变化：{extra['requestedIds']}")
    if any(extra["moves"][move_id].get("rows") for move_id in extra["requestedIds"]):
        fail("PMD 附加快照固定应保留两页无 MDMoveRow 的实测结果")
    base = data["pmd"]
    if set(base["moves"]) & set(extra["moves"]):
        fail("PMD 主快照与附加快照包含重复招式页")
    data["pmd"] = {
        **base,
        "requestedIds": [*base["requestedIds"], *extra["requestedIds"]],
        "moves": {**base["moves"], **extra["moves"]},
        "missingPages": [*(base.get("missingPages") or []), *(extra.get("missingPages") or [])],
    }
    return {"raw": raw_files, "data": data, "hashes": dict(sorted(INPUT_SHA.items()))}


def load_csv(raw: bytes, relative: str) -> list[dict]:
    try:
        text = raw.decode("utf-8-sig")
        return list(csv.DictReader(text.splitlines()))
    except (UnicodeError, csv.Error) as exc:
        fail(f"CSV 无法解析：{relative}: {exc}")


def import_fixed_builder(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        fail(f"无法加载固定基线构造器：{path.name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def json_object_entries(text: str, start: int = 0) -> tuple[dict, int]:
    """Return object values and exact source spans, without normalizing JSON bytes."""
    decoder = json.JSONDecoder()
    n = len(text)

    def ws(pos: int) -> int:
        while pos < n and text[pos].isspace():
            pos += 1
        return pos

    pos = ws(start)
    if pos >= n or text[pos] != "{":
        raise ValueError("expected JSON object")
    pos += 1
    entries = {}
    while True:
        pos = ws(pos)
        if pos < n and text[pos] == "}":
            return entries, pos + 1
        key, key_end = decoder.raw_decode(text, pos)
        if not isinstance(key, str):
            raise ValueError("object key is not a string")
        pos = ws(key_end)
        if text[pos] != ":":
            raise ValueError("expected colon")
        value_start = ws(pos + 1)
        value, value_end = decoder.raw_decode(text, value_start)
        if key in entries:
            raise ValueError(f"duplicate JSON key {key}")
        entries[key] = {"value": value, "start": value_start, "end": value_end, "raw": text[value_start:value_end]}
        pos = ws(value_end)
        if text[pos] == ",":
            pos += 1
            continue
        if text[pos] == "}":
            return entries, pos + 1
        raise ValueError("expected comma or closing brace")


def exact_move_snippets(raw: bytes) -> dict[str, bytes]:
    text = raw.decode("utf-8")
    root, _ = json_object_entries(text)
    if "moves" not in root:
        raise ValueError("missing top-level moves")
    moves, _ = json_object_entries(text, root["moves"]["start"])
    return {move_id: item["raw"].encode("utf-8") for move_id, item in moves.items()}


def build_baselines(snapshot_root: Path, checked: dict):
    names_path = LEGACY_NAMES_PATH
    if not names_path.is_file():
        fail("缺少固定手写名称基线 tools/data/pokedex-legacy-names.json")
    names_raw = names_path.read_bytes().replace(b"\r\n", b"\n")
    actual = sha256(names_raw)
    if actual != NAMES_BASE_SHA:
        fail(f"固定名称基线 SHA-256 不一致（CRLF 已归一为 LF）：预期 {NAMES_BASE_SHA}，实际 {actual}")
    names = json.loads(names_raw.decode("utf-8"))
    checked["hashes"]["baseline/pokedex-legacy-names.json"] = NAMES_BASE_SHA

    showdown = import_fixed_builder("pokedex_import_showdown_base", REPO / "tools" / "data" / "import_showdown.py")
    pmd_builder = import_fixed_builder("pokedex_import_pmd_base", REPO / "tools" / "data" / "import_pmd.py")
    showdown_data = showdown.load(snapshot_root / "showdown")
    old_species, _ = showdown.build(showdown_data)
    if pmd_builder.SNAPSHOT_NAME != OLD_PMD_BASE_NAME or pmd_builder.EXPECTED_SHA256 != OLD_PMD_BASE_SHA:
        fail("固定 import_pmd 基线的文件名或 SHA-256 常量已变化")
    old_pmd = pmd_builder.build(pmd_builder.load(snapshot_root / "pmd" / OLD_PMD_BASE_NAME))

    old_ids = [sp["id"] for sp in old_species]
    if tuple(old_ids) != LEGACY_SPECIES_IDS:
        fail(f"import_showdown 固定基线物种序列变化：{old_ids}")
    if tuple(sorted(old_pmd["moves"])) != tuple(sorted(LEGACY_MOVE_IDS)):
        fail("import_pmd 固定基线招式 ID 集合变化")
    if len(old_pmd["moves"]) != 25:
        fail(f"固定招式基线应有25招，实际 {len(old_pmd['moves'])}")

    # The current generated files may already contain this importer's output.
    # Compare only the frozen old projections and old 25 raw move objects.
    current_roster_path = REPO / "src" / "data" / "roster.json"
    current_moves_path = REPO / "src" / "data" / "pmd-moves.json"
    if current_roster_path.is_file():
        current = json.loads(current_roster_path.read_text(encoding="utf-8"))
        current_species = current.get("species")
        if not isinstance(current_species, list):
            fail("当前 roster.json 缺少 species 数组")
        checked["currentRosterSpecies"] = current_species
        by_id = {sp.get("id"): sp for sp in current_species}
        order = [sp.get("id") for sp in current_species if sp.get("id") in LEGACY_SPECIES_IDS]
        if tuple(order) != LEGACY_SPECIES_IDS:
            fail("当前 roster.json 中原23种的相对顺序与固定导入基线不同")
        for old in old_species:
            cur = by_id.get(old["id"])
            if cur is None or any(cur.get(k) != old.get(k) for k in ("kit", "maxHp", "starter")):
                fail(f"当前 roster.json 的冻结字段与固定导入基线不同：{old['id']}")
    baseline_raw = exact_move_snippets((json.dumps(old_pmd, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))
    if current_moves_path.is_file():
        cur_raw = exact_move_snippets(current_moves_path.read_bytes())
        normalize = lambda raw: raw.replace(b"\r\n", b"\n") if raw is not None else None
        for move_id in LEGACY_MOVE_IDS:
            if normalize(cur_raw.get(move_id)) != normalize(baseline_raw.get(move_id)):
                fail(f"当前 pmd-moves.json 中旧招式原文与固定基线不同：{move_id}")
    return old_species, old_pmd, baseline_raw, names, showdown.SOURCE_COMMIT


CODE = re.compile(r"^(\d+)([A-Z])(\d*)$")


def parse_learnset(learnset: dict) -> tuple[int, dict[str, list[tuple[str, int | None]]]]:
    parsed = {}
    generations = []
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
    if not generations:
        fail("物种学习表没有升级招式，无法按规则选定世代")
    era = max(g for g in generations if g <= 9)
    selected = {
        move_id: [(method, level) for method, generation, level in entries if generation == era and method != "V"]
        for move_id, entries in parsed.items()
    }
    return era, selected


def learnset_data(data: dict, species_ids: list[str]):
    out, union = {}, set()
    for species_id in species_ids:
        if species_id not in data["learnsets"] or "learnset" not in data["learnsets"][species_id]:
            fail(f"Showdown 缺少物种学习表：{species_id}")
        era, selected = parse_learnset(data["learnsets"][species_id]["learnset"])
        out[species_id] = {"era": era, "selected": selected}
        union.update(move_id for move_id, rows in selected.items() if rows)
    return out, union


def split_template_fields(text: str) -> list[str]:
    fields, start, depth, pos = [], 0, 0, 0
    while pos < len(text):
        if text.startswith("{{", pos):
            depth += 1
            pos += 2
        elif text.startswith("}}", pos):
            depth -= 1
            pos += 2
        elif text[pos] == "|" and depth == 0:
            fields.append(text[start:pos])
            pos += 1
            start = pos
        else:
            pos += 1
    fields.append(text[start:])
    return fields


def plain_value(value: str) -> str:
    value = value.strip()
    if value.startswith("{{") and value.endswith("}}"):
        inner = value[2:-2]
        fields = split_template_fields(inner)
        if fields and fields[0].strip().casefold() == "tt" and len(fields) > 1:
            return plain_value(fields[1])
    return value


def parse_pmd_row(row: str) -> dict | None:
    text = row.strip()
    if not text.startswith("{{MDMoveRow|") or not text.endswith("}}"):
        return None
    fields = split_template_fields(text[2:-2])
    values = {key: "-" for key in ("game", "pow", "pp", "acc", "range", "target", "cuts")}
    for field in fields[1:]:
        if "=" not in field:
            continue
        key, value = field.split("=", 1)
        key = key.strip()
        if key in values:
            values[key] = plain_value(value)
    return values


def selected_pmd_row(move_id: str, pmd_data: dict) -> dict | None:
    entry = pmd_data["moves"].get(move_id)
    if not entry:
        if move_id in TEAM_PROTECTION_MOVE_IDS:
            fail(f"7.7b 团队保护招式缺少固定 GTI 行：{move_id}")
        return None
    by_game = {}
    for raw in entry.get("rows", []):
        row = parse_pmd_row(raw)
        if row is None or row["game"] not in GAME_PRIORITY:
            continue
        if row["game"] in by_game:
            fail(f"{move_id} 在 PMD 快照同一作品出现多行：{row['game']}")
        by_game[row["game"]] = {**row, "rawRow": raw}
    if move_id in TEAM_PROTECTION_MOVE_IDS:
        if "GTI" not in by_game:
            fail(f"7.7b 团队保护招式没有固定 GTI 行：{move_id}")
        return by_game["GTI"]
    for game in GAME_PRIORITY:
        if game in by_game:
            return by_game[game]
    return None


def mapped_field(value: str, supported: dict, unsupported: set, field: str, move_id: str):
    normalized = value.strip().casefold()
    if normalized in supported:
        return supported[normalized], None
    if normalized in unsupported:
        return None, "射程暂不支持" if field == "range" else "目标暂不支持"
    fail(f"未知 {field} 取值：{move_id} / {value!r}；请先更新规格映射")


def as_power(value: str) -> int | None:
    return int(value) if re.fullmatch(r"\d+", value.strip()) else None


def truthy(move: dict, key: str) -> bool:
    return bool(move.get(key))


def excluded_nonstandard(move_id: str, move: dict) -> bool:
    return bool(move.get("isZ") or move.get("isMax") or move.get("isMaxMove") or move.get("isGmax")
                or move.get("isGMax") or move.get("isDynamax")) or move.get("isNonstandard") in {
                    "CAP", "Future", "Gmax", "LGPE", "Unobtainable",
                }


def self_cost(move_id: str, move: dict) -> bool:
    flags = move.get("flags") or {}
    own = move.get("self") or {}
    return bool(
        move.get("selfdestruct") or flags.get("recharge") or own.get("volatileStatus")
        or move.get("hasCrashDamage") or move.get("mindBlownRecoil")
        or move.get("chloroblastRecoil") or move.get("sleepUsable")
        or move_id == "dreameater"
    )


def attack_special_reason(move: dict) -> str | None:
    flags = move.get("flags") or {}
    if truthy(move, "ohko"):
        return "一击必杀"
    if "damage" in move and move.get("damage") is not None:
        return "固定伤害"
    if move.get("multihit") is not None:
        return "多段"
    if move.get("recoil"):
        return "反作用"
    if move.get("selfSwitch"):
        return "换人"
    if move.get("basePowerCallback"):
        return "威力由回调决定"
    if move.get("basePower", 0) == 0:
        return "basePower 为 0"
    if flags.get("charge"):
        return "蓄力"
    return None


def classify_moves(union: set[str], showdown_moves: dict, pmd_data: dict, old_move_specs: dict):
    specs, result, admission_counts, exclusions, unavailable_power = {}, {}, {"existingMoveRule": 0}, {}, {}
    for move_id in sorted(union):
        if move_id in old_move_specs:
            result[move_id] = {"admitted": True, "kind": "existingMoveRule"}
            admission_counts["existingMoveRule"] += 1
            continue
        move = showdown_moves.get(move_id)
        if not isinstance(move, dict):
            fail(f"Showdown learnset 引用了不存在的招式：{move_id}")
        if excluded_nonstandard(move_id, move):
            reason = "非标准／Z／极巨招式"
        else:
            row = selected_pmd_row(move_id, pmd_data)
            if row is None:
                reason = "无官方迷宫数据"
            else:
                range_value, range_reason = mapped_field(row["range"], RANGE_MAP, UNSUPPORTED_RANGES, "range", move_id)
                target_value, target_reason = mapped_field(row["target"], TARGET_MAP, UNSUPPORTED_TARGETS, "target", move_id)
                if range_reason:
                    reason = range_reason
                elif target_reason:
                    reason = target_reason
                elif self_cost(move_id, move):
                    reason = "自身代价／使用条件"
                elif move.get("category") in ("Physical", "Special") and attack_special_reason(move):
                    reason = attack_special_reason(move)
                elif move.get("category") in ("Physical", "Special") and as_power(row["pow"]) is None:
                    reason = "官方威力不可用"
                    unavailable_power[move_id] = {
                        "detail": f"Showdown 分类 {move['category']}；所选 {row['game']} 的 pow={row['pow']!r}，不是固定整数威力。",
                        "rawRow": row["rawRow"],
                    }
                else:
                    category = move.get("category")
                    effects, note, kind = [], "", ""
                    if move_id in TEAM_PROTECTION_EFFECTS:
                        if category != "Status":
                            fail(f"7.7b 团队保护招式应为变化招式：{move_id}")
                        effects = [TEAM_PROTECTION_EFFECTS[move_id]]
                        note = TEAM_PROTECTION_NOTES[move_id]
                        kind = "teamProtection"
                    elif move.get("forceSwitch"):
                        effects = ["damage", "blowaway"] if category in ("Physical", "Special") else ["blowaway"]
                        kind = "blowaway"
                    elif category in ("Physical", "Special") and move.get("drain"):
                        effects, kind = ["damage", "drain"], "drain"
                    elif category in ("Physical", "Special"):
                        effects, note, kind = ["damage"], "省略次要效果", "pureDamage"
                    elif category == "Status" and move.get("target") == "self" and isinstance(move.get("boosts"), dict):
                        boosts = move["boosts"]
                        if boosts and set(boosts).issubset({"atk", "def"}) and all(isinstance(v, (int, float)) and v != 0 for v in boosts.values()):
                            for stat in ("atk", "def"):
                                if stat in boosts:
                                    value = boosts[stat]
                                    if not float(value).is_integer():
                                        fail(f"{move_id} 的自身阶段提升不是整数：{value}")
                                    effects.append(f"stage:{stat}:{int(value):+d}")
                            kind = "selfStages"
                    if not kind:
                        reason = "变化招式暂无模板"
                    else:
                        game_id, game_name = GAME_OUTPUT[row["game"]]
                        power = as_power(row["pow"])
                        specs[move_id] = {
                            "range": range_value, "target": target_value, "power": power,
                            "game": game_id, "gameName": game_name,
                            "official": {"basePp": row["pp"], "accuracy": row["acc"], "cutsCorners": row["cuts"]},
                            "effects": effects, "source": "Bulbapedia", "note": note,
                        }
                        result[move_id] = {"admitted": True, "kind": kind, "effects": effects}
                        admission_counts[kind] = admission_counts.get(kind, 0) + 1
                        continue
        result[move_id] = {"admitted": False, "reason": reason}
        exclusions[reason] = exclusions.get(reason, 0) + 1

    if sum(admission_counts.values()) + sum(exclusions.values()) != len(union):
        fail("招式准入与例外分类计数没有闭合")
    return specs, result, dict(sorted(admission_counts.items())), dict(sorted(exclusions.items())), dict(sorted(unavailable_power.items()))


def pp_for(move_id: str, showdown_moves: dict, legacy_pp: dict) -> int:
    if move_id in legacy_pp:
        return legacy_pp[move_id]
    move = showdown_moves.get(move_id)
    pp = move.get("pp") if isinstance(move, dict) else None
    if not isinstance(pp, (int, float)) or pp <= 0:
        fail(f"新招式 {move_id} 的 Showdown PP 无效：{pp!r}")
    return max(1, min(4, math.floor(pp / 10)))


def showdown_name_to_id(pokedex: dict) -> dict[str, str]:
    name_to_id = {}
    for species_id, entry in pokedex.items():
        name = entry.get("name")
        if not isinstance(name, str):
            fail(f"Showdown 图鉴缺少物种显示名：{species_id}")
        if name in name_to_id and name_to_id[name] != species_id:
            fail(f"Showdown 图鉴物种显示名重复：{name}")
        name_to_id[name] = species_id
    return name_to_id


def legacy_evolution_ids(pokedex: dict) -> list[str]:
    name_to_id = showdown_name_to_id(pokedex)
    evolution_ids = []
    for root_id in LEGACY_EXTRA_IDS:
        if root_id not in pokedex:
            fail(f"Showdown 图鉴缺少旧扩展物种：{root_id}")
        current_id = root_id
        seen = {root_id}
        while True:
            children = pokedex[current_id].get("evos", [])
            if not isinstance(children, list):
                fail(f"Showdown evos 不是列表：{current_id}")
            in_scope = []
            for child_name in children:
                child_id = name_to_id.get(child_name)
                if child_id is None:
                    fail(f"Showdown evos 引用了不存在的物种：{current_id} -> {child_name}")
                child = pokedex[child_id]
                if "forme" not in child:
                    in_scope.append(child_id)
            if not in_scope:
                break
            if len(in_scope) != 1:
                fail(f"旧扩展进化链出现规格未列出的分支：{current_id} -> {in_scope}")
            child_id = in_scope[0]
            if child_id in seen:
                fail(f"Showdown 进化链出现循环：{child_id}")
            seen.add(child_id)
            evolution_ids.append(child_id)
            current_id = child_id
    if tuple(evolution_ids) != LEGACY_EVOLUTION_IDS:
        fail(f"按 LEGACY_EXTRA_IDS 推导出的15种与规格显式名单不同：{evolution_ids}")
    return evolution_ids


def evolution_fields(data: dict, all_species: list[dict]) -> dict[str, dict]:
    pokedex = data["pokedex"]
    name_to_id = showdown_name_to_id(pokedex)
    included_ids = {species["id"] for species in all_species}
    in_roster_prevo = {}
    in_roster_evos = {}
    for species_id in included_ids:
        entry = pokedex[species_id]
        prevo_name = entry.get("prevo")
        if prevo_name:
            prevo_id = name_to_id.get(prevo_name)
            if prevo_id is None:
                fail(f"Showdown prevo 引用了不存在的物种：{species_id} -> {prevo_name}")
            if prevo_id in included_ids:
                in_roster_prevo[species_id] = prevo_id
            else:
                # The current 175-species snapshot has no broken in-roster chain.
                # Do not silently treat a future gap as an unevolved base form.
                ancestor_id = prevo_id
                visited = {species_id}
                while ancestor_id:
                    if ancestor_id in visited:
                        fail(f"Showdown prevo 出现循环：{species_id}")
                    visited.add(ancestor_id)
                    if ancestor_id in included_ids:
                        fail(f"名单内进化链有缺口：{ancestor_id} -> ... -> {species_id}；请先补齐图鉴或明确规则")
                    ancestor_name = pokedex[ancestor_id].get("prevo")
                    ancestor_id = name_to_id.get(ancestor_name) if ancestor_name else None
        evos = entry.get("evos", [])
        if not isinstance(evos, list):
            fail(f"Showdown evos 不是列表：{species_id}")
        selected_evos = []
        for child_name in evos:
            child_id = name_to_id.get(child_name)
            if child_id is None:
                fail(f"Showdown evos 引用了不存在的物种：{species_id} -> {child_name}")
            if child_id in included_ids:
                selected_evos.append(child_id)
        if selected_evos:
            in_roster_evos[species_id] = selected_evos

    stages = {}

    def stage_of(species_id: str, visiting: set[str]) -> int:
        if species_id in stages:
            return stages[species_id]
        if species_id in visiting:
            fail(f"名单内 prevo 出现循环：{species_id}")
        prevo_id = in_roster_prevo.get(species_id)
        stage = 0 if prevo_id is None else stage_of(prevo_id, visiting | {species_id}) + 1
        stages[species_id] = stage
        return stage

    result = {}
    for species_id in included_ids:
        entry = pokedex[species_id]
        stage = stage_of(species_id, set())
        source_level = entry.get("evoLevel")
        if stage == 0:
            evo_level = 1
        elif source_level is not None:
            if isinstance(source_level, bool) or not isinstance(source_level, int) or not 1 <= source_level <= 100:
                fail(f"Showdown evoLevel 无效：{species_id} / {source_level!r}")
            evo_level = source_level
        elif stage == 1:
            evo_level = 20
        elif stage == 2:
            evo_level = 36
        else:
            fail(f"本作尚未规定第 {stage} 阶段的非等级进化折算：{species_id}")

        fields = {"evoLevel": evo_level}
        if species_id in in_roster_prevo:
            fields["prevo"] = in_roster_prevo[species_id]
        if species_id in in_roster_evos:
            fields["evos"] = in_roster_evos[species_id]
        fields["legendary"] = bool(entry.get("tags"))
        result[species_id] = fields
    return result


def generate_roster(data: dict, all_species: list[dict], learnsets: dict, union: set[str],
                    admission: dict, move_specs: dict, legacy_species: list[dict], showdown_moves: dict):
    legacy_by_id = {sp["id"]: sp for sp in legacy_species}
    species_evolution = evolution_fields(data, all_species)
    legacy_pp = {}
    for sp in legacy_species:
        for move in [*sp["kit"], *sp["learnable"]]:
            previous = legacy_pp.setdefault(move["move"], move["pp"])
            if previous != move["pp"]:
                fail(f"旧招式 PP 在原名单中不一致：{move['move']} {previous}/{move['pp']}")
    permitted = {mid for mid, row in admission.items() if row["admitted"]}
    output = []
    unavailable = []
    for entry in all_species:
        sid = entry["id"]
        selected = learnsets[sid]["selected"]
        era = learnsets[sid]["era"]
        learned = {mid for mid, methods in selected.items() if methods and mid in permitted}
        old = legacy_by_id.get(sid)
        if old:
            learned.update(m["move"] for m in old["learnable"])
            kit = [dict(m) for m in old["kit"]]
            starter = old["starter"]
            max_hp = old["maxHp"]
        else:
            starter = False
            max_hp = 12 + entry["baseStats"]["hp"] // 5
            levelups = []
            for mid, methods in selected.items():
                if mid not in permitted:
                    continue
                for method, level in methods:
                    if method == "L" and level is not None:
                        levelups.append((level, mid))
            levelups = sorted(set(levelups), key=lambda value: (value[0], value[1]))
            unique_levelups = []
            seen_moves = set()
            for level, mid in levelups:
                if mid not in seen_moves:
                    unique_levelups.append((level, mid))
                    seen_moves.add(mid)
            levelups = unique_levelups
            chosen = [mid for _, mid in levelups[:2]]
            if len(chosen) == 2 and not any("damage" in (move_specs.get(mid, {}).get("effects") or []) for mid in chosen):
                damage = [mid for _, mid in levelups if "damage" in (move_specs.get(mid, {}).get("effects") or [])]
                if damage:
                    chosen[1] = damage[0]
            kit = [{"move": mid, "pp": pp_for(mid, showdown_moves, legacy_pp)} for mid in chosen]
            if len(kit) != 2 or not any("damage" in (move_specs.get(m["move"], {}).get("effects") or []) for m in kit):
                unavailable.append({"id": sid, "dex": f"{entry['num']:04d}", "kit": kit, "learnsetGen": era})

        learnable = [{"move": mid, "pp": pp_for(mid, showdown_moves, legacy_pp)} for mid in sorted(learned)]
        available_for_play = len(kit) == 2 and any("damage" in (move_specs.get(m["move"], {}).get("effects") or []) for m in kit)
        output.append({
            "id": sid, "dex": f"{entry['num']:04d}", "name": entry["name"], "starter": starter,
            "types": entry.get("types", []), "baseStats": entry["baseStats"], "maxHp": max_hp,
            "learnsetGen": era, "kit": kit, "learnable": learnable,
            "source": f"pokedex.json[{sid}]; learnsets.json[{sid}] 第{era}世代; moves.json",
            **({"availability": "暂不出场"} if sid not in legacy_by_id and not available_for_play else {}),
            **species_evolution[sid],
        })
    return output, unavailable


def pokedex_species(data: dict, legacy_species: list[dict]):
    gen1 = []
    for sid, entry in data["pokedex"].items():
        num = entry.get("num")
        if isinstance(num, int) and 1 <= num <= 151 and "forme" not in entry:
            gen1.append({"id": sid, **entry})
    gen1.sort(key=lambda sp: sp["num"])
    if len(gen1) != 151 or [sp["num"] for sp in gen1] != list(range(1, 152)):
        fail(f"pokedex.json 规则筛选没有得到唯一的1–151：{len(gen1)}项")
    gen1_ids = {sp["id"] for sp in gen1}
    old_ids = {sp["id"] for sp in legacy_species}
    extras = old_ids - gen1_ids
    if len(extras) != 9 or tuple(s["id"] for s in legacy_species if s["id"] in extras) != LEGACY_EXTRA_IDS:
        fail(f"原23物种中第2–3代集合变化：{sorted(extras)}")
    by_id = {sid: {"id": sid, **entry} for sid, entry in data["pokedex"].items()}
    new = [sp for sp in gen1 if sp["id"] not in old_ids]
    legacy_entries = []
    for sp in legacy_species:
        if sp["id"] not in by_id:
            fail(f"Showdown 图鉴数据缺少旧物种：{sp['id']}")
        legacy_entries.append(by_id[sp["id"]])
    evolution_ids = legacy_evolution_ids(data["pokedex"])
    if any(sid in old_ids or sid in gen1_ids for sid in evolution_ids):
        fail("新增进化形态与现有160种名单发生重叠")
    evolution_entries = []
    for species_id in evolution_ids:
        if species_id not in by_id:
            fail(f"Showdown 图鉴数据缺少新增进化形态：{species_id}")
        evolution_entries.append(by_id[species_id])
    return [*legacy_entries, *new, *evolution_entries], gen1, {sid: by_id[sid] for sid in gen1_ids}


def validate_existing_species(current_species: list[dict] | None, generated_species: list[dict]) -> None:
    if current_species is None:
        return
    generated_by_id = {species["id"]: species for species in generated_species}
    current_ids = [species.get("id") for species in current_species]
    existing_ids = [species_id for species_id in current_ids if species_id not in LEGACY_EVOLUTION_IDS]
    added_ids = [species_id for species_id in current_ids if species_id in LEGACY_EVOLUTION_IDS]
    expected_existing_ids = [species["id"] for species in generated_species if species["id"] not in LEGACY_EVOLUTION_IDS]
    if existing_ids != expected_existing_ids:
        fail("当前 roster.json 的原160种 ID 或顺序与固定导入基线不同")
    if added_ids and added_ids != list(LEGACY_EVOLUTION_IDS):
        fail("当前 roster.json 的新增15种顺序与固定名单不同")
    if current_ids != [*existing_ids, *added_ids]:
        fail("当前 roster.json 的新增15种没有追加在原160种之后")

    for current in current_species:
        species_id = current.get("id")
        generated = generated_by_id.get(species_id)
        if generated is None:
            fail(f"当前 roster.json 含固定名单以外物种：{species_id}")
        old_fields = {key: value for key, value in current.items() if key not in EVOLUTION_FIELDS}
        generated_old_fields = {key: value for key, value in generated.items() if key not in EVOLUTION_FIELDS}
        if old_fields != generated_old_fields:
            changed = sorted(set(old_fields) | set(generated_old_fields))
            changed = [key for key in changed if old_fields.get(key) != generated_old_fields.get(key)]
            fail(f"当前物种既有字段与固定导入结果不同：{species_id} / {changed}")


def pokeapi_names(snapshot_root: Path, raw_files: dict, gen1: list[dict], roster: list[dict], baseline_names: dict, union: set[str]):
    languages = load_csv(raw_files["pokeapi/languages.csv"], "pokeapi/languages.csv")
    language = next((r for r in languages if r.get("id") == LANGUAGE_ID), None)
    if not language or (language.get("identifier") or "").casefold() != "zh-hans":
        fail("PokeAPI languages.csv 中 language id 12 不再是 zh-Hans")
    species_rows = load_csv(raw_files["pokeapi/pokemon_species_names.csv"], "pokeapi/pokemon_species_names.csv")
    species_api = {r["pokemon_species_id"]: r["name"] for r in species_rows if r.get("local_language_id") == LANGUAGE_ID}
    species_names = dict(baseline_names["species"])
    missing_species = []
    species_name_diffs = []
    legacy_by_dex = {int(sp["dex"]): sp for sp in roster}
    for sp in gen1:
        dex, sid = sp["num"], sp["id"]
        api_name = species_api.get(str(dex))
        if not api_name:
            missing_species.append({"dex": f"{dex:04d}", "id": sid})
            continue
        old_name = baseline_names["species"].get(sid)
        if old_name is not None:
            if old_name != api_name:
                species_name_diffs.append({"dex": f"{dex:04d}", "id": sid, "existing": old_name, "pokeapi": api_name})
        else:
            species_names[sid] = api_name
    for sp in roster:
        if sp["id"] not in species_names:
            # Non-Gen1 roster species use their national dex number in the same fixed snapshot.
            api_name = species_api.get(str(int(sp["dex"])))
            if api_name:
                species_names[sp["id"]] = api_name
            else:
                missing_species.append({"dex": sp["dex"], "id": sp["id"]})

    move_rows = load_csv(raw_files["pokeapi/moves.csv"], "pokeapi/moves.csv")
    move_identifiers = {row["id"]: row["identifier"] for row in move_rows}
    move_name_rows = load_csv(raw_files["pokeapi/move_names.csv"], "pokeapi/move_names.csv")
    api_move_names = {row["move_id"]: row["name"] for row in move_name_rows if row.get("local_language_id") == LANGUAGE_ID}
    id_by_move = {}
    for poke_id, identifier in move_identifiers.items():
        normalized = identifier.replace("-", "")
        if normalized in id_by_move and id_by_move[normalized] != poke_id:
            fail(f"PokeAPI 连字符标准化产生重复招式 id：{normalized}")
        id_by_move[normalized] = poke_id

    move_names = dict(baseline_names["moves"])
    missing_moves = []
    move_name_diffs = []
    for move_id in sorted(union):
        poke_id = id_by_move.get(move_id)
        api_name = api_move_names.get(poke_id) if poke_id else None
        if not api_name:
            missing_moves.append({"id": move_id, "pokeapiIdentifier": next((v for v in move_identifiers.values() if v.replace("-", "") == move_id), None)})
            continue
        old_name = baseline_names["moves"].get(move_id)
        if old_name is not None:
            if old_name != api_name:
                move_name_diffs.append({"id": move_id, "existing": old_name, "pokeapi": api_name})
        else:
            move_names[move_id] = api_name
    return species_names, move_names, {
        "missingSpecies": sorted(missing_species, key=lambda x: x["dex"]),
        "speciesDifferences": sorted(species_name_diffs, key=lambda x: x["dex"]),
        "missingMoves": sorted(missing_moves, key=lambda x: x["id"]),
        "moveDifferences": sorted(move_name_diffs, key=lambda x: x["id"]),
    }


def check_sprite_assets(tracker: dict, roster: list[dict]):
    root = REPO / "public" / "assets" / "characters"
    rows = []
    action_names = ("Walk", "Idle", "Attack", "Hurt", "Shoot")
    for sp in roster:
        dex = f"{sp['num']:04d}"
        entry = tracker.get(dex) or {}
        portrait = entry.get("portrait_complete", 0)
        sprite = entry.get("sprite_complete", 0)
        folder = root / dex
        xml_path = folder / "AnimData.xml"
        missing = []
        actions_checked = False
        if not xml_path.is_file():
            missing.append(f"public/assets/characters/{dex}/AnimData.xml")
        else:
            try:
                xml = ET.parse(xml_path).getroot()
                anims = {node.findtext("Name"): node for node in xml.iter("Anim") if node.findtext("Name")}
                actions_checked = True
                for action in action_names:
                    node = anims.get(action)
                    if node is None:
                        missing.append(f"public/assets/characters/{dex}/AnimData.xml#{action}")
                        continue
                    image_action = node.findtext("CopyOf") or action
                    if image_action not in anims:
                        missing.append(f"public/assets/characters/{dex}/AnimData.xml#{action}（CopyOf={image_action} 不存在）")
                        continue
                    for kind in ("Anim", "Shadow"):
                        relative = f"public/assets/characters/{dex}/{image_action}-{kind}.png"
                        if not (folder / f"{image_action}-{kind}.png").is_file():
                            missing.append(relative)
            except (ET.ParseError, OSError):
                missing.append(f"public/assets/characters/{dex}/AnimData.xml（无法解析）")
        tracker_ready = isinstance(portrait, int) and portrait > 0 and isinstance(sprite, int) and sprite > 0
        local_ready = actions_checked and not missing
        rows.append({
            "dex": dex, "id": sp["id"], "name": sp["name"],
            "portraitComplete": portrait, "spriteComplete": sprite,
            "trackerReady": tracker_ready, "localFilesReady": local_ready,
            "available": tracker_ready and local_ready, "actionsChecked": actions_checked,
            "missingFiles": sorted(missing),
        })
    return rows


def consistency_check(old_pmd: dict, pmd_data: dict):
    checked = []
    old_source_game = {"MDTDS": "TDS", "MDGtI": "GTI"}
    for move_id, old in old_pmd["moves"].items():
        game = old.get("game")
        if game is None:
            continue
        if game not in old_source_game:
            fail(f"旧招式 {move_id} 的官方作品 {game} 不在第2.3节抽检映射中")
        selected = None
        for raw in pmd_data["moves"].get(move_id, {}).get("rows", []):
            row = parse_pmd_row(raw)
            if row and row["game"] == old_source_game[game]:
                selected = row
                break
        if selected is None:
            fail(f"旧招式一致性抽检找不到 {move_id}/{old_source_game[game]} 行")
        official = old["official"]
        comparisons = {"basePp": selected["pp"], "accuracy": selected["acc"], "cutsCorners": selected["cuts"]}
        for key, value in comparisons.items():
            if official.get(key) != value:
                fail(f"旧招式一致性抽检不一致：{move_id}.{key} {official.get(key)!r} != {value!r}")
        checked.append(move_id)
    if len(checked) != 23:
        fail(f"旧招式官方数据抽检预期23招，实际 {len(checked)}")
    return sorted(checked)


def md_table(headers: list[str], rows: list[list[str]]) -> str:
    clean = lambda value: str(value).replace("|", "／").replace("\n", "<br>")
    return "| " + " | ".join(headers) + " |\n| " + " | ".join("---" for _ in headers) + " |\n" + "".join(
        "| " + " | ".join(clean(value) for value in row) + " |\n" for row in rows
    )


def build_exceptions(admission: dict, exclusions: dict, unavailable_power: dict, unavailable: list[dict], names_report: dict,
                     sprite_rows: list[dict], hashes: dict, totals: dict, pmd_snapshot_no_rows: list[str]):
    reason_groups = {}
    for move_id, result in admission.items():
        if not result["admitted"]:
            reason_groups.setdefault(result["reason"], []).append(move_id)
    lines = [
        "# 图鉴批量导入例外清单", "",
        "本清单由固定快照离线生成。招式例外按每招计数；物种、译名和素材类别不计入招式闭合和。素材状态分别记录 tracker 完成度与当前本地文件核验；没有下载任何文件。", "",
        "## 输入快照 SHA-256", "",
        md_table(["相对路径", "SHA-256"], [[path, digest] for path, digest in hashes.items()]),
        "## PMD 附加快照说明", "",
        f"固定附加快照页面存在但没有 MDMoveRow 的招式：{'、'.join(sorted(pmd_snapshot_no_rows)) or '无'}。这些招式按第2.4节的作品优先级计入‘无官方迷宫数据’，这里只说明本次固定快照未提供招式行，不表示断言官方作品中不存在相关数据。", "",
        "## 招式准入摘要", "",
        f"招式并集 {totals['learnsetMoves']} = 准入 {totals['admittedMoves']} + 按规格原因排除 {totals['ruleExcludedMoves']}。", "",
        "## 按规则未准入的招式", "",
    ]
    if reason_groups:
        reason_rows = [[reason, len(ids), "、".join(sorted(ids))] for reason, ids in sorted(reason_groups.items())]
        lines.append(md_table(["原因", "数量", "招式 ID"], reason_rows))
    else:
        lines.append("无。\n")
    lines += ["## 官方威力不可用：原始记录", "", "按规格第2.4节第7条，攻击招式所选官方行的威力不是整数时不准入；本表已计入上述排除总数。保持作品优先级，不以 Showdown 威力补造。", ""]
    for move_id, record in sorted(unavailable_power.items()):
        lines += [f"### {move_id}", "", record["detail"], "", "```text", record["rawRow"], "```", ""]
    if not unavailable_power:
        lines.append("无。\n")
    lines += ["## 暂不出场物种", "", "这些物种按规定方法无法得到两个准入升级招式且至少一个伤害招式；保留在图鉴数据中，写入 `availability: 暂不出场`。", ""]
    lines.append(md_table(["图鉴号", "ID", "升级招式 kit", "原因"], [
        [sp["dex"], sp["id"], "、".join(x["move"] for x in sp["kit"]) or "无", "准入升级招式不足2个或没有伤害招式"] for sp in unavailable
    ]))
    lines += ["## PokeAPI 名称差异与缺失", ""]
    lines += ["### 现有手写名称与 PokeAPI 不同", ""]
    lines.append(md_table(["类别", "ID", "保留名称", "PokeAPI 简体中文"],
        [["物种", x["id"], x["existing"], x["pokeapi"]] for x in names_report["speciesDifferences"]]
        + [["招式", x["id"], x["existing"], x["pokeapi"]] for x in names_report["moveDifferences"]]))
    lines += ["### PokeAPI 未匹配", ""]
    missing_rows = [["物种", x["dex"], x["id"], "未匹配简体中文名"] for x in names_report["missingSpecies"]]
    missing_rows += [["招式", x["id"], x.get("pokeapiIdentifier") or "—", "moves.csv 标识去连字符后无对应 ID 或无简体中文名"] for x in names_report["missingMoves"]]
    lines.append(md_table(["类别", "图鉴号／ID", "PokeAPI 标识", "情况"], missing_rows) if missing_rows else "无。\n")
    lines += ["## 角色素材可用性（本次图鉴 175 种）", "", "tracker 的 `portrait_complete`、`sprite_complete` 只表示快照中的完成度。素材判定还要求当前本地有 `AnimData.xml`，并且 Walk、Idle、Attack、Hurt、Shoot 以及各自解析到的 Anim/Shadow PNG 文件都存在。tracker 完成不代表素材文件已下载、可用或许可已确认。", ""]
    sprite_table = []
    for row in sprite_rows:
        tracker_state = "通过" if row["trackerReady"] else "未通过"
        if not row["actionsChecked"]:
            local = "未核验：本地无可解析 AnimData.xml"
        else:
            local = "文件齐全" if row["localFilesReady"] else "缺 " + "、".join(row["missingFiles"])
        available = "可用性条件通过" if row["available"] else "未通过"
        sprite_table.append([row["dex"], row["id"], f"{row['portraitComplete']} / {row['spriteComplete']}（{tracker_state}）", local, available])
    lines.append(md_table(["图鉴号", "ID", "tracker portrait / sprite", "本地文件", "按三项条件的结果"], sprite_table))
    return "\n".join(lines).rstrip() + "\n"


def serialize_pmd(old_pmd: dict, new_specs: dict, baseline_snippets: dict[str, bytes], showdown_moves: dict) -> bytes:
    moves = dict(old_pmd["moves"])
    moves.update(new_specs)
    categories = {move_id: showdown_moves.get(move_id, {}).get("category") for move_id in sorted(moves)}
    for move_id, category in categories.items():
        if category not in ("Physical", "Special", "Status"):
            fail(f"固定Showdown快照缺少合法招式类别：{move_id} / {category!r}")
    root = {
        "note": "阶段7.8 官方招式与图鉴扩展招式数据，由 tools/data/import_pokedex.py 合并生成；旧25招对象按固定基线保留。仅用于私有构建。",
        "source": old_pmd["source"], "retrieved": old_pmd["retrieved"],
        "snapshotSha256": PMD_SHA,
        "supplementalSnapshotFile": PMD_EXTRA_NAME,
        "supplementalSnapshotSha256": PMD_EXTRA_SHA,
        "gamePriority": [GAME_OUTPUT[g][0] for g in GAME_PRIORITY],
        "categorySource": {"snapshot": "showdown/moves.json", "sha256": INPUT_SHA["showdown/moves.json"]},
        "categories": categories,
        "moves": dict(sorted(moves.items())),
        "candidates77b": {
            move_id: candidate for move_id, candidate in old_pmd["candidates77b"].items()
            if move_id not in TEAM_PROTECTION_MOVE_IDS
        },
    }
    text = json.dumps(root, ensure_ascii=False, indent=1) + "\n"
    root_entries, _ = json_object_entries(text)
    move_entries, _ = json_object_entries(text, root_entries["moves"]["start"])
    for move_id in LEGACY_MOVE_IDS:
        if move_id not in baseline_snippets or move_id not in move_entries:
            fail(f"序列化时缺少旧招式对象：{move_id}")
    # Replace old move objects from right to left so their original raw bytes survive exactly.
    spans = [(move_entries[mid]["start"], move_entries[mid]["end"], baseline_snippets[mid].decode("utf-8")) for mid in LEGACY_MOVE_IDS]
    for start, end, raw in sorted(spans, reverse=True):
        text = text[:start] + raw + text[end:]
    final = text.encode("utf-8")
    extracted = exact_move_snippets(final)
    for move_id in LEGACY_MOVE_IDS:
        normalize = lambda b: b.replace(b"\r\n", b"\n")
        if normalize(extracted[move_id]) != normalize(baseline_snippets[move_id]):
            fail(f"写出前旧招式原文字节核对失败：{move_id}")
    return final


def build_outputs(snapshot_root: Path, main_root: Path, checked: dict):
    data = checked["data"]
    old_species, old_pmd, baseline_snippets, baseline_names, showdown_commit = build_baselines(snapshot_root, checked)
    all_species, gen1, gen1_by_id = pokedex_species(data, old_species)
    roster_learnsets, union = learnset_data(data, [sp["id"] for sp in all_species])
    requested = set(data["pmd"].get("requestedIds", []))
    if union != requested or union != set(data["pmd"].get("moves", {})):
        fail(f"PMD 请求招式集、快照招式集与选定学习表并集不同：learnset={len(union)} requested={len(requested)} pages={len(data['pmd'].get('moves', {}))}")
    if len(union) != 522:
        fail(f"175种名单按固定学习表预期招式并集522，实际 {len(union)}")
    new_specs, admission, admission_counts, exclusions, unavailable_power = classify_moves(
        union, data["moves"], data["pmd"], old_pmd["moves"],
    )
    admitted_count = sum(1 for result in admission.values() if result["admitted"])
    all_move_specs = dict(old_pmd["moves"])
    all_move_specs.update(new_specs)
    roster, unavailable = generate_roster(
        data, all_species, roster_learnsets, union, admission, all_move_specs, old_species, data["moves"],
    )
    validate_existing_species(checked.get("currentRosterSpecies"), roster)
    frozen_ids = tuple(sp["id"] for sp in roster if sp["id"] in LEGACY_SPECIES_IDS)
    if frozen_ids != LEGACY_SPECIES_IDS:
        fail("新名单没有保留原23物种顺序")
    new_by_id = {sp["id"]: sp for sp in roster}
    old_by_id = {sp["id"]: sp for sp in old_species}
    for sid, old in old_by_id.items():
        cur = new_by_id[sid]
        if any(cur[k] != old[k] for k in ("kit", "maxHp", "starter")):
            fail(f"旧物种冻结字段变化：{sid}")
        old_learned = {m["move"] for m in old["learnable"]}
        new_learned = {m["move"] for m in cur["learnable"]}
        if not old_learned.issubset(new_learned):
            fail(f"旧 learnable 不是新集合子集：{sid} 缺 {sorted(old_learned-new_learned)}")

    gen_counts = {}
    for sid in gen1_by_id:
        era = roster_learnsets[sid]["era"]
        gen_counts[str(era)] = gen_counts.get(str(era), 0) + 1
    species_names, move_names, name_report = pokeapi_names(
        snapshot_root, checked["raw"], gen1, roster, baseline_names, union,
    )
    sprite_rows = check_sprite_assets(data["tracker"], all_species)
    consistent_moves = consistency_check(old_pmd, data["pmd"])

    roster_doc = {
        "source": {
            "project": "Pokémon Showdown",
            "files": {name.rsplit("/", 1)[-1]: digest for name, digest in checked["hashes"].items() if name.startswith("showdown/")},
            "url": "https://play.pokemonshowdown.com/data/<name>.json",
            "downloaded": "2026-10-30", "githubCommit": showdown_commit,
            "license": "代码 MIT；宝可梦数据知识产权不在许可之内，仅私有构建",
            "note": "图鉴1–151完整基础形态，并保留旧23种及其15种后续形态。learnsetGen按最新有升级招式的世代决定；原160种既有字段保留，仅追加进化与分类字段。",
        },
        "species": roster,
    }
    tm_names = dict(baseline_names["tms"])
    for move_id in TEAM_PROTECTION_MOVE_IDS:
        if not move_names.get(move_id):
            fail(f"招式机名称缺失：{move_id}")
        tm_names[move_id] = move_names[move_id]
    names_doc = {
        "source": f"物种名与招式名来自 PokeAPI 固定提交 {POKEAPI_COMMIT} 的简体中文（language id 12）；保留固定手写名称基线中已有译名，差异见 .artifacts/pokedex/exceptions.md。类型、招式机与物品名称沿用本作基线。",
        "species": dict(sorted(species_names.items())),
        "types": baseline_names["types"],
        "moves": dict(sorted(move_names.items())),
        "tms": tm_names,
        "items": baseline_names["items"],
    }
    pmd_bytes = serialize_pmd(old_pmd, new_specs, baseline_snippets, data["moves"])

    gen1_ids = {sp["id"] for sp in gen1}
    gen1_sprite_rows = [row for row in sprite_rows if row["id"] in gen1_ids]
    _, gen1_union = learnset_data(data, sorted(gen1_ids))
    gen1_admitted_count = sum(admission[mid]["admitted"] for mid in gen1_union)
    local_files_ready = sum(row["localFilesReady"] for row in sprite_rows)
    tracker_ready = sum(row["trackerReady"] for row in sprite_rows)
    sprite_available = sum(row["available"] for row in sprite_rows)
    totals = {
        "legacySpecies": 23, "generation1Species": len(gen1),
        "extraSpecies": len(roster) - len(gen1), "evolutionSpecies": len(LEGACY_EVOLUTION_IDS),
        "species": len(roster), "learnsetMoves": len(union),
        "admittedMoves": admitted_count, "excludedMoves": sum(exclusions.values()),
        "ruleExcludedMoves": sum(exclusions.values()),
        "notAdmittedMoves": len(union) - admitted_count,
        "moveTableMoves": len(old_pmd["moves"]) + len(set(new_specs) - set(old_pmd["moves"])),
        "oldOfficialConsistencyChecks": len(consistent_moves), "unavailableSpecies": len(unavailable),
    }
    summary = {
        "schemaVersion": 1,
        "inputs": checked["hashes"],
        "totals": totals,
        "learnsetGenerationCounts": dict(sorted(gen_counts.items())),
        "admissionCounts": {key: admission_counts.get(key, 0) for key in ADMISSION_KEYS},
        "exclusionCounts": {
            key: sum(count for reason, count in exclusions.items() if RANGE_REASON.get(reason, reason) == key)
            for key in EXCLUSION_KEYS
        },
        "unavailableSpecies": [{"dex": x["dex"], "id": x["id"]} for x in unavailable],
        "officialPowerUnavailable": [{"id": mid, **record} for mid, record in unavailable_power.items()],
        "comparison": {
            "preview": {
                "admittedMoves": 217, "generation1AdmittedMoves": 215, "unavailableSpecies": 5,
                "learnsetGenerationCounts": {"7": 12, "8": 40, "9": 99},
                "nameChecks": {"missingSpecies": 0, "speciesDifferences": 0, "missingMoves": 1, "moveDifferences": 6},
            },
            "observed": {
                "admittedMoves": admitted_count, "unavailableSpecies": len(unavailable),
                "generation1AdmittedMoves": gen1_admitted_count,
                "learnsetGenerationCounts": dict(sorted(gen_counts.items())),
                "nameChecks": {
                    "missingSpecies": len(name_report["missingSpecies"]),
                    "speciesDifferences": len(name_report["speciesDifferences"]),
                    "missingMoves": len(name_report["missingMoves"]),
                    "moveDifferences": len(name_report["moveDifferences"]),
                },
            },
        },
        "nameChecks": {
            "missingSpecies": len(name_report["missingSpecies"]), "speciesDifferences": len(name_report["speciesDifferences"]),
            "missingMoves": len(name_report["missingMoves"]), "moveDifferences": len(name_report["moveDifferences"]),
        },
        "officialConsistencyCheckedMoves": consistent_moves,
        "spriteAvailability": {
            "rosterSpeciesCount": len(sprite_rows), "generation1Count": len(gen1_sprite_rows),
            "trackerReady": tracker_ready,
            "localFilesReady": local_files_ready, "available": sprite_available,
            "unverifiedLocalFiles": sum(not row["actionsChecked"] for row in sprite_rows),
            "generation1": {
                "trackerReady": sum(row["trackerReady"] for row in gen1_sprite_rows),
                "localFilesReady": sum(row["localFilesReady"] for row in gen1_sprite_rows),
                "available": sum(row["available"] for row in gen1_sprite_rows),
                "unverifiedLocalFiles": sum(not row["actionsChecked"] for row in gen1_sprite_rows),
            },
        },
    }
    pmd_snapshot_no_rows = [
        move_id for move_id, page in data["pmdExtra"]["moves"].items() if not page.get("rows")
    ]
    exceptions = build_exceptions(
        admission, exclusions, unavailable_power, unavailable, name_report, sprite_rows,
        checked["hashes"], totals, pmd_snapshot_no_rows,
    )
    roster_bytes = (json.dumps(roster_doc, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    names_bytes = (json.dumps(names_doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    summary_bytes = (json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return {
        "src/data/roster.json": roster_bytes,
        "src/data/pmd-moves.json": pmd_bytes,
        "src/data/names-zh.json": names_bytes,
        ".artifacts/pokedex/exceptions.md": exceptions.encode("utf-8"),
        ".artifacts/pokedex/summary.json": summary_bytes,
        "summary": summary,
    }


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--snapshot-root", type=Path, help="含 showdown/pmd/pokeapi/spritecollab 的 .artifacts 根目录")
    parser.add_argument("--out-dir", type=Path, help="输出根目录，默认当前 worktree 根目录")
    args = parser.parse_args()
    try:
        main_root = main_checkout_root()
        snapshot_root = (args.snapshot_root or (main_root / ".artifacts")).resolve()
        out_root = (args.out_dir or REPO).resolve()
        checked = verify_and_load(snapshot_root)
        outputs = build_outputs(snapshot_root, main_root, checked)
        summary = outputs.pop("summary")
        # Write only after every input, baseline and derived-data check has passed.
        for relative, raw in outputs.items():
            path = out_root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
    except ImportFailure as exc:
        print(f"import_pokedex: {exc}", file=sys.stderr)
        return 1
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError, KeyError, TypeError) as exc:
        print(f"import_pokedex: 输入或派生数据无效：{exc}", file=sys.stderr)
        return 1
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    print("import_pokedex: 已写出 roster.json、pmd-moves.json、names-zh.json、exceptions.md、summary.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
