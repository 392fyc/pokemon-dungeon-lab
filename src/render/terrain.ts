import rawThemes from '../data/terrain-themes.json' with { type: 'json' };

export type TerrainThemeKey = 'moss' | 'wet' | 'ash';
export type TerrainLayer = 'edge' | 'liquid' | 'wall';
export type HashLayer = TerrainLayer | 'deco' | 1 | 2 | 3 | 4;
export type TerrainCell = { x: number; y: number };
export type RGB = readonly [number, number, number];
export type Range = readonly [number, number];
export type TerrainLiquidGeneration = {
  rivers: Range;
  lakes: Range;
  lakeSize: Range;
  riverWidth: Range;
  drift: readonly (readonly [number, number])[];
};

export type TerrainTheme = {
  floor: readonly RGB[];
  floorNoise: {
    octaves: readonly (readonly [number, number])[];
    cuts: readonly number[];
    flatten: number;
    levels?: readonly number[];
  };
  wall: readonly RGB[];
  edgeGrowth: readonly RGB[];
  liquid: readonly RGB[];
  facadeHeight?: number;
  edgeGrowthWidth?: Range;
  edgeShadowWidth?: Range;
  cornerGrowth?: Range;
  variants?: number;
  variantWeights?: readonly number[];
  decoDensity?: { floor: number; wallTop: number };
  liquidGen?: TerrainLiquidGeneration;
};

export type TerrainThemeInput = TerrainThemeKey | TerrainTheme;
export type TerrainThemes = Readonly<Record<TerrainThemeKey, TerrainTheme>>;

export const TERRAIN_THEMES = rawThemes as unknown as TerrainThemes;

export type TerrainMap = {
  width: number;
  height: number;
  floor: readonly TerrainCell[];
  liquid?: readonly (TerrainCell | string)[];
  seen: readonly string[];
  seenWalls?: readonly string[];
};

export type PreparedTerrainMap = {
  readonly preparedTerrainMap: true;
  readonly source: TerrainMap;
  readonly width: number;
  readonly height: number;
  readonly floor: ReadonlySet<string>;
  readonly liquid: ReadonlySet<string>;
  readonly seen: ReadonlySet<string>;
  readonly seenWalls: ReadonlySet<string>;
  readonly known: ReadonlySet<string>;
};

export type TerrainMapInput = TerrainMap | PreparedTerrainMap;
export type PixelTexture = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type DecorationKind = 'floor' | 'wallTop';
export type DecorationCandidate = {
  x: number;
  y: number;
  kind: DecorationKind;
  hash: number;
};
export type DecorationAtlas = { frames: readonly string[] } | null | undefined;
export type DecorationInput = {
  map: TerrainMapInput;
  theme: TerrainThemeInput;
  seed: number;
  level: number;
  excluded?: readonly (TerrainCell | string)[];
  atlas?: DecorationAtlas;
};
export type Decoration = {
  x: number;
  y: number;
  kind: DecorationKind;
  frame: string;
};

const TILE_SIZE = 24;
const FLOOR_SIZE = TILE_SIZE * 16;
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 6;
const FALLBACK_VARIANTS = 4;
const NEIGHBORS = [
  { dx: 0, dy: -1, bit: 1 },
  { dx: 1, dy: -1, bit: 2 },
  { dx: 1, dy: 0, bit: 4 },
  { dx: 1, dy: 1, bit: 8 },
  { dx: 0, dy: 1, bit: 16 },
  { dx: -1, dy: 1, bit: 32 },
  { dx: -1, dy: 0, bit: 64 },
  { dx: -1, dy: -1, bit: 128 },
] as const;
const LAYER_NUMBER: Record<Exclude<HashLayer, number>, number> = {
  edge: 1,
  liquid: 2,
  wall: 3,
  deco: 4,
};
const SHAPE_VALUES = [
  0, 1, 4, 5, 7, 16, 17, 20, 21, 23, 28, 29, 31,
  64, 65, 68, 69, 71, 80, 81, 84, 85, 87, 92, 93, 95,
  112, 113, 116, 117, 119, 124, 125, 127,
  193, 197, 199, 209, 213, 215, 221, 223, 241, 245, 247, 253, 255,
] as const;

export const SHAPES: readonly number[] = SHAPE_VALUES;
const SHAPE_FRAME = new Map<number, number>(SHAPES.map((mask, frame) => [mask, frame]));

export function reduceMask(mask: number): number {
  let reduced = (Math.trunc(mask) || 0) & 0xff;
  const corners = [
    { bit: 2, sides: 1 | 4 },
    { bit: 8, sides: 4 | 16 },
    { bit: 32, sides: 16 | 64 },
    { bit: 128, sides: 64 | 1 },
  ];
  for (const corner of corners) {
    if ((reduced & corner.sides) !== corner.sides) reduced &= ~corner.bit;
  }
  return reduced;
}

export function frameOf(mask: number): number {
  const frame = SHAPE_FRAME.get(reduceMask(mask));
  if (frame === undefined) throw new RangeError('terrain mask is outside the 8-bit shape table');
  return frame;
}

