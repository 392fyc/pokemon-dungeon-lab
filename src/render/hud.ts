import {
  accuracyMultiplier,
  BLESSINGS,
  COMMISSIONS,
  hitChance,
  ITEM_NAMES,
  PROG,
  stageOf,
  sleeping,
  STATUS_NAMES,
  STAGE_NAMES,
  type BlessingId,
  type Item,
  type Skill,
  type StageKey,
  type StatusId,
  type StatusState,
  type Unit,
  type World,
} from "../core/engine.ts";
import { moveCategory, moveEffects, moveOf, type MoveRange } from "../core/moves.ts";
import { THEME_FLOORS, themeOfLevel } from "../core/dungeon.ts";
import { itemZh, moveZh, speciesZh, tmZh, typeZh } from "../core/names.ts";
import { damageEstimateText, moveRangeLabel } from "../core/describe.ts";
import { itemDescription } from "../core/item-descriptions.ts";
import { skinFor } from "./sprites.ts";
import { portraitMarkup } from "./portrait.ts";
import "./portrait.css";
import moveTypeSnapshot from "../data/move-types.json" with { type: "json" };
import moveDescriptionSnapshot from "../data/move-desc-zh.json" with { type: "json" };

const MOVE_TYPES = (moveTypeSnapshot as unknown as { types: Record<string, string> }).types;
const MOVE_DESCRIPTIONS = (moveDescriptionSnapshot as unknown as {
  moves: Record<string, { desc: string }>;
}).moves;
const ITEM_CATEGORIES: Record<Item, string> = {
  berry: "berry",
  bigBerry: "berry",
  tonic: "drink",
  teamTonic: "drink",
  pechaBerry: "berry",
  rawstBerry: "berry",
  cheriBerry: "berry",
  chestoBerry: "berry",
  healSeed: "other",
  violentSeed: "other",
  maxElixir: "drink",
};
const CATEGORY_TABS = [
  ["all", "全部"],
  ["berry", "树果"],
  ["drink", "补剂"],
  ["tm", "招式机"],
  ["other", "其他"],
] as const;
const CATEGORY_SET = new Set<string>(CATEGORY_TABS.map(([id]) => id));

function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

function unitName(unit: Unit): string {
  return unit.species ? speciesZh(unit.species) : unit.side === "enemy" ? "敌人" : "队员";
}

