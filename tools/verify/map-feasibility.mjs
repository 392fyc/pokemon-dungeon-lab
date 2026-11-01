// 8.2 地图可行性验证（main 云端工作者，只读）。
//
// 用途：在 dev 动手之前，用一个独立的参考生成器检查 v0.1 计划第 2 节的地图数值能不能同时满足：
//   36×24、9—12 个房间、2 格宽通道、6 只敌人（4 游荡 2 定点）、第 3 层首领房在中心或四边之一、
//   每层一个下楼梯、无出口。并给出委托“速通”需要的最短路径数据。
// 它不是正式实现：正式生成器由 dev 写在 src/core/dungeon.ts。这里只 import 现行代码里的纯函数
// （mulberry32、center、roomCells、generateFloor），不改 src/。
//
// 运行（Node 24）：
//   node --experimental-strip-types tools/verify/map-feasibility.mjs [--seeds 1000] [--out 路径.json]
// 结果打印成中文表格；--out 时另写一份 JSON（建议写到被忽略的 .artifacts/ 或 .tmp/）。

import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {mulberry32,center,roomCells,generateFloor} from '../../src/core/dungeon.ts';

const args=process.argv.slice(2);
const opt=(name,def)=>{const i=args.indexOf(name);return i>=0?args[i+1]:def;};
const SEEDS=Number(opt('--seeds',1000));
const OUT=opt('--out',null);

// ---------- 参数（草案工作值，与 docs/02-进度/计划/8.2地图规格.md 第 3 节一致） ----------
export const P={
  width:36,height:24,floors:3,
  rooms:[9,12],            // 每层房间数（含到达房、首领房）
  roomW:[4,8],roomH:[3,6], // 普通房间尺寸
  largeW:[7,8],largeH:[5,6],// 保底大房间尺寸（8.3 挑战房候选）
  gap:2,                   // 两个房间之间至少 2 格墙
  bossSize:7,              // 首领房 7×7，奇数边长保证中心是一个格
  extraLoops:2,            // 树之外再加的环路数
  enemies:6,fixed:2,
  placeTries:3000,
};
const BOSS_SPOTS=['center','east','south','west','north'];

const k=p=>`${p.x},${p.y}`;
const DIRS=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const inRect=(p,r)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;

/** 首领房矩形。中心＝地图正中；四边＝贴着该边（留 1 格边框墙），另一轴居中。 */
export function bossRect(spot,W=P.width,H=P.height,s=P.bossSize){
  const cx=Math.floor((W-s)/2),cy=Math.floor((H-s)/2);
  const at={center:{x:cx,y:cy},east:{x:W-1-s,y:cy},west:{x:1,y:cy},north:{x:cx,y:1},south:{x:cx,y:H-1-s}}[spot];
  return {...at,w:s,h:s};
}

function bfs(cells,start,blocked=null){
  const dist=new Map([[k(start),0]]),q=[start];
  for(let i=0;i<q.length;i++)for(const d of DIRS){const c={x:q[i].x+d.x,y:q[i].y+d.y},kc=k(c);
    if(cells.has(kc)&&!dist.has(kc)&&!(blocked&&blocked(c))){dist.set(kc,dist.get(k(q[i]))+1);q.push(c);}}
  return dist;
}

/**
 * 参考生成器（草案第 4 节的算法要点）。
 * 1 首领层先放首领房；2 随机放其余房间（间隔 gap）；3 每个新房间连到已放房间里中心最近的一个（最小生成树式），
 *   再加 extraLoops 条环路；通道用 2×2 笔刷画 L 形，所以直段、转角、交叉处都是 2 格宽；
 *   首领房只连一条（叶子），其他通道的 L 形若穿过首领房（含外圈 1 格）就换另一种 L 形，两种都穿过就换连接对象；
 * 4 到达房：第 1、2 层为 rooms[0]；第 3 层为离首领房路径最远的房间；下楼梯在离到达房最远的房间中心。
 * 5 敌人：2 只定点放在两个不同的房间（非到达房、非首领房、非楼梯房，离到达房尽量远），4 只游荡放在其余房间格。
 */