export function hash32(
  x: number,
  y: number,
  layer: HashLayer,
  seed: number,
  level: number,
  salt = 0,
): number {
  const layerNumber = typeof layer === 'number' ? layer : LAYER_NUMBER[layer];
  let value = (
    Math.imul(x | 0, 0x9e3779b1)
    ^ Math.imul(y | 0, 0x85ebca6b)
    ^ Math.imul(layerNumber | 0, 0xc2b2ae35)
    ^ Math.imul(seed | 0, 0x27d4eb2d)
    ^ Math.imul(level | 0, 0x165667b1)
    ^ (salt | 0)
  ) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

export function terrainVariant(
  x: number,
  y: number,
  layer: TerrainLayer,
  seed: number,
  level: number,
  themeInput: TerrainThemeInput = 'moss',
): number {
  const theme = typeof themeInput === 'string' ? TERRAIN_THEMES[themeInput] : themeInput;
  const variantCount = Math.max(1, Math.trunc(theme.variants ?? FALLBACK_VARIANTS));
  const weightAt = (index: number): number => Math.max(0, theme.variantWeights?.[index] ?? (index === 0 ? 2 : 1));
  let total = 0;
  for (let index = 0; index < variantCount; index++) total += weightAt(index);
  if (total <= 0) return 0;
  let selection = hash32(x, y, layer, seed, level) % total;
  for (let index = 0; index < variantCount; index++) {
    const weight = weightAt(index);
    if (selection < weight) return index;
    selection -= weight;
  }
  return 0;
}

const cellKey = (x: number, y: number): string => String(x) + ',' + String(y);

function parseCellKey(value: string): TerrainCell | null {
  const comma = value.indexOf(',');
  if (comma < 0) return null;
  const x = Number(value.slice(0, comma));
  const y = Number(value.slice(comma + 1));
  return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
}

function setFromCells(cells: readonly (TerrainCell | string)[] | undefined): Set<string> {
  const result = new Set<string>();
  for (const cell of cells ?? []) {
    if (typeof cell === 'string') result.add(cell);
    else result.add(cellKey(cell.x, cell.y));
  }
  return result;
}

export function prepareTerrainMap(map: TerrainMapInput): PreparedTerrainMap {
  if ('preparedTerrainMap' in map && map.preparedTerrainMap) return map;
  const source = map as TerrainMap;
  const floor = setFromCells(source.floor);
  const liquid = setFromCells(source.liquid);
  const seen = new Set(source.seen ?? []);
  const seenWalls = new Set(source.seenWalls ?? []);
  const known = new Set<string>([...seen, ...seenWalls]);
  for (const key of seen) {
    const cell = parseCellKey(key);
    if (!cell) continue;
    for (const neighbor of NEIGHBORS) {
      const x = cell.x + neighbor.dx;
      const y = cell.y + neighbor.dy;
      if (x < 0 || y < 0 || x >= source.width || y >= source.height) continue;
      const neighborKey = cellKey(x, y);
      if (!floor.has(neighborKey)) known.add(neighborKey);
    }
  }
  return {
    preparedTerrainMap: true,
    source,
    width: source.width,
    height: source.height,
    floor,
    liquid,
    seen,
    seenWalls,
    known,
  };
}

function inside(map: PreparedTerrainMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

function isWall(map: PreparedTerrainMap, x: number, y: number): boolean {
  if (!inside(map, x, y)) return true;
  const key = cellKey(x, y);
  return !map.floor.has(key) && !map.liquid.has(key);
}

function matchesLayer(map: PreparedTerrainMap, x: number, y: number, layer: TerrainLayer, useKnown: boolean): boolean {
  if (!inside(map, x, y)) return layer !== 'edge';
  const key = cellKey(x, y);
  if (useKnown && !map.known.has(key)) return true;
  if (layer === 'edge') return !isWall(map, x, y);
  if (layer === 'liquid') return map.liquid.has(key);
  return isWall(map, x, y);
}

function maskAtPrepared(map: PreparedTerrainMap, x: number, y: number, layer: TerrainLayer, useKnown: boolean): number {
  if (!inside(map, x, y)) return 0;
  let mask = 0;
  for (const neighbor of NEIGHBORS) {
    const nx = x + neighbor.dx;
    const ny = y + neighbor.dy;
    if (matchesLayer(map, nx, ny, layer, useKnown)) mask |= neighbor.bit;
  }
  return mask;
}

export function maskAt(map: TerrainMapInput, x: number, y: number, layer: TerrainLayer): number {
  return maskAtPrepared(prepareTerrainMap(map), x, y, layer, true);
}

function fullMaskAt(map: PreparedTerrainMap, x: number, y: number, layer: TerrainLayer): number {
  return maskAtPrepared(map, x, y, layer, false);
}

type ResolvedTheme = { key: TerrainThemeKey; value: TerrainTheme };

function inferThemeKey(theme: TerrainTheme): TerrainThemeKey {
  if (theme.liquid[0]?.[0] >= 80) return 'ash';
  return theme.floorNoise.octaves[0]?.[0] === 24 ? 'wet' : 'moss';
}

function resolveTheme(theme: TerrainThemeInput): ResolvedTheme {
  const key = typeof theme === 'string' ? theme : inferThemeKey(theme);
  const value = typeof theme === 'string' ? TERRAIN_THEMES[theme] : theme;
  if (!value) throw new RangeError('unknown terrain theme');
  const fallback = TERRAIN_THEMES.moss;
  return {
    key,
    value: {
      ...fallback,
      ...value,
      floorNoise: { ...fallback.floorNoise, ...value.floorNoise },
      decoDensity: {
        floor: value.decoDensity?.floor ?? fallback.decoDensity?.floor ?? 0.06,
        wallTop: value.decoDensity?.wallTop ?? fallback.decoDensity?.wallTop ?? 0.04,
      },
    },
  };
}

function paletteSeed(theme: ResolvedTheme): number {
  let seed = theme.key === 'moss' ? 0x13579bdf : theme.key === 'wet' ? 0x2468ace0 : 0x1f123bb5;
  for (const rgb of theme.value.floor) {
    seed = Math.imul(seed ^ rgb[0], 0x45d9f3b) ^ Math.imul(rgb[1], 0x119de1f3) ^ rgb[2];
  }
  return seed | 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function colorScale(color: RGB, factor: number): [number, number, number] {
  return [
    clamp(Math.round(color[0] * factor), 0, 255),
    clamp(Math.round(color[1] * factor), 0, 255),
    clamp(Math.round(color[2] * factor), 0, 255),
  ];
}

function mixColor(from: RGB, to: RGB, amount: number): [number, number, number] {
  const t = clamp(amount, 0, 1);
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

function floorColor(color: RGB, average: RGB, flatten: number): [number, number, number] {
  const keep = 1 - clamp(flatten, 0, 1);
  return [
    clamp(Math.round(average[0] + (color[0] - average[0]) * keep), 0, 255),
    clamp(Math.round(average[1] + (color[1] - average[1]) * keep), 0, 255),
    clamp(Math.round(average[2] + (color[2] - average[2]) * keep), 0, 255),
  ];
}

function setPixel(image: PixelTexture, x: number, y: number, color: RGB, alpha = 255): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const index = (y * image.width + x) * 4;
  image.data[index] = color[0];
  image.data[index + 1] = color[1];
  image.data[index + 2] = color[2];
  image.data[index + 3] = alpha;
}

function fillRect(
  image: PixelTexture,
  x: number,
  y: number,
  width: number,
  height: number,
  color: RGB,
  alpha = 255,
): void {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) setPixel(image, px, py, color, alpha);
  }
}

function blitTile(target: PixelTexture, tile: PixelTexture, x: number, y: number): void {
  for (let py = 0; py < tile.height; py++) {
    const sourceStart = py * tile.width * 4;
    const targetStart = ((y + py) * target.width + x) * 4;
    target.data.set(tile.data.subarray(sourceStart, sourceStart + tile.width * 4), targetStart);
  }
}

function drawWallTile(theme: ResolvedTheme, frame: number, variant: number): PixelTexture {
  const image: PixelTexture = { width: TILE_SIZE, height: TILE_SIZE, data: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4) };
  const mask = SHAPES[frame];
  const colors = theme.value.wall;
  const shade = [0.9, 1, 1.05, 0.96][variant % 4];
  const dark = colorScale(colors[0], shade);
  const middle = colorScale(colors[1], shade);
  const light = colorScale(colors[2], shade);
  const northSame = (mask & 1) !== 0;
  const eastSame = (mask & 4) !== 0;
  const southSame = (mask & 16) !== 0;
  const westSame = (mask & 64) !== 0;
  const facadeHeight = clamp(Math.round(theme.value.facadeHeight ?? 16), 0, TILE_SIZE);
  const facadeStart = TILE_SIZE - facadeHeight;

  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const grain = hash32(x, y, 'wall', frame * 37 + variant * 101 + paletteSeed(theme), 0) % 100;
      let color: RGB = middle;
      if (!southSame && y >= facadeStart) {
        const progress = facadeHeight <= 1 ? 1 : (y - facadeStart) / (facadeHeight - 1);
        color = mixColor(middle, dark, 0.18 + progress * 0.58);
        if (x > 2 && x < TILE_SIZE - 3 && grain < 7) color = dark;
        else if (x > 2 && x < TILE_SIZE - 3 && grain > 96) color = mixColor(color, light, 0.25);
      } else if (x > 2 && x < TILE_SIZE - 3 && y > 2 && y < TILE_SIZE - 3) {
        if (grain < 5) color = mixColor(middle, dark, 0.2);
        else if (grain > 95) color = mixColor(middle, light, 0.2);
      }
      setPixel(image, x, y, color);
    }
  }

  if (!northSame) {
    fillRect(image, 0, 0, TILE_SIZE, 1, light);
    fillRect(image, 1, 1, TILE_SIZE - 2, 1, middle);
  }
  if (!southSame && facadeHeight > 0 && facadeStart > 0) {
    const lineStart = westSame ? 0 : 1;
    const lineEnd = eastSame ? TILE_SIZE : TILE_SIZE - 1;
    fillRect(image, lineStart, facadeStart, lineEnd - lineStart, 1, light);
  }
  if (!southSame && !westSame) {
    fillRect(image, 0, facadeStart, 1, facadeHeight, dark);
    fillRect(image, 1, facadeStart + 1, 1, facadeHeight - 1, light);
  }
  if (!southSame && !eastSame) {
    fillRect(image, TILE_SIZE - 1, facadeStart, 1, facadeHeight, dark);
    fillRect(image, TILE_SIZE - 2, facadeStart + 1, 1, facadeHeight - 1, light);
  }

  const corners = [
    { diagonal: 2, horizontal: 1, vertical: 4, x: TILE_SIZE - 1, y: 0, darkX: -1, darkY: 1 },
    { diagonal: 8, horizontal: 16, vertical: 4, x: TILE_SIZE - 1, y: TILE_SIZE - 1, darkX: -1, darkY: -1 },
    { diagonal: 32, horizontal: 16, vertical: 64, x: 0, y: TILE_SIZE - 1, darkX: 1, darkY: -1 },
    { diagonal: 128, horizontal: 1, vertical: 64, x: 0, y: 0, darkX: 1, darkY: 1 },
  ];
  for (const corner of corners) {
    const diagonalSame = (mask & corner.diagonal) !== 0;
    const bothSidesSame = (mask & corner.horizontal) !== 0 && (mask & corner.vertical) !== 0;
    if (bothSidesSame && !diagonalSame) {
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          if (dx + dy < 3) setPixel(image, corner.x + corner.darkX * dx, corner.y + corner.darkY * dy, dark);
        }
      }
    } else if (diagonalSame && !bothSidesSame) {
      setPixel(image, corner.x, corner.y, light);
      setPixel(image, corner.x + corner.darkX, corner.y, middle);
      setPixel(image, corner.x, corner.y + corner.darkY, middle);
    }
  }

  const crackHash = hash32(frame, variant, 'wall', paletteSeed(theme), 23);
  const crackX = 4 + (crackHash % 16);
  const crackY = !southSame && facadeHeight >= 6
    ? facadeStart + 2 + ((crackHash >>> 8) % Math.max(1, facadeHeight - 4))
    : 4 + ((crackHash >>> 8) % 12);
  if (crackY < TILE_SIZE - 2) {
    setPixel(image, crackX, crackY, dark);
    setPixel(image, crackX + ((crackHash & 1) ? 1 : 0), crackY + 1, dark);
    setPixel(image, crackX + ((crackHash & 1) ? 2 : 0), crackY + 2, middle);
  }
  return image;
}

