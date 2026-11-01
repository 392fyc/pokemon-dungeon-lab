/**
 * 6.3 seeded floor generator. Pure functions, no engine import at run time (type-free on purpose):
 * the same (seed, level, params) always returns byte-identical data, whatever order floors are visited in.
 * Rooms-and-corridors layout; every floor cell is connected by construction (see tests/core/dungeon.test.mjs).
 * All numbers below are WORKING CANDIDATES (map size, room counts, enemy counts, enemy stats), not final balance.
 */
export type Cell={x:number;y:number};
/** `boss` (7.3): themed floors, the new enemy pools and a regional boss on the last floor. */
export type FloorParams={width:number;height:number;floors:number;boss?:boolean;roguelike?:true;difficulty?:Difficulty};
export const DEFAULT_PARAMS:FloorParams={width:36,height:24,floors:3,boss:true,roguelike:true};
import {ECON} from './economy.ts';
import {SPECIES,BOSS_CONFIG,speciesMaxHp} from './roster.ts';
export {BOSS_CONFIG} from './roster.ts';
export type PointKind='goal'|'item'|'exit'|'down'|'up'|'berry'|'tonic'|'rest'|'shop'|'exchange';
export type PointSpec={pos:Cell;kind:PointKind;used:boolean};
export type EnemySpec={id:string;species:string;level:number;hp:number;pos:Cell;post?:Cell;boss?:true;asleep?:boolean};
export type Room={x:number;y:number;w:number;h:number};
export type GeneratedFloor={level:number;width:number;height:number;floor:Cell[];rooms:Room[];
  /** Where the team first arrives from outside or from the floor above. */
  arrivalRoom:number;arrival:Cell;up:Cell|null;down:Cell|null;points:PointSpec[];enemies:EnemySpec[];enemyAiRng:number;
  /** 6.4 recovery pickups (berry on every floor, tonic on floor 2). Kept apart from `points` and drawn from their own random stream, so the layout above is unchanged. */
  pickups:PointSpec[];
  /** 6.5 one-use rest point, floor 2 only, in the arrival room next to the up stairs. Kept apart from `pickups` and `points` so those lists are unchanged. */
  rest:PointSpec|null;
  /** 7.2 rare service cells (shop, exchanger) of this floor, own random stream, never part of `points`. The caller adds them only for runs that carry the services. */
  services:PointSpec[];
  /** 7.3 (boss-marked runs only): the floor theme, and on the last floor the index of the boss room. Absent on developer expeditions without a boss. */
  theme?:ThemeId;bossRoom?:number};
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
    a.x>=b.x+b.w+2||b.x>=a.x+a.w+2||a.y>=b.y+b.h+2||b.y>=a.y+a.h+2;
  const rooms:Room[]=[];
  let bossRoom=-1;
  for(let layout=0;layout<8&&rooms.length<9;layout++){
    rooms.length=0;
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
  }
  if(rooms.length<9)throw new Error('floor generator could not place nine rooms');

  const cells=new Map<string,Cell>();
  const carve=(c:Cell)=>{
    if(c.x>=1&&c.y>=1&&c.x<W-1&&c.y<H-1)cells.set(k(c),{x:c.x,y:c.y});
  };
  rooms.forEach(room=>roomCells(room).forEach(carve));
  const bossBox:Room|null=bossFloor
    ?{x:rooms[bossRoom].x-1,y:rooms[bossRoom].y-1,w:rooms[bossRoom].w+2,h:rooms[bossRoom].h+2}
    :null;
  const inRect=(c:Cell,r:Room)=>c.x>=r.x&&c.x<r.x+r.w&&c.y>=r.y&&c.y<r.y+r.h;
  const brush=(x:number,y:number):Cell[]=>[
    {x,y},{x:x+1,y},{x,y:y+1},{x:x+1,y:y+1}
  ];
  const lPath=(p:Cell,q:Cell,horizontalFirst:boolean):Cell[]=>{
    const out:Cell[]=[];
    const hLine=(y:number,x0:number,x1:number)=>{
      for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++)out.push(...brush(x,y));
    };
    const vLine=(x:number,y0:number,y1:number)=>{
      for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++)out.push(...brush(x,y));
    };
    if(horizontalFirst){hLine(p.y,p.x,q.x);vLine(q.x,p.y,q.y);}
    else{vLine(p.x,p.y,q.y);hLine(q.y,p.x,q.x);}
    return out;
  };
  const anchor=(room:Room):Cell=>({
    x:Math.min(room.x+Math.floor((room.w-1)/2),room.x+room.w-2),
    y:Math.min(room.y+Math.floor((room.h-1)/2),room.y+room.h-2)
  });
  const crossesBoss=(path:Cell[],a:number,b:number)=>
    !!bossBox&&a!==bossRoom&&b!==bossRoom&&path.some(c=>inRect(c,bossBox!));
  const via:Cell[]=bossBox?[
    {x:bossBox.x-2,y:bossBox.y-2},
    {x:bossBox.x+bossBox.w,y:bossBox.y-2},
    {x:bossBox.x-2,y:bossBox.y+bossBox.h},
    {x:bossBox.x+bossBox.w,y:bossBox.y+bossBox.h}
  ].filter(c=>c.x>=1&&c.y>=1&&c.x<=W-3&&c.y<=H-3):[];
  const link=(a:number,b:number):boolean=>{
    const first=rng()<0.5;
    for(const horizontalFirst of [first,!first]){
      const path=lPath(anchor(rooms[a]),anchor(rooms[b]),horizontalFirst);
      if(!crossesBoss(path,a,b)){path.forEach(carve);return true;}
    }
    const p=anchor(rooms[a]),q=anchor(rooms[b]);
    const ways=via.slice().sort((u,v)=>
      (Math.abs(u.x-p.x)+Math.abs(u.y-p.y)+Math.abs(u.x-q.x)+Math.abs(u.y-q.y))-
      (Math.abs(v.x-p.x)+Math.abs(v.y-p.y)+Math.abs(v.x-q.x)+Math.abs(v.y-q.y)));
    for(const waypoint of ways)for(const firstLeg of [true,false])for(const secondLeg of [true,false]){
      const path=[...lPath(p,waypoint,firstLeg),...lPath(waypoint,q,secondLeg)];
      if(!crossesBoss(path,a,b)){path.forEach(carve);return true;}
    }
    return false;
  };
  const centerDistance=(a:number,b:number)=>{
    const p=center(rooms[a]),q=center(rooms[b]);
    return Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
  };
  const ordinaryRooms=rooms.map((_,i)=>i).filter(i=>i!==bossRoom);
  const treeEdges=new Set<string>();
  for(let n=1;n<ordinaryRooms.length;n++){
    const room=ordinaryRooms[n];
    const earlier=ordinaryRooms.slice(0,n).sort((a,b)=>centerDistance(room,a)-centerDistance(room,b)||a-b);
    let connected=false;
    for(const other of earlier){
      if(link(room,other)){
        treeEdges.add(roomKey(room,other));
        connected=true;
        break;
      }
    }
    if(!connected)throw new Error('floor generator could not connect every room');
  }
  if(bossFloor){
    const closest=ordinaryRooms.slice().sort((a,b)=>centerDistance(bossRoom,a)-centerDistance(bossRoom,b)||a-b);
    if(!closest.some(other=>link(bossRoom,other)))throw new Error('floor generator could not connect the boss room');
  }
  const loopCandidates:[number,number][]=[];
  for(let i=0;i<ordinaryRooms.length;i++)for(let j=i+1;j<ordinaryRooms.length;j++){
    const a=ordinaryRooms[i],b=ordinaryRooms[j];
    if(!treeEdges.has(roomKey(a,b)))loopCandidates.push([a,b]);
  }
  let loops=0;
  while(loops<2&&loopCandidates.length){
    const pair=loopCandidates.splice(int(0,loopCandidates.length-1),1)[0];
    if(link(pair[0],pair[1]))loops++;
  }
  if(loops<2)throw new Error('floor generator could not add two loops');

  const floor=[...cells.values()].sort((a,b)=>a.y-b.y||a.x-b.x);
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
    const asleep=sleepRng()<0.25;
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
      hp:speciesMaxHp(BOSS.species,enemyLevel,traits.hpMultiplier*difficulty),pos:bossPos,boss:true,asleep:false});
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
  return {level,width:W,height:H,floor,rooms,arrivalRoom,arrival,up:null,down,points,enemies,enemyAiRng,
    pickups,rest,services,...(bossEnabled?{theme:themed.theme}:{}),...(bossFloor?{bossRoom}:{})};
}