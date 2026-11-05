import type Phaser from 'phaser';
import {DTEF_CONFIG, DTEF_TILE, animationFrame, dtefFiles, dtefTextureKey, dtefSlot, planDtefTerrain, tileId, tileRect, WALL, type DtefAnimation, type DtefCell} from './dtef.ts';
import type {TerrainMapInput, TerrainThemeKey} from './terrain.ts';

/** Queue every DTEF sheet and animation frame (about 100 small PNGs, private build). */
export function preloadDtef(scene: Phaser.Scene, base: string): void {
  for (const theme of Object.values(DTEF_CONFIG.themes))
    for (const file of dtefFiles(theme)) scene.load.image(dtefTextureKey(theme, file), `${base}tiles/dtef/${theme.set}/${file}`);
}
const prepared = new WeakSet<Phaser.Textures.Texture>();
/** Tile frames are named by tile id (segment * 48 + slot); cut once per texture. */
function cutFrames(texture: Phaser.Textures.Texture): void {
  if (prepared.has(texture)) return;
  for (let id = 0; id < 144; id++) { const r = tileRect(id); texture.add(String(id), 0, r.x, r.y, DTEF_TILE, DTEF_TILE); }
  prepared.add(texture);
}
export type DtefAnimator = {update(ms: number): void; count: number};
type Overlay = {image: Phaser.GameObjects.Image; anim: DtefAnimation; id: number; shown: number};

/** Draws every revealed cell; returns the animator that swaps overlay frames. Images are pushed to `push` so the scene can destroy them on repaint. */
export function paintDtef(scene: Phaser.Scene, args: {
  map: TerrainMapInput; theme: TerrainThemeKey; seed: number; level: number; scale: number; frozen: boolean;
  center: (p: {x: number; y: number}) => {x: number; y: number}; push: (image: Phaser.GameObjects.Image) => void;
}): DtefAnimator {
  const theme = DTEF_CONFIG.themes[args.theme], overlays: Overlay[] = [];
  const texture = (file: string) => { const t = scene.textures.get(dtefTextureKey(theme, file)); cutFrames(t); return t.key; };
  for (const cell of planDtefTerrain(args.map, args.theme, args.seed, args.level)) {
    const c = args.center(cell);
    args.push(scene.add.image(c.x, c.y, texture(theme.variants[cell.variant]!.file), String(cell.id)).setScale(args.scale).setDepth(1));
    cell.overlays.forEach((anim, i) => {
      const image = scene.add.image(c.x, c.y, texture(anim.frames[0]!), String(cell.id)).setScale(args.scale).setDepth(1.01 + i / 100);
      args.push(image); overlays.push({image, anim, id: cell.id, shown: 0});
    });
  }
  return {
    count: overlays.length,
    update(ms) {
      if (args.frozen) return;
      for (const o of overlays) {
        if (!o.image.active) continue; // destroyed by a repaint: never touch it
        const f = animationFrame(o.anim, ms);
        if (f !== o.shown) { o.shown = f; o.image.setTexture(texture(o.anim.frames[f]!), String(o.id)); }
      }
    },
  };
}

export type DtefTerrainArgs = {
  map: TerrainMapInput; theme: TerrainThemeKey; seed: number; level: number; scale: number; frozen: boolean;
  center: (p: {x: number; y: number}) => {x: number; y: number};
};
type PersistentOverlay = {image: Phaser.GameObjects.Image; anim: DtefAnimation; shown: number};
type PersistentCell = {cell: DtefCell; signature: string; base: Phaser.GameObjects.Image; overlays: PersistentOverlay[]};
type RGB = readonly [number, number, number];
const UNDERLAY_MARGIN_TILES = 64;
const wallColors = new Map<string, RGB>();