function drawEdgeSide(
  image: PixelTexture,
  theme: ResolvedTheme,
  frame: number,
  variant: number,
  side: 'north' | 'east' | 'south' | 'west',
): void {
  const [growthMin, growthMax] = theme.value.edgeGrowthWidth ?? [3, 5];
  const [shadowMin, shadowMax] = theme.value.edgeShadowWidth ?? [2, 6];
  const hash = hash32(frame, variant, 'edge', paletteSeed(theme), side === 'north' ? 1 : side === 'east' ? 2 : side === 'south' ? 3 : 4);
  const growthWidth = clamp(growthMin + (hash % (growthMax - growthMin + 1)), 1, TILE_SIZE);
  const shadowWidth = clamp(shadowMin + ((hash >>> 8) % (shadowMax - shadowMin + 1)), 1, TILE_SIZE);
  const growth = theme.value.edgeGrowth;
  for (let depth = 0; depth < growthWidth + shadowWidth; depth++) {
    for (let along = 0; along < TILE_SIZE; along++) {
      let x = along;
      let y = depth;
      if (side === 'east') {
        x = TILE_SIZE - 1 - depth;
        y = along;
      } else if (side === 'south') {
        x = along;
        y = TILE_SIZE - 1 - depth;
      } else if (side === 'west') {
        x = depth;
        y = along;
      }
      const fleck = hash32(x, y, 'edge', frame + paletteSeed(theme), variant + 11) % 100;
      const localWidth = clamp(growthWidth + (fleck % 3) - 1, 2, growthWidth + 1);
      if (depth < localWidth) {
        if (fleck < 82) {
          const color = fleck < 18 ? growth[0] : fleck > 94 ? growth[3] : fleck > 58 ? growth[2] : growth[1];
          setPixel(image, x, y, color, fleck < 12 ? 190 : 235);
        }
      } else {
        const shadowDepth = depth - localWidth;
        if (shadowDepth < shadowWidth && fleck < 72) {
          const alpha = Math.round(88 * (1 - shadowDepth / Math.max(1, shadowWidth)));
          setPixel(image, x, y, [0, 0, 0], alpha);
        }
      }
    }
  }
}

