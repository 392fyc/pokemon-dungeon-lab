// 8.3 探险房间可行性验证（main 云端工作者，只读）。
//
// 问题：在 8.2 的参考地图上（tools/verify/map-feasibility.mjs 的 referenceFloor），每层再指定 2—3 间探险房间
// （挑战 35％／委托 30％／祝福 20％／道具 15％，挑战房每层至多 1 间且必须是大房间），放不放得下？大房间够不够？
// 候选房间＝非到达房、非楼梯房、非首领房、非定点敌人房（草案第 3 节）。
// 大房间＝宽≥6 且高≥5（可容纳队伍 3 人＋敌人 4 只并留出走位）；小房间＝其余。
//
// 运行（Node 24）：node --experimental-strip-types tools/verify/rooms-83.mjs [--seeds 1000] [--out 路径.json]
import {writeFileSync} from 'node:fs';
import {mulberry32,roomCells,center} from '../../src/core/dungeon.ts';
import {referenceFloor,P,bfs,k,DIRS,inRect} from './map-feasibility.mjs';

const args=process.argv.slice(2);
const opt=(n,d)=>{const i=args.indexOf(n);return i>=0?args[i+1]:d;};
const SEEDS=Number(opt('--seeds',1000)),OUT=opt('--out',null);

export const WEIGHTS={challenge:35,commission:30,blessing:20,item:15};
export const isLarge=r=>r.w>=6&&r.h>=5;

/**
 * 草案第 4 节的分配算法（独立随机序列，不改变 8.2 的地图与敌人）：
 * 1 房间数 2 或 3（各 50％）；2 每个名额按权重抽类型，挑战已抽过或没有大候选时把挑战从权重里去掉；
 * 3 挑战→在大候选里随机；其余→优先小候选，没有小候选时用大候选（记为“借用大房间”）；4 候选用完就停。
 */