function hpPercent(unit: Unit): number {
  if (unit.maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
}

function spriteMarkup(unit: Unit, label: string): string {
  const dex = skinFor(unit.id, unit.side, unit.species);
  return portraitMarkup(dex, {
    boxClass: "hud-avatar",
    spriteClass: "hud-avatar-sprite",
    label,
    animated: false,
  });
}

function stageBadge(label: string, stage: number): string {
  if (!stage) return "";
  const direction = stage > 0 ? "up" : "down";
  const arrow = stage > 0 ? "↑" : "↓";
  return '<span class="hud-status-badge is-' + direction + '">' +
    esc(label + arrow + Math.abs(stage)) + "</span>";
}

function statusMarkup(unit: Unit): string {
  const stageKeys: StageKey[] = ["atk", "def", "spa", "spd", "acc", "eva"];
  const badges = stageKeys.map((key) => stageBadge(STAGE_NAMES[key], stageOf(unit, key)));
  for (const kind of Object.keys(STATUS_NAMES) as StatusId[]) {
    const state: StatusState | undefined = unit.status?.[kind];
    if (!state) continue;
    const remaining = state.left ?? state.tick;
    badges.push('<span class="hud-status-badge is-down">' +
      esc(STATUS_NAMES[kind] + (remaining === undefined ? "" : remaining)) + "</span>");
  }
  if (unit.asleep) badges.push('<span class="hud-status-badge is-down">睡眠</span>');
  if (unit.protect > 0) badges.push('<span class="hud-status-badge is-up">守住' + unit.protect + '</span>');
  if (unit.reflect && unit.reflect > 0) badges.push('<span class="hud-status-badge is-up">反射' + unit.reflect + '</span>');
  if (unit.lightscreen && unit.lightscreen > 0) badges.push('<span class="hud-status-badge is-up">光墙' + unit.lightscreen + '</span>');
  if (unit.counter > 0) badges.push('<span class="hud-status-badge is-up">反击' + unit.counter + '</span>');
  if (unit.hp <= 0) badges.push('<span class="hud-status-badge is-down">倒下</span>');
  return badges.filter(Boolean).join("");
}

function itemCount(world: World, item: Item): number {
  return world.prog?.items[item] ?? 0;
}

function itemTitle(item: Item): string {
  return ITEM_NAMES[item] ?? itemZh(item);
}

const QUICK_ITEM_NAMES: Record<Item, string> = {
  berry: "橙橙果",
  bigBerry: "大树果",
  tonic: "PP剂",
  teamTonic: "全员PP剂",
  pechaBerry: "桃桃果",
  rawstBerry: "莓莓果",
  cheriBerry: "樱子果",
  chestoBerry: "零余果",
  healSeed: "治愈种",
  violentSeed: "暴力种",
  maxElixir: "满PP剂",
};

function quickSlotMarkup(world: World, item: Item | null, index: number, disabled: boolean, selectedItem: Item | null): string {
  const amount = item ? itemCount(world, item) : 0;
  if (!item || amount < 1) {
    return '<button type="button" class="hud-quick-slot is-empty" data-hud-quick="' + index +
      '" aria-label="空快捷格" disabled><span aria-hidden="true"></span></button>';
  }
  const name = itemTitle(item);
  const description = itemDescription(item);
  const selected = item === selectedItem;
  const unavailable = disabled;
  return '<button type="button" class="hud-quick-slot' + (selected ? " is-selected" : "") + '" data-hud-quick="' + index +
    '" aria-pressed="' + selected + '" aria-label="' + esc(name + " ×" + amount + "。" + description) + '"' + (unavailable ? " disabled" : "") + ">" +
    '<span class="hud-quick-name">' + esc(QUICK_ITEM_NAMES[item]) + '</span><span class="hud-quick-count">×' +
    amount + '</span><span class="hud-item-description">' + esc(description) + "</span></button>";
}

function experienceMarkup(world: World): string {
  if (!world.prog) return "";
  const level = Math.max(PROG.initialLevel, Math.min(PROG.maxLevel, world.prog.level));
  const start = PROG.thresholds[level] ?? 0;
  const next = PROG.thresholds[level + 1];
  const exp = world.prog.exp;
  const segment = next === undefined ? 0 : Math.max(0, next - start);
  const progress = next === undefined ? 0 : Math.max(0, Math.min(100, ((exp - start) / Math.max(1, segment)) * 100));
  const current = next === undefined ? 0 : Math.max(0, exp - start);
  const count = next === undefined ? "MAX" : current + "/" + segment;
  return '<div class="hud-experience" aria-label="队伍等级与经验">' +
    '<span class="hud-experience-level">队伍 Lv' + level + "</span>" +
    '<span class="hud-experience-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
    progress.toFixed(0) + '"><span style="width:' + progress.toFixed(2) + '%"></span></span>' +
    '<span class="hud-experience-count">' + count + "</span></div>";
}

function moveType(skill: Skill): string {
  return MOVE_TYPES[skill] ?? "";
}

function moveTypeLabel(skill: Skill): string {
  const id = moveType(skill);
  return id ? typeZh(id) : "—";
}

function moveCategoryLabel(skill: Skill): string {
  const category = moveCategory(skill);
  if (category === "Physical") return "物理";
  if (category === "Special") return "特殊";
  if (category === "Status") return "变化";
  return "—";
}

function compactRange(range: MoveRange | undefined): string {
  switch (range) {
    case "front": return "1格";
    case "front2": return "2格";
    case "line10": return "10格";
    case "around": return "周围1格";
    case "room": return "同房间";
    case "user": return "自身";
    default: return "—";
  }
}

function rangeCategory(range: MoveRange | undefined): string {
  switch (range) {
    case "front":
    case "front2":
    case "line10": return "单体";
    case "around": return "周围";
    case "room": return "房间";
    case "user": return "自身";
    default: return "—";
  }
}

function scopeGrid(range: MoveRange | undefined): string {
  const rangeCells = new Set<string>();
  const directions = new Set<string>();
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const dx = x - 2;
      const dy = y - 2;
      if ((dx !== 0 || dy !== 0) && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        directions.add(x + "," + y);
      }
    }
  }

  if (range === "front") rangeCells.add("2,1");
  else if (range === "front2") {
    rangeCells.add("2,1");
    rangeCells.add("2,0");
  } else if (range === "line10") {
    rangeCells.add("2,1");
    rangeCells.add("2,0");
  } else if (range === "around") {
    for (const cell of directions) rangeCells.add(cell);
  } else if (range === "room") {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (x !== 2 || y !== 2) rangeCells.add(x + "," + y);
      }
    }
  }

  const cells: string[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const key = x + "," + y;
      const classes = ["hud-range-cell"];
      if (x === 2 && y === 2) classes.push("is-self");
      else if (rangeCells.has(key)) classes.push("is-active");
      else if (directions.has(key)) classes.push("is-direction");
      cells.push('<span class="' + classes.join(" ") + '" aria-hidden="true"></span>');
    }
  }
  return '<span class="hud-range-grid" role="img" aria-label="5×5 范围示意">' + cells.join("") + "</span>";
}

