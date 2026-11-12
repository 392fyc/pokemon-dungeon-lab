/** The small map and the big map (key M). Kept free of stylesheet imports so a plain Node test can render it.
 *  Everything drawn here comes from what the player already knows: terrain from `terrainKnown`, points and units from `s.seen`.
 *  The "exit" marks are computed from the known set only, so they say nothing about unrevealed ground. */
import type { Unit, World } from "../core/engine.ts";
import { THEME_FLOORS, themeOfLevel } from "../core/dungeon.ts";
import { terrainKnown } from "./point-visuals.ts";

const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

type Cell = { x: number; y: number };
/** What the board draws for one unit, as `playbackMinimapWorld` expects it. `view` is the unit's board drawing (sprite plus its cell-centred shadow `gfx`), if any. */
export function boardCell(
  view: { sprite: { visible: boolean; alpha: number }; gfx: { x: number; y: number } } | undefined,
  placeholder: boolean,
  g: { ox: number; oy: number; cell: number; minX: number; minY: number },
): Cell | null | undefined {
  if (!view) return placeholder ? undefined : null;   // no drawing: off the map unless the board shows a loading placeholder
  if (!view.sprite.visible || view.sprite.alpha === 0) return null;   // hidden, or a knocked-out unit that has faded out
  return { x: Math.round((view.gfx.x - g.ox) / g.cell + g.minX - 0.5), y: Math.round((view.gfx.y - g.oy) / g.cell + g.minY - 0.5) };   // gfx sits on the cell centre; the sprite carries the foot offset
}
/** The world the small map shows while a round plays: only what the board draws. `place(id)` says where the board currently draws a unit:
 *  a cell; `undefined` when it stands as a loading placeholder at its pre-round cell; `null` when the board does not draw it at all
 *  (a hidden sprite, a unit in unrevealed ground when the round began, or one that appears this round such as a challenge's enemies). */
export function playbackMinimapWorld(before: World, after: World, revealed: boolean, place: (id: string) => Cell | null | undefined): World {
  const base = revealed ? after : before;
  const units = Object.fromEntries(Object.entries(after.units).map(([id, u]) => {
    const at = place(id);
    if (at === undefined) { const old = before.units[id]; return [id, old ?? { ...u, pos: null, hp: 0 }]; }
    if (at === null) return [id, { ...u, pos: null, hp: 0 }];
    return [id, { ...u, hp: Math.max(1, u.hp), pos: at }];
  }));
  return { ...base, units, queue: after.queue, enemies: after.enemies, leader: before.leader };   // the board keeps the leader ring on the old leader until the round ends
}
type Bounds = { minX: number; minY: number; width: number; height: number };
type Terrain = { markup: string; viewBox: string; width: number; height: number; rooms: number | null };

const cellKey = (x: number, y: number): string => x + "," + y;

