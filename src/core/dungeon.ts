/**
 * 6.3 seeded floor generator. Pure functions, no engine import at run time (type-free on purpose):
 * the same (seed, level, params) always returns byte-identical data, whatever order floors are visited in.
 * Rooms-and-corridors layout; every floor cell is connected by construction (see tests/core/dungeon.test.mjs).
 * All numbers below are WORKING CANDIDATES (map size, room counts, enemy counts, enemy stats), not final balance.
 */
export type Cell={x:number;y:number};
/** `boss` (7.3): themed floors, the new enemy pools and a regional boss on the last floor. */
export type FloorParams={width:number;height:number;floors:number;boss?:boolean;roguelike?:true;difficulty?:Difficulty;enemySleepChance?:number};
export const DEFAULT_PARAMS:FloorParams={width:36,height:24,floors:3,boss:true,roguelike:true};
import {ECON} from './economy.ts';
import {SPECIES,BOSS_CONFIG,speciesMaxHp,bossMaxHp,tmPool} from './roster.ts';
import rooms83 from '../data/rooms-83.json' with {type:'json'};
import terrainThemesJson from '../data/terrain-themes.json' with {type:'json'};
export {BOSS_CONFIG} from './roster.ts';
export type PointKind='goal'|'item'|'exit'|'down'|'up'|'berry'|'tonic'|'pechaBerry'|'rawstBerry'|'cheriBerry'|'chestoBerry'|'healSeed'|'slumberOrb'|'totterOrb'|'luminousOrb'|'rollcallOrb'|'rest'|'shop'|'exchange';
/** 8.8 (#165, G3.x): what a floor item point holds, with its weight in percent (WORKING CANDIDATE). */
export const FLOOR_ITEM_WEIGHTS:readonly (readonly [PointKind,number])[]=[['berry',35],['healSeed',13],['pechaBerry',8],['rawstBerry',8],['cheriBerry',8],['chestoBerry',8],['slumberOrb',5],['totterOrb',5],['luminousOrb',5],['rollcallOrb',5]];
export type PointSpec={pos:Cell;kind:PointKind;used:boolean};
export type EnemySpec={id:string;species:string;level:number;hp:number;pos:Cell;post?:Cell;boss?:true;asleep?:boolean};
export type Room={x:number;y:number;w:number;h:number};
export type AdventureRoomType='challenge'|'commission'|'blessing'|'item';
export type AdventureRoomState='idle'|'sealed'|'cleared'|'done';
type LegacyAdventureItemId='bigBerry'|'teamTonic';
export type AdventureItemId=LegacyAdventureItemId|'violentSeed'|'maxElixir'|'slumberOrb'|'totterOrb'|'luminousOrb'|'rollcallOrb'|'reviverSeed';
export type ChallengeRewardType='currency'|'item'|'invite'|'tm'|'blessing';
export type AdventureRoom={room:number;type:AdventureRoomType;state:AdventureRoomState;interaction:Cell;doors:Cell[];sealedCells:Cell[];
  enemyIds:string[];reward:ChallengeRewardType|null;rewardCurrency:number|null;item:AdventureItemId|null;rewardItem:AdventureItemId|null;rewardMove:string|null};
export type ChallengeEnemySpec=Omit<EnemySpec,'pos'|'post'|'boss'> & {asleep:false};
export type ChallengeEncounter={enemies:ChallengeEnemySpec[];reward:ChallengeRewardType;rewardItem:AdventureItemId|null;rewardMove:string|null;currencyAmount:number};
export type GeneratedFloor={level:number;width:number;height:number;floor:Cell[];rooms:Room[];
  /** Accepted room-to-room routes. `path` is the ordered list of 2x2 brush top-left cells, including both anchors. */
  corridors:{fromRoom:number;toRoom:number;path:Cell[]}[];
  /** 仅供生成验收诊断；不进入运行世界或营地存档。 */
  generationStats:{layoutAttempts:number;connectionRetries:number;shapeRetries:number;liquidRetries:number;liquidLayoutRetries:number};
  /** Non-walkable second terrain, generated only on cells that are not floor. */
  liquid:Cell[];
  /** Where the team first arrives from outside or from the floor above. */
  arrivalRoom:number;arrival:Cell;up:Cell|null;down:Cell|null;points:PointSpec[];enemies:EnemySpec[];enemyAiRng:number;
  /** 6.4 recovery pickups (berry on every floor, tonic on floor 2). Kept apart from `points` and drawn from their own random stream, so the layout above is unchanged. */
  pickups:PointSpec[];
  /** 6.5 one-use rest point, floor 2 only, in the arrival room next to the up stairs. Kept apart from `pickups` and `points` so those lists are unchanged. */
  rest:PointSpec|null;
  /** 7.2 rare service cells (shop, exchanger) of this floor, own random stream, never part of `points`. The caller adds them only for runs that carry the services. */
  services:PointSpec[];
  /** 7.3 (boss-marked runs only): the floor theme, and on the last floor the index of the boss room. Absent on developer expeditions without a boss. */
  theme?:ThemeId;bossRoom?:number;
  /** 8.3 run-only rooms. Absent for legacy floors so their generated shape and points stay unchanged. */
  adventureRooms?:AdventureRoom[];goalAnchor?:Cell};
export type ThemeId='moss'|'wet'|'ash';
export const INITIAL_LEVEL=5;
/** Difficulty multiplier on generated enemy HP and damage dealt by enemies. */
export type Difficulty='easy'|'normal'|'hard';
export const DIFFICULTY:Readonly<Record<Difficulty,number>>=Object.freeze({easy:0.28,normal:0.4,hard:0.56});
export const isDifficulty=(value:unknown):value is Difficulty=>typeof value==='string'&&Object.hasOwn(DIFFICULTY,value);
export const ENEMY_DIFFICULTY=DIFFICULTY.normal;
/** First-type partitions and level bands from the 7.8 working specification. */
export const THEME_FLOORS:{theme:ThemeId;name:string;types:string[];levels:[number,number];count:number;floorTile:string;wallTile:string}[]=[
  {theme:'moss',name:'苔石洞',types:['Normal','Grass','Bug','Rock','Ground','Flying'],levels:[5,6],count:6,floorTile:'floor-stone',wallTile:'wall-rock'},
  {theme:'wet',name:'潮湿水窟',types:['Water','Ice','Electric','Poison','Psychic','Fairy'],levels:[8,11],count:6,floorTile:'floor-wet',wallTile:'wall-wet'},
  {theme:'ash',name:'灰烬裂谷',types:['Fire','Fighting','Dark','Ghost','Dragon','Steel'],levels:[12,20],count:6,floorTile:'floor-ash',wallTile:'wall-basalt'},
];
export const themeOfLevel=(boss:boolean|undefined,level:number):ThemeId=>boss?THEME_FLOORS[Math.min(Math.max(level,1),THEME_FLOORS.length)-1].theme:'moss';
export const ARENA_TILE='floor-arena';
export const themeCandidates=(theme:ThemeId)=>Object.values(SPECIES).filter(sp=>sp.availability!=='暂不出场'&&!sp.legendary&&THEME_FLOORS.find(t=>t.theme===theme)!.types.includes(sp.types![0]));
export const eligibleSpecies=(level:number,boss=true):string[]=>{
  const config=THEME_FLOORS[boss?Math.min(Math.max(level,1),THEME_FLOORS.length)-1:0];
  return themeCandidates(config.theme).filter(sp=>sp.evoLevel<=config.levels[1]).map(sp=>sp.id);
};
export const WILD_SPECIES:Record<string,string>=Object.fromEntries([...new Set([...THEME_FLOORS.flatMap((_,i)=>eligibleSpecies(i+1)), 'geodude','pidgey','growlithe'])].map(id=>[id,SPECIES[id].dex]));
/** The ordinary enemies a floor will draw, from the same species stream as generateFloor (one draw per enemy slot), so the interface can preload their sprites before the floor exists. */
export function plannedEnemySpecies(seed:number,level:number,bossEnabled:boolean):string[] {
  const themed=THEME_FLOORS[bossEnabled?Math.min(Math.max(level,1),THEME_FLOORS.length)-1:0],pool=eligibleSpecies(level,bossEnabled);
  if(!pool.length)return [];
  const rng=mulberry32(streamSeed(seed,level,'enemy-species'));
  return Array.from({length:themed.count},()=>pool[Math.floor(rng()*pool.length)]);
}
/** Only identity lives here. All boss modifiers come from main-owned boss.json. */
export const BOSS={id:'boss',species:'arcanine'} as const;
export type EnemyStream='enemy-ai'|'enemy-level'|'enemy-species';
const STREAM_TAGS:Record<EnemyStream,number>={'enemy-ai':0xA24BAED5,'enemy-level':0x9FB21C65,'enemy-species':0xC13FA9A9};
export const streamSeed=(seed:number,level:number,tag:EnemyStream)=>(Math.imul(seed>>>0,0x9E3779B1)^Math.imul(level,0x85EBCA6B)^STREAM_TAGS[tag])>>>0;
export function mulberry32(seed:number):()=>number {
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
}
const k=(p:Cell)=>`${p.x},${p.y}`;
const dist=(a:Cell,b:Cell)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const DIRS:Cell[]=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
export const center=(r:Room):Cell=>({x:r.x+Math.floor(r.w/2),y:r.y+Math.floor(r.h/2)});
export const roomCells=(r:Room):Cell[]=>{const out:Cell[]=[];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)out.push({x,y});return out;};