function consumableList(world: World): Array<{ item: Item; category: string; amount: number }> {
  const items = Object.keys(ITEM_CATEGORIES) as Item[];
  return items
    .map((item) => ({ item, category: ITEM_CATEGORIES[item], amount: itemCount(world, item) }))
    .filter((entry) => entry.amount > 0);
}

function heldTmList(world: World): Array<{ move: string; amount: number }> {
  const counts = new Map<string, number>();
  for (const tm of world.tms ?? []) {
    if (tm.fate === "held") counts.set(tm.move, (counts.get(tm.move) ?? 0) + 1);
  }
  return [...counts.entries()].map(([move, amount]) => ({ move, amount }));
}

export function hudParty(s: World, disabled: boolean): string {
  const cards = s.queue.slice(0, 3).map((id, index) => {
    const unit = s.units[id];
    if (!unit) return "";
    const name = unitName(unit);
    const percent = hpPercent(unit);
    const chosen = id === s.leader;
    const status = statusMarkup(unit);
    return '<article class="hud-party-card' + (chosen ? " is-leader" : "") + '" id="unit-card-' + esc(id) + '">' +
      '<button type="button" class="hud-party-main" id="leader-' + index + '" data-hud-leader="' +
      esc(id) + '" aria-pressed="' + chosen + '" aria-label="切换操控到' + esc(name) + '"' +
      (disabled ? " disabled" : "") + ">" +
      spriteMarkup(unit, name) +
      '<span class="hud-party-info"><span class="hud-party-name-row"><strong class="hud-party-name">' +
      esc(name) + '</strong><span class="hud-party-hp">' + unit.hp + "/" + unit.maxHp +
      '</span></span><span class="hud-hp-track"><span class="hud-hp-fill' +
      (unit.hp <= 0 ? " is-empty" : "") + '" style="width:' + percent.toFixed(2) +
      '%"></span></span><span class="hud-unit-status" data-unit-status="' + esc(id) +
      '">' + status + "</span></span></button>" +
      '<button type="button" class="hud-party-details" id="detail-' + index +
      '" data-hud-details="' + esc(id) + '" aria-label="查看' + esc(name) + '详情">详情</button></article>';
  }).join("");
  return '<div class="hud-party-list" aria-label="队伍">' + cards + "</div>";
}