export function referenceFloor(seed,level,spot=null){
  const W=P.width,H=P.height,bossFloor=level===P.floors;
  const rng=mulberry32((Math.imul(seed>>>0,0x9E3779B1)^Math.imul(level,0x85EBCA6B)^0x2F1C3A5B)>>>0);
  const int=(lo,hi)=>lo+Math.floor(rng()*(hi-lo+1));
  // 计划第 2 节“最中心或最边缘二选一随机”：先 50% 中心／50% 边缘，边缘再在东南西北四个里等概率取一。
  if(bossFloor&&!spot)spot=rng()<.5?'center':BOSS_SPOTS[int(1,4)];
  const target=int(P.rooms[0],P.rooms[1]);
  const apart=(a,b)=>a.x>=b.x+b.w+P.gap||b.x>=a.x+a.w+P.gap||a.y>=b.y+b.h+P.gap||b.y>=a.y+a.h+P.gap;
  // 放房间：一次“布局尝试”先按目标数试 placeTries 次，不足 9 间再只用最小号房间（4×3）补到 2×placeTries 次；
  // 仍不足 9 间就清空重来（同一个随机序列继续往下取，所以结果仍由种子唯一决定），最多 8 次布局尝试。
  let rooms=[],boss=-1,tries=0,layouts=0;
  for(;layouts<8&&rooms.length<P.rooms[0];layouts++){
    rooms=bossFloor?[bossRect(spot)]:[];boss=bossFloor?0:-1;
    for(let t=0;(rooms.length<target&&t<P.placeTries)||(rooms.length<P.rooms[0]&&t<2*P.placeTries);t++,tries++){
      // 第 2、3 个普通房间（下标 1、2）只用大号尺寸 largeW×largeH，保证除到达房与楼梯房外至少剩一间大房间给 8.3 的挑战房。
      const normal=rooms.length-(bossFloor?1:0),large=normal===1||normal===2;
      const small=t>=P.placeTries&&!large,w=large?int(...P.largeW):small?P.roomW[0]:int(...P.roomW),h=large?int(...P.largeH):small?P.roomH[0]:int(...P.roomH),r={x:int(1,W-1-w),y:int(1,H-1-h),w,h};
      if(rooms.every(o=>apart(r,o)))rooms.push(r);
    }
  }
  const placed=rooms.length;
  // 首领层把首领房挪到最后，rooms[0] 仍是“第一个普通房间”，便于与现行代码习惯一致。
  if(bossFloor){rooms.push(rooms.shift());boss=rooms.length-1;}
  const cells=new Map();const carve=c=>{if(c.x>=1&&c.y>=1&&c.x<W-1&&c.y<H-1)cells.set(k(c),{x:c.x,y:c.y});};
  rooms.forEach(r=>roomCells(r).forEach(carve));
  const bossBox=boss>=0?{x:rooms[boss].x-1,y:rooms[boss].y-1,w:rooms[boss].w+2,h:rooms[boss].h+2}:null;
  // 2 格笔刷：在 (x,y) 画 (x,y)(x+1,y)(x,y+1)(x+1,y+1)。
  const brush=(x,y)=>[{x,y},{x:x+1,y},{x,y:y+1},{x:x+1,y:y+1}];
  const lPath=(p,q,hFirst)=>{const out=[];
    const hLine=(y,x0,x1)=>{for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++)out.push(...brush(x,y));};
    const vLine=(x,y0,y1)=>{for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++)out.push(...brush(x,y));};
    if(hFirst){hLine(p.y,p.x,q.x);vLine(q.x,p.y,q.y);}else{vLine(p.x,p.y,q.y);hLine(q.y,p.x,q.x);}
    return out;};
  // 笔刷锚点取房间中心偏左上，使 2 格通道正好落在房间内部。
  const anchor=r=>({x:Math.min(r.x+Math.floor((r.w-1)/2),r.x+r.w-2),y:Math.min(r.y+Math.floor((r.h-1)/2),r.y+r.h-2)});
  const crossesBoss=(path,a,b)=>bossBox&&a!==boss&&b!==boss&&path.some(c=>inRect(c,bossBox));
  // 绕行点：首领房外框四角再向外 1 格（只用落在地图内部、且不在外框里的角）。两种 L 形都穿过首领房时，经一个绕行点走两段 L。
  const via=bossBox?[[bossBox.x-2,bossBox.y-2],[bossBox.x+bossBox.w,bossBox.y-2],[bossBox.x-2,bossBox.y+bossBox.h],[bossBox.x+bossBox.w,bossBox.y+bossBox.h]]
    .map(([x,y])=>({x,y})).filter(c=>c.x>=1&&c.y>=1&&c.x<=W-3&&c.y<=H-3):[];
  let detours=0;
  const link=(a,b)=>{const first=rng()<.5;
    for(const hFirst of [first,!first]){const path=lPath(anchor(rooms[a]),anchor(rooms[b]),hFirst);
      if(!crossesBoss(path,a,b)){path.forEach(carve);return true;}}
    const p=anchor(rooms[a]),q=anchor(rooms[b]);
    const ways=via.slice().sort((u,v)=>(Math.abs(u.x-p.x)+Math.abs(u.y-p.y)+Math.abs(u.x-q.x)+Math.abs(u.y-q.y))-(Math.abs(v.x-p.x)+Math.abs(v.y-p.y)+Math.abs(v.x-q.x)+Math.abs(v.y-q.y)));
    for(const w of ways)for(const h1 of [true,false])for(const h2 of [true,false]){
      const path=[...lPath(p,w,h1),...lPath(w,q,h2)];if(!crossesBoss(path,a,b)){path.forEach(carve);detours++;return true;}}
    return false;};
  const d2=(a,b)=>{const p=center(rooms[a]),q=center(rooms[b]);return Math.abs(p.x-q.x)+Math.abs(p.y-q.y);};
  const order=rooms.map((_,i)=>i).filter(i=>i!==boss);
  let skipped=0;
  for(let n=1;n<order.length;n++){const i=order[n];
    const prev=order.slice(0,n).sort((a,b)=>d2(i,a)-d2(i,b)||a-b);
    if(!prev.some(j=>link(i,j)))skipped++;}
  if(boss>=0){const near=order.slice().sort((a,b)=>d2(boss,a)-d2(boss,b)||a-b);if(!near.some(j=>link(boss,j)))skipped++;}
  for(let n=0;n<P.extraLoops;n++){const i=order[int(0,order.length-1)],j=order[int(0,order.length-1)];if(i!==j)link(i,j);}
  // 到达房
  let arrivalRoom=0;
  if(bossFloor){const db=bfs(cells,center(rooms[boss]));let best=-1;order.forEach(i=>{const d=db.get(k(center(rooms[i])));if(d!==undefined&&d>best){best=d;arrivalRoom=i;}});}
  const arrival=center(rooms[arrivalRoom]);
  const da=bfs(cells,arrival);
  let downRoom=-1,down=null;
  if(!bossFloor){let best=-1;order.forEach(i=>{if(i===arrivalRoom)return;const d=da.get(k(center(rooms[i])));if(d!==undefined&&d>best){best=d;downRoom=i;}});down=center(rooms[downRoom]);}
  // 敌人
  const roomDist=i=>da.get(k(center(rooms[i])))??Infinity;
  const candidates=order.filter(i=>i!==arrivalRoom&&i!==downRoom).sort((a,b)=>roomDist(b)-roomDist(a)||a-b);
  const fixedRooms=[];const pool=candidates.slice(0,Math.max(2,Math.ceil(candidates.length/2)));
  while(fixedRooms.length<P.fixed&&pool.length){fixedRooms.push(pool.splice(int(0,pool.length-1),1)[0]);}
  const used=new Set([k(arrival),...(down?[k(down)]:[]),...(boss>=0?[k(center(rooms[boss]))]:[])]);
  const enemies=[];
  for(const r of fixedRooms){const c=center(rooms[r]);const spots=roomCells(rooms[r]).filter(x=>!used.has(k(x))).sort((a,b)=>Math.abs(a.x-c.x)+Math.abs(a.y-c.y)-(Math.abs(b.x-c.x)+Math.abs(b.y-c.y)));
    const pos=spots[0]??null;if(pos)used.add(k(pos));enemies.push({kind:'fixed',room:r,pos});}
  const wanderPool=order.filter(i=>i!==arrivalRoom).flatMap(i=>roomCells(rooms[i]));
  for(let n=enemies.length;n<P.enemies;n++){
    const free=[6,4,2].map(m=>wanderPool.filter(c=>!used.has(k(c))&&(da.get(k(c))??-1)>=m)).find(l=>l.length)??[];
    const pos=free.length?free[int(0,free.length-1)]:null;if(pos)used.add(k(pos));enemies.push({kind:'wander',pos});}
  return {seed,level,spot,target,placed,tries,layouts,skipped,detours,rooms,boss,arrivalRoom,arrival,downRoom,down,cells,enemies};
}