/**
 * 7.3 boss room: the room (other than the first) whose centre is farthest by path from the first room's centre; ties go to the lower index (the same rule the down stairs use).
 * Exported so the renderer finds the same room from the saved `rooms` and floor cells.
 */
export function farthestRoom(rooms:Room[],walkable:Set<string>):number {
  const start=center(rooms[0]);const depth=new Map<string,number>([[k(start),0]]);const queue=[start];
  for(let n=0;n<queue.length;n++)for(const d of DIRS){const c={x:queue[n].x+d.x,y:queue[n].y+d.y};
    if(walkable.has(k(c))&&!depth.has(k(c))){depth.set(k(c),depth.get(k(queue[n]))!+1);queue.push(c);}}
  let best=-1,room=-1;rooms.forEach((r,n)=>{if(n===0)return;const dd=depth.get(k(center(r)));if(dd!==undefined&&dd>best){best=dd;room=n;}});
  return room;
}
/**
 * 7.2: which floor (if any) holds this run's shop and exchanger. Decided once from the seed alone, so it does not depend on the order floors are visited;
 * `tmDraw` in [0,1) picks the shop's technique machine. Always draws the same number of values, so one decision never shifts another.
 */
export type ServiceRoll={shop:{level:number;tmDraw:number}|null;exchange:{level:number}|null};
export function serviceRoll(seed:number,floors:number):ServiceRoll {
  const r=mulberry32((Math.imul(seed>>>0,0x2545F491)^0x7A3C1D55)>>>0);
  const shopOn=r()<ECON.shopChance,shopLevel=1+Math.floor(r()*Math.min(2,floors)),tmDraw=r();
  const exOn=r()<ECON.exchangeChance,exLevel=1+Math.floor(r()*floors);
  return {shop:shopOn?{level:shopLevel,tmDraw}:null,exchange:exOn?{level:exLevel}:null};
}
type Rooms83Data={roomTypeWeights:Record<AdventureRoomType,number>;challengeRewardWeights:Record<ChallengeRewardType,number>;
  itemWeights:Record<AdventureItemId,number>;roomItemWeights:Record<AdventureItemId,number>;challengeCurrencyAmount:number;
};
const ROOMS_83=rooms83 as Rooms83Data;
const ADVENTURE_STREAMS={roomItem:0x4C957F2D,challengeCount:0x165667B1,challengeSpecies:0x9E3779B9,
  challengeLevel:0x85EBCA6B,challengeReward:0xA511E9B3,challengeItem:0x63D83595,challengeMove:0xB7E15162} as const;
const adventureSeed=(seed:number,level:number,tag:number)=>(Math.imul(seed>>>0,0x9E3779B1)^Math.imul(level,0x85EBCA6B)^tag)>>>0;
const drawWeighted=<T extends string>(weights:Record<T,number>,random:()=>number):T=>{
  const entries=Object.entries(weights) as [T,number][];
  const total=entries.reduce((sum,[,weight])=>sum+weight,0);
  let roll=random()*total;
  for(const [value,weight] of entries){if(roll<weight)return value;roll-=weight;}
  return entries[entries.length-1][0];
};
const inRoom=(p:Cell,r:Room)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;
const isLargeRoom=(r:Room)=>r.w>=6&&r.h>=5;
type AdventureLayout={rooms:Room[];arrivalRoom:number;downRoom:number;bossRoom?:number;enemies:EnemySpec[];floor:Cell[];occupied:Set<string>};
/** The room assignment stream follows tools/verify/rooms-83.mjs exactly and never consumes the 8.2 streams. */
function makeAdventureRooms(seed:number,level:number,layout:AdventureLayout):AdventureRoom[]{
  const random=mulberry32((Math.imul(seed>>>0,0x27D4EB2F)^Math.imul(level,0x165667B1)^0x3C6EF372)>>>0);
  const fixedRooms=new Set(layout.enemies.filter(e=>e.post).map(e=>layout.rooms.findIndex(r=>inRoom(e.post!,r))).filter(i=>i>=0));
  const candidates=layout.rooms.map((_,i)=>i).filter(i=>i!==layout.arrivalRoom&&i!==layout.downRoom&&i!==layout.bossRoom&&!fixedRooms.has(i));
  const want=random()<0.5?2:3;
  const left=new Set(candidates),assigned:{room:number;type:AdventureRoomType}[]=[];
  for(let n=0;n<want&&left.size;n++){
    const large=[...left].filter(i=>isLargeRoom(layout.rooms[i]));
    const small=[...left].filter(i=>!isLargeRoom(layout.rooms[i]));
    const weights:Partial<Record<AdventureRoomType,number>>={...ROOMS_83.roomTypeWeights};
    if(assigned.some(a=>a.type==='challenge')||!large.length)delete weights.challenge;
    const entries=Object.entries(weights) as [AdventureRoomType,number][];
    const total=entries.reduce((sum,[,weight])=>sum+weight,0);
    let roll=random()*total,type=entries[entries.length-1][0];
    for(const [candidate,weight] of entries){if(roll<weight){type=candidate;break;}roll-=weight;}
    const pool=type==='challenge'?large:(small.length?small:large);
    const room=pool[Math.floor(random()*pool.length)];
    left.delete(room);assigned.push({room,type});
  }
  const walkable=new Set(layout.floor.map(k)),occupied=new Set(layout.occupied);
  const itemRandom=mulberry32(adventureSeed(seed,level,ADVENTURE_STREAMS.roomItem));
  return assigned.map(({room:roomIndex,type})=>{
    const room=layout.rooms[roomIndex],origin=center(room);
    const interaction=roomCells(room).filter(c=>!occupied.has(k(c)))
      .sort((a,b)=>dist(a,origin)-dist(b,origin)||a.y-b.y||a.x-b.x)[0];
    if(!interaction)throw new Error('adventure room has no free interaction cell');
    occupied.add(k(interaction));
    const doors=roomCells(room).filter(c=>DIRS.some(d=>{
      const outside={x:c.x+d.x,y:c.y+d.y};return !inRoom(outside,room)&&walkable.has(k(outside));
    })).map(c=>({x:c.x,y:c.y}));
    return {room:roomIndex,type,state:'idle',interaction:{x:interaction.x,y:interaction.y},doors,sealedCells:[],enemyIds:[],reward:null,rewardCurrency:null,
      item:type==='item'?drawWeighted(ROOMS_83.roomItemWeights,itemRandom):null,rewardItem:null,rewardMove:null};
  });
}
/** Pre-draw a challenge fight and its reward from streams independent of map, ordinary enemies, and expedition recruitment. */
export function generateChallengeEncounter(seed:number,level:number,difficulty:Difficulty,bossEnabled:boolean,tmPoolVersion?:3|4|5):ChallengeEncounter {
  const countRandom=mulberry32(adventureSeed(seed,level,ADVENTURE_STREAMS.challengeCount));
  const speciesRandom=mulberry32(adventureSeed(seed,level,ADVENTURE_STREAMS.challengeSpecies));
  const levelRandom=mulberry32(adventureSeed(seed,level,ADVENTURE_STREAMS.challengeLevel));
  const rewardRandom=mulberry32(adventureSeed(seed,level,ADVENTURE_STREAMS.challengeReward));
  const itemRandom=mulberry32(adventureSeed(seed,level,ADVENTURE_STREAMS.challengeItem));
  const moveRandom=mulberry32(adventureSeed(seed,level,ADVENTURE_STREAMS.challengeMove));
  const count=countRandom()<0.5?3:4;
  const themed=THEME_FLOORS[bossEnabled?Math.min(Math.max(level,1),THEME_FLOORS.length)-1:0];
  const speciesPool=eligibleSpecies(level,bossEnabled);
  if(!speciesPool.length)throw new Error('No eligible species for challenge on floor '+level);
  const multiplier=DIFFICULTY[difficulty]??DIFFICULTY.normal;
  const enemies:ChallengeEnemySpec[]=[];
  for(let n=0;n<count;n++){
    const species=speciesPool[Math.floor(speciesRandom()*speciesPool.length)];
    const lower=Math.max(themed.levels[0],SPECIES[species].evoLevel),upper=themed.levels[1];
    const enemyLevel=bossEnabled?lower+Math.floor(levelRandom()*(upper-lower+1)):INITIAL_LEVEL;
    enemies.push({id:'c'+level+'abcd'[n],species,level:enemyLevel,hp:speciesMaxHp(species,enemyLevel,multiplier),asleep:false});
  }
  const reward=drawWeighted(ROOMS_83.challengeRewardWeights,rewardRandom);
  const rewardItem=reward==='item'?drawWeighted(ROOMS_83.itemWeights,itemRandom):null;
  const pool=tmPool({boss:bossEnabled,tmPool:tmPoolVersion});
  const rewardMove=reward==='tm'?pool[Math.floor(moveRandom()*pool.length)]:null;
  return {enemies,reward,rewardItem,rewardMove,currencyAmount:ROOMS_83.challengeCurrencyAmount};
}
type LiquidGenConfig={rivers:[number,number];lakes:[number,number];lakeSize:[number,number];riverWidth:[number,number];drift:[number,number][]};
type LiquidThemeConfig={liquidGen:LiquidGenConfig};
export type LiquidFeatures={rivers:Cell[][];lakes:Cell[][]};
const liquidThemeConfig=(terrainThemesJson as unknown as Record<ThemeId,LiquidThemeConfig>);
const liquidStreamSeed=(seed:number,level:number)=>(Math.imul(seed>>>0,0x7FEB352D)^Math.imul(level,0x846CA68B)^0xB5297A4D)>>>0;
/**
 * 8.8 (#178) liquid shaping limits (WORKING CANDIDATES). A shaped layer may turn at most this share of its non-ground cells into liquid;
 * floors 2 and 3 must keep at least `LIQUID_MIN_CELLS` liquid cells; the raw features are redrawn up to `LIQUID_ATTEMPTS` times before the whole layout is redrawn.
 */