export function hudBottom(
  s: World,
  quick: (Item | null)[],
  disabled: boolean,
  selectedSkill: Skill | null,
  selectedQuickItem: Item | null = null,
): string {
  const leader = s.units[s.leader];
  if (!leader) return "";
  const name = unitName(leader);
  const percent = hpPercent(leader);
  const skills = Array.from({ length: 4 }, (_, index) => {
    const skill = leader.learned[index];
    if (!skill) {
      return '<button type="button" class="hud-skill is-empty" data-move-slot="' + index +
        '" aria-label="空招式格" disabled><span></span></button>';
    }
    const current = leader.pp[skill] ?? 0;
    const maximum = leader.maxPp[skill] ?? current;
    const spec = moveOf(skill);
    const typeId = moveType(skill);
    const unavailable = disabled || current < 1 || !spec;
    return '<button type="button" class="hud-skill" id="skill-' + esc(skill) +
      '" data-hud-skill="' + esc(skill) + '" data-move-slot="' + index +
      '" data-move-type="' + esc(typeId) + '" aria-pressed="' +
      (selectedSkill === skill) + '" aria-label="' + esc(moveZh(skill) + "，" + moveTypeLabel(skill) +
      "，PP " + current + "/" + maximum) + '"' + (unavailable ? " disabled" : "") + ">" +
      '<span class="hud-skill-name">' + esc(moveZh(skill)) + '</span>' +
      '<span class="hud-skill-meta"><span class="hud-skill-type">' + esc(moveTypeLabel(skill)) +
      '</span><span class="hud-skill-pp">PP ' + current + "/" + maximum + "</span></span></button>";
  }).join("");

  const quickMarkup = Array.from({ length: 6 }, (_, index) =>
    quickSlotMarkup(s, quick[index] ?? null, index, disabled, selectedQuickItem),
  ).join("");

  const sleepNotice=sleeping(leader)?'<span id="hud-sleep-status" role="status">'+(leader.status?.nap?'打盹中':'睡眠中')+'</span>':'';
  return '<div class="hud-bottom-grid">' +
    '<section class="hud-current-unit" aria-label="当前操控队员">' +
    experienceMarkup(s) +
    '<div class="hud-current-member">' + spriteMarkup(leader, name) +
    '<span class="hud-current-info"><strong>' + esc(name) + '</strong><span class="hud-hp-track hud-hp-track-large">' +
    '<span class="hud-hp-fill' + (leader.hp <= 0 ? " is-empty" : "") +
    '" style="width:' + percent.toFixed(2) + '%"></span></span><span class="hud-current-hp"><span class="hud-current-hp-value">HP ' +
    leader.hp + "/" + leader.maxHp + "</span>" + sleepNotice + "</span></span></div></section>" +
    '<div class="hud-skills" aria-label="招式">' + skills + "</div>" +
    '<div class="hud-quick-grid" aria-label="快捷物品">' + quickMarkup + "</div>" +
    '<div class="hud-bag-button-wrap"><button type="button" id="bag-open" class="hud-bag-open">背包</button></div>' +
    "</div>";
}

export function hudMinimap(s: World): string {
  const seen = new Set(s.seen);
  const floorCells = s.floor.filter((pos) => seen.has(pos.x + "," + pos.y));
  const wallCells = (s.seenWalls ?? []).map((value) => {
    const [x, y] = value.split(",").map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }).filter((pos): pos is { x: number; y: number } => !!pos);
  const floorXs = s.floor.map((pos) => pos.x);
  const floorYs = s.floor.map((pos) => pos.y);
  const minX = s.dungeon ? 0 : Math.min(0, ...floorXs) - 1;
  const minY = s.dungeon ? 0 : Math.min(0, ...floorYs) - 1;
  const maxX = s.dungeon ? s.dungeon.width : Math.max(0, ...floorXs) + 2;
  const maxY = s.dungeon ? s.dungeon.height : Math.max(0, ...floorYs) + 2;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const floorMarkup = floorCells.map((pos) =>
    '<rect class="hud-map-floor" x="' + pos.x + '" y="' + pos.y + '" width="1" height="1"></rect>',
  ).join("");
  const wallMarkup = wallCells.map((pos) =>
    '<rect class="hud-map-wall" x="' + pos.x + '" y="' + pos.y + '" width="1" height="1"></rect>',
  ).join("");
  const pointMarkup = s.points.filter((point) => !point.used && seen.has(point.pos.x + "," + point.pos.y)).map((point) =>
    '<rect class="hud-map-point is-' + esc(point.kind) + '" x="' + point.pos.x +
    '" y="' + point.pos.y + '" width="1" height="1"></rect>',
  ).join("");
  const friends = s.queue.map((id) => s.units[id]).filter((unit): unit is Unit & { pos: NonNullable<Unit["pos"]> } =>
    !!unit && !!unit.pos && unit.hp > 0 && seen.has(unit.pos.x + "," + unit.pos.y),
  );
  const enemies = s.enemies.map((id) => s.units[id]).filter((unit): unit is Unit & { pos: NonNullable<Unit["pos"]> } =>
    !!unit && !!unit.pos && unit.hp > 0 && seen.has(unit.pos.x + "," + unit.pos.y),
  );
  const friendMarkup = friends.map((unit) =>
    '<circle class="hud-map-unit' + (unit.id === s.leader ? " is-leader" : "") +
    '" cx="' + (unit.pos!.x + 0.5) + '" cy="' + (unit.pos!.y + 0.5) + '" r="0.36"></circle>',
  ).join("");
  const enemyMarkup = enemies.map((unit) =>
    '<circle class="hud-map-unit is-enemy" cx="' + (unit.pos!.x + 0.5) +
    '" cy="' + (unit.pos!.y + 0.5) + '" r="0.32"></circle>',
  ).join("");
  const theme = s.dungeon ? themeOfLevel(s.dungeon.boss, s.dungeon.level) : null;
  const mazeName = theme ? THEME_FLOORS.find((floor) => floor.theme === theme)?.name ?? "迷宫" : "固定地图";
  const floorLabel = s.dungeon ? mazeName + " " + s.dungeon.level + "F" : mazeName;
  const roundLabel = "第 " + s.round + " 轮";
  return '<section class="hud-minimap-panel" aria-label="小地图">' +
    '<div class="hud-minimap-heading"><span>' + esc(floorLabel) + '</span><span>' + esc(roundLabel) + "</span></div>" +
    '<svg class="hud-minimap-map" viewBox="' + minX + " " + minY + " " + width + " " + height +
    '" role="img" aria-label="已探索区域">' + wallMarkup + floorMarkup + pointMarkup +
    friendMarkup + enemyMarkup + "</svg></section>";
}

