import type Phaser from 'phaser';
import {TERRAIN_THEMES} from './terrain.ts';
import type {TerrainThemeKey} from './terrain.ts';

/** The mask is a screen-space picture composed from geometry (circles and one rounded rectangle per lit room), never from per-cell values.
 *  It is drawn at SAMPLES_PER_CELL texels per cell and stretched bilinearly, which keeps every edge a soft curve. */
const SAMPLES_PER_CELL = 6;
const BORDER_CELLS = 64;
/** A lit room is the room plus the ring of cells around it (corners included) as one rounded rectangle. */
const ROOM_RADIUS = .5;
const ROOM_FEATHER = .3;
export const ROOM_FADE_MS = 225;
/** A party member lights a circle of about 2.5 cells (full light inside CIRCLE_INNER, none beyond CIRCLE_OUTER). */
export const CIRCLE_INNER = 1.9;
export const CIRCLE_OUTER = 3.0;
export const BOARD_BACKGROUND = 0x101c1b;

export type DarknessLight = {x: number; y: number; primary: boolean};
export type StaticDarknessLight = {x: number; y: number; inner: number; outer: number; strength: number};
export type DarknessRoom = {x: number; y: number; w: number; h: number};
export type DarknessColor = readonly [number, number, number];
export type Field = {
  width: number;
  height: number;
  known: ReadonlySet<string>;
  lights: readonly DarknessLight[];
  /** Rooms (before the outer ring) holding the leader or a living companion. */
  litRooms?: readonly DarknessRoom[];
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

/** The one darkness outside the light follows the research formula: clamp(1 - 26 / mean wall RGB, .7, .9). */
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

export const roomKey = (r: DarknessRoom) => r.x + ',' + r.y + ',' + r.w + ',' + r.h;

/** Light on a rounded rectangle: 1 inside, 0 outside, feathered ROOM_FEATHER across the edge. Coordinates are in cells. */
export function roomLight(room: DarknessRoom, x: number, y: number): number {
  const x0 = room.x - 1, y0 = room.y - 1, hw = (room.w + 2) / 2, hh = (room.h + 2) / 2;
  const qx = Math.abs(x - (x0 + hw)) - (hw - ROOM_RADIUS), qy = Math.abs(y - (y0 + hh)) - (hh - ROOM_RADIUS);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const sdf = outside + Math.min(Math.max(qx, qy), 0) - ROOM_RADIUS;
  return 1 - smoothstep((sdf + ROOM_FEATHER / 2) / ROOM_FEATHER);
}

/** Light of a circle at distance d (in cells). */
export const circleLight = (distance: number, inner = CIRCLE_INNER, outer = CIRCLE_OUTER) =>
  1 - smoothstep((distance - inner) / Math.max(1e-4, outer - inner));

/** The whole mask in one pass: one even darkness, minus the rooms (with their fade levels) and the party circles, times the static glows.
 *  Writes alpha 0..1 per texel (SAMPLES_PER_CELL texels per cell) into `out`. */
export function composeMask(
  width: number, height: number, dark: number,
  rooms: readonly {room: DarknessRoom; level: number}[],
  lights: readonly {x: number; y: number}[],
  staticMul: Float32Array | undefined,
  out: Float32Array,
  knownMask?: Float32Array,
): Float32Array {
  const S = SAMPLES_PER_CELL, pw = width * S, ph = height * S;
  if (staticMul) for (let i = 0; i < out.length; i++) out[i] = dark * staticMul[i]!;
  else out.fill(dark);
  const clampX = (v: number) => Math.max(0, Math.min(pw - 1, v)), clampY = (v: number) => Math.max(0, Math.min(ph - 1, v));
  for (const {room, level} of rooms) {
    if (level <= 0) continue;
    const pad = ROOM_FEATHER;
    const px0 = clampX(Math.floor((room.x - 1 - pad) * S)), px1 = clampX(Math.ceil((room.x + room.w + 1 + pad) * S));
    const py0 = clampY(Math.floor((room.y - 1 - pad) * S)), py1 = clampY(Math.ceil((room.y + room.h + 1 + pad) * S));
    for (let py = py0; py <= py1; py++) {
      const y = (py + .5) / S;
      for (let px = px0; px <= px1; px++) out[py * pw + px]! *= 1 - level * roomLight(room, (px + .5) / S, y);
    }
  }
  for (const light of lights) {
    const lx = light.x + .5, ly = light.y + .5;
    const px0 = clampX(Math.floor((lx - CIRCLE_OUTER) * S)), px1 = clampX(Math.ceil((lx + CIRCLE_OUTER) * S));
    const py0 = clampY(Math.floor((ly - CIRCLE_OUTER) * S)), py1 = clampY(Math.ceil((ly + CIRCLE_OUTER) * S));
    for (let py = py0; py <= py1; py++) {
      const dy = (py + .5) / S - ly;
      for (let px = px0; px <= px1; px++) {
        const dx = (px + .5) / S - lx, d2 = dx * dx + dy * dy;
        if (d2 >= CIRCLE_OUTER * CIRCLE_OUTER) continue;
        const lit = d2 <= CIRCLE_INNER * CIRCLE_INNER ? 1 : circleLight(Math.sqrt(d2));
        out[py * pw + px]! *= 1 - lit * (knownMask ? knownMask[py * pw + px]! : 1);
      }
    }
  }
  return out;
}

/** How much a texel belongs to the revealed map: the known bits blended bilinearly between cell centres, then sharpened a little, so a party
 *  circle never lights up cells the player has not revealed (they stay the even darkness) and the cut-off is a soft curve, not a cell edge. */
export function buildKnownMask(width: number, height: number, bits: Uint8Array): Float32Array {
  const S = SAMPLES_PER_CELL, pw = width * S, ph = height * S, out = new Float32Array(pw * ph);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : bits[y * width + x]!);
  for (let py = 0; py < ph; py++) {
    const cy = (py + .5) / S - .5, y0 = Math.floor(cy), fy = cy - y0;
    for (let px = 0; px < pw; px++) {
      const cx = (px + .5) / S - .5, x0 = Math.floor(cx), fx = cx - x0;
      const b = mix(mix(at(x0, y0), at(x0 + 1, y0), fx), mix(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy);
      out[py * pw + px] = smoothstep(b);
    }
  }
  return out;
}

/** Local glow of revealed stairs and magma: multiplies the darkness down around the source. */
function buildStaticMultiplier(width: number, height: number, lights: readonly StaticDarknessLight[]): Float32Array {
  const S = SAMPLES_PER_CELL, pw = width * S, ph = height * S, out = new Float32Array(pw * ph).fill(1);
  for (const light of lights) {
    const lx = light.x + .5, ly = light.y + .5, outer = Math.max(light.inner + .0001, light.outer);
    const px0 = Math.max(0, Math.floor((lx - outer) * S)), px1 = Math.min(pw - 1, Math.ceil((lx + outer) * S));
    const py0 = Math.max(0, Math.floor((ly - outer) * S)), py1 = Math.min(ph - 1, Math.ceil((ly + outer) * S));
    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        const d = Math.hypot((px + .5) / S - lx, (py + .5) / S - ly);
        if (d >= outer) continue;
        out[py * pw + px]! *= 1 - light.strength * (d <= light.inner ? 1 : 1 - smoothstep((d - light.inner) / (outer - light.inner)));
      }
    }
  }
  return out;
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
type RoomFade = {room: DarknessRoom; level: number; from: number; to: number; start: number; end: number};

