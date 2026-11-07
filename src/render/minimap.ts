/** The small map. Kept free of stylesheet imports so a plain Node test can render it. */
import type { Unit, World } from "../core/engine.ts";
import { THEME_FLOORS, themeOfLevel } from "../core/dungeon.ts";
import { terrainKnown } from "./point-visuals.ts";

const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

export function hudMinimap(s: World): string {
  // Terrain follows what the player knows (the whole floor after a Luminous Orb); points and units follow what has actually been seen.
  const known = terrainKnown(s);
  const knownFloor = new Set(known.seen);
  const seen = new Set(s.seen);
  const floorCells = s.floor.filter((pos) => knownFloor.has(pos.x + "," + pos.y));
  const wallCells = known.seenWalls.map((value) => {
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

