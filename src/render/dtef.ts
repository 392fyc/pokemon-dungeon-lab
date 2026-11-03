import atlasConfig from '../data/terrain-atlas.json' with {type: 'json'};
import {hash32, prepareTerrainMap, type PreparedTerrainMap, type TerrainMapInput, type TerrainThemeKey} from './terrain.ts';

/**
 * DTEF atlas rendering (#178, D-20261103-12). A DTEF sheet is 432 x 192: three segments side by side (wall, second terrain,
 * floor), each a 6 x 8 grid of 24 px tiles holding the 47 base shapes (the slot at column 5, row 2 is empty).
 * Every cell picks its tile from ITS OWN class and the same-class neighbours only, like the original game.
 */
export const DTEF_TILE = 24;
export const DTEF_SEGMENT_WIDTH = 6 * DTEF_TILE;
export const DTEF_SHEET = {width: 3 * DTEF_SEGMENT_WIDTH, height: 8 * DTEF_TILE} as const;
/** Terrain class of a cell, which is also the segment of the sheet it is drawn from. */
export const WALL = 0, LIQUID = 1, FLOOR = 2;
export type TerrainClass = 0 | 1 | 2;

/** DMA neighbour bit values of SkyTemple (south = 1 ... south-west = 128). Our own masks use north = 1 (terrain.ts). */
const DMA = {S: 1, SE: 2, E: 4, NE: 8, N: 16, NW: 32, W: 64, SW: 128} as const;
const OURS_TO_DMA = [
  [1, DMA.N], [2, DMA.NE], [4, DMA.E], [8, DMA.SE], [16, DMA.S], [32, DMA.SW], [64, DMA.W], [128, DMA.NW],
] as const;
/**
 * The 47 base rules in DTEF slot order (6 columns x 8 rows, row-major); null is the empty slot at column 5, row 2.
 * Values are DMA masks. Source: SkyTemple skytemple_dtef rules.py REMAP_RULES (the order of the original dungeon tilesets).
 */
export const DTEF_REMAP_RULES: readonly (number | null)[] = [
  7, 199, 193, 5, 68, 65,
  31, 255, 241, 17, 0, 80,
  28, 124, 112, 20, 1, null,
  245, 95, 69, 4, 85, 64,
  215, 125, 84, 21, 16, 81,
  253, 127, 29, 113, 197, 71,
  247, 223, 23, 209, 116, 92,
  87, 213, 93, 117, 221, 119,
];

/** Our neighbour mask (north = 1, north-east = 2, east = 4 ...) converted to the DMA bit order. */
export function toDmaMask(mask: number): number {
  let out = 0;
  for (const [ours, dma] of OURS_TO_DMA) if (mask & ours) out |= dma;
  return out;
}
/** A diagonal neighbour only counts when both straight neighbours beside it are also the same class (DMA bits). */
function reduceDma(mask: number): number {
  let m = mask & 0xff;
  for (const [corner, a, b] of [[DMA.NW, DMA.N, DMA.W], [DMA.NE, DMA.N, DMA.E], [DMA.SW, DMA.S, DMA.W], [DMA.SE, DMA.S, DMA.E]] as const)
    if ((m & (a | b)) !== (a | b)) m &= ~corner;
  return m;
}
const SLOT_OF_DMA = new Map<number, number>();
DTEF_REMAP_RULES.forEach((rule, slot) => { if (rule !== null) SLOT_OF_DMA.set(rule, slot); });
/** All 256 raw masks (our bit order) to a slot of the sheet. Built once; the unit test proves every entry is valid. */
export const DTEF_SLOT_OF_MASK: readonly number[] = Array.from({length: 256}, (_, mask) => SLOT_OF_DMA.get(reduceDma(toDmaMask(mask))) ?? -1);
export function dtefSlot(mask: number): number {
  const slot = DTEF_SLOT_OF_MASK[(Math.trunc(mask) || 0) & 0xff]!;
  if (slot < 0) throw new RangeError('terrain mask has no DTEF slot');
  return slot;
}
/** Tile id inside a sheet: segment * 48 + slot. */
export const tileId = (segment: TerrainClass, slot: number): number => segment * 48 + slot;
export const tileRect = (id: number): {x: number; y: number} => ({
  x: Math.floor(id / 48) * DTEF_SEGMENT_WIDTH + (id % 6) * DTEF_TILE,
  y: Math.floor((id % 48) / 6) * DTEF_TILE,
});

const NEIGHBOURS = [
  [0, -1, 1], [1, -1, 2], [1, 0, 4], [1, 1, 8], [0, 1, 16], [-1, 1, 32], [-1, 0, 64], [-1, -1, 128],
] as const;
export function classAt(map: PreparedTerrainMap, x: number, y: number): TerrainClass {
  const key = String(x) + ',' + String(y);
  return map.floor.has(key) ? FLOOR : map.liquid.has(key) ? LIQUID : WALL;
}
/**
 * Same-class neighbour mask (our bit order) of a cell whose class is `kind`. Outside the map counts as the same class only
 * for walls (the outer ring is wall). A neighbour that is not revealed yet counts as the same class for every layer, so
 * revealing never draws a false shoreline or shadow; revealing a cell recomputes it and its 8 neighbours.
 */