function wallColorFor(scene: Phaser.Scene, themeKey: TerrainThemeKey): RGB {
  const theme = DTEF_CONFIG.themes[themeKey], file = theme.variants[0]!.file;
  const cacheKey = dtefTextureKey(theme, file), cached = wallColors.get(cacheKey);
  if (cached) return cached;
  const texture = scene.textures.get(cacheKey);
  cutFrames(texture);
  const frameId = tileId(WALL, dtefSlot(255)), frame = texture.get(String(frameId));
  const source = texture.getSourceImage(String(frameId)) as unknown as CanvasImageSource;
  const canvas = document.createElement('canvas');
  canvas.width = DTEF_TILE; canvas.height = DTEF_TILE;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('Cannot read DTEF wall pixels: 2D canvas is unavailable');
  context.drawImage(source, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, DTEF_TILE, DTEF_TILE);
  const pixels = context.getImageData(0, 0, DTEF_TILE, DTEF_TILE).data;
  let r = 0, g = 0, b = 0, alpha = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]! / 255;
    if (a === 0) continue;
    r += pixels[i]! * a; g += pixels[i + 1]! * a; b += pixels[i + 2]! * a; alpha += a;
  }
  const color: RGB = alpha ? [Math.round(r / alpha), Math.round(g / alpha), Math.round(b / alpha)] : [0, 0, 0];
  wallColors.set(cacheKey, color);
  return color;
}

function cellSignature(cell: DtefCell, theme: TerrainThemeKey): string {
  return JSON.stringify([theme, cell.kind, cell.slot, cell.variant, cell.id,
    cell.overlays.map((anim) => [anim.variant, anim.layer, anim.ticks, anim.frames, anim.tiles])]);
}

/** A repeated center-wall backdrop plus persistent sprites for the cells planDtefTerrain reveals. */
export class DtefTerrainLayer {
  private floorKey: string | null = null;
  private underlay: Phaser.GameObjects.TileSprite | null = null;
  private cells = new Map<string, PersistentCell>();
  private imageList: Phaser.GameObjects.Image[] = [];
  private themeKey: TerrainThemeKey | null = null;
  private currentWallColor: RGB = [0, 0, 0];
  private frozen = false;
  private buildCount = 0;
  private changedCells = 0;
  private underlayColumns = 0;
  private underlayRows = 0;

  private readonly scene: Phaser.Scene;
  constructor(scene: Phaser.Scene) { this.scene = scene; }

  get images(): readonly Phaser.GameObjects.Image[] { return this.imageList; }
  wallColor(): readonly [number, number, number] { return this.currentWallColor; }

  show(floorKey: string, args: DtefTerrainArgs): void {
    if (floorKey !== this.floorKey) {
      this.destroyLayer();
      this.floorKey = floorKey;
    }
    this.changedCells = 0;
    this.frozen = args.frozen;
    this.themeKey = args.theme;
    this.currentWallColor = wallColorFor(this.scene, args.theme);

    const theme = DTEF_CONFIG.themes[args.theme];
    const underlayTexture = this.texture(theme.variants[0]!.file);
    const underlayFrame = String(tileId(WALL, dtefSlot(255)));
    if (!this.underlay || !this.underlay.active) {
      this.underlay = this.scene.add.tileSprite(0, 0, 1, 1, underlayTexture, underlayFrame).setDepth(0.5);
      this.buildCount++;
    } else if (this.underlay.texture.key !== underlayTexture || this.underlay.frame.name !== underlayFrame) {
      this.underlay.setTexture(underlayTexture, underlayFrame);
    }
    this.positionUnderlay(args);

    const planned = planDtefTerrain(args.map, args.theme, args.seed, args.level);
    const wanted = new Map(planned.map((cell) => [String(cell.x) + ',' + String(cell.y), cell] as const));
    for (const [key, current] of this.cells) {
      if (wanted.has(key)) continue;
      this.destroyCell(current); this.cells.delete(key); this.changedCells++;
    }
    for (const [key, cell] of wanted) {
      const signature = cellSignature(cell, args.theme), current = this.cells.get(key);
      if (!current || current.signature !== signature) {
        if (current) this.destroyCell(current);
        this.cells.set(key, this.createCell(cell, signature, args)); this.changedCells++;
      } else this.placeCell(current, args);
    }
    this.rebuildImageList();
  }

