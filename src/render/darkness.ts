import type Phaser from 'phaser';
import {TERRAIN_THEMES} from './terrain.ts';
import type {TerrainThemeKey} from './terrain.ts';

const SAMPLES_PER_CELL = 4;
const NOISE_SCALE = 5;
const WARP_AMOUNT = .24;
const BLUR_ROUNDS = 2;
const BORDER_CELLS = 64;
export const BOARD_BACKGROUND = 0x101c1b;

export type DarknessLight = {x: number; y: number; primary: boolean; fire: boolean};
export type StaticDarknessLight = {x: number; y: number; inner: number; outer: number; strength: number};
export type DarknessColor = readonly [number, number, number];
export type Field = {
  width: number;
  height: number;
  known: ReadonlySet<string>;
  visible: ReadonlySet<string>;
  lights: readonly DarknessLight[];
  seed?: number;
  wallColor?: DarknessColor;
  staticLights?: readonly StaticDarknessLight[];
};

const smoothstep = (value: number) => {
  const n = Math.max(0, Math.min(1, value));
  return n * n * (3 - 2 * n);
};
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;

function averageWallColor(theme: TerrainThemeKey): DarknessColor {
  const palette = TERRAIN_THEMES[theme].wall;
  if (!palette.length) return [0, 0, 0];
  let red = 0, green = 0, blue = 0;
  for (const color of palette) {
    red += color[0];
    green += color[1];
    blue += color[2];
  }
  return [red / palette.length, green / palette.length, blue / palette.length];
}

/** Use the theme's first wall color as the dark mask tint. */
export function darknessTint(theme: TerrainThemeKey): DarknessColor {
  const wall = TERRAIN_THEMES[theme].wall[0] ?? [0, 0, 0];
  return [wall[0], wall[1], wall[2]];
}

/** Wall brightness is the arithmetic mean of the supplied red, green and blue channels. */
function wallBrightness(color: DarknessColor): number {
  return (color[0] + color[1] + color[2]) / 3;
}

/** Unexplored darkness follows the research formula: clamp(1 - 26 / mean wall RGB, .7, .9). */
export function unknownDarkness(color: DarknessColor): number {
  const brightness = wallBrightness(color);
  if (Number.isNaN(brightness)) return .7;
  return Math.min(.9, Math.max(.7, 1 - 26 / brightness));
}

export function darknessBackground(theme: TerrainThemeKey, wallColor: DarknessColor = averageWallColor(theme)): number {
  const opacity = unknownDarkness(wallColor);
  const tint = darknessTint(theme);
  return (
    (Math.round(mix(wallColor[0], tint[0], opacity)) << 16)
    | (Math.round(mix(wallColor[1], tint[1], opacity)) << 8)
    | Math.round(mix(wallColor[2], tint[2], opacity))
  ) >>> 0;
}

function coordinateKeys(width: number, height: number): string[] {
  const keys = new Array<string>(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) keys[y * width + x] = x + ',' + y;
  }
  return keys;
}

/** One entry per grid cell: visible 0, revealed edge 0.3, other revealed 0.58, unknown from wall brightness. */
export function buildCellDarkness(field: Field, theme: TerrainThemeKey = 'moss'): Float32Array {
  const {width, height, known, visible} = field;
  const keys = coordinateKeys(width, height);
  const values = new Float32Array(width * height);
  const unknown = unknownDarkness(field.wallColor ?? averageWallColor(theme));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const key = keys[index]!;
      if (!known.has(key)) {
        values[index] = unknown;
      } else if (visible.has(key)) {
        values[index] = 0;
      } else {
        let atVisibleEdge = false;
        for (let dy = -1; dy <= 1 && !atVisibleEdge; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx || dy) && x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height
              && known.has(keys[(y + dy) * width + x + dx]!)
              && visible.has(keys[(y + dy) * width + x + dx]!)) {
              atVisibleEdge = true;
              break;
            }
          }
        }
        values[index] = atVisibleEdge ? .3 : .58;
      }
    }
  }
  return values;
}