function blessingEffectLabel(id: BlessingId): string {
  const definition = BLESSINGS[id];
  switch (id) {
    case "berryBoost": return "橙橙果额外回复 " + (definition.berryHealBonus ?? 0) + " HP";
    case "floorHeal": return "换层回复 " + (definition.floorHealHp ?? 0) + " HP";
    case "battleSpirit": return "攻击 +" + (definition.attackStage ?? 0) + "，换层清除";
    case "lullaby": return "下层睡眠 " + Math.round((definition.sleepChance ?? 0) * 100) + "%";
    case "rally": return "招募概率 " + Math.round((definition.recruitChance ?? 0) * 100) + "%";
    case "tmChoice": return "招式机 " + (definition.choiceCount ?? 0) + " 选 1";
  }
}

export function hudTracking(s: World): string {
  const activeCommissions = s.commissions ?? [];
  const commissions = activeCommissions.map((commission) => {
    const definition = COMMISSIONS[commission.id];
    const goal = (() => {
      switch (commission.id) {
        case "hunter": return "击倒敌人";
        case "collector": return "取得道具";
        case "scout": return "探访房间并下楼";
        case "guardian": return "全队存活下楼";
        case "speedrun": return "及时下楼";
      }
    })();
    const progress = (() => {
      if (commission.id === "speedrun") {
        return commission.speedLimit === null
          ? "限时未设置"
          : "剩余 " + Math.max(0, commission.speedLimit - commission.progress) + " 轮";
      }
      if (commission.id === "hunter") {
        return "剩余 " + Math.max(0, commission.progressTarget - commission.progress) + " 只";
      }
      if (commission.id === "collector") {
        return "剩余 " + Math.max(0, commission.progressTarget - commission.progress) + " 件";
      }
      if (commission.id === "scout") {
        return commission.progress >= commission.progressTarget ? "已探访，待下楼" : "待探访";
      }
      return "待下楼";
    })();
    return '<li class="hud-track-row" data-commission="' + esc(commission.id) + '">' +
      '<span class="hud-track-goal">' + esc(definition?.name ?? commission.id) + ' · 本层目标：' + esc(goal) + '</span>' +
      '<span class="hud-track-count">' + esc(progress) + "</span></li>";
  }).join("");
  const blessings = (s.blessings ?? []).map((id) => {
    const definition = BLESSINGS[id];
    return '<li class="hud-track-row" data-blessing="' + esc(id) + '">' +
      '<span class="hud-track-name">' + esc(definition?.name ?? id) + '</span>' +
      '<span class="hud-track-count">' + esc(blessingEffectLabel(id)) + "</span></li>";
  }).join("");
  return '<div class="hud-tracking-panel" aria-label="委托与祝福">' +
    '<section class="hud-track-section" id="commission-status"><h2>委托 ' +
    activeCommissions.length + '/3</h2><ul id="commission-active">' +
    (commissions || '<li class="hud-track-empty">无</li>') + "</ul></section>" +
    '<section class="hud-track-section" id="blessing-status"><h2>祝福</h2><ul id="blessing-active">' +
    (blessings || '<li class="hud-track-empty">无</li>') + "</ul></section></div>";
}