export const LIQUID_MAX_SHARE=0.3;
export const LIQUID_MIN_CELLS=16;
export const LIQUID_ATTEMPTS=24;
const GROUND=1,LIQUID=2;
/**
 * One shaped attempt: raw rivers and lakes (own random stream), then opening (every liquid cell must belong to a 2x2 all-liquid block),
 * then gap filling (a 1-cell wall between liquid and liquid/ground, or two liquid cells meeting only diagonally, gets a whole 2x2 liquid block),
 * repeated until stable. Only wall cells ever change; ground is never touched. Returns null when this attempt cannot satisfy the shape rules.
 */
function shapeLiquidAttempt(seed:number,level:number,params:FloorParams,floor:Cell[],rooms:Room[],attempt:number):LiquidFeatures|null {
  const {width:W,height:H}=params,theme=themeOfLevel(params.boss,level),config=liquidThemeConfig[theme].liquidGen;
  const random=mulberry32((liquidStreamSeed(seed,level)+Math.imul(attempt,0x9E3779B1))>>>0);
  const int=(range:[number,number])=>range[0]+Math.floor(random()*(range[1]-range[0]+1));
  const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
  const kind=new Uint8Array(W*H),owner=new Int16Array(W*H).fill(-1);
  const at=(x:number,y:number)=>y*W+x,inBounds=(x:number,y:number)=>x>=0&&y>=0&&x<W&&y<H;
  const ring=(x:number,y:number)=>x===0||y===0||x===W-1||y===H-1;
  for(const c of floor)kind[at(c.x,c.y)]=GROUND;
  const isLiquid=(x:number,y:number)=>inBounds(x,y)&&kind[at(x,y)]===LIQUID;
  const isGround=(x:number,y:number)=>inBounds(x,y)&&kind[at(x,y)]===GROUND;
  const isWall=(x:number,y:number)=>inBounds(x,y)&&kind[at(x,y)]===0;
  const open=(x:number,y:number)=>inBounds(x,y)&&kind[at(x,y)]!==0;
  const drift=()=>{
    const total=config.drift.reduce((sum,[,weight])=>sum+weight,0);let roll=random()*total;
    for(const [distance,weight] of config.drift){if(roll<weight)return distance;roll-=weight;}
    return config.drift[config.drift.length-1][0];
  };
  const roomBufferHit=(left:number,rows:number[],widthCells:number)=>rooms.some(r=>
    rows.some(y=>y>=r.y-1&&y<r.y+r.h+1)&&left<r.x+r.w+1&&left+widthCells>r.x-1);
  let featureNo=0;const riverCount=int(config.rivers);
  // Rivers run top-to-bottom or bottom-to-top in two-row steps, so every liquid cell sits in a 2x2 block of its own step; a step moves at most one column.
  for(let riverNo=0;riverNo<riverCount;riverNo++,featureNo++){
    const widthCells=Math.max(2,int(config.riverWidth)),maxLeft=Math.max(0,W-widthCells);
    const minStart=Math.min(6,maxLeft),maxStart=Math.max(minStart,W-6-widthCells);
    let x=clamp(minStart+Math.floor(random()*(maxStart-minStart+1)),0,maxLeft);
    const fromBottom=random()<0.5,step=fromBottom?-1:1;
    for(let row=0;row<H;row++){
      const y=fromBottom?H-1-row:row;
      if(row>0&&row%2===0){
        const previous=x,rows=[y,y+step].filter(v=>v>=0&&v<H);
        const wanted=clamp(previous+clamp(drift(),-1,1),0,maxLeft);
        const order=[wanted,previous,clamp(previous-1,0,maxLeft),clamp(previous+1,0,maxLeft)];
        x=order.find(candidate=>!roomBufferHit(candidate,rows,widthCells))??wanted;
      }
      for(let dx=0;dx<widthCells;dx++)if(isWall(x+dx,y)){kind[at(x+dx,y)]=LIQUID;owner[at(x+dx,y)]=featureNo;}
    }
  }
  const lakeCount=int(config.lakes);
  for(let lakeNo=0;lakeNo<lakeCount;lakeNo++,featureNo++){
    const target=int(config.lakeSize);
    const seeds:Cell[]=[];
    for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++)if(isWall(x,y)&&isWall(x+1,y)&&isWall(x,y+1)&&isWall(x+1,y+1))seeds.push({x,y});
    if(!seeds.length)return null;
    const start=seeds[Math.floor(random()*seeds.length)];
    const cells=[{x:start.x,y:start.y},{x:start.x+1,y:start.y},{x:start.x,y:start.y+1},{x:start.x+1,y:start.y+1}];
    for(const c of cells){kind[at(c.x,c.y)]=LIQUID;owner[at(c.x,c.y)]=featureNo;}
    while(cells.length<target){
      const frontier=new Map<string,Cell>();
      for(const cell of cells)for(const d of DIRS){const nx=cell.x+d.x,ny=cell.y+d.y;if(isWall(nx,ny))frontier.set(nx+','+ny,{x:nx,y:ny});}
      const choices=[...frontier.values()];if(!choices.length)break;
      const next=choices[Math.floor(random()*choices.length)];cells.push(next);kind[at(next.x,next.y)]=LIQUID;owner[at(next.x,next.y)]=featureNo;
    }
  }
  // Opening (the keep-map below): liquid cells outside every 2x2 all-liquid block turn back into wall.
  const keep=new Uint8Array(W*H);
  for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++)if(isLiquid(x,y)&&isLiquid(x+1,y)&&isLiquid(x,y+1)&&isLiquid(x+1,y+1)){
    keep[at(x,y)]=keep[at(x+1,y)]=keep[at(x,y+1)]=keep[at(x+1,y+1)]=1;
  }
  for(let i=0;i<W*H;i++)if(kind[i]===LIQUID&&!keep[i]){kind[i]=0;owner[i]=-1;}
  // Gap filling. A block may only use wall cells that are not on the outer ring; any ground cell in it cancels that fill.
  const tryBlock=(cells:Cell[],from:number):boolean=>{
    for(const c of cells){
      if(!inBounds(c.x,c.y)||isGround(c.x,c.y))return false;
      if(!isLiquid(c.x,c.y)&&ring(c.x,c.y))return false;
    }
    for(const c of cells)if(!isLiquid(c.x,c.y)){kind[at(c.x,c.y)]=LIQUID;owner[at(c.x,c.y)]=from;}
    return true;
  };
  const addedCount=(cells:Cell[])=>cells.filter(c=>!isLiquid(c.x,c.y)).length;
  const fillThin=(gx:number,gy:number,dx:number,dy:number):boolean=>{
    // g is a wall cell whose two neighbours along (dx,dy) are liquid/liquid or liquid/ground.
    const options:{cells:Cell[];from:number;added:number}[]=[];
    const px=dy,py=dx;
    for(const side of [-1,1])if(isLiquid(gx+side*dx,gy+side*dy))for(const s of [1,-1]){
      const cells=[{x:gx,y:gy},{x:gx+s*px,y:gy+s*py},{x:gx+side*dx,y:gy+side*dy},{x:gx+side*dx+s*px,y:gy+side*dy+s*py}];
      options.push({cells,from:owner[at(gx+side*dx,gy+side*dy)],added:addedCount(cells)});
    }
    options.sort((a,b)=>a.added-b.added);
    for(const option of options)if(tryBlock(option.cells,option.from))return true;
    return false;
  };
  for(let pass=0;pass<400;pass++){
    let changed=false;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      if(!isWall(x,y))continue;
      for(const [dx,dy] of [[1,0],[0,1]]){
        const la=isLiquid(x-dx,y-dy),lb=isLiquid(x+dx,y+dy);
        if((la&&(lb||isGround(x+dx,y+dy)))||(lb&&isGround(x-dx,y-dy))){if(fillThin(x,y,dx,dy)){changed=true;break;}}
      }
    }
    for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){
      const d1=isLiquid(x,y)&&isLiquid(x+1,y+1)&&!isLiquid(x+1,y)&&!isLiquid(x,y+1);
      const d2=isLiquid(x+1,y)&&isLiquid(x,y+1)&&!isLiquid(x,y)&&!isLiquid(x+1,y+1);
      if(!d1&&!d2)continue;
      const cells=[{x,y},{x:x+1,y},{x,y:y+1},{x:x+1,y:y+1}];
      if(tryBlock(cells,owner[at(d1?x:x+1,y)]))changed=true;
    }
    if(!changed)break;
  }
  // What could not be filled must not leave a pillar or a diagonal-only liquid contact.
  let total=0,walls=0;
  const featureCells:Cell[][]=Array.from({length:featureNo},()=>[]);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=at(x,y);
    if(kind[i]===LIQUID){total++;if(owner[i]>=0)featureCells[owner[i]].push({x,y});}
    if(kind[i]!==GROUND)walls++;
    if(kind[i]===0&&(isLiquid(x-1,y)||isLiquid(x+1,y)||isLiquid(x,y-1)||isLiquid(x,y+1))
      &&((open(x-1,y)&&open(x+1,y))||(open(x,y-1)&&open(x,y+1))))return null;
    if(x<W-1&&y<H-1){
      const a=isLiquid(x,y),b=isLiquid(x+1,y),c=isLiquid(x,y+1),d=isLiquid(x+1,y+1);
      if((a&&d&&!b&&!c)||(b&&c&&!a&&!d))return null;
    }
  }
  if(total>Math.floor(walls*LIQUID_MAX_SHARE))return null;
  if(featureCells.some(cells=>cells.length<4))return null;
  if(theme!=='moss'&&total<LIQUID_MIN_CELLS)return null;
  return {rivers:featureCells.slice(0,riverCount),lakes:featureCells.slice(riverCount)};
}
/** Shaped liquid, or null after `LIQUID_ATTEMPTS` failed redraws (the caller then redraws the layout). `attempts` says how many redraws were used. */
export function tryLiquidFeatures(seed:number,level:number,params:FloorParams,floor:Cell[],rooms:Room[]):{features:LiquidFeatures;attempts:number}|null {
  for(let attempt=0;attempt<LIQUID_ATTEMPTS;attempt++){
    const features=shapeLiquidAttempt(seed,level,params,floor,rooms,attempt);
    if(features)return {features,attempts:attempt+1};
  }
  return null;
}
/**
 * Generates water or lava from its own random stream and shapes it for 47-shape tiling. The supplied ground and rooms are read only;
 * every returned feature cell is a wall cell, so this layer cannot change paths, points, or units.
 */