function hashNoise(x: number, y: number, seed: number, salt: number): number {
  let value = (
    Math.imul(x | 0, 0x9e3779b1)
    ^ Math.imul(y | 0, 0x85ebca6b)
    ^ Math.imul(seed | 0, 0xc2b2ae35)
    ^ (salt | 0)
  ) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function valueNoise(x: number, y: number, seed: number, salt: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = smoothstep(x - x0), ty = smoothstep(y - y0);
  const top = mix(hashNoise(x0, y0, seed, salt), hashNoise(x0 + 1, y0, seed, salt), tx);
  const bottom = mix(hashNoise(x0, y0 + 1, seed, salt), hashNoise(x0 + 1, y0 + 1, seed, salt), tx);
  return mix(top, bottom, ty);
}

function sampleCellField(values: Float32Array, width: number, height: number, x: number, y: number): number {
  const gx = Math.floor(x - .5);
  const gy = Math.floor(y - .5);
  const tx = smoothstep(x - .5 - gx);
  const ty = smoothstep(y - .5 - gy);
  const x0 = Math.max(0, Math.min(width - 1, gx));
  const x1 = Math.max(0, Math.min(width - 1, gx + 1));
  const y0 = Math.max(0, Math.min(height - 1, gy));
  const y1 = Math.max(0, Math.min(height - 1, gy + 1));
  const a = mix(values[y0 * width + x0]!, values[y0 * width + x1]!, tx);
  const b = mix(values[y1 * width + x0]!, values[y1 * width + x1]!, tx);
  return mix(a, b, ty);
}

function boxBlur(source: Float32Array, target: Float32Array, width: number, height: number, horizontal: boolean): void {
  if (horizontal) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const left = row + Math.max(0, x - 1);
        const middle = row + x;
        const right = row + Math.min(width - 1, x + 1);
        target[middle] = (source[left]! + source[middle]! + source[right]!) / 3;
      }
    }
  } else {
    for (let y = 0; y < height; y++) {
      const above = Math.max(0, y - 1) * width;
      const row = y * width;
      const below = Math.min(height - 1, y + 1) * width;
      for (let x = 0; x < width; x++) target[row + x] = (source[above + x]! + source[row + x]! + source[below + x]!) / 3;
    }
  }
}

function buildBaseDarkness(field: Field, theme: TerrainThemeKey, seed: number): Uint8ClampedArray {
  const {width, height} = field;
  const cellValues = buildCellDarkness(field, theme);
  const pixelWidth = width * SAMPLES_PER_CELL;
  const pixelHeight = height * SAMPLES_PER_CELL;
  const raw = new Float32Array(pixelWidth * pixelHeight);
  for (let py = 0; py < pixelHeight; py++) {
    const y = (py + .5) / SAMPLES_PER_CELL;
    for (let px = 0; px < pixelWidth; px++) {
      const x = (px + .5) / SAMPLES_PER_CELL;
      const warpX = (valueNoise(x / NOISE_SCALE, y / NOISE_SCALE, seed, 0x51ed270b) - .5) * WARP_AMOUNT;
      const warpY = (valueNoise(x / NOISE_SCALE, y / NOISE_SCALE, seed, 0x68bc21eb) - .5) * WARP_AMOUNT;
      raw[py * pixelWidth + px] = sampleCellField(cellValues, width, height, x + warpX, y + warpY) * 255;
    }
  }
  const scratch = new Float32Array(raw.length);
  for (let round = 0; round < BLUR_ROUNDS; round++) {
    boxBlur(raw, scratch, pixelWidth, pixelHeight, true);
    boxBlur(scratch, raw, pixelWidth, pixelHeight, false);
  }
  const output = Uint8ClampedArray.from(raw);
  applyStaticLightsToBase(output, field);
  return output;
}

type LightSample = {x: number; y: number; inner: number; outer: number; strength: number; primary?: boolean; fire?: boolean};