// ---------- 检查 ----------
/** 每个“通道格”（不在任何房间里的地面）都至少属于一个全是地面的 2×2 方块，就说明它所在处宽度≥2。 */
function narrowCells(cells,rooms){
  const has=(x,y)=>cells.has(`${x},${y}`);let bad=0,corr=0;
  for(const c of cells.values()){if(rooms.some(r=>inRect(c,r)))continue;corr++;
    const ok=[[0,0],[-1,0],[0,-1],[-1,-1]].some(([dx,dy])=>has(c.x+dx,c.y+dy)&&has(c.x+dx+1,c.y+dy)&&has(c.x+dx,c.y+dy+1)&&has(c.x+dx+1,c.y+dy+1));
    if(!ok)bad++;}
  return {bad,corr};
}
/** 首领房是不是叶子：从首领房外的任一格出发，不经过首领房能走到所有非首领房格。另数首领房入口（与房外地面相邻的房内边缘格组成的连通段数）。 */
/** 走廊并成大片空地的程度：不在房间里、却位于一个 3×3 全地面方块内的格子数。这类格子在引擎里按“走廊”处理（G4.4 走廊视野），玩家会觉得像一间没被识别的房间。 */
function openCorridorCells(cells,rooms){const has=(x,y)=>cells.has(`${x},${y}`);let n=0;
  for(const c of cells.values()){if(rooms.some(r=>inRect(c,r)))continue;
    let ok=false;for(let dx=-2;dx<=0&&!ok;dx++)for(let dy=-2;dy<=0&&!ok;dy++){let all=true;for(let i=0;i<3&&all;i++)for(let j=0;j<3;j++)if(!has(c.x+dx+i,c.y+dy+j)){all=false;break;}ok=all;}
    if(ok)n++;}
  return n;}
