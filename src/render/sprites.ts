import Phaser from 'phaser';
import index from './characters.json';
import {WILD_SPECIES} from '../core/dungeon.ts';
import {SPECIES,BOSS_SPECIES} from '../core/roster.ts';
/** Character sheets come from SpriteCollab and tiles from tools/art; provenance is in public/assets/manifest.json. */
type AnimMeta = {file:string;w:number;h:number;durations:number[]};
const CHARACTERS = index as Record<string, Record<string, AnimMeta>>;
export const TILE = 24;
/** Trial-only skins: which species draws each fixture unit. Stage 6.2 replaces this with roster data. */
const SKINS: Record<string, string> = {A:'0004', B:'0007', C:'0001', N:'0074', N1:'0074', N2:'0074', Q:'0025', D:'0016', E:'0019', R:'0021', H:'0041'};
export const skinFor = (id:string, side:'friend'|'enemy', species?:string) => (species && (SPECIES[species]?.dex ?? WILD_SPECIES[species] ?? BOSS_SPECIES[species])) || SKINS[id] || (side === 'enemy' ? '0019' : '0074');
/** Sheet rows follow the PMD order: down, down-right, right, up-right, up, up-left, left, down-left. */
export function facingRow(dx:number, dy:number):number {
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const rows: Record<string, number> = {'0,1':0, '1,1':1, '1,0':2, '1,-1':3, '0,-1':4, '-1,-1':5, '-1,0':6, '-1,1':7};
  return rows[`${sx},${sy}`] ?? 0;
}
/** Sheet metadata (frame size and per-frame durations in 1/60 s), or undefined when a species lacks that action. */
export const sheet = (dex:string, name:string):AnimMeta|undefined => CHARACTERS[dex]?.[name];
export const animKey = (dex:string, name:string, row:number) => `${dex}-${name}-${row}`;
export function preloadArt(scene:Phaser.Scene):void {
  const base = 'assets/'; // relative to the page, so the private build works from any folder
  scene.load.image('floor', base + 'tiles/floor-stone.png');
  // 7.3 theme tiles (named by the key the renderer asks for); a missing file only means the stone tile is tinted instead.
  for (const t of ['floor-wet', 'wall-wet', 'floor-ash', 'wall-basalt', 'floor-arena']) scene.load.image(t, base + `tiles/${t}.png`);
  scene.load.image('wall', base + 'tiles/wall-rock.png');
  scene.load.image('exit', base + 'tiles/marker-exit.png');
  scene.load.image('goal', base + 'props/marker-goal.png');
  scene.load.image('item', base + 'props/marker-item.png');
  scene.load.image('stairs-down', base + 'tiles/stairs-down.png');
  scene.load.image('stairs-up', base + 'tiles/stairs-up.png');
  scene.load.image('item-berry', base + 'props/item-berry.png');
  scene.load.image('item-tonic', base + 'props/item-tonic.png');
  for (const fx of ['strong', 'line', 'guard', 'push', 'heal']) scene.load.image('fx-' + fx, base + `effects/fx-${fx}.png`);
  for (const [dex, anims] of Object.entries(CHARACTERS))
    for (const [name, m] of Object.entries(anims)) scene.load.spritesheet(`${dex}-${name}`, base + m.file, {frameWidth:m.w, frameHeight:m.h});
}
/** One animation per species, action and direction; AnimData durations count 1/60 s frames. */
export function createAnims(scene:Phaser.Scene):void {
  for (const [dex, anims] of Object.entries(CHARACTERS))
    for (const [name, m] of Object.entries(anims))
      for (let row = 0; row < 8; row++)
        scene.anims.create({key:animKey(dex, name, row), repeat:name === 'Idle' || name === 'Walk' ? -1 : 0,
          frames:m.durations.map((d, i) => ({key:`${dex}-${name}`, frame:row * m.durations.length + i, duration:d * 1000 / 60}))});
}