function drawCornerGrowth(
  image: PixelTexture,
  theme: ResolvedTheme,
  frame: number,
  variant: number,
  corner: 'ne' | 'se' | 'sw' | 'nw',
): void {
  const [min, max] = theme.value.cornerGrowth ?? [6, 9];
  const hash = hash32(frame, variant, 'edge', paletteSeed(theme), corner === 'ne' ? 21 : corner === 'se' ? 22 : corner === 'sw' ? 23 : 24);
  const size = min + (hash % (max - min + 1));
  const growth = theme.value.edgeGrowth;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (dx + dy >= size) continue;
      const x = corner.endsWith('e') ? TILE_SIZE - 1 - dx : dx;
      const y = corner.startsWith('s') ? TILE_SIZE - 1 - dy : dy;
      setPixel(image, x, y, (dx + dy) % 3 === 0 ? growth[2] : growth[1]);
    }
  }
}

function drawEdgeTile(theme: ResolvedTheme, frame: number, variant: number): PixelTexture {
  const image: PixelTexture = { width: TILE_SIZE, height: TILE_SIZE, data: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4) };
  const mask = SHAPES[frame];
  if (mask === 255) return image;
  if ((mask & 1) === 0) drawEdgeSide(image, theme, frame, variant, 'north');
  if ((mask & 4) === 0) drawEdgeSide(image, theme, frame, variant, 'east');
  if ((mask & 16) === 0) drawEdgeSide(image, theme, frame, variant, 'south');
  if ((mask & 64) === 0) drawEdgeSide(image, theme, frame, variant, 'west');
  if ((mask & 1) !== 0 && (mask & 4) !== 0 && (mask & 2) === 0) drawCornerGrowth(image, theme, frame, variant, 'ne');
  if ((mask & 4) !== 0 && (mask & 16) !== 0 && (mask & 8) === 0) drawCornerGrowth(image, theme, frame, variant, 'se');
  if ((mask & 16) !== 0 && (mask & 64) !== 0 && (mask & 32) === 0) drawCornerGrowth(image, theme, frame, variant, 'sw');
  if ((mask & 64) !== 0 && (mask & 1) !== 0 && (mask & 128) === 0) drawCornerGrowth(image, theme, frame, variant, 'nw');
  return image;
}

