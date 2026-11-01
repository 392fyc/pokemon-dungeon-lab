// 8.3 交互格撞格统计（main 云端工作者，只读）：用正式生成器（8.2，PR #127）的地图，按 8.3 草案的分配算法
// （rooms-83.mjs 的 assignRooms）指定探险房间，统计房间中心格是否已被 8.2 的点位、拾取物、服务点或出生敌人占用，
// 以及按 8.3 第 3 节第 9 条的规则（离中心最近的空格，平手先小 y 再小 x）要挪多远。
//
// 运行（Node 24）：node --experimental-strip-types tools/verify/rooms-83-official.mjs [--seeds 1000] [--dungeon <dungeon.ts 路径>]
// --dungeon 默认是本仓库的 src/core/dungeon.ts；PR #127 合并前可指向 #127 检出的 src/core/dungeon.ts。
import {pathToFileURL} from 'node:url';
import {assignRooms} from './rooms-83.mjs';

const args=process.argv.slice(2);
const opt=(n,d)=>{const i=args.indexOf(n);return i>=0?args[i+1]:d;};
const SEEDS=Number(opt('--seeds',1000));
const DUNGEON=opt('--dungeon',null);
const mod=await import(DUNGEON?pathToFileURL(DUNGEON).href:'../../src/core/dungeon.ts');
const {generateFloor,center,roomCells}=mod;
const k=p=>`${p.x},${p.y}`;
const inRect=(p,r)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;
const PARAMS={width:36,height:24,floors:3,boss:true,roguelike:true};

/** 把正式生成器的结果转成 assignRooms 需要的形状（房间下标、定点敌人所在房间）。 */
function adapt(g){
  const roomOf=p=>g.rooms.findIndex(r=>inRect(p,r));
  return {rooms:g.rooms,arrivalRoom:g.arrivalRoom,downRoom:g.down?roomOf(g.down):-1,boss:g.bossRoom??-1,
    enemies:g.enemies.filter(e=>!e.boss).map(e=>e.post?{kind:'fixed',room:roomOf(e.post),pos:e.pos}:{kind:'wander',pos:e.pos})};
}
if(!generateFloor(1,1,PARAMS).arrivalRoom&&generateFloor(1,1,PARAMS).arrivalRoom!==0)throw Error('这个 dungeon.ts 不是 8.2 的正式生成器（没有 arrivalRoom）');

const byKind={},moved=[];let rooms=0,collisions=0,noFree=0;
for(let seed=1;seed<=SEEDS;seed++)for(let level=1;level<=3;level++){
  const g=generateFloor(seed,level,PARAMS),f=adapt(g),a=assignRooms(f,seed,level);
  const occ=new Map();const mark=(p,why)=>occ.set(k(p),why);
  g.points.forEach(p=>mark(p.pos,p.kind));g.pickups.forEach(p=>mark(p.pos,p.kind));g.services.forEach(p=>mark(p.pos,p.kind));
  if(g.rest)mark(g.rest.pos,'rest');g.enemies.forEach(e=>mark(e.pos,e.boss?'boss':e.post?'fixed-enemy':'wander-enemy'));
  for(const o of a.assigned){rooms++;const r=g.rooms[o.room],c=center(r);
    if(occ.has(k(c))){collisions++;const why=occ.get(k(c));byKind[why]=(byKind[why]??0)+1;}
    const free=roomCells(r).filter(p=>!occ.has(k(p))).sort((p,q)=>(Math.abs(p.x-c.x)+Math.abs(p.y-c.y))-(Math.abs(q.x-c.x)+Math.abs(q.y-c.y))||p.y-q.y||p.x-q.x);
    if(!free.length){noFree++;continue;}
    moved.push(Math.abs(free[0].x-c.x)+Math.abs(free[0].y-c.y));}
}
const hist=xs=>{const m=new Map();xs.forEach(x=>m.set(x,(m.get(x)??0)+1));return [...m.entries()].sort((a,b)=>a[0]-b[0]);};
console.log(`# 8.3 交互格撞格（正式生成器 ${DUNGEON??'src/core/dungeon.ts'}；${SEEDS} 种子 × 3 层；${process.platform} ${process.version}）`);
console.log(`探险房间 ${rooms} 间；中心格已被占用 ${collisions} 间（${(collisions/rooms*100).toFixed(1)}％），按占用者 ${JSON.stringify(byKind)}；没有空格的房间 ${noFree}`);
console.log(`按“离中心最近的空格”规则挪动的距离分布 ${JSON.stringify(hist(moved))}`);