export function generateLiquidFeatures(seed:number,level:number,params:FloorParams,floor:Cell[],rooms:Room[]):LiquidFeatures {
  const result=tryLiquidFeatures(seed,level,params,floor,rooms);
  if(!result)throw new Error(`floor generator could not shape liquid in ${LIQUID_ATTEMPTS} attempts (seed ${seed}, level ${level})`);
  return result.features;
}
const unionLiquid=(features:LiquidFeatures):Cell[]=>{
  const all=[...features.rivers.flat(),...features.lakes.flat()];
  return [...new Map(all.map(cell=>[k(cell),cell])).values()].sort((a,b)=>a.y-b.y||a.x-b.x);
};
/** Pure union helper used by the generator and topology tests. */
export function generateLiquid(seed:number,level:number,params:FloorParams,floor:Cell[],rooms:Room[]):Cell[] {
  return unionLiquid(generateLiquidFeatures(seed,level,params,floor,rooms));
}
/** Wall cells kept between ground pieces (rooms and corridor stretches) except at doors and junctions, and around the boss room. */
const BUFFER=2;
/** Candidate room pairs tried in turn-only mode before a link may stay straight (#200). */
const TURN_EDGE_TRIES=4;
/** Layout redraw limit; redraws come from failed connections, ground shapes, or liquid shaping. */
const MAX_LAYOUT_ATTEMPTS=64;
export function generateFloor(seed:number,level:number,params:FloorParams=DEFAULT_PARAMS):GeneratedFloor {
  const {width:W,height:H,floors}=params;
  const bossEnabled=params.boss===true;
  const bossFloor=bossEnabled&&level===floors;
  const difficulty=DIFFICULTY[params.difficulty??'normal'];
  const rng=mulberry32((Math.imul(seed>>>0,0x9E3779B1)^Math.imul(level,0x85EBCA6B)^0x2F1C3A5B)>>>0);
  const int=(lo:number,hi:number)=>lo+Math.floor(rng()*(hi-lo+1));
  const pick=<T>(xs:T[]):T=>{
    if(xs.length===0)throw new Error('floor generator has no free cells');
    return xs[int(0,xs.length-1)];
  };
  const pickFrom=<T>(xs:T[],random:()=>number):T=>{
    if(xs.length===0)throw new Error('floor generator has no free cells');
    return xs[Math.floor(random()*xs.length)];
  };
  const roomKey=(a:number,b:number)=>a<b?a+':'+b:b+':'+a;
  const spots=['center','east','south','west','north'] as const;
  type BossSpot=typeof spots[number];
  let bossSpot:BossSpot|null=null;
  if(bossFloor)bossSpot=rng()<0.5?'center':spots[int(1,4)];
  const bossSize=7;
  const bossRect=(spot:BossSpot):Room=>{
    const cx=Math.floor((W-bossSize)/2),cy=Math.floor((H-bossSize)/2);
    const at:Record<BossSpot,Cell>={
      center:{x:cx,y:cy},east:{x:W-1-bossSize,y:cy},
      west:{x:1,y:cy},north:{x:cx,y:1},south:{x:cx,y:H-1-bossSize}
    };
    return {...at[spot],w:bossSize,h:bossSize};
  };
  const target=int(9,12);
  const apart=(a:Room,b:Room)=>
    a.x>=b.x+b.w+3||b.x>=a.x+a.w+3||a.y>=b.y+b.h+3||b.y>=a.y+a.h+3;
  let connectionRetries=0,layoutAttempts=0,shapeRetries=0,liquidRetries=0,liquidLayoutRetries=0;
  const retryConnection=()=>{connectionRetries++;return null;};
  const tryLayout=()=>{
    const rooms:Room[]=[];
    let bossRoom=-1;
    if(bossFloor){rooms.push(bossRect(bossSpot!));bossRoom=0;}
    for(let tries=0;(rooms.length<target&&tries<3000)||(rooms.length<9&&tries<6000);tries++){
      const ordinaryCount=rooms.length-(bossFloor?1:0);
      const large=ordinaryCount===1||ordinaryCount===2;
      const small=tries>=3000&&!large;
      const w=large?int(7,8):small?4:int(4,8);
      const h=large?int(5,6):small?3:int(3,6);
      const r:Room={x:int(1,W-1-w),y:int(1,H-1-h),w,h};
      if(rooms.every(other=>apart(r,other)))rooms.push(r);
    }
    if(rooms.length<9)return null;

    const cells=new Map<string,Cell>();
    const carve=(c:Cell)=>{
      if(c.x>=1&&c.y>=1&&c.x<W-1&&c.y<H-1)cells.set(k(c),{x:c.x,y:c.y});
    };
    rooms.forEach(room=>roomCells(room).forEach(carve));
    const bossBox:Room|null=bossFloor
      ?{x:rooms[bossRoom].x-BUFFER,y:rooms[bossRoom].y-BUFFER,w:rooms[bossRoom].w+2*BUFFER,h:rooms[bossRoom].h+2*BUFFER}
      :null;
    const inRect=(c:Cell,r:Room)=>c.x>=r.x&&c.x<r.x+r.w&&c.y>=r.y&&c.y<r.y+r.h;
    const brush=(x:number,y:number):Cell[]=>[
      {x,y},{x:x+1,y},{x,y:y+1},{x:x+1,y:y+1}
    ];
    const brushPath=(path:Cell[]):Cell[]=>path.flatMap(c=>brush(c.x,c.y));
    const compactPath=(path:Cell[]):Cell[]=>path.filter((c,i)=>i===0||c.x!==path[i-1].x||c.y!==path[i-1].y);
    const lPath=(p:Cell,q:Cell,horizontalFirst:boolean):Cell[]=>{
      const out:Cell[]=[{x:p.x,y:p.y}];
      const hLine=(y:number,x0:number,x1:number)=>{
        const step=x1>=x0?1:-1;for(let x=x0+step;step>0?x<=x1:x>=x1;x+=step)out.push({x,y});
      };
      const vLine=(x:number,y0:number,y1:number)=>{
        const step=y1>=y0?1:-1;for(let y=y0+step;step>0?y<=y1:y>=y1;y+=step)out.push({x,y});
      };
      if(horizontalFirst){hLine(p.y,p.x,q.x);vLine(q.x,p.y,q.y);}
      else{vLine(p.x,p.y,q.y);hLine(q.y,p.x,q.x);}
      return compactPath(out);
    };
    const anchor=(room:Room):Cell=>({
      x:Math.min(room.x+Math.floor((room.w-1)/2),room.x+room.w-2),
      y:Math.min(room.y+Math.floor((room.h-1)/2),room.y+room.h-2)
    });
    const crossesBoss=(path:Cell[],a:number,b:number)=>
      !!bossBox&&a!==bossRoom&&b!==bossRoom&&brushPath(path).some(c=>inRect(c,bossBox!));
    const via:Cell[]=bossBox?[
      {x:bossBox.x-2,y:bossBox.y-2},
      {x:bossBox.x+bossBox.w,y:bossBox.y-2},
      {x:bossBox.x-2,y:bossBox.y+bossBox.h},
      {x:bossBox.x+bossBox.w,y:bossBox.y+bossBox.h}
    ].filter(c=>c.x>=1&&c.y>=1&&c.x<=W-3&&c.y<=H-3):[];
    const corridorRng=mulberry32((Math.imul(seed>>>0,0xD1B54A35)^Math.imul(level,0x94D049BB)^0x6A09E667)>>>0);
    const corridorInt=(lo:number,hi:number)=>lo+Math.floor(corridorRng()*(hi-lo+1));
    // 8.8 (#178): next to its own room (within BUFFER cells outside it) a route may only go straight out of, or into, a room face: no cell in a corner zone,
    // and no sideways step while any brush cell is that close. That is the door; running along the room's outside would be hugging.
    const doorOk=(cellsNow:Cell[],cellsBefore:Cell[]|null,step:Cell|null,room:Room):boolean=>{
      for(const group of cellsBefore?[cellsNow,cellsBefore]:[cellsNow])for(const c of group){
        const dx=c.x<room.x?room.x-c.x:c.x>=room.x+room.w?c.x-(room.x+room.w-1):0;
        const dy=c.y<room.y?room.y-c.y:c.y>=room.y+room.h?c.y-(room.y+room.h-1):0;
        if(Math.max(dx,dy)===0||Math.max(dx,dy)>BUFFER)continue;
        if(dx>0&&dy>0)return false;
        if(step&&((dx===0&&step.x!==0)||(dy===0&&step.y!==0)))return false;
      }
      return true;
    };
    const footprintLegal=(p:Cell,a:number,b:number,from:Cell|null=null):boolean=>{
      const cellsHere=brush(p.x,p.y);
      if(cellsHere.some(c=>c.x<1||c.y<1||c.x>=W-1||c.y>=H-1))return false;
      for(let i=0;i<rooms.length;i++)if(i!==a&&i!==b){
        const r=rooms[i];if(cellsHere.some(c=>c.x>=r.x-BUFFER&&c.x<r.x+r.w+BUFFER&&c.y>=r.y-BUFFER&&c.y<r.y+r.h+BUFFER))return false;
      }
      const before=from?brush(from.x,from.y):null,step=from?{x:p.x-from.x,y:p.y-from.y}:null;
      if(!doorOk(cellsHere,before,step,rooms[a])||!doorOk(cellsHere,before,step,rooms[b]))return false;
      return !(bossBox&&a!==bossRoom&&b!==bossRoom&&cellsHere.some(c=>inRect(c,bossBox)));
    };
    const toward=(at:Cell,q:Cell):Cell[]=>[
      ...(at.x===q.x?[]:[{x:Math.sign(q.x-at.x),y:0}]),
      ...(at.y===q.y?[]:[{x:0,y:Math.sign(q.y-at.y)}])
    ];
    const sameDir=(a:Cell,b:Cell)=>a.x===b.x&&a.y===b.y;
    // #200: a route never stands on the same position twice. The search states carry a direction and a flag, so one position can be
    // reached again by a different state; walking the chain of parent states keeps each found route a simple walk.
    const onChain=(previous:Map<string,string|null>,positions:Map<string,{p:Cell}>,from:string,cell:Cell):boolean=>{
      for(let at:string|null=from;at!==null;at=previous.get(at)??null){
        const seen=positions.get(at)!.p;
        if(seen.x===cell.x&&seen.y===cell.y)return true;
      }
      return false;
    };
    const hallwayPosition=(p:Cell,a:number,b:number)=>
      brush(p.x,p.y).some(c=>!inRect(c,rooms[a]))&&brush(p.x,p.y).some(c=>!inRect(c,rooms[b]));
    const hasHallwayTurn=(path:Cell[],a:number,b:number):boolean=>{
      let previous:Cell|null=null;
      for(let i=1;i<path.length;i++){
        const direction={x:path[i].x-path[i-1].x,y:path[i].y-path[i-1].y};
        // #200: stepping straight back (a U-turn on the spot) is not a bend.
        if(previous&&!sameDir(previous,direction)&&!(previous.x+direction.x===0&&previous.y+direction.y===0)
          &&hallwayPosition(path[i-1],a,b)&&hallwayPosition(path[i],a,b))return true;
        previous=direction;
      }
      return false;
    };
    const turningPath=(p:Cell,q:Cell,a:number,b:number,oneWayBossEntry=false):Cell[]|null=>{
      const touchesBoss=(at:Cell)=>!!bossBox&&brush(at.x,at.y).some(c=>inRect(c,bossBox!));
      const keyOf=(at:Cell,dx:number,dy:number,turned:boolean,entered:boolean)=>
        `${k(at)}|${dx},${dy}|${turned?1:0}|${entered?1:0}`;
      const start={x:p.x,y:p.y},startEntered=touchesBoss(start);
      const startKey=keyOf(start,0,0,false,startEntered);
      const queue=[{p:start,dx:0,dy:0,turned:false,entered:startEntered}];
      const previous=new Map<string,string|null>([[startKey,null]]);
      const positions=new Map([[startKey,queue[0]]]);let found:string|undefined;
      for(let i=0;i<queue.length&&!found;i++){
        const current=queue[i],currentKey=keyOf(current.p,current.dx,current.dy,current.turned,current.entered);
        if(current.p.x===q.x&&current.p.y===q.y&&current.turned&&(!oneWayBossEntry||current.entered)){found=currentKey;break;}
        const directions=DIRS.slice().sort((u,v)=>
          (Math.abs(current.p.x+u.x-q.x)+Math.abs(current.p.y+u.y-q.y))-
          (Math.abs(current.p.x+v.x-q.x)+Math.abs(current.p.y+v.y-q.y)));
        for(const d of directions){
          if(d.x===-current.dx&&d.y===-current.dy&&(current.dx!==0||current.dy!==0))continue;
          const next={x:current.p.x+d.x,y:current.p.y+d.y};
          if(!footprintLegal(next,a,b,current.p)||onChain(previous,positions,currentKey,next))continue;
          const nextEntered=touchesBoss(next);
          if(oneWayBossEntry&&current.entered&&!nextEntered)continue;
          const turned=current.turned||((current.dx!==0||current.dy!==0)
            &&(current.dx!==d.x||current.dy!==d.y)
            &&hallwayPosition(current.p,a,b)&&hallwayPosition(next,a,b));
          const nextKey=keyOf(next,d.x,d.y,turned,current.entered||nextEntered);
          if(previous.has(nextKey))continue;
          previous.set(nextKey,currentKey);
          const state={p:next,dx:d.x,dy:d.y,turned,entered:current.entered||nextEntered};
          positions.set(nextKey,state);queue.push(state);
        }
      }
      if(!found)return null;
      const path:Cell[]=[];let at:string|null=found;
      while(at!==null){path.push(positions.get(at)!.p);at=previous.get(at)??null;}
      return path.reverse();
    };
    const curvePath=(p:Cell,q:Cell,a:number,b:number):Cell[]|null=>{
      const path=[{x:p.x,y:p.y}];let at={x:p.x,y:p.y},last:Cell|null=null,steps=0,sideways=0;
      while(at.x!==q.x||at.y!==q.y){
        if(++steps>W*H)return null;
        const original=toward(at,q);
        if(original.length===1&&sideways<3&&corridorRng()<0.35){
          const axis=original[0].x===0?'x':'y',sign=corridorRng()<0.5?-1:1,length=corridorInt(1,2);
          let shifted=false;
          for(const side of [sign,-sign]){
            let next={x:at.x,y:at.y};const sidePath:Cell[]=[];
            for(let n=0;n<length;n++){
              const before=next;
              next=axis==='x'?{x:next.x+side,y:next.y}:{x:next.x,y:next.y+side};
              if(!footprintLegal(next,a,b,before)){sidePath.length=0;break;}sidePath.push(next);
            }
            if(sidePath.length){path.push(...sidePath);at=sidePath[sidePath.length-1];last=axis==='x'?{x:side,y:0}:{x:0,y:side};sideways++;shifted=true;break;}
          }
          if(shifted)continue;
        }
        let options=original;
        if(options.length===2&&last){
          const forward=options.filter(d=>!(d.x===-last!.x&&d.y===-last!.y));
          if(forward.length)options=forward;
        }
        let ordered=options.slice();
        if(original.length===2&&options.length===2){
          const continuing=last&&options.find(d=>sameDir(d,last!));
          const turning=continuing?options.find(d=>!sameDir(d,continuing!)):null;
          if(continuing&&turning)ordered=corridorRng()<0.5?[continuing,turning]:[turning,continuing];
          else if(!continuing&&corridorRng()<0.5)ordered.reverse();
        }
        const segment=corridorInt(3,5);let chosen=ordered[0];
        for(let n=0;n<segment;n++){
          const available=toward(at,q);if(!available.length)break;
          const candidates=[chosen,...available.filter(d=>!sameDir(d,chosen))].filter(d=>available.some(v=>sameDir(v,d)));
          const nextDir=candidates.find(d=>footprintLegal({x:at.x+d.x,y:at.y+d.y},a,b,at));
          if(!nextDir)return null;
          const blockedTurn=!sameDir(nextDir,chosen);chosen=nextDir;
          at={x:at.x+chosen.x,y:at.y+chosen.y};path.push(at);last=chosen;
          if(blockedTurn)break;
        }
      }
      return path.every((c,i)=>footprintLegal(c,a,b,i?path[i-1]:null))?path:null;
    };
    const detourPath=(p:Cell,q:Cell,a:number,b:number,oneWayBossEntry=false):Cell[]|null=>{
      const inBoss=(p:Cell)=>!!bossBox&&brush(p.x,p.y).some(c=>inRect(c,bossBox!));
      const stateKey=(p:Cell,entered:boolean)=>`${k(p)}|${entered?1:0}`;
      const start={x:p.x,y:p.y},startEntered=inBoss(start),startKey=stateKey(start,startEntered);
      const previous=new Map<string,string|null>([[startKey,null]]),positions=new Map([[startKey,{p:start,entered:startEntered}]]),queue=[{p:start,entered:startEntered}];
      let found:string|undefined;
      for(let i=0;i<queue.length&&!found;i++){
        const current=queue[i],at=current.p,ordered=DIRS.slice().sort((u,v)=>
          (Math.abs(at.x+u.x-q.x)+Math.abs(at.y+u.y-q.y))-(Math.abs(at.x+v.x-q.x)+Math.abs(at.y+v.y-q.y)));
        for(const d of ordered){
          const next={x:at.x+d.x,y:at.y+d.y},nextKey=k(next);
          if(!footprintLegal(next,a,b,at))continue;
          const nextEntered=inBoss(next);if(oneWayBossEntry&&current.entered&&!nextEntered)continue;
          const id=stateKey(next,current.entered||nextEntered);if(previous.has(id))continue;
          previous.set(id,stateKey(at,current.entered));positions.set(id,{p:next,entered:current.entered||nextEntered});queue.push({p:next,entered:current.entered||nextEntered});
          if(next.x===q.x&&next.y===q.y&&(!oneWayBossEntry||current.entered||nextEntered)){found=id;break;}
        }
        if(found)break;
      }
      if(!found)return null;
      const path:Cell[]=[];let at:string|null=found;
      while(at!==null){path.push(positions.get(at)!.p);at=previous.get(at)??null;}
      return path.reverse();
    };
    const bossEntryOnly=(path:Cell[]):boolean=>{
      if(!bossBox)return false;
      let entered=false;
      for(const topLeft of path){
        // A 2x2 brush may straddle the frame while crossing it. Treat the four
        // cells as one step so the outside half of that brush is not mistaken
        // for a second exit from the boss room.
        if(brush(topLeft.x,topLeft.y).some(brushCell=>inRect(brushCell,bossBox)))entered=true;
        else if(entered)return false;
      }
      return entered;
    };
    const corridors:{fromRoom:number;toRoom:number;path:Cell[]}[]=[];
    // 8.8 (#178): ground spacing. A new route cell may sit within BUFFER cells of an existing or other new ground cell only where the two are joined
    // by a short ground path (a door or a junction); otherwise two walls at least must lie between them (no parallel edge-rubbing, no diagonal-only contact).
    const roomsNear=(c:Cell):number[]=>{
      const out:number[]=[];
      rooms.forEach((r,i)=>{if(c.x>=r.x-BUFFER&&c.x<r.x+r.w+BUFFER&&c.y>=r.y-BUFFER&&c.y<r.y+r.h+BUFFER)out.push(i);});
      return out;
    };
    const spacingOk=(path:Cell[]):boolean=>{
      const fresh=new Map<string,Cell>();
      for(const c of brushPath(path))if(!cells.has(k(c)))fresh.set(k(c),c);
      const has=(x:number,y:number)=>cells.has(x+','+y)||fresh.has(x+','+y);
      const joined=(from:Cell,to:Cell):boolean=>{
        const seen=new Set([k(from)]);let ring:Cell[]=[from];
        for(let depth=0;depth<4;depth++){
          const next:Cell[]=[];
          for(const c of ring)for(const d of DIRS){
            const n={x:c.x+d.x,y:c.y+d.y},key=k(n);
            if(seen.has(key)||!has(n.x,n.y))continue;
            if(n.x===to.x&&n.y===to.y)return true;
            seen.add(key);next.push(n);
          }
          ring=next;
        }
        return false;
      };
      for(const c of fresh.values())for(let dy=-BUFFER;dy<=BUFFER;dy++)for(let dx=-BUFFER;dx<=BUFFER;dx++){
        if((dx===0&&dy===0)||Math.abs(dx)+Math.abs(dy)===1)continue;
        const n={x:c.x+dx,y:c.y+dy};
        if(!has(n.x,n.y))continue;
        if(fresh.has(k(n))&&(n.y<c.y||(n.y===c.y&&n.x<c.x)))continue;
        const near=roomsNear(c);
        if(near.length&&roomsNear(n).some(i=>near.includes(i)))continue;
        if(!joined(c,n))return false;
      }
      return true;
    };
    // #200: the turn quota counts real bends only. In turn-only mode a link accepts nothing but a route that bends, so a candidate edge
    // that cannot bend is skipped without carving anything and the generator can try another edge instead.
    let turnOnly=false;
    const turnedCount=()=>corridors.filter(route=>hasHallwayTurn(route.path,route.fromRoom,route.toRoom)).length;
    const behindQuota=()=>turnedCount()*2<corridors.length+2;
    const acceptPath=(a:number,b:number,path:Cell[]):boolean=>{
      if(turnOnly&&!hasHallwayTurn(path,a,b))return false;
      if(path.some((c,i)=>!footprintLegal(c,a,b,i?path[i-1]:null))||crossesBoss(path,a,b)||!spacingOk(path))return false;
      for(const c of brushPath(path))carve(c);
      corridors.push({fromRoom:a,toRoom:b,path:path.map(c=>({x:c.x,y:c.y}))});
      return true;
    };
    const link=(a:number,b:number):boolean=>{
      const p=anchor(rooms[a]),q=anchor(rooms[b]);
      const needsTurn=behindQuota();
      if(bossFloor&&(a===bossRoom||b===bossRoom)){
        const ordinary=a===bossRoom?b:a,from=anchor(rooms[ordinary]),to=anchor(rooms[bossRoom]);
        const orderedRoute=(path:Cell[])=>a===bossRoom?path.slice().reverse():path;
        if(needsTurn){
          const turned=turningPath(from,to,ordinary,bossRoom,true);
          if(turned&&bossEntryOnly(turned)&&acceptPath(a,b,orderedRoute(turned)))return true;
        }
        for(const horizontalFirst of [true,false]){
          const path=lPath(from,to,horizontalFirst);
          if(bossEntryOnly(path)&&acceptPath(a,b,orderedRoute(path)))return true;
        }
        const ways=via.slice().sort((u,v)=>
          (Math.abs(u.x-from.x)+Math.abs(u.y-from.y)+Math.abs(u.x-to.x)+Math.abs(u.y-to.y))-
          (Math.abs(v.x-from.x)+Math.abs(v.y-from.y)+Math.abs(v.x-to.x)+Math.abs(v.y-to.y)));
        for(const waypoint of ways)for(const firstLeg of [true,false])for(const secondLeg of [true,false]){
          const one=lPath(from,waypoint,firstLeg),two=lPath(waypoint,to,secondLeg);
          if(brushPath(one).some(c=>inRect(c,bossBox!)))continue;
          const path=compactPath([...one,...two.slice(1)]);
          if(bossEntryOnly(path)&&acceptPath(a,b,orderedRoute(path)))return true;
        }
        const detour=detourPath(from,to,ordinary,bossRoom,true);
        if(detour&&bossEntryOnly(detour)&&acceptPath(a,b,orderedRoute(detour)))return true;
        return false;
      }
      const curved=curvePath(p,q,a,b);
      if(curved&&(!needsTurn||hasHallwayTurn(curved,a,b))&&acceptPath(a,b,curved))return true;
      if(needsTurn){
        const turned=turningPath(p,q,a,b);
        if(turned&&acceptPath(a,b,turned))return true;
      }
      if(curved&&acceptPath(a,b,curved))return true;
      const first=corridorRng()<0.5;
      for(const horizontalFirst of [first,!first]){
        const path=lPath(p,q,horizontalFirst);
        if(acceptPath(a,b,path))return true;
      }
      const ways=via.slice().sort((u,v)=>
        (Math.abs(u.x-p.x)+Math.abs(u.y-p.y)+Math.abs(u.x-q.x)+Math.abs(u.y-q.y))-
        (Math.abs(v.x-p.x)+Math.abs(v.y-p.y)+Math.abs(v.x-q.x)+Math.abs(v.y-q.y)));
      for(const waypoint of ways)for(const firstLeg of [true,false])for(const secondLeg of [true,false]){
        const one=lPath(p,waypoint,firstLeg),two=lPath(waypoint,q,secondLeg),path=compactPath([...one,...two.slice(1)]);
        if(acceptPath(a,b,path))return true;
      }
      const detour=detourPath(p,q,a,b);
      if(detour&&acceptPath(a,b,detour))return true;
      return false;
    };
    const centerDistance=(a:number,b:number)=>{
      const p=center(rooms[a]),q=center(rooms[b]);
      return Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
    };
    const ordinaryRooms=rooms.map((_,i)=>i).filter(i=>i!==bossRoom);
    const treeEdges=new Set<string>();
    const connectedRooms=new Set<number>([ordinaryRooms[0]]);
    while(ordinaryRooms.some(room=>!connectedRooms.has(room))){
      const candidates:[number,number][]=[];
      for(const room of ordinaryRooms)if(!connectedRooms.has(room))for(const other of connectedRooms)candidates.push([room,other]);
      candidates.sort(([a,b],[c,d])=>centerDistance(a,b)-centerDistance(c,d)||a-c||b-d);
      let added=false;
      if(behindQuota()){
        turnOnly=true;
        for(const [room,other] of candidates.slice(0,TURN_EDGE_TRIES))if(link(room,other)){
          treeEdges.add(roomKey(room,other));connectedRooms.add(room);added=true;break;
        }
        turnOnly=false;
      }
      if(!added)for(const [room,other] of candidates)if(link(room,other)){
        treeEdges.add(roomKey(room,other));connectedRooms.add(room);added=true;break;
      }
      if(!added)return retryConnection();
    }
    if(bossFloor){
      const closest=ordinaryRooms.slice().sort((a,b)=>centerDistance(bossRoom,a)-centerDistance(bossRoom,b)||a-b);
      let bossLinked=false;
      if(behindQuota()){
        turnOnly=true;bossLinked=closest.slice(0,TURN_EDGE_TRIES).some(other=>link(bossRoom,other));turnOnly=false;
      }
      if(!bossLinked&&!closest.some(other=>link(bossRoom,other)))return retryConnection();
    }
    const loopCandidates:[number,number][]=[];
    for(let i=0;i<ordinaryRooms.length;i++)for(let j=i+1;j<ordinaryRooms.length;j++){
      const a=ordinaryRooms[i],b=ordinaryRooms[j];
      if(!treeEdges.has(roomKey(a,b)))loopCandidates.push([a,b]);
    }
    let loops=0;
    while(loops<2&&loopCandidates.length){
      const pair=loopCandidates.splice(corridorInt(0,loopCandidates.length-1),1)[0];
      if(behindQuota()){
        turnOnly=true;const linked=link(pair[0],pair[1]);turnOnly=false;
        if(linked){loops++;continue;}
      }
      if(link(pair[0],pair[1]))loops++;
    }
    if(loops<2)return retryConnection();

    // Remove only a 2x2 corridor block with one way out. A route crossing a
    // trimmed spur is rebuilt from the surviving 2x2 floor cells below.
    const roomCellsSet=new Set(rooms.flatMap(roomCells).map(k));
    let trimmed=true;
    while(trimmed){
      trimmed=false;
      for(let y=1;y<H-2&&!trimmed;y++)for(let x=1;x<W-2&&!trimmed;x++){
        const block=brush(x,y),keys=block.map(k);
        if(keys.some(key=>!cells.has(key)||roomCellsSet.has(key)))continue;
        const exits=[
          [k({x:x-1,y}),k({x:x-1,y:y+1})],
          [k({x:x+2,y}),k({x:x+2,y:y+1})],
          [k({x,y:y-1}),k({x:x+1,y:y-1})],
          [k({x,y:y+2}),k({x:x+1,y:y+2})]
        ].filter(side=>side.some(key=>cells.has(key))).length;
        if(exits!==1)continue;
        for(const key of keys)cells.delete(key);
        trimmed=true;
      }
    }
    const validBrush=(p:Cell)=>brush(p.x,p.y).every(cell=>cells.has(k(cell)));
    const survivingBrushPath=(from:number,to:number,requireHallwayTurn:boolean):Cell[]|null=>{
      const start=anchor(rooms[from]),goal=anchor(rooms[to]);
      const stateKey=(p:Cell,dx:number,dy:number,turned:boolean)=>`${k(p)}|${dx},${dy}|${turned?1:0}`;
      const startKey=stateKey(start,0,0,false),queue=[{p:start,dx:0,dy:0,turned:false}],previous=new Map<string,string|null>([[startKey,null]]),positions=new Map([[startKey,queue[0]]]);
      let found:string|undefined;
      for(let i=0;i<queue.length&&!found;i++){
        const current=queue[i],currentKey=stateKey(current.p,current.dx,current.dy,current.turned);
        if(current.p.x===goal.x&&current.p.y===goal.y&&(!requireHallwayTurn||current.turned)){found=currentKey;break;}
        for(const d of DIRS){
          // #200: no U-turn on the spot. Stepping back to the cell just left is not a bend of the corridor.
          if(d.x===-current.dx&&d.y===-current.dy&&(current.dx!==0||current.dy!==0))continue;
          const next={x:current.p.x+d.x,y:current.p.y+d.y};
          if(!validBrush(next)||!footprintLegal(next,from,to,current.p)||onChain(previous,positions,currentKey,next))continue;
          const hallway=(current.dx!==0||current.dy!==0)
            &&hallwayPosition(current.p,from,to)&&hallwayPosition(next,from,to);
          const turned=current.turned||(hallway&&(current.dx!==d.x||current.dy!==d.y));
          const nextKey=stateKey(next,d.x,d.y,turned);if(previous.has(nextKey))continue;
          previous.set(nextKey,currentKey);positions.set(nextKey,{p:next,dx:d.x,dy:d.y,turned});queue.push({p:next,dx:d.x,dy:d.y,turned});
        }
      }
      if(!found)return null;
      const path:Cell[]=[];let at:string|null=found;
      while(at!==null){path.push(positions.get(at)!.p);at=previous.get(at)??null;}
      return path.reverse();
    };
    for(const route of corridors){
      const path=survivingBrushPath(route.fromRoom,route.toRoom,true)
        ??survivingBrushPath(route.fromRoom,route.toRoom,false);
      if(!path)return retryConnection();
      route.path=path;
    }
    // G3: at least half of the routes bend, counted on the rebuilt routes that the tests and the game report (#200).
    if(turnedCount()*2<corridors.length)return retryConnection();
    // Final shape check on the real ground: no one-cell wall between two ground cells (this includes single-wall pillars) and no ground cell pair that only touches diagonally.
    const shapeBad=()=>{
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const here=cells.has(x+','+y);
        if(!here&&((cells.has((x-1)+','+y)&&cells.has((x+1)+','+y))||(cells.has(x+','+(y-1))&&cells.has(x+','+(y+1)))))return true;
        const right=cells.has((x+1)+','+y),below=cells.has(x+','+(y+1)),diag=cells.has((x+1)+','+(y+1));
        if((here&&diag&&!right&&!below)||(right&&below&&!here&&!diag))return true;
      }
      return false;
    };
    if(shapeBad()){shapeRetries++;return null;}
    // The block trim cannot see pockets: a one-deep stub on a room edge holds room cells, and a pocket wider than a
    // corridor has blocks with two exits (#185). Ground off every route is kept only as a real second way through,
    // meaning it opens onto the rest of the ground in at least two separate places.
    const routeGround=new Set([...rooms.flatMap(roomCells),...corridors.flatMap(route=>route.path.flatMap(p=>brush(p.x,p.y)))].map(k));
    const AROUND=[...DIRS,{x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1}];
    const near=(key:string,steps:readonly Cell[])=>{const [x,y]=key.split(',').map(Number);return steps.map(d=>k({x:x+d.x,y:y+d.y}));};
    const offRoute=new Set([...cells.keys()].filter(key=>!routeGround.has(key)));
    for(const key of [...offRoute]){
      if(!offRoute.has(key))continue;
      const piece=[key];offRoute.delete(key);const contact=new Set<string>();
      for(let i=0;i<piece.length;i++)for(const next of near(piece[i],DIRS)){
        if(offRoute.delete(next))piece.push(next);
        else if(routeGround.has(next))contact.add(next);
      }
      let openings=0;
      for(const start of contact){
        if(!contact.delete(start))continue;
        openings++;const edge=[start];
        for(let i=0;i<edge.length;i++)for(const next of near(edge[i],AROUND))if(contact.delete(next))edge.push(next);
      }
      if(openings<2)for(const cell of piece)cells.delete(cell);
    }
    // Pockets go after the first check so a seed keeps the layout it already had; only the ground around it changes.
    if(shapeBad()){shapeRetries++;return null;}
    return {rooms,bossRoom,cells,corridors,ordinaryRooms,inRect};
  };
  let topology:ReturnType<typeof tryLayout>=null,shaped:LiquidFeatures|null=null,floor:Cell[]=[];
  while(layoutAttempts<MAX_LAYOUT_ATTEMPTS&&!shaped){
    layoutAttempts++;
    topology=tryLayout();
    if(!topology)continue;
    floor=[...topology.cells.values()].sort((a,b)=>a.y-b.y||a.x-b.x);
    const result=tryLiquidFeatures(seed,level,params,floor,topology.rooms);
    if(!result){liquidLayoutRetries++;liquidRetries+=LIQUID_ATTEMPTS;topology=null;continue;}
    liquidRetries+=result.attempts-1;shaped=result.features;
  }
  if(!topology||!shaped)throw new Error(`floor generator could not build a connected, well-shaped layout in ${MAX_LAYOUT_ATTEMPTS} attempts (seed ${seed}, level ${level})`);
  const {rooms,bossRoom,cells,corridors,ordinaryRooms,inRect}=topology;
  const generationStats={layoutAttempts,connectionRetries,shapeRetries,liquidRetries,liquidLayoutRetries};

  const distancesFrom=(start:Cell):Map<string,number>=>{
    const depth=new Map<string,number>([[k(start),0]]),queue=[start];
    for(let n=0;n<queue.length;n++)for(const d of DIRS){
      const next={x:queue[n].x+d.x,y:queue[n].y+d.y},key=k(next);
      if(cells.has(key)&&!depth.has(key)){depth.set(key,depth.get(k(queue[n]))!+1);queue.push(next);}
    }
    return depth;
  };
  const bossDepth=bossFloor?distancesFrom(center(rooms[bossRoom])):null;
  let arrivalRoom=ordinaryRooms[0];
  if(bossDepth){
    let best=-1;
    for(const i of ordinaryRooms){
      const distance=bossDepth.get(k(center(rooms[i])));
      if(distance!==undefined&&distance>best){best=distance;arrivalRoom=i;}
    }
  }
  const arrival=center(rooms[arrivalRoom]);
  const arrivalDepth=distancesFrom(arrival);
  let downRoom=-1,down:Cell|null=null;
  if(level<floors){
    let best=-1;
    for(const i of ordinaryRooms){
      if(i===arrivalRoom)continue;
      const distance=arrivalDepth.get(k(center(rooms[i])));
      if(distance!==undefined&&distance>best){best=distance;downRoom=i;}
    }
    if(downRoom<0)throw new Error('floor generator could not choose a down-stairs room');
    down=center(rooms[downRoom]);
  }

  const used=new Set<string>([k(arrival),...(down?[k(down)]:[]),
    ...(bossFloor?[k(center(rooms[bossRoom]))]:[])]);
  const points:PointSpec[]=[];
  const place=(kind:PointKind,pos:Cell)=>{
    used.add(k(pos));
    points.push({pos:{x:pos.x,y:pos.y},kind,used:false});
  };
  if(down)place('down',down);
  const inBoss=(c:Cell)=>bossFloor&&inRect(c,rooms[bossRoom]);
  const fallback=()=>{
    const arrivalCells=new Set(roomCells(rooms[arrivalRoom]).map(k));
    const cell=floor.find(c=>!used.has(k(c))&&!inBoss(c)&&!arrivalCells.has(k(c)));
    if(!cell)throw new Error('floor generator has no fallback point cell');
    return cell;
  };
  const free=(i:number)=>roomCells(rooms[i]).filter(c=>!used.has(k(c)));
  const others=rooms.map((_,i)=>i).filter(i=>i!==arrivalRoom&&i!==downRoom&&i!==bossRoom);
  if(level===1)place('goal',pick(free(pick(others))));
  if(level===floors){const itemCells=free(pick(others));place('item',itemCells.length?pick(itemCells):fallback());}
  const themed=THEME_FLOORS[bossEnabled?Math.min(level,THEME_FLOORS.length)-1:0];
  const speciesPool=eligibleSpecies(level,bossEnabled);
  if(!speciesPool.length)throw new Error('No eligible species for floor '+level);
  const speciesRng=mulberry32(streamSeed(seed,level,'enemy-species'));
  const levelRng=mulberry32(streamSeed(seed,level,'enemy-level'));
  let enemyAiRng=streamSeed(seed,level,'enemy-ai');
  const sleepRng=mulberry32(enemyAiRng);
  const enemies:EnemySpec[]=[];
  const makeEnemy=(n:number,pos:Cell,post?:Cell):EnemySpec=>{
    const species=speciesPool[Math.floor(speciesRng()*speciesPool.length)];
    const lower=Math.max(themed.levels[0],SPECIES[species].evoLevel),upper=themed.levels[1];
    const enemyLevel=bossEnabled?lower+Math.floor(levelRng()*(upper-lower+1)):INITIAL_LEVEL;
    const asleep=sleepRng()<(params.enemySleepChance??0.25);
    enemyAiRng=(enemyAiRng+0x6D2B79F5)>>>0;
    return {id:'w'+level+'abcdef'[n],species,level:enemyLevel,
      hp:speciesMaxHp(species,enemyLevel,difficulty),pos,
      ...(post?{post:{x:post.x,y:post.y}}:{}),asleep};
  };
  const fixedCandidates=ordinaryRooms
    .filter(i=>i!==arrivalRoom&&i!==downRoom&&i!==bossRoom)
    .sort((a,b)=>(arrivalDepth.get(k(center(rooms[b])))??-1)-(arrivalDepth.get(k(center(rooms[a])))??-1)||a-b);
  const fixedPool=fixedCandidates.slice(0,Math.max(2,Math.ceil(fixedCandidates.length/2)));
  const fixedRooms:number[]=[];
  while(fixedRooms.length<2&&fixedPool.length)fixedRooms.push(fixedPool.splice(int(0,fixedPool.length-1),1)[0]);
  if(fixedRooms.length<2)throw new Error('floor generator has fewer than two fixed-enemy rooms');
  for(let n=0;n<fixedRooms.length;n++){
    const room=rooms[fixedRooms[n]],origin=center(room);
    const position=roomCells(room)
      .filter(c=>!used.has(k(c))&&!inBoss(c))
      .sort((a,b)=>dist(a,origin)-dist(b,origin)||a.y-b.y||a.x-b.x)[0];
    if(!position)throw new Error('floor generator has no post cell in a fixed-enemy room');
    used.add(k(position));
    enemies.push(makeEnemy(n,position,position));
  }
  const anchors=points.map(p=>p.pos);
  const wanderPool=rooms.filter((_,i)=>i!==arrivalRoom&&i!==bossRoom).flatMap(roomCells);
  for(let n=2;n<themed.count;n++){
    const pool=wanderPool.filter(c=>!used.has(k(c))&&anchors.every(a=>dist(a,c)>=2));
    const far=[6,4,2].map(min=>pool.filter(c=>(arrivalDepth.get(k(c))??-1)>=min)).find(list=>list.length>0)??pool;
    const pos=far.length?pick(far):fallback();
    used.add(k(pos));
    enemies.push(makeEnemy(n,pos));
  }
  let bossPos:Cell|null=null;
  if(bossFloor){
    const traits=BOSS_CONFIG[BOSS.species];
    const enemyLevel=Math.max(themed.levels[1]+traits.levelBonus,SPECIES[BOSS.species].evoLevel);
    bossPos=center(rooms[bossRoom]);
    used.add(k(bossPos));
    enemies.push({id:BOSS.id,species:BOSS.species,level:enemyLevel,
      hp:bossMaxHp(BOSS.species,enemyLevel,traits.hpMultiplier*difficulty),pos:bossPos,boss:true,asleep:false});
  }

  const prng=mulberry32((Math.imul(seed>>>0,0x7FEB352D)^Math.imul(level,0x846CA68B)^0x1B873593)>>>0);
  const pickups:PointSpec[]=[];
  for(const kind of (level===2?['berry','tonic']:['berry']) as PointKind[]){
    const outside=rooms.filter((_,i)=>i!==arrivalRoom&&i!==bossRoom)
      .flatMap(roomCells).filter(c=>!used.has(k(c))&&!inBoss(c));
    const pool=outside.length?outside:floor.filter(c=>!used.has(k(c))&&!inBoss(c));
    const pos=pickFrom(pool,prng)
    used.add(k(pos));
    pickups.push({pos:{x:pos.x,y:pos.y},kind,used:false});
  }
  let rest:PointSpec|null=null;
  if(level===2){
    const near=roomCells(rooms[arrivalRoom]).filter(c=>!used.has(k(c)))
      .sort((a,b)=>dist(a,arrival)-dist(b,arrival)||a.y-b.y||a.x-b.x)[0];
    if(near){used.add(k(near));rest={pos:{x:near.x,y:near.y},kind:'rest',used:false};}
  }
  const roll=serviceRoll(seed,floors);
  const serviceRng=mulberry32((Math.imul(seed>>>0,0x68E31DA4)^Math.imul(level,0xB5297A4D)^0x1B56C4E9)>>>0);
  const services:PointSpec[]=[];
  for(const [kind,at] of [['shop',roll.shop?.level],['exchange',roll.exchange?.level]] as [PointKind,number|undefined][]){
    if(at!==level)continue;
    const outside=rooms.filter((_,i)=>i!==arrivalRoom&&i!==bossRoom)
      .flatMap(roomCells).filter(c=>!used.has(k(c))&&!inBoss(c));
    const pool=outside.length?outside:floor.filter(c=>!used.has(k(c))&&!inBoss(c));
    const pos=pickFrom(pool,serviceRng)
    used.add(k(pos));
    services.push({pos:{x:pos.x,y:pos.y},kind,used:false});
  }
  const roguelike=params.roguelike===true;
  const goalAnchor=points.find(p=>p.kind==='goal')?.pos;
  let adventureRooms:AdventureRoom[]|undefined;
  let outputPoints=points,outputServices=services;
  if(roguelike){
    // G remains occupied as an anchor, but disappears from the v0.1 map. The exchanger is the
    // final service placement, so releasing its cell does not move any 8.2 point or enemy.
    if(goalAnchor)outputPoints=points.filter(p=>p.kind!=='goal');
    for(const exchange of services.filter(p=>p.kind==='exchange'))used.delete(k(exchange.pos));
    outputServices=services.filter(p=>p.kind!=='exchange');
    adventureRooms=makeAdventureRooms(seed,level,{rooms,arrivalRoom,downRoom,bossRoom:bossFloor?bossRoom:undefined,
      enemies,floor,occupied:used});
    // 8.8 (#165): 2-4 item points per floor. The first is the existing berry point (same cell, its kind is redrawn); the rest are placed last, from their
    // own stream, so every earlier placement (rest point, services, adventure rooms) is unchanged.
    const itemRandom=mulberry32((Math.imul(seed>>>0,0x4F1BBCDD)^Math.imul(level,0x2C1B3C6D)^0x5851F42D)>>>0);
    const total=FLOOR_ITEM_WEIGHTS.reduce((a,[,w])=>a+w,0);
    const drawKind=():PointKind=>{let r=itemRandom()*total;for(const [kind,weight] of FLOOR_ITEM_WEIGHTS){if(r<weight)return kind;r-=weight;}return 'berry';};
    const count=2+Math.floor(itemRandom()*3);
    const first=pickups.find(q=>q.kind==='berry');
    if(first)first.kind=drawKind();
    const interactions=new Set(adventureRooms.map(r=>k(r.interaction)));
    for(let n=first?1:0;n<count;n++){
      const outside=rooms.filter((_,i)=>i!==arrivalRoom&&i!==bossRoom).flatMap(roomCells).filter(c=>!used.has(k(c))&&!interactions.has(k(c))&&!inBoss(c));
      const pool=outside.length?outside:floor.filter(c=>!used.has(k(c))&&!interactions.has(k(c))&&!inBoss(c));
      if(!pool.length)break;
      const kind=drawKind(),pos=pickFrom(pool,itemRandom);
      used.add(k(pos));pickups.push({pos:{x:pos.x,y:pos.y},kind,used:false});
    }
  }
  const liquid=unionLiquid(shaped);
  return {level,width:W,height:H,floor,rooms,corridors,generationStats,liquid,arrivalRoom,arrival,up:null,down,points:outputPoints,enemies,enemyAiRng,
    pickups,rest,services:outputServices,...(roguelike?{adventureRooms,
      ...(goalAnchor?{goalAnchor:{x:goalAnchor.x,y:goalAnchor.y}}:{})}:{}),
    ...(bossEnabled?{theme:themed.theme}:{}),...(bossFloor?{bossRoom}:{})};
}
