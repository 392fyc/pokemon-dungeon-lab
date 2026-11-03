import type Phaser from 'phaser';
import type {TerrainThemeKey} from './terrain.ts';

const SAMPLES_PER_CELL = 4;
const FADE_MS = 240;
const UNKNOWN_DARKNESS = .82;
export const BOARD_BACKGROUND = 0x101c1b;
const TINT: Record<TerrainThemeKey, readonly [number, number, number]> = {
  moss: [20, 32, 26],
  wet: [20, 32, 48],
  ash: [49, 25, 24],
};

export type DarknessLight = {x: number; y: number; primary: boolean; fire: boolean};
type Field = {
  width: number;
  height: number;
  known: ReadonlySet<string>;
  visible: ReadonlySet<string>;
  lights: readonly DarknessLight[];
};

const smooth = (n: number) => n * n * (3 - 2 * n);
const mix = (a: number, b: number, n: number) => a + (b - a) * n;

export function darknessBackground(theme: TerrainThemeKey): number {
  return TINT[theme].reduce((color, target, channel) => {
    const base = (BOARD_BACKGROUND >> ((2 - channel) * 8)) & 255;
    return (color << 8) + Math.round(mix(base, target, UNKNOWN_DARKNESS));
  }, 0);
}

/** Builds a texture from revealed coordinates and party lights, without reading actual terrain. */
export function buildDarkness({width, height, known, visible, lights}: Field): Uint8ClampedArray {
  const cells = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const key = x + ',' + y;
    cells[y * width + x] = !known.has(key) ? UNKNOWN_DARKNESS : visible.has(key) ? 0 : .58;
  }
  const sample = (x: number, y: number) =>
    cells[Math.max(0, Math.min(y, height - 1)) * width + Math.max(0, Math.min(x, width - 1))]!;
  const sources = lights.map(light => ({
    x: light.x + .5, y: light.y + .5,
    inner: light.primary ? (light.fire ? 1.3 : .9) : (light.fire ? .95 : .55),
    outer: light.primary ? (light.fire ? 2.8 : 1.95) : (light.fire ? 2.25 : 1.45),
    strength: light.primary ? 1 : light.fire ? .85 : .8,
  }));
  const stride = width * SAMPLES_PER_CELL;
  const opacity = new Uint8ClampedArray(stride * height * SAMPLES_PER_CELL);
  for (let py = 0; py < height * SAMPLES_PER_CELL; py++) for (let px = 0; px < stride; px++) {
    const x = (px + .5) / SAMPLES_PER_CELL, y = (py + .5) / SAMPLES_PER_CELL;
    const gx = Math.floor(x - .5), gy = Math.floor(y - .5);
    const tx = smooth(x - .5 - gx), ty = smooth(y - .5 - gy);
    let alpha = mix(mix(sample(gx, gy), sample(gx + 1, gy), tx),
      mix(sample(gx, gy + 1), sample(gx + 1, gy + 1), tx), ty);
    if (known.has(Math.floor(x) + ',' + Math.floor(y))) for (const light of sources) {
      const distance = Math.hypot(x - light.x, y - light.y);
      const edge = Math.max(0, Math.min(1, (distance - light.inner) / (light.outer - light.inner)));
      alpha *= 1 - light.strength * (1 - smooth(edge));
    }
    opacity[py * stride + px] = alpha * 255;
  }
  return opacity;
}

const textureKey = 'dungeon-darkness';

export class DungeonDarkness {
  private floor = '';
  private texture?: Phaser.Textures.CanvasTexture;
  private image?: Phaser.GameObjects.Image;
  private pixels?: ImageData;
  private target?: Uint8ClampedArray;
  private from?: Uint8ClampedArray;
  private changedAt = 0;

  constructor(private scene: Phaser.Scene, private filter: Phaser.Textures.FilterMode) {}

  clear(): void {
    this.image?.destroy();
    if (this.texture) this.scene.textures.remove(textureKey);
    this.image = this.texture = this.pixels = this.target = this.from = undefined;
    this.floor = '';
  }

  show(floor: string, theme: TerrainThemeKey, cellSize: number, field: Field, animate: boolean): void {
    const {width, height} = field;
    const next = buildDarkness(field);
    if (this.floor !== floor) {
      this.clear();
      const texture = this.scene.textures.createCanvas(textureKey, width * SAMPLES_PER_CELL, height * SAMPLES_PER_CELL);
      if (!texture) return;
      this.floor = floor;
      this.texture = texture;
      this.pixels = texture.getContext().createImageData(texture.width, texture.height);
      const [r, g, b] = TINT[theme];
      const rgba = this.pixels.data;
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b;
      }
      this.image = this.scene.add.image(0, 0, textureKey).setOrigin(0).setDepth(7)
        .setDisplaySize(width * cellSize, height * cellSize);
    }
    if (animate && this.target?.every((a, i) => a === next[i])) return;
    const now = this.scene.time.now;
    this.update(now);
    if (animate && this.target && this.pixels) {
      this.from = this.pixels.data.filter((_, i) => i % 4 === 3);
      this.changedAt = now;
    } else {
      this.from = undefined;
    }
    this.target = next;
    if (!this.from) this.draw(1);
  }

  update(time: number): void {
    if (!this.from) return;
    const elapsed = Math.max(0, Math.min(1, (time - this.changedAt) / FADE_MS));
    this.draw(smooth(elapsed));
    if (elapsed === 1) this.from = undefined;
  }

  private draw(progress: number): void {
    if (!this.target || !this.texture || !this.pixels) return;
    const rgba = this.pixels.data;
    for (let i = 0; i < this.target.length; i++) {
      const alpha = this.target[i]!;
      rgba[i * 4 + 3] = this.from ? mix(this.from[i]!, alpha, progress) : alpha;
    }
    this.texture.getContext().putImageData(this.pixels, 0, 0);
    this.texture.refresh();
    // Phaser's WebGL refresh restores the game's nearest filter on canvas uploads.
    this.texture.setFilter(this.filter);
  }
}
