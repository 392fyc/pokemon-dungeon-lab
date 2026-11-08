import type Phaser from 'phaser';
import index from './characters.json';
import {WILD_SPECIES,BOSS,generateChallengeEncounter,plannedEnemySpecies} from '../core/dungeon.ts';
import type {World} from '../core/engine.ts';
import {SPECIES,BOSS_SPECIES} from '../core/roster.ts';
import {preloadDtef} from './dtef-scene.ts';
import {ITEM_ICON_KEYS,ROOM_PROP_KEYS} from './item-icons.ts';
import {buildAtlas,buildFloorTexture,type TerrainThemeKey,type TerrainLayer,type PixelTexture} from './terrain.ts';
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
/** SpriteCollab's idle ground baseline is four source pixels below the frame centre; actions keep their authored motion around it. */
export const groundOriginY=(dex:string,name:string):number=>{const meta=sheet(dex,name);return meta?.h ? .5+4/meta.h : .5;};
/** Sprites, their ground shadow and the leader ring share this cell-relative anchor. */
export const UNIT_GROUND_FRACTION=.3;
export const animKey = (dex:string, name:string, row:number) => `${dex}-${name}-${row}`;
export function preloadArt(scene:Phaser.Scene):void {
  const base = 'assets/'; // relative to the page, so the private build works from any folder
  scene.load.image('floor', base + 'tiles/floor-stone.png');
  // 7.3 theme tiles (named by the key the renderer asks for); a missing file only means the stone tile is tinted instead.
  for (const t of ['floor-wet', 'wall-wet', 'floor-ash', 'wall-basalt', 'floor-arena']) scene.load.image(t, base + `tiles/${t}.png`);
  scene.load.image('wall', base + 'tiles/wall-rock.png');
  for (const theme of ['moss', 'wet', 'ash'])
    scene.load.atlas(`deco-${theme}`, base + `tiles/deco/deco-${theme}.png`, base + `tiles/deco/deco-${theme}.json`);
  preloadDtef(scene, base);
  scene.load.image('exit', base + 'tiles/marker-exit.png');
  scene.load.image('goal', base + 'props/marker-goal.png');
  scene.load.image('item', base + 'props/marker-item.png');
  scene.load.image('stairs-down', base + 'tiles/stairs-down.png');
  scene.load.image('stairs-up', base + 'tiles/stairs-up.png');
  for (const key of ITEM_ICON_KEYS) scene.load.image(key, base + `props/${key}.png`);
  for (const key of ROOM_PROP_KEYS) scene.load.image(key, base + `props/${key}.png`);
  for (const fx of ['strong', 'line', 'guard', 'push', 'heal']) scene.load.image('fx-' + fx, base + `effects/fx-${fx}.png`);
  // Character sheets are not loaded here: ensureCharacters() fetches only the species a floor can show (a lazy-loading pass of the kind Pokémon Mystery Dungeon uses per dungeon).
}
/** The four actions the board plays for every species. */
const ACTIONS=['Idle','Walk','Attack','Hurt'] as const;
const built=new Set<string>(),failed=new Set<string>(),queued=new Set<string>();
let chain:Promise<void>=Promise.resolve();
/** One animation per species, action and direction; AnimData durations count 1/60 s frames. Only actions whose sheet really loaded get animations. */
function createAnimsFor(scene:Phaser.Scene,dex:string):void {
  for (const [name, m] of Object.entries(CHARACTERS[dex] ?? {})) {
    if (!scene.textures.exists(`${dex}-${name}`)) continue;
    for (let row = 0; row < 8; row++) {
      const k = animKey(dex, name, row);
      if (scene.anims.exists(k)) continue;
      scene.anims.create({key:k, repeat:name === 'Idle' || name === 'Walk' ? -1 : 0,
        frames:m.durations.map((d, i) => ({key:`${dex}-${name}`, frame:row * m.durations.length + i, duration:d * 1000 / 60}))});
    }
  }
}
/** True when every sheet of this species is loaded and animated, or it can never load (a file really missing). */
export const characterReady = (dex:string):boolean => !CHARACTERS[dex] || built.has(dex) || failed.has(dex);
/** True only for a species whose files were refused (not found, unreadable): its units get a placeholder for good. A slow load is not a failure and is retried. */
export const characterFailed = (dex:string):boolean => failed.has(dex);
/** True while character sheets are being fetched (browser checks wait for it before reading the board). */
export const charactersPending = ():boolean => queued.size > 0;
/** Textures a unit really has; a species whose Idle sheet is not there is not drawn as a sprite. */
export const characterDrawable = (scene:Phaser.Scene, dex:string):boolean => scene.textures.exists(`${dex}-Idle`);
/**
 * Loads the four action sheets of each given species once, in one queue (batches never overlap), then builds their animations.
 * Resolves when everything asked for so far is ready, refused or timed out; never rejects. A species whose file the server refused is marked failed;
 * one that merely took longer than 15 s is NOT marked, so the next request tries again.
 */