/** Everything outside the light is one even darkness (the unexplored wall-centre tiles and the explored terrain share it, so there are no
 *  patches). Lit rooms and party circles cut soft holes into it. */
export class DungeonDarkness {
  private width = 0;
  private height = 0;
  private texture?: Phaser.Textures.CanvasTexture;
  private image?: Phaser.GameObjects.Image;
  private border?: Phaser.GameObjects.Graphics;
  private pixels?: ImageData;
  private alpha = new Float32Array(0);
  private staticMul?: Float32Array;
  private knownBits = new Uint8Array(0);
  private knownMask?: Float32Array;
  private dark = .7;
  private fades = new Map<string, RoomFade>();
  private lastDrawMs = 0;
  private lastBaseBuildMs = 0;
  private baseBuildCount = 0;
  private lights: {x: number; y: number; primary: boolean}[] = [];
  private tint?: DarknessColor;
  private borderKey = '';
  private lastFloorKey = '';
  private staticKey = '';
  private transition = {start: 0, end: 0, progress: 1};

  private scene: Phaser.Scene;
  private filter: Phaser.Textures.FilterMode;

  constructor(scene: Phaser.Scene, filter: Phaser.Textures.FilterMode) {
    this.scene = scene;
    this.filter = filter;
  }

  clear(): void {
    this.destroyVisuals();
    this.width = 0;
    this.height = 0;
    this.alpha = new Float32Array(0);
    this.staticMul = undefined;
    this.knownMask = undefined;
    this.knownBits = new Uint8Array(0);
    this.fades.clear();
    this.lights = [];
    this.staticKey = '';
    this.lastFloorKey = '';
    this.transition = {start: 0, end: 0, progress: 1};
  }