function partyLight(light: DarknessLight): LightSample {
  const inner = light.primary ? (light.fire ? 1.3 : .9) : (light.fire ? .95 : .55);
  const outer = light.primary ? (light.fire ? 2.8 : 1.95) : (light.fire ? 2.25 : 1.45);
  const strength = light.primary ? 1 : light.fire ? .85 : .8;
  return {x: light.x + .5, y: light.y + .5, inner, outer, strength, primary: light.primary, fire: light.fire};
}

function applyLightValues(
  alpha: number, x: number, y: number, lightX: number, lightY: number,
  innerInput: number, outerInput: number, strength: number,
): number {
  const dx = x - lightX;
  const dy = y - lightY;
  const inner = Math.max(0, innerInput);
  const outer = Math.max(inner + .0001, outerInput);
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= outer * outer) return alpha;
  let attenuation: number;
  if (distanceSquared <= inner * inner) attenuation = 1 - strength;
  else {
    const distance = Math.sqrt(distanceSquared);
    const edge = smoothstep((distance - inner) / (outer - inner));
    attenuation = 1 - strength * (1 - edge);
  }
  return alpha * attenuation;
}

function applyLight(alpha: number, x: number, y: number, light: LightSample): number {
  return applyLightValues(alpha, x, y, light.x, light.y, light.inner, light.outer, light.strength);
}

function collectPartyLights(field: Field): LightSample[] {
  return field.lights.map(partyLight);
}

function collectRevealedStaticLights(field: Field): LightSample[] {
  const lights: LightSample[] = [];
  for (const light of field.staticLights ?? []) {
    if (field.known.has(Math.floor(light.x) + ',' + Math.floor(light.y))) {
      lights.push({x: light.x + .5, y: light.y + .5, inner: light.inner, outer: light.outer, strength: light.strength});
    }
  }
  return lights;
}

function applyStaticLightsToBase(base: Uint8ClampedArray, field: Field): void {
  const lights = collectRevealedStaticLights(field);
  if (!lights.length) return;
  const width = field.width * SAMPLES_PER_CELL;
  for (let py = 0; py < field.height * SAMPLES_PER_CELL; py++) {
    const y = (py + .5) / SAMPLES_PER_CELL;
    for (let px = 0; px < width; px++) {
      const index = py * width + px;
      const x = (px + .5) / SAMPLES_PER_CELL;
      let alpha = base[index]! / 255;
      for (const light of lights) alpha = applyLight(alpha, x, y, light);
      base[index] = alpha * 255;
    }
  }
}

/** Builds the smooth 4× mask and applies current party and revealed static lights. */
export function buildDarkness(field: Field, theme: TerrainThemeKey = 'moss'): Uint8ClampedArray {
  const base = buildBaseDarkness(field, theme, field.seed ?? 0);
  const output = base.slice();
  const lights = collectPartyLights(field);
  const {width, height} = field;
  const pixelWidth = width * SAMPLES_PER_CELL;
  for (let py = 0; py < height * SAMPLES_PER_CELL; py++) {
    const y = (py + .5) / SAMPLES_PER_CELL;
    for (let px = 0; px < pixelWidth; px++) {
      const index = py * pixelWidth + px;
      const x = (px + .5) / SAMPLES_PER_CELL;
      let alpha = output[index]! / 255;
      for (const light of lights) alpha = applyLight(alpha, x, y, light);
      output[index] = alpha * 255;
    }
  }
  return output;
}

function seedFromFloor(floor: string, mapSeed = 0): number {
  let seed = Math.imul(0x811c9dc5 ^ (Math.trunc(mapSeed) | 0), 0x01000193);
  for (let i = 0; i < floor.length; i++) seed = Math.imul(seed ^ floor.charCodeAt(i), 0x01000193);
  return seed >>> 0;
}