function bossLeaf(f){
  if(f.boss<0)return null;const br=f.rooms[f.boss];
  const outside=[...f.cells.values()].filter(c=>!inRect(c,br));
  const set=new Map(outside.map(c=>[k(c),c]));const reach=bfs(set,outside[0]);
  const door=new Set();for(const c of roomCells(br))if(DIRS.some(d=>{const n={x:c.x+d.x,y:c.y+d.y};return !inRect(n,br)&&f.cells.has(k(n));}))door.add(k(c));
  // 入口段：门格按 4 邻接分组
  let segs=0;const seen=new Set();for(const d of door){if(seen.has(d))continue;segs++;const q=[d];seen.add(d);
    while(q.length){const [x,y]=q.pop().split(',').map(Number);for(const e of DIRS){const n=`${x+e.x},${y+e.y}`;if(door.has(n)&&!seen.has(n)){seen.add(n);q.push(n);}}}}
  return {passThrough:reach.size!==outside.length,doorSegments:segs,doorCells:door.size};
}
/** 迷雾探索机器人：只按 G4.4 的玩家地图规则揭示（房间里看整间、走廊里四向各 4 格），每回合走一步，
 * 去最近的“边界格”（已揭示、且有未揭示的相邻地面），看到目标后走最短已知路。返回到达目标所用步数。 */