  /** Called whenever the world changes. `animate` fades rooms in or out; a final repaint, a skip or reduced motion settles at once. */
  show(floor: string, theme: TerrainThemeKey, cellSize: number, field: Field, animate: boolean): void {
    const now = this.scene.time.now;
    const {width, height} = field;
    if (width <= 0 || height <= 0) {
      this.clear();
      return;
    }
    const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const fade = animate && !reduced;
    const changedDimensions = width !== this.width || height !== this.height;
    const floorKey = floor + ':' + seedFromFloor(floor, field.seed ?? 0);
    const newFloor = floorKey !== this.lastFloorKey;
    const color = field.wallColor ?? averageWallColor(theme);
    this.dark = unknownDarkness(color);

    if (!this.texture || changedDimensions) {
      this.destroyVisuals();
      this.width = width;
      this.height = height;
      this.alpha = new Float32Array(width * SAMPLES_PER_CELL * height * SAMPLES_PER_CELL);
      this.createTexture(width, height, cellSize);
      this.staticKey = '';
      this.knownMask = undefined;
    } else {
      this.image?.setDisplaySize(width * cellSize, height * cellSize);
    }
    this.lastFloorKey = floorKey;

    // Static glows (revealed stairs and magma): rebuilt only when their set changes.
    const statics = (field.staticLights ?? []).filter(light => field.known.has(Math.floor(light.x) + ',' + Math.floor(light.y)));
    const staticKey = statics.map(l => [l.x, l.y, l.inner, l.outer, l.strength].join(':')).join('|');
    if (staticKey !== this.staticKey || (statics.length && !this.staticMul)) {
      const start = performance.now();
      this.staticMul = statics.length ? buildStaticMultiplier(width, height, statics) : undefined;
      this.lastBaseBuildMs = performance.now() - start;
      this.baseBuildCount++;
      this.staticKey = staticKey;
    }

    // The revealed map as a soft mask (rebuilt only when the revealed cells change).
    {
      const bits = new Uint8Array(width * height);
      let same = bits.length === this.knownBits.length;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const v = field.known.has(x + ',' + y) ? 1 : 0;
        bits[y * width + x] = v;
        if (same && this.knownBits[y * width + x] !== v) same = false;
      }
      if (!same || !this.knownMask) {
        const start = performance.now();
        this.knownBits = bits;
        this.knownMask = buildKnownMask(width, height, bits);
        this.lastBaseBuildMs = performance.now() - start;
        this.baseBuildCount++;
      }
    }