function tilePeriodicNoise(x: number, y: number, period: number, theme: ResolvedTheme, octave: number, variant = 0): number {
  const cells = TILE_SIZE / period;
  const gx = x / period;
  const gy = y / period;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = smooth(gx - ix);
  const fy = smooth(gy - iy);
  const x0 = ((ix % cells) + cells) % cells;
  const y0 = ((iy % cells) + cells) % cells;
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const seed = paletteSeed(theme);
  const valueAt = (sx: number, sy: number): number => hash32(sx, sy, 'liquid', seed, octave + variant * 7) / 0xffffffff;
  const top = valueAt(x0, y0) * (1 - fx) + valueAt(x1, y0) * fx;
  const bottom = valueAt(x0, y1) * (1 - fx) + valueAt(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

function liquidNoiseAt(x: number, y: number, theme: ResolvedTheme, variant: number): number {
  const coarse = tilePeriodicNoise(x, y, 8, theme, 0, variant);
  const fine = tilePeriodicNoise(x, y, 4, theme, 1, variant);
  const common = tilePeriodicNoise(x, y, 8, theme, 0) * 0.65
    + tilePeriodicNoise(x, y, 4, theme, 1) * 0.35;
  const varied = coarse * 0.65 + fine * 0.35;
  const edgeDistance = Math.min(x, y, TILE_SIZE - 1 - x, TILE_SIZE - 1 - y);
  const detailWeight = smooth(clamp(edgeDistance / 3, 0, 1)) * 0.8;
  return common + (varied - common) * detailWeight;
}

function liquidThresholds(theme: ResolvedTheme): [number, number] {
  const values = new Float32Array(TILE_SIZE * TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      values[y * TILE_SIZE + x] = liquidNoiseAt(x, y, theme, 0);
    }
  }
  const sorted = new Float32Array(values);
  sorted.sort();
  return [sorted[Math.floor(0.3 * (sorted.length - 1))], sorted[Math.floor(0.72 * (sorted.length - 1))]];
}

function buildLiquidBands(theme: ResolvedTheme, variant: number, thresholds: readonly [number, number]): Uint8Array {
  const values = new Float32Array(TILE_SIZE * TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) values[y * TILE_SIZE + x] = liquidNoiseAt(x, y, theme, variant);
  }
  const bands = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) bands[i] = values[i] <= thresholds[0] ? 0 : values[i] <= thresholds[1] ? 1 : 2;
  return bands;
}