function fogSteps(f,goalCell,maxSteps=2000){
  const seen=new Set();let pos=f.arrival;
  const reveal=p=>{seen.add(k(p));for(const d of DIRS){let c=p;for(let n=0;n<4;n++){c={x:c.x+d.x,y:c.y+d.y};if(!f.cells.has(k(c)))break;seen.add(k(c));}}
    for(const r of f.rooms)if(inRect(p,r))roomCells(r).forEach(c=>seen.add(k(c)));};
  reveal(pos);
  for(let step=0;step<maxSteps;step++){
    if(k(pos)===k(goalCell))return step;
    const known=new Map([...seen].map(s=>[s,f.cells.get(s)]));
    const dist=new Map([[k(pos),{d:0,first:null}]]),q=[pos];let target=null;
    if(seen.has(k(goalCell)))target=k(goalCell);
    for(let i=0;i<q.length;i++){const cur=q[i],info=dist.get(k(cur));
      if(!target&&DIRS.some(d=>{const n={x:cur.x+d.x,y:cur.y+d.y};return f.cells.has(k(n))&&!seen.has(k(n));})){target=k(cur);break;}
      for(const d of DIRS){const n={x:cur.x+d.x,y:cur.y+d.y};if(known.has(k(n))&&!dist.has(k(n))){dist.set(k(n),{d:info.d+1,first:info.first??n});q.push(n);}}}
    if(!target||!dist.has(target))return Infinity;
    const next=dist.get(target).first;if(!next)return Infinity;pos=next;reveal(pos);
  }
  return Infinity;
}