export function ensureCharacters(scene:Phaser.Scene, dexes:Iterable<string>):Promise<void> {
  const todo = [...new Set(dexes)].filter(d => CHARACTERS[d] && !built.has(d) && !failed.has(d) && !queued.has(d));
  if (!todo.length) return chain;
  todo.forEach(d => queued.add(d));
  const base = 'assets/';
  chain = chain.then(() => new Promise<void>(resolve => {
    let settled = false;
    const refused = new Set<string>();
    const onError = (file:{key:string}) => refused.add(file.key);
    const done = () => {
      if (settled) return; settled = true; clearTimeout(timer);
      scene.load.off('complete', done); scene.load.off('loaderror', onError);
      for (const d of todo) {
        createAnimsFor(scene, d);
        const all = ACTIONS.every(a => !CHARACTERS[d][a] || scene.textures.exists(`${d}-${a}`));
        if (all) built.add(d);
        else if (ACTIONS.some(a => refused.has(`${d}-${a}`))) failed.add(d);   // refused by the server: no point asking again
        queued.delete(d);   // otherwise (timeout): left open, the next request retries
      }
      resolve();
    };
    const timer = setTimeout(done, 15000);
    scene.load.on('loaderror', onError);
    let added = 0;
    for (const d of todo) for (const name of ACTIONS) {
      const m = CHARACTERS[d][name]; if (!m || scene.textures.exists(`${d}-${name}`)) continue;
      scene.load.spritesheet(`${d}-${name}`, base + m.file, {frameWidth:m.w, frameHeight:m.h}); added++;
    }
    if (!added) { done(); return; }
    scene.load.once('complete', done);
    scene.load.start();
  }));
  return chain;
}
/** Sheets a world can show now: every unit on the floor, the evolutions on offer and the challenge-room enemies. */
export function worldDex(s:World):string[] {
  const out = new Set<string>();
  for (const [id, u] of Object.entries(s.units)) out.add(skinFor(id, u.side, u.species));
  for (const e of s.pendingEvolutions ?? []) for (const c of e.choices) { const d = SPECIES[c]?.dex; if (d) out.add(d); }
  const d = s.dungeon;
  if (d?.roguelike) for (const room of s.adventureRooms ?? []) if (room.type === 'challenge' && room.state !== 'done' && room.state !== 'cleared') {
    try { for (const e of generateChallengeEncounter(d.seed, d.level, s.difficulty ?? 'normal', !!d.boss, d.tmPool).enemies) { const x = SPECIES[e.species]?.dex; if (x) out.add(x); } } catch { /* a floor without that encounter has nothing to preload */ }
  }
  return [...out].filter(x => CHARACTERS[x]);
}
/** The species the next floor will place, known from the dungeon seed alone, so they can be fetched while the player is still on this floor. */
export function nextFloorDex(s:World):string[] {
  const d = s.dungeon;
  if (!d?.roguelike || d.level >= d.floors) return [];
  const ids = plannedEnemySpecies(d.seed, d.level + 1, !!d.boss);
  if (d.boss && d.level + 1 === d.floors) ids.push(BOSS.species);
  return ids.map(id => SPECIES[id]?.dex).filter((x):x is string => !!x && !!CHARACTERS[x]);
}

/** Generate each theme once, on first use. No downloaded atlas or canvas API is needed by the pure painter. */
export function createTerrainArt(scene:Phaser.Scene,theme:TerrainThemeKey):void {
  const install=(name:string,pixels:PixelTexture)=>{
    const texture=scene.textures.createCanvas(name,pixels.width,pixels.height);
    if(!texture)throw new Error(`无法创建地形纹理：${name}`);
    const ctx=texture.getContext(),data=ctx.createImageData(pixels.width,pixels.height);
    data.data.set(pixels.data);ctx.putImageData(data,0,0);texture.refresh();return texture;
  };
  const floorKey=`terrain-${theme}-floor`;
  if(!scene.textures.exists(floorKey)){
    const texture=install(floorKey,buildFloorTexture(theme));
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)texture.add(`${x},${y}`,0,x*TILE,y*TILE,TILE,TILE);
  }
  for(const layer of ['edge','liquid','wall'] as const){
    const name=`terrain-${theme}-${layer}`;if(scene.textures.exists(name))continue;
    const pixels=buildAtlas(theme,layer),texture=install(name,pixels);
    for(let variant=0;variant<pixels.height/(6*TILE);variant++)for(let frame=0;frame<47;frame++)
      texture.add(`v${variant}-f${frame}`,0,(frame%8)*TILE,(variant*6+Math.floor(frame/8))*TILE,TILE,TILE);
  }
}

/** Developer-only single-file export; the browser downloads exactly the runtime texture used on screen. */
export function exportTerrainArt(scene:Phaser.Scene,theme:TerrainThemeKey,layer:TerrainLayer|'floor'):void {
  createTerrainArt(scene,theme);
  const texture=scene.textures.get(`terrain-${theme}-${layer}`) as Phaser.Textures.CanvasTexture;
  const a=document.createElement('a');a.href=texture.getCanvas().toDataURL('image/png');
  a.download=`terrain-${theme}-${layer}.png`;a.click();
}