    // Rooms: entering rooms fade in and leaving rooms fade out as whole shapes.
    const wanted = new Map<string, DarknessRoom>();
    for (const room of field.litRooms ?? []) wanted.set(roomKey(room), room);
    if (newFloor) this.fades.clear();
    for (const [k, room] of wanted) {
      const f = this.fades.get(k);
      if (!f) {
        const entry: RoomFade = {room, level: fade && !newFloor ? 0 : 1, from: 0, to: 1, start: now, end: now};
        if (entry.level < 1) {
          entry.end = now + ROOM_FADE_MS;
          this.transition = {start: now, end: entry.end, progress: 0};
        }
        this.fades.set(k, entry);
      } else if (f.to !== 1) {
        f.from = f.level;
        f.to = 1;
        f.start = now;
        f.end = fade ? now + ROOM_FADE_MS : now;
        if (fade) this.transition = {start: now, end: f.end, progress: 0};
      }
    }
    for (const [k, f] of this.fades) {
      if (wanted.has(k) || f.to === 0) continue;
      f.from = f.level;
      f.to = 0;
      f.start = now;
      f.end = fade ? now + ROOM_FADE_MS : now;
      if (fade) this.transition = {start: now, end: f.end, progress: 0};
    }
    if (!fade) {
      for (const f of this.fades.values()) f.level = f.to;
      this.transition = {start: now, end: now, progress: 1};
    }

    this.syncTint(theme);
    this.syncBorder(theme, color, cellSize);
    this.update(now, field.lights);
  }

  update(time: number, lights?: readonly DarknessLight[]): void {
    if (!this.texture || !this.pixels) return;
    const drawStart = performance.now();
    if (lights) this.lights = lights.map(l => ({x: l.x, y: l.y, primary: l.primary}));
    let running = false, progress = 1;
    for (const [k, f] of [...this.fades]) {
      if (time >= f.end || f.end <= f.start) {
        f.level = f.to;
        if (f.to === 0) this.fades.delete(k);
      } else {
        const p = smoothstep((time - f.start) / (f.end - f.start));
        f.level = mix(f.from, f.to, p);
        running = true;
        progress = Math.min(progress, p);
      }
    }
    this.transition.progress = running ? progress : 1;
    composeMask(this.width, this.height, this.dark, [...this.fades.values()].map(f => ({room: f.room, level: f.level})), this.lights, this.staticMul, this.alpha, this.knownMask);
    const rgba = this.pixels.data;
    for (let i = 0; i < this.alpha.length; i++) rgba[i * 4 + 3] = this.alpha[i]! * 255 + .5;
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
    lights: {x: number; y: number; centerX: number; centerY: number; inner: number; outer: number; strength: number; primary: boolean}[];
    rooms: {x: number; y: number; w: number; h: number; level: number}[];
  } {
    return {
      baseBuildCount: this.baseBuildCount,
      baseBuildMs: this.lastBaseBuildMs,
      drawMs: this.lastDrawMs,
      transition: {...this.transition},
      lights: this.lights.map(l => ({x: l.x, y: l.y, centerX: l.x + .5, centerY: l.y + .5, inner: CIRCLE_INNER, outer: CIRCLE_OUTER, strength: 1, primary: l.primary})),
      rooms: [...this.fades.values()].map(f => ({...f.room, level: f.level})),
    };
  }

  /** The mask alpha (0..1) at a point given in cells (the centre of cell (3,2) is 3.5, 2.5); used by the browser checks. */
  alphaAt(x: number, y: number): number {
    const S = SAMPLES_PER_CELL, px = Math.min(this.width * S - 1, Math.max(0, Math.floor(x * S))), py = Math.min(this.height * S - 1, Math.max(0, Math.floor(y * S)));
    return this.alpha[py * this.width * S + px] ?? 0;
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
    this.tint = undefined;
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