export function assignRooms(f,seed,level){
  const rng=mulberry32((Math.imul(seed>>>0,0x27D4EB2F)^Math.imul(level,0x165667B1)^0x3C6EF372)>>>0);
  const fixedRooms=new Set(f.enemies.filter(e=>e.kind==='fixed').map(e=>e.room));
  const cand=f.rooms.map((r,i)=>i).filter(i=>i!==f.arrivalRoom&&i!==f.downRoom&&i!==f.boss&&!fixedRooms.has(i));
  const want=rng()<.5?2:3,out=[];let borrowed=0,challengeBlocked=0;
  const left=new Set(cand);
  for(let n=0;n<want&&left.size;n++){
    const large=[...left].filter(i=>isLarge(f.rooms[i])),small=[...left].filter(i=>!isLarge(f.rooms[i]));
    const w={...WEIGHTS};if(out.some(o=>o.type==='challenge')||!large.length){if(!out.some(o=>o.type==='challenge')&&!large.length)challengeBlocked++;delete w.challenge;}
    const total=Object.values(w).reduce((a,b)=>a+b,0);let x=rng()*total,type=null;
    for(const [t,v] of Object.entries(w)){if(x<v){type=t;break;}x-=v;}
    let pool=type==='challenge'?large:(small.length?small:large);
    if(type!=='challenge'&&!small.length)borrowed++;
    const room=pool[Math.floor(rng()*pool.length)];left.delete(room);out.push({type,room});
  }
  return {want,assigned:out,candidates:cand.length,largeCandidates:cand.filter(i=>isLarge(f.rooms[i])).length,borrowed,challengeBlocked};
}
/** 房间的门格：房间边缘上与房外地面相邻的格，按 4 邻接分段。 */
export function doors(f,ri){const r=f.rooms[ri];const door=[];
  for(const c of roomCells(r))if(DIRS.some(d=>{const n={x:c.x+d.x,y:c.y+d.y};return !inRect(n,r)&&f.cells.has(k(n));}))door.push(c);
  const set=new Set(door.map(k)),seen=new Set();let segs=0;
  for(const c of door){if(seen.has(k(c)))continue;segs++;const q=[c];seen.add(k(c));while(q.length){const p=q.pop();for(const d of DIRS){const n={x:p.x+d.x,y:p.y+d.y};if(set.has(k(n))&&!seen.has(k(n))){seen.add(k(n));q.push(n);}}}}
  return {cells:door.length,segments:segs};}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const hist=xs=>{const m=new Map();xs.forEach(x=>m.set(x,(m.get(x)??0)+1));return [...m.entries()].sort((a,b)=>a[0]<b[0]?-1:1);};
  const q=(xs,p)=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.floor(p*(s.length-1))];};
  const R={seeds:SEEDS,weights:WEIGHTS,node:process.version,platform:process.platform};
  const cands=[],larges=[],placed=[],short=[],types=[],borrowed=[],blocked=[],chalArea=[],chalDoors=[],chalCells=[],otherArea=[],distArr=[],perLevelChal={1:0,2:0,3:0};
  for(let seed=1;seed<=SEEDS;seed++)for(let level=1;level<=3;level++){
    const f=referenceFloor(seed,level),a=assignRooms(f,seed,level);
    cands.push(a.candidates);larges.push(a.largeCandidates);placed.push(a.assigned.length);if(a.assigned.length<a.want)short.push({seed,level,want:a.want,got:a.assigned.length});
    borrowed.push(a.borrowed);blocked.push(a.challengeBlocked);
    const da=bfs(f.cells,f.arrival);
    for(const o of a.assigned){types.push(o.type);const r=f.rooms[o.room];distArr.push(da.get(k(center(r))));
      if(o.type==='challenge'){perLevelChal[level]++;chalArea.push(r.w*r.h);const d=doors(f,o.room);chalDoors.push(d.segments);chalCells.push(d.cells);}
      else otherArea.push(r.w*r.h);}
  }
  const floors=SEEDS*3,st=xs=>({min:Math.min(...xs),p10:q(xs,.1),p50:q(xs,.5),p90:q(xs,.9),max:Math.max(...xs)});
  Object.assign(R,{floors,candidatesPerFloor:hist(cands),largeCandidatesPerFloor:hist(larges),roomsPlaced:hist(placed),floorsShort:short.length,shortExamples:short.slice(0,5),
    typeShare:Object.fromEntries(hist(types).map(([t,n])=>[t,+(n/types.length*100).toFixed(1)])),floorsWithChallenge:Object.values(perLevelChal).reduce((a,b)=>a+b,0),challengeByLevel:perLevelChal,
    floorsBorrowingLarge:borrowed.filter(x=>x>0).length,floorsChallengeBlocked:blocked.filter(x=>x>0).length,
    challengeArea:st(chalArea),challengeDoorSegments:hist(chalDoors),challengeDoorCells:st(chalCells),otherArea:st(otherArea),pathFromArrival:st(distArr)});
  console.log(`# 8.3 探险房间可行性（${SEEDS} 种子 × 3 层＝${floors} 层；${process.platform} ${process.version}）`);
  console.log(`候选房间数/层 ${JSON.stringify(R.candidatesPerFloor)}；其中大房间 ${JSON.stringify(R.largeCandidatesPerFloor)}`);
  console.log(`实际放下 ${JSON.stringify(R.roomsPlaced)}；没放够的层 ${R.floorsShort}`);
  console.log(`类型占比％ ${JSON.stringify(R.typeShare)}；有挑战房的层 ${R.floorsWithChallenge}/${floors} ${JSON.stringify(perLevelChal)}；因没有大候选而挑战被去掉的层 ${R.floorsChallengeBlocked}；非挑战房借用大房间的层 ${R.floorsBorrowingLarge}`);
  console.log(`挑战房面积 ${JSON.stringify(R.challengeArea)}；入口段数 ${JSON.stringify(R.challengeDoorSegments)}；门格数 ${JSON.stringify(R.challengeDoorCells)}；其他探险房面积 ${JSON.stringify(R.otherArea)}`);
  console.log(`探险房离到达点路径 ${JSON.stringify(R.pathFromArrival)}`);
  if(OUT)writeFileSync(OUT,JSON.stringify(R,null,1));
}