export function hudBag(
  s: World,
  quick: (Item | null)[],
  category: string,
  selectedSlot: number,
  selectedItem: Item | null = null,
): string {
  const activeCategory = CATEGORY_SET.has(category) ? category : "all";
  const selected = Number.isInteger(selectedSlot) && selectedSlot >= 0 && selectedSlot < 6;
  const selectedBagItem = selectedItem ?? (selected ? quick[selectedSlot] ?? null : null);
  const quickMarkup = Array.from({ length: 6 }, (_, index) => {
    const item = quick[index] ?? null;
    const amount = item ? itemCount(s, item) : 0;
    const occupied = !!item && amount > 0;
    const description = occupied ? itemDescription(item!) : "";
    const label = occupied ? itemTitle(item!) + " ×" + amount + "。" + description : "空快捷格";
    const isSelectedSlot = selected && selectedSlot === index;
    return '<button type="button" class="hud-bag-slot' + (occupied ? "" : " is-empty") +
      (isSelectedSlot ? " is-selected" : "") + '" data-bag-slot="' + index + '" aria-pressed="' + isSelectedSlot +
      '" aria-label="快捷格 ' + (index + 1) + "：" + esc(label) + '">' +
      (occupied ? '<span>' + esc(QUICK_ITEM_NAMES[item!]) + '</span><small>×' + amount +
        '</small><span class="hud-item-description">' + esc(description) + "</span>" : "") +
      "</button>";
  }).join("");

  const consumables = consumableList(s).map((entry) => {
    const description = itemDescription(entry.item);
    const selectedClass = entry.item === selectedBagItem ? " is-selected" : "";
    return {
      category: entry.category,
      markup: '<button type="button" class="hud-bag-item' + selectedClass + '" data-bag-item="' + entry.item +
        '" aria-label="' + esc(itemTitle(entry.item) + " ×" + entry.amount + "。" + description) + '">' +
        '<span class="hud-item-name">' + esc(itemTitle(entry.item)) + '</span><small>×' + entry.amount +
        '</small><span class="hud-item-description">' + esc(description) + "</span></button>",
    };
  });
  const machines = heldTmList(s).map((entry) => ({
    category: "tm",
    markup: '<div class="hud-bag-item is-readonly" role="group" aria-label="' +
      esc("招式机 " + tmZh(entry.move) + " ×" + entry.amount) + '">' +
      '<span>招式机 · ' + esc(tmZh(entry.move)) + '</span><small>×' +
      entry.amount + "</small></div>",
  }));
  const allItems = [...consumables, ...machines];
  const filtered = allItems.filter((entry) => activeCategory === "all" || entry.category === activeCategory);
  const itemMarkup = filtered.length
    ? filtered.map((entry) => entry.markup).join("")
    : '<div class="hud-bag-empty">无物品</div>';
  const selectedDescription = selectedBagItem
    ? '<p class="hud-bag-selected-description" aria-live="polite"><strong>' + esc(itemTitle(selectedBagItem)) + '：</strong>' + esc(itemDescription(selectedBagItem)) + '</p>'
    : '<p class="hud-bag-selected-description" aria-live="polite">悬停、聚焦或点选道具查看效果说明。</p>';
  const tabs = CATEGORY_TABS.map(([id, label]) =>
    '<button type="button" role="tab" class="hud-bag-tab' + (activeCategory === id ? " is-active" : "") +
    '" data-bag-category="' + id + '" aria-selected="' + (activeCategory === id) + '">' +
    label + "</button>",
  ).join("");

  return '<div class="hud-bag-scrim" aria-hidden="true"></div>' +
    '<section class="hud-bag-dialog" role="dialog" aria-label="背包" aria-modal="true">' +
    '<header class="hud-bag-heading"><h2>背包</h2>' +
    '<button type="button" id="bag-close" class="hud-bag-close" aria-label="关闭背包">×</button></header>' +
    '<div class="hud-bag-quick-heading"><span>快捷物品</span>' +
    '<button type="button" class="hud-bag-clear" data-bag-clear' +
    (selected ? "" : " disabled") + '>清空所选快捷格</button></div>' +
    '<div class="hud-bag-quick-grid" aria-label="快捷格">' + quickMarkup + "</div>" +
    '<div class="hud-bag-tabs" role="tablist" aria-label="物品分类">' + tabs + "</div>" +
    '<div class="hud-bag-item-grid" aria-label="背包物品">' + itemMarkup + "</div>" + selectedDescription + "</section>";
}