function sameColor(a: DarknessColor | undefined, b: DarknessColor): boolean {
  return !!a && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

const textureKey = 'dungeon-darkness';
const LIGHT_STRIDE = 7;
const STATIC_LIGHT_STRIDE = 5;

export class DungeonDarkness {
  private width = 0;
  private height = 0;
  private cellKeys: string[] = [];
  private knownBits = new Uint8Array(0);
  private visibleBits = new Uint8Array(0);
  private nextKnownBits = new Uint8Array(0);
  private nextVisibleBits = new Uint8Array(0);
  private texture?: Phaser.Textures.CanvasTexture;
  private image?: Phaser.GameObjects.Image;
  private border?: Phaser.GameObjects.Graphics;
  private pixels?: ImageData;
  private base?: Uint8ClampedArray;
  private target?: Uint8ClampedArray;
  private from?: Uint8ClampedArray;
  private changedAt = 0;
  private transitionEnd = 0;
  private transitionProgress = 1;
  private movementProgress: number | undefined;
  private lastDrawMs = 0;
  private lastBaseBuildMs = 0;
  private baseBuildCount = 0;
  private lightData = new Float32Array(20);
  private lightCount = 0;
  private staticData = new Float32Array(20);
  private nextStaticData = new Float32Array(20);
  private staticCount = 0;
  private nextStaticCount = 0;
  private currentLights: readonly DarknessLight[] = [];
  private tint?: DarknessColor;
  private borderKey = '';

  private scene: Phaser.Scene;
  private filter: Phaser.Textures.FilterMode;

  constructor(scene: Phaser.Scene, filter: Phaser.Textures.FilterMode) {
    this.scene = scene;
    this.filter = filter;
  }

  clear(): void {
    this.image?.destroy();
    this.border?.destroy();
    if (this.texture) this.scene.textures.remove(textureKey);
    this.image = undefined;
    this.border = undefined;
    this.texture = undefined;
    this.pixels = undefined;
    this.base = undefined;
    this.target = undefined;
    this.from = undefined;
    this.width = 0;
    this.height = 0;
    this.cellKeys = [];
    this.knownBits = this.visibleBits = this.nextKnownBits = this.nextVisibleBits = new Uint8Array(0);
    this.currentLights = [];
    this.lightCount = 0;
    this.staticCount = this.nextStaticCount = 0;
    this.staticData = this.nextStaticData = new Float32Array(20);
    this.tint = undefined;
    this.borderKey = '';
    this.transitionProgress = 1;
    this.movementProgress = undefined;
    this.changedAt = this.transitionEnd = 0;
  }

  show(
    floor: string,
    theme: TerrainThemeKey,
    cellSize: number,
    field: Field,
    animate: boolean,
    durationMs = 0,
  ): void {
    const now = this.scene.time.now;
    const {width, height} = field;
    if (width <= 0 || height <= 0) {
      this.clear();
      return;
    }

    const changedDimensions = width !== this.width || height !== this.height;
    const effectiveSeed = seedFromFloor(floor, field.seed ?? 0);
    const color = field.wallColor ?? averageWallColor(theme);
    const cellsChanged = this.readAndCompareCells(field, width, height);
    const staticLightsChanged = this.readAndCompareStaticLights(field);
    const baseChanged = changedDimensions || effectiveSeed !== this.lastSeed || !sameColor(this.wallColor, color)
      || cellsChanged || staticLightsChanged;

    if (!this.texture || changedDimensions) {
      this.destroyVisuals();
      this.width = width;
      this.height = height;
      this.cellKeys = coordinateKeys(width, height);
      this.knownBits = new Uint8Array(width * height);
      this.visibleBits = new Uint8Array(width * height);
      this.nextKnownBits = new Uint8Array(width * height);
      this.nextVisibleBits = new Uint8Array(width * height);
      this.readCells(field);
      this.createTexture(width, height, cellSize);
    } else {
      this.image?.setDisplaySize(width * cellSize, height * cellSize);
    }

    this.currentLights = field.lights;

    if (baseChanged || !this.base) {
      const buildStart = performance.now();
      const next = buildBaseDarkness(field, theme, effectiveSeed);
      this.lastBaseBuildMs = performance.now() - buildStart;
      this.baseBuildCount++;
      this.lastSeed = effectiveSeed;
      this.wallColor = [...color] as DarknessColor;
      this.storeCellBits(field);
      this.storeStaticLights();
      if (!this.base || changedDimensions || this.base.length !== next.length) {
        this.base = next;
        this.from = undefined;
        this.target = next;
        this.transitionProgress = 1;
        this.changedAt = now;
        this.transitionEnd = now;
      } else if (animate && durationMs > 0) {
        this.advanceBase(now);
        this.from = this.base.slice();
        this.target = next;
        this.transitionProgress = 0;
        this.changedAt = now;
        this.transitionEnd = now + durationMs;
      } else {
        this.base = next;
        this.target = next;
        this.from = undefined;
        this.transitionProgress = 1;
        this.changedAt = now;
        this.transitionEnd = now;
      }
    } else if (!animate) {
      // A final repaint settles to its target without rebuilding the same base field.
      if (this.from && this.target) this.base = this.target;
      this.from = undefined;
      this.transitionProgress = 1;
      this.changedAt = now;
      this.transitionEnd = now;
    }

    this.syncTint(theme);
    this.syncBorder(theme, color, cellSize);
    this.update(now, field.lights);
  }

  /** Phaser tweens and Scene clocks can advance by different deltas; visual movement supplies the authoritative progress. */
  setMovementProgress(progress: number | undefined): void {
    this.movementProgress = progress === undefined ? undefined : Math.max(0, Math.min(1, progress));
  }

  update(time: number, lights?: readonly DarknessLight[]): void {
    if (!this.texture || !this.pixels || !this.base) return;
    const drawStart = performance.now();
    if (lights) this.currentLights = lights;
    this.advanceBase(time);
    this.fillLightBuffer();
    const rgba = this.pixels.data;
    const pixelWidth = this.width * SAMPLES_PER_CELL;
    for (let py = 0; py < this.height * SAMPLES_PER_CELL; py++) {
      const y = (py + .5) / SAMPLES_PER_CELL;
      for (let px = 0; px < pixelWidth; px++) {
        const index = py * pixelWidth + px;
        const x = (px + .5) / SAMPLES_PER_CELL;
        let alpha = this.base[index]! / 255;
        for (let lightIndex = 0; lightIndex < this.lightCount; lightIndex++) {
          const offset = lightIndex * LIGHT_STRIDE;
          alpha = applyLightValues(alpha, x, y, this.lightData[offset]!, this.lightData[offset + 1]!,
            this.lightData[offset + 2]!, this.lightData[offset + 3]!, this.lightData[offset + 4]!);
        }
        rgba[index * 4 + 3] = alpha * 255;
      }
    }
    this.texture.getContext().putImageData(this.pixels, 0, 0);
    this.texture.refresh();
    this.texture.setFilter(this.filter);
    this.lastDrawMs = performance.now() - drawStart;
  }

  debug(): {
    baseBuildCount: number;
    baseBuildMs: number;
    drawMs: number;
    transition: {start: number; end: number; progress: number};
    lights: {x: number; y: number; centerX: number; centerY: number; inner: number; outer: number; strength: number; primary: boolean; fire: boolean}[];
  } {
    const lights = new Array<{x: number; y: number; centerX: number; centerY: number; inner: number; outer: number; strength: number; primary: boolean; fire: boolean}>(this.lightCount);
    for (let i = 0; i < this.lightCount; i++) {
      const offset = i * LIGHT_STRIDE;
      const centerX = this.lightData[offset]!;
      const centerY = this.lightData[offset + 1]!;
      lights[i] = {
        x: centerX - .5,
        y: centerY - .5,
        centerX,
        centerY,
        inner: this.lightData[offset + 2]!,
        outer: this.lightData[offset + 3]!,
        strength: this.lightData[offset + 4]!,
        primary: this.lightData[offset + 5] === 1,
        fire: this.lightData[offset + 6] === 1,
      };
    }
    return {
      baseBuildCount: this.baseBuildCount,
      baseBuildMs: this.lastBaseBuildMs,
      drawMs: this.lastDrawMs,
      transition: {start: this.changedAt, end: this.transitionEnd, progress: this.transitionProgress},
      lights,
    };
  }

  private lastSeed = 0;
  private wallColor?: DarknessColor;

  private readAndCompareCells(field: Field, width: number, height: number): boolean {
    if (width !== this.width || height !== this.height || this.cellKeys.length !== width * height) {
      this.width = width;
      this.height = height;
      this.cellKeys = coordinateKeys(width, height);
      this.knownBits = new Uint8Array(width * height);
      this.visibleBits = new Uint8Array(width * height);
      this.nextKnownBits = new Uint8Array(width * height);
      this.nextVisibleBits = new Uint8Array(width * height);
      return true;
    }
    let changed = false;
    for (let i = 0; i < this.cellKeys.length; i++) {
      const key = this.cellKeys[i]!;
      const known = field.known.has(key) ? 1 : 0;
      const visible = field.visible.has(key) ? 1 : 0;
      this.nextKnownBits[i] = known;
      this.nextVisibleBits[i] = visible;
      if (known !== this.knownBits[i] || visible !== this.visibleBits[i]) changed = true;
    }
    return changed;
  }

  private readCells(field: Field): void {
    for (let i = 0; i < this.cellKeys.length; i++) {
      const key = this.cellKeys[i]!;
      this.nextKnownBits[i] = field.known.has(key) ? 1 : 0;
      this.nextVisibleBits[i] = field.visible.has(key) ? 1 : 0;
    }
    this.knownBits.set(this.nextKnownBits);
    this.visibleBits.set(this.nextVisibleBits);
  }

  private storeCellBits(field: Field): void {
    for (let i = 0; i < this.cellKeys.length; i++) {
      const key = this.cellKeys[i]!;
      this.nextKnownBits[i] = field.known.has(key) ? 1 : 0;
      this.nextVisibleBits[i] = field.visible.has(key) ? 1 : 0;
    }
    const known = this.knownBits;
    this.knownBits = this.nextKnownBits;
    this.nextKnownBits = known;
    const visible = this.visibleBits;
    this.visibleBits = this.nextVisibleBits;
    this.nextVisibleBits = visible;
  }

  private readAndCompareStaticLights(field: Field): boolean {
    let changed = false;
    this.nextStaticCount = 0;
    for (const light of field.staticLights ?? []) {
      if (!field.known.has(Math.floor(light.x) + ',' + Math.floor(light.y))) continue;
      const offset = this.nextStaticCount * STATIC_LIGHT_STRIDE;
      if (offset + STATIC_LIGHT_STRIDE > this.nextStaticData.length) {
        const expanded = new Float32Array(Math.max(this.nextStaticData.length * 2, offset + STATIC_LIGHT_STRIDE));
        expanded.set(this.nextStaticData);
        this.nextStaticData = expanded;
      }
      const x = light.x + .5, y = light.y + .5;
      this.nextStaticData[offset] = x;
      this.nextStaticData[offset + 1] = y;
      this.nextStaticData[offset + 2] = light.inner;
      this.nextStaticData[offset + 3] = light.outer;
      this.nextStaticData[offset + 4] = light.strength;
      if (this.staticData[offset] !== x || this.staticData[offset + 1] !== y
        || this.staticData[offset + 2] !== light.inner || this.staticData[offset + 3] !== light.outer
        || this.staticData[offset + 4] !== light.strength) changed = true;
      this.nextStaticCount++;
    }
    if (this.nextStaticCount !== this.staticCount) changed = true;
    return changed;
  }

  private storeStaticLights(): void {
    const previous = this.staticData;
    this.staticData = this.nextStaticData;
    this.nextStaticData = previous;
    this.staticCount = this.nextStaticCount;
  }

  private advanceBase(time: number): void {
    if (!this.from || !this.target || !this.base) return;
    const progress = this.movementProgress ?? (this.transitionEnd <= this.changedAt
      ? 1
      : Math.max(0, Math.min(1, (time - this.changedAt) / (this.transitionEnd - this.changedAt))));
    const eased = smoothstep(progress);
    for (let i = 0; i < this.base.length; i++) {
      this.base[i] = mix(this.from[i]!, this.target[i]!, eased);
    }
    this.transitionProgress = eased;
    if (progress >= 1) {
      this.base = this.target;
      this.from = undefined;
      this.transitionProgress = 1;
      if(this.movementProgress!==undefined)this.transitionEnd=time;
      this.movementProgress=undefined;
    }
  }

  private fillLightBuffer(): void {
    this.lightCount = 0;
    for (const light of this.currentLights) {
      const inner = light.primary ? (light.fire ? 1.3 : .9) : (light.fire ? .95 : .55);
      const outer = light.primary ? (light.fire ? 2.8 : 1.95) : (light.fire ? 2.25 : 1.45);
      const strength = light.primary ? 1 : light.fire ? .85 : .8;
      this.appendLight(light.x + .5, light.y + .5, inner, outer, strength, light.primary, light.fire);
    }
  }

  private appendLight(
    x: number, y: number, innerInput: number, outerInput: number, strength: number, primary: boolean, fire: boolean,
  ): void {
    const offset = this.lightCount * LIGHT_STRIDE;
    if (offset + LIGHT_STRIDE > this.lightData.length) {
      const expanded = new Float32Array(Math.max(this.lightData.length * 2, offset + LIGHT_STRIDE));
      expanded.set(this.lightData);
      this.lightData = expanded;
    }
    this.lightData[offset] = x;
    this.lightData[offset + 1] = y;
    const inner = Math.max(0, innerInput);
    this.lightData[offset + 2] = inner;
    this.lightData[offset + 3] = Math.max(inner + .0001, outerInput);
    this.lightData[offset + 4] = Math.max(0, Math.min(1, strength));
    this.lightData[offset + 5] = primary ? 1 : 0;
    this.lightData[offset + 6] = fire ? 1 : 0;
    this.lightCount++;
  }

  private syncTint(theme: TerrainThemeKey): void {
    const tint = darknessTint(theme);
    if (this.tint && sameColor(this.tint, tint)) return;
    this.tint = tint;
    if (!this.pixels) return;
    const rgba = this.pixels.data;
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = tint[0];
      rgba[i + 1] = tint[1];
      rgba[i + 2] = tint[2];
    }
  }

  private syncBorder(theme: TerrainThemeKey, wallColor: DarknessColor, cellSize: number): void {
    const key = theme + ':' + wallColor.join(',') + ':' + cellSize + ':' + this.width + ':' + this.height;
    if (key === this.borderKey) return;
    this.border?.destroy();
    const border = this.scene.add.graphics().setDepth(1);
    const tint = darknessTint(theme);
    const color = ((tint[0] << 16) | (tint[1] << 8) | tint[2]) >>> 0;
    const mapWidth = this.width * cellSize;
    const mapHeight = this.height * cellSize;
    const margin = BORDER_CELLS * cellSize;
    border.fillStyle(color, unknownDarkness(wallColor));
    border.fillRect(-margin, -margin, margin, mapHeight + margin * 2);
    border.fillRect(mapWidth, -margin, margin, mapHeight + margin * 2);
    border.fillRect(0, -margin, mapWidth, margin);
    border.fillRect(0, mapHeight, mapWidth, margin);
    this.border = border;
    this.borderKey = key;
  }

  private createTexture(width: number, height: number, cellSize: number): void {
    const pixelWidth = width * SAMPLES_PER_CELL;
    const pixelHeight = height * SAMPLES_PER_CELL;
    const texture = this.scene.textures.createCanvas(textureKey, pixelWidth, pixelHeight);
    if (!texture) return;
    this.texture = texture;
    this.pixels = texture.getContext().createImageData(pixelWidth, pixelHeight);
    this.image = this.scene.add.image(0, 0, textureKey).setOrigin(0).setDepth(7)
      .setDisplaySize(width * cellSize, height * cellSize);
  }

  private destroyVisuals(): void {
    this.image?.destroy();
    this.border?.destroy();
    if (this.texture) this.scene.textures.remove(textureKey);
    this.image = undefined;
    this.border = undefined;
    this.texture = undefined;
    this.pixels = undefined;
    this.borderKey = '';
    this.tint = undefined;
  }
}
