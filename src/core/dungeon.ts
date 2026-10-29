/**
 * 6.3 seeded floor generator. Pure functions, no engine import at run time (type-free on purpose):
 * the same (seed, level, params) always returns byte-identical data, whatever order floors are visited in.
 * Rooms-and-corridors layout; every floor cell is connected by construction (see tests/core/dungeon.test.mjs).
 * All numbers below are WORKING CANDIDATES (map size, room counts, enemy counts, enemy stats), not final balance.
 */
export type Cell={x:number;y:number};
export type FloorParams={width:number;height:number;floors:number};
export const DEFAULT_PARAMS:FloorParams={width:20,height:14,floors:2};
export type PointKind='goal'|'item'|'exit'|'down'|'up'|'berry'|'tonic'|'rest';
export type PointSpec={pos:Cell;kind:PointKind;used:boolean};
export type EnemyAi='melee'|'ranged'|'chase';
export type EnemySpec={id:string;species:string;ai:EnemyAi;hp:number;damage:number;range:number;pos:Cell};
export type Room={x:number;y:number;w:number;h:number};
export type GeneratedFloor={level:number;width:number;height:number;floor:Cell[];rooms:Room[];
  /** Where the team first arrives from outside (level 1: the ordinary exit) or from above (the up stairs). */
  arrival:Cell;up:Cell|null;down:Cell|null;points:PointSpec[];enemies:EnemySpec[];
  /** 6.4 recovery pickups (berry on every floor, tonic on floor 2). Kept apart from `points` and drawn from their own random stream, so the layout above is unchanged. */
  pickups:PointSpec[];
  /** 6.5 one-use rest point, floor 2 only, in the arrival room next to the up stairs. Kept apart from `pickups` and `points` so those lists are unchanged. */
  rest:PointSpec|null};
/**
 * Wild species used for display and ids only; battle numbers stay on the manual tiers below.
 * Must stay a subset of the non-starter species in src/data/roster.json (checked by a test); values are dex numbers.
 */
export const WILD_SPECIES:Record<string,string>={pidgey:'0016',rattata:'0019',spearow:'0021',zubat:'0041',geodude:'0074'};
/** Manual stat tiers copied from the fixed main map: E (melee), R (ranged), V5 chaser. */
const TIERS:Record<EnemyAi,{hp:number;damage:number;range:number}>={melee:{hp:16,damage:4,range:1},ranged:{hp:6,damage:6,range:3},chase:{hp:6,damage:3,range:1}};
export function mulberry32(seed:number):()=>number {
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
}
const k=(p:Cell)=>`${p.x},${p.y}`;
const dist=(a:Cell,b:Cell)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const DIRS:Cell[]=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const center=(r:Room):Cell=>({x:r.x+Math.floor(r.w/2),y:r.y+Math.floor(r.h/2)});
const roomCells=(r:Room):Cell[]=>{const out:Cell[]=[];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)out.push({x,y});return out;};