export function dtefMaskAt(map: PreparedTerrainMap, x: number, y: number, kind: TerrainClass): number {
  let mask = 0;
  for (const [dx, dy, bit] of NEIGHBOURS) {
    const nx = x + dx, ny = y + dy;
    let same: boolean;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) same = kind === WALL;
    else if (!map.known.has(String(nx) + ',' + String(ny))) same = true;
    else same = classAt(map, nx, ny) === kind;
    if (same) mask |= bit;
  }
  return mask;
}

export type DtefAnimation = {variant: number; layer: number; ticks: number; frames: readonly string[]; tiles: readonly number[]};
export type DtefTheme = {set: string; variants: readonly {file: string; empty: readonly number[]}[]; animations: readonly DtefAnimation[]};
export type DtefConfig = {defaultSource: 'dtef' | 'painter'; variantZeroShare: number; themes: Record<TerrainThemeKey, DtefTheme>};
export const DTEF_CONFIG = atlasConfig as unknown as DtefConfig;

const emptySets = new WeakMap<DtefTheme, Set<number>[]>();
const emptyOf = (theme: DtefTheme, variant: number): Set<number> => {
  let sets = emptySets.get(theme);
  if (!sets) { sets = theme.variants.map((v) => new Set(v.empty)); emptySets.set(theme, sets); }
  return sets[variant]!;
};
export type DtefChoice = {variant: number; id: number; overlays: readonly DtefAnimation[]};
/**
 * Which variant sheet a cell draws from. Variant 0 takes `variantZeroShare` of the cells (95%, chosen from screenshots); the other variants share the rest equally. A tile that is empty in the chosen variant reuses
 * the previous variant. A tile animated in variant 0 stays on variant 0 unless the variant has its own animation, so the
 * second terrain does not mix still and moving cells.
 */
export function chooseDtefTile(theme: DtefTheme, kind: TerrainClass, slot: number, x: number, y: number, seed: number, level: number, zeroShare = DTEF_CONFIG.variantZeroShare): DtefChoice {
  const id = tileId(kind, slot), count = theme.variants.length;
  const h = hash32(x, y, (kind + 1) as 1 | 2 | 3, seed, level);
  let variant = 0;
  if (count > 1 && (h % 1000) / 1000 >= zeroShare) variant = 1 + ((h >>> 10) % (count - 1));
  while (variant > 0 && emptyOf(theme, variant).has(id)) variant--;
  let overlays = theme.animations.filter((a) => a.variant === variant && a.tiles.includes(id));
  if (!overlays.length && variant > 0) {
    const zero = theme.animations.filter((a) => a.variant === 0 && a.tiles.includes(id));
    if (zero.length) { variant = 0; overlays = zero; }
  }
  return {variant, id, overlays};
}
/** Index of the frame an animation shows at `ms` milliseconds. */
export const animationFrame = (a: Pick<DtefAnimation, 'ticks' | 'frames'>, ms: number): number =>
  Math.floor(Math.max(0, ms) / (a.ticks * 1000 / 60)) % a.frames.length;

export const dtefTextureKey = (theme: DtefTheme, file: string): string => `dtef-${theme.set}-${file.replace(/\.png$/, '')}`;
export const dtefFiles = (theme: DtefTheme): string[] => [...theme.variants.map((v) => v.file), ...theme.animations.flatMap((a) => a.frames)];

export type DtefCell = {x: number; y: number; kind: TerrainClass; slot: number} & DtefChoice;
/** The tiles to draw for every revealed cell of a map (pure; the Phaser layer only places images). */
export function planDtefTerrain(input: TerrainMapInput, themeKey: TerrainThemeKey, seed: number, level: number): DtefCell[] {
  const map = prepareTerrainMap(input), theme = DTEF_CONFIG.themes[themeKey], out: DtefCell[] = [];
  for (const key of map.known) {
    const comma = key.indexOf(','), x = Number(key.slice(0, comma)), y = Number(key.slice(comma + 1));
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const kind = classAt(map, x, y), slot = dtefSlot(dtefMaskAt(map, x, y, kind));
    out.push({x, y, kind, slot, ...chooseDtefTile(theme, kind, slot, x, y, seed, level)});
  }
  return out;
}

/** Terrain source: the original DTEF sheets by default; the 8.5b painter stays for the public-release route. Override with ?terrain=painter or window.__terrainSource. */
export function terrainSource(): 'dtef' | 'painter' {
  try {
    const w = globalThis as {__terrainSource?: string; location?: {search?: string}};
    const asked = w.__terrainSource ?? new URLSearchParams(w.location?.search ?? '').get('terrain');
    if (asked === 'painter' || asked === 'dtef') return asked;
  } catch { /* fall through to the configured default */ }
  return DTEF_CONFIG.defaultSource;
}