function boundsOf(s: World): Bounds {
  const floorXs = s.floor.map((pos) => pos.x);
  const floorYs = s.floor.map((pos) => pos.y);
  const minX = s.dungeon ? 0 : Math.min(0, ...floorXs) - 1;
  const minY = s.dungeon ? 0 : Math.min(0, ...floorYs) - 1;
  const maxX = s.dungeon ? s.dungeon.width : Math.max(0, ...floorXs) + 2;
  const maxY = s.dungeon ? s.dungeon.height : Math.max(0, ...floorYs) + 2;
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** Rooms the party has been into: every floor cell of the room is in the remembered set (a room is revealed whole when someone stands in it;
 *  a glance from a doorway never reveals all of it, and a Luminous Orb adds terrain only, not `seen`). The total is deliberately not shown (G4.4). */
export function enteredRooms(s: World): number | null {
  if (!s.rooms || !s.rooms.length) return null;
  const seen = new Set(s.seen);
  const left = s.rooms.map((room) => ({ room, cells: 0, seen: 0 }));
  for (const pos of s.floor) {
    for (const entry of left) {
      const { room } = entry;
      if (pos.x >= room.x && pos.x < room.x + room.w && pos.y >= room.y && pos.y < room.y + room.h) {
        entry.cells += 1;
        if (seen.has(cellKey(pos.x, pos.y))) entry.seen += 1;
        break;
      }
    }
  }
  return left.filter((entry) => entry.cells > 0 && entry.seen === entry.cells).length;
}

/** Known ground that touches a cell the player knows nothing about: the way on that has not been looked at yet.
 *  It is a function of the known set alone (never of the real map), so it cannot show what lies behind the fog. */
export function frontierCells(floorCells: Cell[], knownFloor: Set<string>, knownWalls: Set<string>, bounds: Bounds): Cell[] {
  const unknown = (x: number, y: number): boolean => {
    if (x < bounds.minX || y < bounds.minY || x >= bounds.minX + bounds.width || y >= bounds.minY + bounds.height) return false;
    const k = cellKey(x, y);
    return !knownFloor.has(k) && !knownWalls.has(k);
  };
  return floorCells.filter((pos) => unknown(pos.x + 1, pos.y) || unknown(pos.x - 1, pos.y) || unknown(pos.x, pos.y + 1) || unknown(pos.x, pos.y - 1));
}

/** Terrain layer: changes only when something is revealed. */
export function minimapTerrain(s: World): Terrain {
  const known = terrainKnown(s);
  const knownFloor = new Set(known.seen);
  const wallCells = known.seenWalls.map((value) => {
    const [x, y] = value.split(",").map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }).filter((pos): pos is Cell => !!pos);
  const knownWalls = new Set(wallCells.map((pos) => cellKey(pos.x, pos.y)));
  const floorCells = s.floor.filter((pos) => knownFloor.has(cellKey(pos.x, pos.y)));
  const bounds = boundsOf(s);
  const wallMarkup = wallCells.map((pos) =>
    '<rect class="hud-map-wall" x="' + pos.x + '" y="' + pos.y + '" width="1" height="1"></rect>',
  ).join("");
  const floorMarkup = floorCells.map((pos) =>
    '<rect class="hud-map-floor" x="' + pos.x + '" y="' + pos.y + '" width="1" height="1"></rect>',
  ).join("");
  const exitMarkup = frontierCells(floorCells, knownFloor, knownWalls, bounds).map((pos) =>
    '<circle class="hud-map-exit" cx="' + (pos.x + 0.5) + '" cy="' + (pos.y + 0.5) + '" r="0.3"></circle>',
  ).join("");
  return {
    markup: wallMarkup + floorMarkup + exitMarkup,
    viewBox: bounds.minX + " " + bounds.minY + " " + bounds.width + " " + bounds.height,
    width: bounds.width,
    height: bounds.height,
    rooms: enteredRooms(s),
  };
}

const stairsIcon = (kind: "down" | "up", pos: Cell): string =>
  '<g class="hud-map-stairs is-' + kind + '" transform="translate(' + (pos.x + 0.5) + " " + (pos.y + 0.5) + ')">' +
  '<rect class="hud-map-stairs-plate" x="-1.25" y="-1.25" width="2.5" height="2.5" rx="0.45"></rect>' +
  '<path class="hud-map-stairs-arrow" d="' + (kind === "down" ? "M-0.62 -0.4 L0.62 -0.4 L0 0.66 Z" : "M-0.62 0.4 L0.62 0.4 L0 -0.66 Z") + '"></path></g>';

/** Points and units layer: changes when something moves, is picked up or becomes known. */
export function minimapDynamic(s: World): string {
  const seen = new Set(s.seen);
  const pointMarkup = s.points.filter((point) => !point.used && seen.has(cellKey(point.pos.x, point.pos.y))).map((point) => {
    if (point.kind === "down" || point.kind === "up") return stairsIcon(point.kind, point.pos);
    if (point.kind === "exit") {
      return '<circle class="hud-map-point is-exit" cx="' + (point.pos.x + 0.5) + '" cy="' + (point.pos.y + 0.5) + '" r="0.8"></circle>';
    }
    return '<rect class="hud-map-point is-' + esc(point.kind) + '" x="' + (point.pos.x + 0.1) +
      '" y="' + (point.pos.y + 0.1) + '" width="0.8" height="0.8" rx="0.25"></rect>';
  }).join("");
  const here = (unit: Unit | undefined): unit is Unit & { pos: NonNullable<Unit["pos"]> } =>
    !!unit && !!unit.pos && unit.hp > 0 && seen.has(cellKey(unit.pos.x, unit.pos.y));
  const enemyMarkup = s.enemies.map((id) => s.units[id]).filter(here).map((unit) =>
    '<circle class="hud-map-unit is-enemy" cx="' + (unit.pos.x + 0.5) + '" cy="' + (unit.pos.y + 0.5) + '" r="0.34"></circle>',
  ).join("");
  const friendMarkup = s.queue.map((id) => s.units[id]).filter(here).map((unit) =>
    '<circle class="hud-map-unit' + (unit.id === s.leader ? " is-leader" : "") +
    '" cx="' + (unit.pos.x + 0.5) + '" cy="' + (unit.pos.y + 0.5) + '" r="' + (unit.id === s.leader ? "0.52" : "0.36") + '"></circle>',
  ).join("");
  return pointMarkup + enemyMarkup + friendMarkup;
}

/** Heading: floor name, round and the number of rooms entered (an icon and a number). */
export function minimapHeading(s: World, rooms: number | null): string {
  const theme = s.dungeon ? themeOfLevel(s.dungeon.boss, s.dungeon.level) : null;
  const mazeName = theme ? THEME_FLOORS.find((floor) => floor.theme === theme)?.name ?? "迷宫" : "固定地图";
  const floorLabel = s.dungeon ? mazeName + " " + s.dungeon.level + "F" : mazeName;
  const roomsMarkup = rooms === null ? "" :
    '<span class="hud-minimap-rooms" title="已进入的房间数" aria-label="已进入 ' + rooms + ' 个房间"><i class="hud-room-icon" aria-hidden="true"></i><b>' + rooms + "</b></span>";
  return "<span>" + esc(floorLabel) + "</span>" + roomsMarkup + "<span>第 " + s.round + " 回合</span>";
}

function svgOf(terrain: Terrain, dynamic: string, cls: string): string {
  return '<svg class="' + cls + '" viewBox="' + terrain.viewBox + '" role="img" aria-label="已探索区域">' +
    '<g class="mm-terrain">' + terrain.markup + '</g><g class="mm-dynamic">' + dynamic + "</g></svg>";
}

export function hudMinimap(s: World): string {
  const terrain = minimapTerrain(s);
  return '<section class="hud-minimap-panel" aria-label="小地图">' +
    '<div class="hud-minimap-heading">' + minimapHeading(s, terrain.rooms) + "</div>" +
    svgOf(terrain, minimapDynamic(s), "hud-minimap-map") + "</section>";
}

/** Cheap signatures: the terrain layer changes when the remembered set grows; the dynamic layer when a unit or point changes. */
function terrainSignature(s: World): string {
  const walls = s.seenWalls ?? [];
  return [s.runId, s.dungeon?.level ?? 0, s.seen.length, s.seen[s.seen.length - 1] ?? "", walls.length, walls[walls.length - 1] ?? "", s.mapRevealed ? 1 : 0, s.floor.length].join("|");
}
function dynamicSignature(s: World): string {
  let text = s.leader + "|" + s.points.length;
  for (const point of s.points) if (!point.used) text += "|" + point.pos.x + "," + point.pos.y;
  for (const id of s.queue) { const u = s.units[id]; text += "|" + id + (u && u.pos && u.hp > 0 ? u.pos.x + "," + u.pos.y : "x"); }
  for (const id of s.enemies) { const u = s.units[id]; text += "|" + (u && u.pos && u.hp > 0 ? u.pos.x + "," + u.pos.y : "x"); }
  return text;
}

/** How often the map is really redrawn and what a redraw costs. A turn where nothing was revealed and nothing moved costs no redraw. */
export const minimapStats = { calls: 0, terrainDraws: 0, dynamicDraws: 0, lastMs: 0, totalMs: 0, maxMs: 0 };

type Cached = { terrainSig: string; dynamicSig: string; terrain: Terrain; dynamic: string; heading: string };
let cached: Cached | null = null;

/** Draws (or keeps) the small map in `host`: the panel is created once, then only the layer that changed is replaced. */
export function updateMinimap(host: HTMLElement, s: World): void {
  const started = performance.now();
  minimapStats.calls += 1;
  const terrainSig = terrainSignature(s);
  const dynamicSig = dynamicSignature(s);
  const terrainChanged = !cached || cached.terrainSig !== terrainSig;
  const dynamicChanged = terrainChanged || !cached || cached.dynamicSig !== dynamicSig;
  const terrain = terrainChanged ? minimapTerrain(s) : cached!.terrain;
  const dynamic = dynamicChanged ? minimapDynamic(s) : cached!.dynamic;
  const heading = minimapHeading(s, terrain.rooms);
  cached = { terrainSig, dynamicSig, terrain, dynamic, heading };
  let panel = host.querySelector<HTMLElement>(".hud-minimap-panel");
  if (!panel || terrainChanged && panel.dataset.viewBox !== terrain.viewBox) {
    host.innerHTML = '<section class="hud-minimap-panel" aria-label="小地图"><div class="hud-minimap-heading"></div>' + svgOf(terrain, dynamic, "hud-minimap-map") + "</section>";
    panel = host.querySelector<HTMLElement>(".hud-minimap-panel")!;
    panel.dataset.viewBox = terrain.viewBox;
    panel.dataset.terrainSig = terrainSig;
    panel.dataset.dynamicSig = dynamicSig;
    minimapStats.terrainDraws += 1;
    minimapStats.dynamicDraws += 1;
  } else {
    const svg = panel.querySelector<SVGElement>(".hud-minimap-map")!;
    if (terrainChanged) { svg.querySelector(".mm-terrain")!.innerHTML = terrain.markup; panel.dataset.terrainSig = terrainSig; minimapStats.terrainDraws += 1; }
    if (dynamicChanged) { svg.querySelector(".mm-dynamic")!.innerHTML = dynamic; panel.dataset.dynamicSig = dynamicSig; minimapStats.dynamicDraws += 1; }
  }
  const headingEl = panel.querySelector<HTMLElement>(".hud-minimap-heading")!;
  if (headingEl.dataset.html !== heading) { headingEl.innerHTML = heading; headingEl.dataset.html = heading; }
  if (terrainChanged || dynamicChanged) {
    const ms = performance.now() - started;
    minimapStats.lastMs = ms; minimapStats.totalMs += ms; minimapStats.maxMs = Math.max(minimapStats.maxMs, ms);
  }
}

/** The big map: the same two layers at whole-floor scale. Uses the layers last drawn for the small map, so it never shows more than the small map does. */
export function bigMinimapMarkup(s: World): { heading: string; svg: string; width: number; height: number } {
  const terrain = cached?.terrain ?? minimapTerrain(s);
  const dynamic = cached?.dynamic ?? minimapDynamic(s);
  return { heading: cached?.heading ?? minimapHeading(s, terrain.rooms), svg: svgOf(terrain, dynamic, "hud-minimap-map is-big"), width: terrain.width, height: terrain.height };
}