function drawLiquidTile(theme: ResolvedTheme, frame: number, variant: number, bands: Uint8Array): PixelTexture {
  const image: PixelTexture = { width: TILE_SIZE, height: TILE_SIZE, data: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4) };
  const mask = SHAPES[frame];
  const colors = theme.value.liquid;
  const ash = theme.key === 'ash';
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      setPixel(image, x, y, colors[bands[y * TILE_SIZE + x]]);
    }
  }

  const detailHash = hash32(frame, variant, 'liquid', paletteSeed(theme), 17);
  for (let i = 0; i < 4; i++) {
    const x = 4 + ((detailHash >>> (i * 5)) % 16);
    const y = 4 + ((detailHash >>> (i * 3 + 7)) % 16);
    setPixel(image, x, y, colors[2], ash ? 150 : 205);
    if (!ash && (detailHash & (1 << i)) !== 0) setPixel(image, x + 1, y, colors[2], 185);
  }

  const shore = colors[3];
  const foam = colors[2];
  const drawShore = (side: 'north' | 'east' | 'south' | 'west') => {
    const shellWidth = ash ? 2 : 1;
    for (let depth = 0; depth < shellWidth; depth++) {
      for (let along = 0; along < TILE_SIZE; along++) {
        let x = along;
        let y = depth;
        if (side === 'east') {
          x = TILE_SIZE - 1 - depth;
          y = along;
        } else if (side === 'south') {
          x = along;
          y = TILE_SIZE - 1 - depth;
        } else if (side === 'west') {
          x = depth;
          y = along;
        }
        setPixel(image, x, y, shore);
      }
    }
    if (!ash) {
      const line = shellWidth;
      for (let along = 1; along < TILE_SIZE - 1; along += 3) {
        let x = along;
        let y = line;
        if (side === 'east') {
          x = TILE_SIZE - 1 - line;
          y = along;
        } else if (side === 'south') {
          x = along;
          y = TILE_SIZE - 1 - line;
        } else if (side === 'west') {
          x = line;
          y = along;
        }
        setPixel(image, x, y, foam);
      }
    }
  };
  if ((mask & 1) === 0) drawShore('north');
  if ((mask & 4) === 0) drawShore('east');
  if ((mask & 16) === 0) drawShore('south');
  if ((mask & 64) === 0) drawShore('west');
  const corners = [
    { bit: 2, horizontal: 1, vertical: 4, x: TILE_SIZE - 1, y: 0, dx: -1, dy: 1 },
    { bit: 8, horizontal: 16, vertical: 4, x: TILE_SIZE - 1, y: TILE_SIZE - 1, dx: -1, dy: -1 },
    { bit: 32, horizontal: 16, vertical: 64, x: 0, y: TILE_SIZE - 1, dx: 1, dy: -1 },
    { bit: 128, horizontal: 1, vertical: 64, x: 0, y: 0, dx: 1, dy: 1 },
  ];
  for (const corner of corners) {
    const diagonalSame = (mask & corner.bit) !== 0;
    const bothSidesSame = (mask & corner.horizontal) !== 0 && (mask & corner.vertical) !== 0;
    if (bothSidesSame && !diagonalSame) {
      const size = ash ? 4 : 3;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          if (dx + dy < size) setPixel(image, corner.x + corner.dx * dx, corner.y + corner.dy * dy, shore);
        }
      }
    } else if (diagonalSame && !bothSidesSame) {
      setPixel(image, corner.x, corner.y, shore);
      setPixel(image, corner.x + corner.dx, corner.y, colors[1]);
      setPixel(image, corner.x, corner.y + corner.dy, colors[1]);
    }
  }
  return image;
}

function drawTile(theme: ResolvedTheme, layer: TerrainLayer, frame: number, variant: number, liquidBands: Uint8Array | null): PixelTexture {
  if (layer === 'wall') return drawWallTile(theme, frame, variant);
  if (layer === 'edge') return drawEdgeTile(theme, frame, variant);
  return drawLiquidTile(theme, frame, variant, liquidBands ?? buildLiquidBands(theme, variant, liquidThresholds(theme)));
}