const hist=xs=>{const m=new Map();xs.forEach(x=>m.set(x,(m.get(x)??0)+1));return [...m.entries()].sort((a,b)=>a[0]-b[0]);};
const q=(xs,p)=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(p*(s.length-1)))];};
const stats=xs=>({min:Math.min(...xs),p10:q(xs,.1),p50:q(xs,.5),p90:q(xs,.9),max:Math.max(...xs),mean:+(xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(1)});

// ---------- 运行 ----------
const t0=performance.now();
const R={seeds:SEEDS,params:P,platform:process.platform,node:process.version,reference:{},current:{},bossSpots:{}};
const bossSpotN=[],openN=[],corrN=[],largeN=[],layoutN=[],detourN=[],roomsN=[],placedShort=[],skipped=[],disconnected=[],narrow=[],stairsUnreach=[],shortest=[],fog=[],fogRatio=[],fixedDist=[],fixedSameRoom=[],genMs=[],bossLeafBad=[],bossDoors=[],bossPath=[],enemyFail=[],cellsN=[];
for(let seed=1;seed<=SEEDS;seed++)for(let level=1;level<=P.floors;level++){
  const a=performance.now();const f=referenceFloor(seed,level);genMs.push(performance.now()-a);
  roomsN.push(f.rooms.length);if(f.rooms.length<P.rooms[0])placedShort.push({seed,level,rooms:f.rooms.length});
  skipped.push(f.skipped);detourN.push(f.detours);largeN.push(f.rooms.filter((r,i)=>i!==f.boss&&i!==f.arrivalRoom&&i!==f.downRoom&&r.w>=6&&r.h>=5).length);layoutN.push(f.layouts);cellsN.push(f.cells.size);
  const all=[...f.cells.values()];const reach=bfs(f.cells,all[0]);if(reach.size!==all.length)disconnected.push({seed,level});
  const nw=narrowCells(f.cells,f.rooms);corrN.push(nw.corr);openN.push(openCorridorCells(f.cells,f.rooms));if(nw.bad)narrow.push({seed,level,bad:nw.bad});
  if(f.enemies.length!==P.enemies||f.enemies.some(e=>!e.pos))enemyFail.push({seed,level});
  const da=bfs(f.cells,f.arrival);
  if(f.down){const d=da.get(k(f.down));if(d===undefined)stairsUnreach.push({seed,level});else{shortest.push(d);
    if(seed<=Math.min(SEEDS,300)){const s=fogSteps(f,f.down);fog.push(s);fogRatio.push(s/d);}}}
  else{const bl=bossLeaf(f);if(bl.passThrough)bossLeafBad.push({seed,spot:f.spot});bossDoors.push(bl.doorSegments);
    bossSpotN.push(f.spot);bossPath.push(da.get(k(center(f.rooms[f.boss]))));}
  for(const e of f.enemies.filter(e=>e.kind==='fixed'&&e.pos))fixedDist.push(da.get(k(e.pos))??-1);
  const fr=f.enemies.filter(e=>e.kind==='fixed').map(e=>e.room);if(new Set(fr).size!==fr.length)fixedSameRoom.push({seed,level});
}
// 首领房五个位置逐一强制，看能否都放下其余房间并保持连通、叶子
for(const spot of BOSS_SPOTS){let ok=0,short=0,leaf=0,conn=0;const rn=[];
  for(let seed=1;seed<=SEEDS;seed++){const f=referenceFloor(seed,3,spot);rn.push(f.rooms.length);
    const all=[...f.cells.values()];const c=bfs(f.cells,all[0]).size===all.length;const lf=!bossLeaf(f).passThrough;
    if(f.rooms.length>=P.rooms[0])ok++;else short++;if(lf)leaf++;if(c)conn++;}
  R.bossSpots[spot]={roomsAtLeast9:ok,roomsShort:short,connected:conn,leaf,rooms:stats(rn)};}
// 现行生成器直接放大到 36×24 的基线（只读调用 generateFloor），说明为什么需要改算法
const cur={rooms:[],narrow:0,floors:0};
for(let seed=1;seed<=Math.min(SEEDS,300);seed++)for(let level=1;level<=3;level++){
  const g=generateFloor(seed,level,{width:36,height:24,floors:3,boss:true});cur.floors++;cur.rooms.push(g.rooms.length);
  const cells=new Map(g.floor.map(c=>[k(c),c]));if(narrowCells(cells,g.rooms).bad)cur.narrow++;}
R.current={floors:cur.floors,roomHist:hist(cur.rooms),floorsWithOneWidePassages:cur.narrow};
const speed=shortest.map(d=>Math.ceil(d*1.5));
R.reference={floors:SEEDS*P.floors,roomHist:hist(roomsN),floorsBelow9Rooms:placedShort.length,floorsWithSkippedLinks:skipped.filter(x=>x>0).length,floorsWithDetours:detourN.filter(x=>x>0).length,layoutAttempts:hist(layoutN),largeRoomsPerFloor:hist(largeN),corridorCells:stats(corrN),openCorridorCells:stats(openN),
  disconnected:disconnected.length,floorsWithNarrowCells:narrow.length,narrowExamples:narrow.slice(0,5),enemyPlacementFail:enemyFail.length,
  stairsUnreachable:stairsUnreach.length,shortestArrivalToDown:stats(shortest),speedrunN:stats(speed),
  fogBotSteps:stats(fog.filter(Number.isFinite)),fogBotUnfinished:fog.filter(x=>!Number.isFinite(x)).length,
  fogBotRatio:stats(fogRatio.filter(Number.isFinite).map(x=>+x.toFixed(2))),fogBotWithin15:+(fogRatio.filter(x=>x<=1.5).length/fogRatio.length*100).toFixed(1),
  fogBotWithin20:+(fogRatio.filter(x=>x<=2).length/fogRatio.length*100).toFixed(1),fogBotWithin25:+(fogRatio.filter(x=>x<=2.5).length/fogRatio.length*100).toFixed(1),fogBotWithin30:+(fogRatio.filter(x=>x<=3).length/fogRatio.length*100).toFixed(1),
  fixedEnemyPathFromArrival:stats(fixedDist),fixedSameRoom:fixedSameRoom.length,
  bossLeafViolations:bossLeafBad.length,bossSpotDrawn:Object.fromEntries(hist(bossSpotN.map(x=>BOSS_SPOTS.indexOf(x))).map(([i,n])=>[BOSS_SPOTS[i],n])),bossDoorSegments:hist(bossDoors),arrivalToBossCentre:stats(bossPath),
  floorCells:stats(cellsN),genMsPerFloor:{p50:+q(genMs,.5).toFixed(3),p99:+q(genMs,.99).toFixed(3),max:+Math.max(...genMs).toFixed(3)}};
R.totalSeconds=+((performance.now()-t0)/1000).toFixed(1);

const r=R.reference;
console.log(`# 8.2 地图可行性（参考生成器，${SEEDS} 种子 × 3 层＝${r.floors} 层；${process.platform} ${process.version}）`);
console.log(`房间数分布 ${JSON.stringify(r.roomHist)}；少于 9 间的层 ${r.floorsBelow9Rooms}；有连接被跳过的层 ${r.floorsWithSkippedLinks}；用了绕行点的层 ${r.floorsWithDetours}；布局尝试次数分布 ${JSON.stringify(r.layoutAttempts)}`);
console.log(`可当挑战房的大房间（≥6×5，非到达／楼梯／首领房）每层个数 ${JSON.stringify(r.largeRoomsPerFloor)}`);
console.log(`走廊格 ${JSON.stringify(r.corridorCells)}；其中位于 3×3 空地内的走廊格 ${JSON.stringify(r.openCorridorCells)}`);
console.log(`不连通 ${r.disconnected}；有 1 格窄处的层 ${r.floorsWithNarrowCells}；敌人放不下 ${r.enemyPlacementFail}；楼梯不可达 ${r.stairsUnreachable}`);
console.log(`到达→下楼梯最短路 ${JSON.stringify(r.shortestArrivalToDown)}；速通 N=ceil(1.5d) ${JSON.stringify(r.speedrunN)}`);
console.log(`迷雾机器人步数 ${JSON.stringify(r.fogBotSteps)}，未到达 ${r.fogBotUnfinished}；步数/最短路 ${JSON.stringify(r.fogBotRatio)}；≤1.5 倍 ${r.fogBotWithin15}%，≤2 倍 ${r.fogBotWithin20}%，≤2.5 倍 ${r.fogBotWithin25}%，≤3 倍 ${r.fogBotWithin30}%`);
console.log(`定点敌人离到达点路径 ${JSON.stringify(r.fixedEnemyPathFromArrival)}；两只同房 ${r.fixedSameRoom}`);
console.log(`首领房：穿堂（非叶子）${r.bossLeafViolations}；随机抽到的位置 ${JSON.stringify(r.bossSpotDrawn)}；入口段数 ${JSON.stringify(r.bossDoorSegments)}；到达点→首领中心 ${JSON.stringify(r.arrivalToBossCentre)}`);
console.log('首领房五个位置强制：');for(const [s,v] of Object.entries(R.bossSpots))console.log(`  ${s}: ≥9 间 ${v.roomsAtLeast9}/${SEEDS}，连通 ${v.connected}，叶子 ${v.leaf}，房间数 ${JSON.stringify(v.rooms)}`);
console.log(`地面格数 ${JSON.stringify(r.floorCells)}；生成耗时 ms/层 ${JSON.stringify(r.genMsPerFloor)}`);
console.log(`现行 generateFloor 直接放大到 36×24（${R.current.floors} 层）：房间数 ${JSON.stringify(R.current.roomHist)}；有 1 格窄通道的层 ${R.current.floorsWithOneWidePassages}`);
console.log(`总耗时 ${R.totalSeconds}s`);
if(OUT)writeFileSync(OUT,JSON.stringify(R,null,1));

// --ascii <种子>：打印该种子三层的字符图（#墙 .地面 A到达 >下楼梯 B首领 F定点敌人 w游荡敌人），便于肉眼检查通道宽度。
const asciiSeed=opt('--ascii',null);
if(asciiSeed!==null){for(let level=1;level<=P.floors;level++){const f=referenceFloor(Number(asciiSeed),level);
  const mark=new Map([[k(f.arrival),'A']]);if(f.down)mark.set(k(f.down),'>');if(f.boss>=0)mark.set(k(center(f.rooms[f.boss])),'B');
  f.enemies.forEach(e=>e.pos&&mark.set(k(e.pos),e.kind==='fixed'?'F':'w'));
  console.log(`\n种子 ${asciiSeed} 第 ${level} 层${f.spot?'（首领房：'+f.spot+'）':''}，${f.rooms.length} 间`);
  for(let y=0;y<P.height;y++){let line='';for(let x=0;x<P.width;x++){const c=`${x},${y}`;line+=mark.get(c)??(f.cells.has(c)?'.':'#');}console.log(line);}}}