export function hudDamageEstimate(s: World, actor: string, targetId?: string, skill?: Skill): string {
  return damageEstimateText(s, actor, targetId, skill).replace(/（对普通目标）$/, "");
}

function formatAccuracy(chance: number): string {
  return String(Number(chance.toFixed(1))) + "%";
}

export function hudMoveAccuracy(s: World, sourceId: string, skill: Skill, targetId?: string): string {
  const source = s.units[sourceId];
  const spec = moveOf(skill);
  if (!source || !spec) return "—";
  const rollsHit = spec.target === "enemy" || spec.target === "all";
  if (!rollsHit) return "不检定";
  if (targetId && s.units[targetId]) {
    return formatAccuracy(hitChance(s, sourceId, targetId, skill));
  }
  const base = moveEffects(skill)?.acc;
  if (base === null || base === undefined) return "基础 100%";
  const chance = Math.min(100, base * accuracyMultiplier(stageOf(source, "acc")));
  return "基础 " + formatAccuracy(chance);
}

export function hudMoveTip(s: World, skill: Skill): string {
  const spec = moveOf(skill);
  const leader = s.units[s.leader];
  const current = leader?.pp[skill] ?? 0;
  const maximum = leader?.maxPp[skill] ?? current;
  const type = moveType(skill);
  const category = moveCategoryLabel(skill);
  const power = spec?.power === null || spec?.power === undefined ? "—" : String(spec.power);
  const range = compactRange(spec?.range);
  const target = rangeCategory(spec?.range);
  const fullRange = spec ? moveRangeLabel(skill) : "未知射程";
  const cells = scopeGrid(spec?.range);
  const typeId = type ? esc(type) : "";
  const accuracy = hudMoveAccuracy(s, s.leader, skill);
  const description = MOVE_DESCRIPTIONS[skill]?.desc ?? "";
  return '<section class="hud-move-tip" aria-label="' + esc(moveZh(skill)) + "招式信息" +
    '" data-move-type="' + typeId + '">' +
    '<div class="hud-move-tip-main">' + cells +
    '<div class="hud-move-tip-info"><header class="hud-move-tip-heading">' +
    '<strong>' + esc(moveZh(skill)) + '</strong><span class="hud-tip-type" data-move-type="' +
    typeId + '">' + esc(type ? typeZh(type) : "—") + '</span>' +
    '<span class="hud-tip-category">' + esc(category) + "</span></header>" +
    '<div class="hud-tip-fields">' +
    '<div class="hud-tip-field"><span>威力</span><strong>' + power + "</strong></div>" +
    '<div class="hud-tip-field"><span>命中</span><strong data-move-accuracy="' +
    esc(skill) + '">' + esc(accuracy) + "</strong></div>" +
    '<div class="hud-tip-field"><span>PP</span><strong>' + current + "/" + maximum + "</strong></div>" +
    '<div class="hud-tip-field" data-move-range="' + esc(spec?.range ?? "") + '"><span>射程</span><strong aria-label="' + esc(fullRange) + '">' + esc(range) + "</strong></div>" +
    '<div class="hud-tip-field"><span>范围</span><strong>' + esc(target) + "</strong></div></div>" +
    '<div class="hud-tip-preview"><span>预计伤害</span><strong data-move-preview="' +
    esc(skill) + '">' + esc(hudDamageEstimate(s, s.leader, undefined, skill)) + '</strong></div>' +
    '<p class="hud-tip-description" data-move-description>' + esc(description) + '</p></div></div></section>';
}

/** The title picker shows the same move data as the dungeon card before there is a live team. */
export function starterMoveFields(skill: Skill) {
  const spec = moveOf(skill);
  const type = moveType(skill);
  const checksAccuracy = spec?.target === "enemy" || spec?.target === "all";
  const baseAccuracy = moveEffects(skill)?.acc ?? 100;
  return {
    type,
    category: moveCategoryLabel(skill),
    power: spec?.power ?? "—",
    accuracy: checksAccuracy ? formatAccuracy(baseAccuracy) : "不检定",
    range: compactRange(spec?.range),
    target: rangeCategory(spec?.range),
    scope: scopeGrid(spec?.range),
    description: MOVE_DESCRIPTIONS[skill]?.desc ?? "",
  };
}

export {statusMarkup as hudStatusMarkup};