export function buildAtlas(theme: TerrainThemeInput, layer: TerrainLayer): PixelTexture {
  const resolved = resolveTheme(theme);
  const variants = Math.max(1, Math.trunc(resolved.value.variants ?? FALLBACK_VARIANTS));
  const atlas: PixelTexture = {
    width: ATLAS_COLUMNS * TILE_SIZE,
    height: ATLAS_ROWS * TILE_SIZE * variants,
    data: new Uint8ClampedArray(ATLAS_COLUMNS * TILE_SIZE * ATLAS_ROWS * TILE_SIZE * variants * 4),
  };
  const liquidThreshold = layer === 'liquid' ? liquidThresholds(resolved) : null;
  const liquidBands = liquidThreshold
    ? Array.from({ length: variants }, (_, variant) => buildLiquidBands(resolved, variant, liquidThreshold))
    : null;
  for (let variant = 0; variant < variants; variant++) {
    for (let frame = 0; frame < SHAPES.length; frame++) {
      const x = (frame % ATLAS_COLUMNS) * TILE_SIZE;
      const y = (Math.floor(frame / ATLAS_COLUMNS) + variant * ATLAS_ROWS) * TILE_SIZE;
      blitTile(atlas, drawTile(resolved, layer, frame, variant, liquidBands?.[variant] ?? null), x, y);
    }
  }
  return atlas;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicNoise(x: number, y: number, period: number, theme: ResolvedTheme, octave: number): number {
  const cells = FLOOR_SIZE / period;
  const gx = x / period;
  const gy = y / period;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = smooth(gx - ix);
  const fy = smooth(gy - iy);
  const x0 = ((ix % cells) + cells) % cells;
  const y0 = ((iy % cells) + cells) % cells;
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const seed = paletteSeed(theme);
  const valueAt = (sx: number, sy: number): number => hash32(sx, sy, 'deco', seed, octave) / 0xffffffff;
  const top = valueAt(x0, y0) * (1 - fx) + valueAt(x1, y0) * fx;
  const bottom = valueAt(x0, y1) * (1 - fx) + valueAt(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

function detailPixel(image: PixelTexture, x: number, y: number, color: RGB): void {
  if (x < 2 || y < 2 || x >= TILE_SIZE - 2 || y >= TILE_SIZE - 2) return;
  setPixel(image, x, y, color);
}

function drawFloorDetail(image: PixelTexture, x: number, y: number, theme: ResolvedTheme, kind: number, h: number): void {
  const key = theme.key;
  const x0 = 3 + (h % 15);
  const y0 = 3 + ((h >>> 8) % 15);
  const leavesDark: RGB = [112, 164, 66];
  const leavesLight: RGB = [156, 200, 92];
  const pebbleLight: RGB = key === 'moss' ? [128, 128, 112] : key === 'wet' ? [118, 126, 132] : [122, 108, 96];
  const pebbleDark: RGB = key === 'moss' ? [74, 76, 66] : key === 'wet' ? [70, 78, 86] : [68, 58, 52];
  if (key === 'moss') {
    if (kind === 0) {
      detailPixel(image, x + x0, y + y0, leavesDark);
      detailPixel(image, x + x0 + 1, y + y0 - 1, leavesLight);
      detailPixel(image, x + x0 + 2, y + y0 - 2, leavesDark);
    } else if (kind === 1) {
      detailPixel(image, x + x0, y + y0, leavesLight);
      detailPixel(image, x + x0 + 1, y + y0, leavesDark);
    } else if (kind === 2) {
      fillRect(image, x + x0, y + y0, 2, 2, pebbleLight);
      detailPixel(image, x + x0 + 1, y + y0 + 2, pebbleDark);
    } else {
      for (let i = 0; i < 4; i++) detailPixel(image, x + x0 + i, y + y0, i % 2 ? leavesDark : pebbleDark);
    }
    return;
  }
  if (key === 'wet') {
    if (kind % 3 === 0) {
      detailPixel(image, x + x0, y + y0, kind % 2 ? [136, 176, 192] : [112, 150, 166]);
      if ((h & 3) !== 0) detailPixel(image, x + x0 + 1, y + y0, [136, 176, 192]);
    } else {
      fillRect(image, x + x0, y + y0, 2, 2, pebbleLight);
      detailPixel(image, x + x0, y + y0 + 2, pebbleDark);
    }
    return;
  }
  if (kind === 0) {
    detailPixel(image, x + x0, y + y0, [178, 82, 36]);
    if ((h & 1) === 0) detailPixel(image, x + x0 + 1, y + y0, [112, 48, 30]);
  } else if (kind === 1) {
    const length = 5 + ((h >>> 16) % 5);
    let px = x0;
    let py = y0;
    const direction = (h >>> 20) & 1 ? 1 : -1;
    for (let i = 0; i < length; i++) {
      detailPixel(image, x + px, y + py, colorScale(theme.value.floor[0], 0.95));
      if (i > 1 && i % 3 === 0) py += direction;
      else px += 1;
    }
  } else {
    fillRect(image, x + x0, y + y0, 2, 2, pebbleLight);
    detailPixel(image, x + x0 + 1, y + y0 + 2, pebbleDark);
  }
}

function addFloorDetails(image: PixelTexture, theme: ResolvedTheme): void {
  const seed = paletteSeed(theme);
  for (let cy = 0; cy < 16; cy++) {
    for (let cx = 0; cx < 16; cx++) {
      const countRoll = hash32(cx, cy, 'deco', seed, 1) % 10;
      const count = countRoll < 4 ? 0 : countRoll < 9 ? 1 : 2;
      for (let index = 0; index < count; index++) {
        const h = hash32(cx, cy, 'deco', seed, index + 2);
        let kind = h % (theme.key === 'moss' ? 4 : 3);
        if (theme.key === 'ash') {
          const typeRoll = hash32(cx, cy, 'deco', seed, 8) % 100;
          kind = typeRoll < 25 ? 1 : typeRoll < 67 ? 2 : 0;
        }
        drawFloorDetail(image, cx * TILE_SIZE, cy * TILE_SIZE, theme, kind, h);
      }
    }
  }
}

export function buildFloorTexture(theme: TerrainThemeInput): PixelTexture {
  const resolved = resolveTheme(theme);
  const image: PixelTexture = { width: FLOOR_SIZE, height: FLOOR_SIZE, data: new Uint8ClampedArray(FLOOR_SIZE * FLOOR_SIZE * 4) };
  const count = FLOOR_SIZE * FLOOR_SIZE;
  const values = new Float32Array(count);
  const octaves = resolved.value.floorNoise.octaves;
  let weightSum = 0;
  for (const [, weight] of octaves) weightSum += weight;
  for (let y = 0; y < FLOOR_SIZE; y++) {
    for (let x = 0; x < FLOOR_SIZE; x++) {
      let combined = 0;
      for (let octave = 0; octave < octaves.length; octave++) {
        const [period, weight] = octaves[octave];
        combined += periodicNoise(x, y, period, resolved, octave) * weight;
      }
      values[y * FLOOR_SIZE + x] = weightSum > 0 ? combined / weightSum : 0.5;
    }
  }
  const sorted = new Float32Array(values);
  sorted.sort();
  const thresholds = resolved.value.floorNoise.cuts.map((cut) => sorted[clamp(Math.floor(cut * (count - 1)), 0, count - 1)]);
  const palette = resolved.value.floor;
  const average: [number, number, number] = [0, 0, 0];
  for (const color of palette) {
    average[0] += color[0] / palette.length;
    average[1] += color[1] / palette.length;
    average[2] += color[2] / palette.length;
  }
  const seed = paletteSeed(resolved);
  for (let y = 0; y < FLOOR_SIZE; y++) {
    for (let x = 0; x < FLOOR_SIZE; x++) {
      const index = y * FLOOR_SIZE + x;
      let band = 0;
      while (band < thresholds.length && values[index] > thresholds[band]) band++;
      const colorIndex = resolved.value.floorNoise.levels?.[band] ?? band;
      const base = floorColor(palette[clamp(colorIndex, 0, palette.length - 1)], average, resolved.value.floorNoise.flatten);
      const grain = hash32(x, y, 'deco', seed, 19) % 100;
      const color = grain < 5 ? colorScale(base, 1.25) : grain < 10 ? colorScale(base, 0.75) : base;
      const pixel = index * 4;
      image.data[pixel] = color[0];
      image.data[pixel + 1] = color[1];
      image.data[pixel + 2] = color[2];
      image.data[pixel + 3] = 255;
    }
  }
  addFloorDetails(image, resolved);
  return image;
}

function excludedKeys(excluded: readonly (TerrainCell | string)[] | undefined): Set<string> {
  const keys = new Set<string>();
  for (const item of excluded ?? []) keys.add(typeof item === 'string' ? item : cellKey(item.x, item.y));
  return keys;
}

export function decorationCandidates(input: DecorationInput): DecorationCandidate[] {
  const map = prepareTerrainMap(input.map);
  const theme = resolveTheme(input.theme);
  const excluded = excludedKeys(input.excluded);
  const density = theme.value.decoDensity ?? TERRAIN_THEMES.moss.decoDensity!;
  const candidates: DecorationCandidate[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const key = cellKey(x, y);
      if (excluded.has(key)) continue;
      let kind: DecorationKind | null = null;
      if (map.floor.has(key) && frameOf(fullMaskAt(map, x, y, 'edge')) === 46) {
        kind = 'floor';
      } else if (!map.floor.has(key) && !map.liquid.has(key) && isWall(map, x, y)
        && isWall(map, x, y - 1) && isWall(map, x, y + 1)) {
        kind = 'wallTop';
      }
      if (!kind) continue;
      const rate = kind === 'floor' ? density.floor : density.wallTop;
      const hash = hash32(x, y, 'deco', input.seed, input.level);
      if (hash % 1000 < rate * 1000) candidates.push({ x, y, kind, hash });
    }
  }
  candidates.sort((a, b) => a.hash - b.hash || a.y - b.y || a.x - b.x);
  return candidates;
}

export function selectDecorations(input: DecorationInput): Decoration[] {
  const frames = input.atlas?.frames;
  if (!frames?.length) return [];
  const framesByKind: Record<DecorationKind, string[]> = {
    floor: frames.filter((frame) => frame.startsWith('floor-')),
    wallTop: frames.filter((frame) => frame.startsWith('wall-')),
  };
  const map = prepareTerrainMap(input.map);
  const candidates = decorationCandidates({ ...input, map });
  const placed: DecorationCandidate[] = [];
  for (const candidate of candidates) {
    const tooClose = placed.some((other) => Math.max(Math.abs(candidate.x - other.x), Math.abs(candidate.y - other.y)) < 2);
    if (!tooClose) placed.push(candidate);
  }
  return placed
    .filter((candidate) => map.known.has(cellKey(candidate.x, candidate.y)))
    .filter((candidate) => framesByKind[candidate.kind].length > 0)
    .map((candidate) => {
      const frameHash = hash32(candidate.x, candidate.y, 'deco', input.seed, input.level, 0x51ed270b);
      const kindFrames = framesByKind[candidate.kind];
      return {
        x: candidate.x,
        y: candidate.y,
        kind: candidate.kind,
        frame: kindFrames[frameHash % kindFrames.length],
      };
    });
}
