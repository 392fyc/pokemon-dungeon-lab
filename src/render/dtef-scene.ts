import type Phaser from 'phaser';
import {DTEF_CONFIG, DTEF_TILE, animationFrame, dtefFiles, dtefTextureKey, planDtefTerrain, tileRect, type DtefAnimation} from './dtef.ts';
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