  update(ms: number): void {
    if (this.frozen || !this.themeKey) return;
    for (const cell of this.cells.values()) for (const overlay of cell.overlays) {
      if (!overlay.image.active) continue;
      const frame = animationFrame(overlay.anim, ms);
      if (frame === overlay.shown) continue;
      overlay.shown = frame;
      overlay.image.setTexture(this.texture(overlay.anim.frames[frame]!), String(cell.cell.id));
    }
  }

  clear(): void {
    this.destroyLayer();
    this.floorKey = null; this.themeKey = null; this.currentWallColor = [0, 0, 0]; this.frozen = false;
    this.changedCells = 0; this.underlayColumns = 0; this.underlayRows = 0;
  }

  debug(): {
    floorKey: string | null; buildCount: number; changedCells: number;
    underlay: null | {type: 'TileSprite'; width: number; height: number; columns: number; rows: number; cells: number; marginTiles: number; texture: string; frame: string};
    tileCount: number; overlayCount: number; imageCount: number;
  } {
    const underlay = this.underlay, columns = this.underlayColumns, rows = this.underlayRows;
    return {
      floorKey: this.floorKey, buildCount: this.buildCount, changedCells: this.changedCells,
      underlay: underlay ? {
        type: 'TileSprite', width: underlay.width, height: underlay.height, columns, rows,
        cells: columns * rows, marginTiles: UNDERLAY_MARGIN_TILES, texture: underlay.texture.key, frame: underlay.frame.name,
      } : null,
      tileCount: this.cells.size,
      overlayCount: Array.from(this.cells.values()).reduce((sum, cell) => sum + cell.overlays.length, 0),
      imageCount: this.imageList.length,
    };
  }

  private texture(file: string): string {
    const theme = DTEF_CONFIG.themes[this.themeKey!], texture = this.scene.textures.get(dtefTextureKey(theme, file));
    cutFrames(texture); return texture.key;
  }

  private positionUnderlay(args: DtefTerrainArgs): void {
    const map = args.map, first = args.center({x: 0, y: 0}), last = args.center({x: map.width - 1, y: map.height - 1});
    const tileSize = DTEF_TILE * args.scale;
    const columns = Math.max(1, Math.trunc(map.width)) + UNDERLAY_MARGIN_TILES * 2;
    const rows = Math.max(1, Math.trunc(map.height)) + UNDERLAY_MARGIN_TILES * 2;
    this.underlayColumns = columns; this.underlayRows = rows;
    this.underlay!
      .setPosition((first.x + last.x) / 2, (first.y + last.y) / 2)
      .setSize(columns * tileSize, rows * tileSize)
      .setTileScale(args.scale);
  }

  private createCell(cell: DtefCell, signature: string, args: DtefTerrainArgs): PersistentCell {
    const theme = DTEF_CONFIG.themes[args.theme], center = args.center(cell);
    const base = this.scene.add.image(center.x, center.y, this.texture(theme.variants[cell.variant]!.file), String(cell.id))
      .setScale(args.scale).setDepth(1);
    const overlays = cell.overlays.map((anim, index) => {
      const image = this.scene.add.image(center.x, center.y, this.texture(anim.frames[0]!), String(cell.id))
        .setScale(args.scale).setDepth(1.01 + index / 100);
      return {image, anim, shown: 0};
    });
    return {cell, signature, base, overlays};
  }

  private placeCell(display: PersistentCell, args: DtefTerrainArgs): void {
    const center = args.center(display.cell);
    display.base.setPosition(center.x, center.y).setScale(args.scale);
    for (const overlay of display.overlays) overlay.image.setPosition(center.x, center.y).setScale(args.scale);
  }

  private destroyCell(cell: PersistentCell): void {
    cell.base.destroy();
    for (const overlay of cell.overlays) overlay.image.destroy();
  }

  private destroyLayer(): void {
    for (const cell of this.cells.values()) this.destroyCell(cell);
    this.cells.clear(); this.imageList = [];
    this.underlay?.destroy(); this.underlay = null;
  }

  private rebuildImageList(): void {
    const list: Phaser.GameObjects.Image[] = [];
    for (const cell of this.cells.values()) {
      list.push(cell.base);
      for (const overlay of cell.overlays) list.push(overlay.image);
    }
    this.imageList = list;
  }
}