export function generateFloor(seed:number,level:number,params:FloorParams=DEFAULT_PARAMS):GeneratedFloor {
  const {width:W,height:H,floors}=params;
  const rng=mulberry32((Math.imul(seed>>>0,0x9E3779B1)^Math.imul(level,0x85EBCA6B)^0x5BD1E995)>>>0);
  const int=(lo:number,hi:number)=>lo+Math.floor(rng()*(hi-lo+1));
  const pick=<T>(xs:T[]):T=>xs[int(0,xs.length-1)];
  // 1. Rooms: 3-6 wide, 3-5 high, one wall cell of gap between any two, never touching the map border.
  const rooms:Room[]=[];const target=int(5,7);
  const apart=(a:Room,b:Room)=>a.x>=b.x+b.w+1||b.x>=a.x+a.w+1||a.y>=b.y+b.h+1||b.y>=a.y+a.h+1;
  for(let tries=0;(rooms.length<target&&tries<400)||(rooms.length<4&&tries<20000);tries++){
    const w=int(3,6),h=int(3,5),r:Room={x:int(1,W-1-w),y:int(1,H-1-h),w,h};
    if(rooms.every(o=>apart(r,o)))rooms.push(r);
  }
  if(rooms.length<4)throw Error('floor generator could not place four rooms');
  // 2. Corridors: each new room joins a random earlier room (a tree, so all connected), plus one extra loop.
  const cells=new Map<string,Cell>();
  const carve=(c:Cell)=>{cells.set(k(c),{x:c.x,y:c.y});};
  rooms.forEach(r=>roomCells(r).forEach(carve));
  const link=(a:Room,b:Room)=>{
    const p=center(a),q=center(b),horizontalFirst=rng()<.5;
    const hLine=(y:number)=>{for(let x=Math.min(p.x,q.x);x<=Math.max(p.x,q.x);x++)carve({x,y});};
    const vLine=(x:number)=>{for(let y=Math.min(p.y,q.y);y<=Math.max(p.y,q.y);y++)carve({x,y});};
    if(horizontalFirst){hLine(p.y);vLine(q.x);}else{vLine(p.x);hLine(q.y);}
  };
  for(let i=1;i<rooms.length;i++)link(rooms[i],rooms[int(0,i-1)]);
  const i=int(0,rooms.length-1),j=int(0,rooms.length-1);if(i!==j)link(rooms[i],rooms[j]);
  const floor=[...cells.values()].sort((a,b)=>a.y-b.y||a.x-b.x);
  // 3. Path distance from the first room's centre decides where the down stairs go (the farthest room).
  const start=center(rooms[0]);const depth=new Map<string,number>([[k(start),0]]);const queue=[start];
  for(let n=0;n<queue.length;n++)for(const d of DIRS){const c={x:queue[n].x+d.x,y:queue[n].y+d.y};
    if(cells.has(k(c))&&!depth.has(k(c))){depth.set(k(c),depth.get(k(queue[n]))!+1);queue.push(c);}}
  let downRoom=-1;
  if(level<floors){let best=-1;rooms.forEach((r,n)=>{if(n===0)return;const dd=depth.get(k(center(r)))!;if(dd>best){best=dd;downRoom=n;}});}
  const used=new Set<string>();const points:PointSpec[]=[];
  const place=(kind:PointKind,pos:Cell)=>{used.add(k(pos));points.push({pos:{x:pos.x,y:pos.y},kind,used:false});};
  let up:Cell|null=null,down:Cell|null=null;
  if(level===1)place('exit',start);else{up={x:start.x,y:start.y};place('up',up);}
  if(downRoom>=0){down=center(rooms[downRoom]);place('down',down);}
  // 4. The goal G (first floor) and the result T (last floor) go into rooms that are neither the arrival room nor the stairs room.
  const free=(n:number)=>roomCells(rooms[n]).filter(c=>!used.has(k(c)));
  const others=rooms.map((_,n)=>n).filter(n=>n!==0&&n!==downRoom);
  if(level===1)place('goal',pick(free(pick(others))));
  if(level===floors)place('item',pick(free(pick(others))));
  // 5. Enemies: never in the arrival room, never next to the stairs or points; far from the arrival when room allows.
  const ais:EnemyAi[]=level===1?['melee','ranged']:['melee','ranged','chase'];
  const species=Object.keys(WILD_SPECIES);const enemies:EnemySpec[]=[];
  const anchors=points.map(p=>p.pos);
  ais.forEach((ai,n)=>{
    const pool=rooms.slice(1).flatMap(roomCells).filter(c=>!used.has(k(c))&&anchors.every(a=>dist(a,c)>=2));
    const far=[6,4,2].map(m=>pool.filter(c=>dist(c,start)>=m)).find(l=>l.length>0)??pool;
    const pos=pick(far);used.add(k(pos));
    enemies.push({id:`w${level}${'abc'[n]}`,species:pick(species),ai,...TIERS[ai],pos});
  });
  // 6. Pickups (6.4 working candidate): one berry per floor, plus one tonic on floor 2. Own random stream; never on a point or an enemy; outside the arrival room when possible.
  const prng=mulberry32((Math.imul(seed>>>0,0x7FEB352D)^Math.imul(level,0x846CA68B)^0x1B873593)>>>0);
  const pickups:PointSpec[]=[];
  for(const kind of (level===2?['berry','tonic']:['berry']) as PointKind[]){
    const outside=rooms.slice(1).flatMap(roomCells).filter(c=>!used.has(k(c)));
    const pool=outside.length?outside:floor.filter(c=>!used.has(k(c)));
    const pos=pool[Math.floor(prng()*pool.length)];used.add(k(pos));pickups.push({pos:{x:pos.x,y:pos.y},kind,used:false});
  }
  // 7. Rest point (6.5): floor 2, the free cell of the arrival room nearest to the up stairs (ties: top row first, then left).
  let rest:PointSpec|null=null;
  if(level===2){const near=roomCells(rooms[0]).filter(c=>!used.has(k(c))).sort((a,b)=>dist(a,start)-dist(b,start)||a.y-b.y||a.x-b.x)[0];
    if(near){used.add(k(near));rest={pos:{x:near.x,y:near.y},kind:'rest',used:false};}}
  return {level,width:W,height:H,floor,rooms,arrival:level===1?start:up!,up,down,points,enemies,pickups,rest};
}
