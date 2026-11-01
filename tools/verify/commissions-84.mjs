// 8.4 委托与祝福的算法验证（main 云端工作者，只读）。
//
// 1. 按用户决定 D-20261101-19 的新走廊视野（直线最多 4 格、遇墙停、墙与该处两侧揭示、距离 d 的两侧格随直线格揭示），
//    重算“迷雾机器人”从到达点找到下楼梯的步数，并与旧视野（只看直线）对比；评估速通 N＝⌈2.5×最短路⌉。
// 2. 速通委托的两种起算法：从进入本层起算（main 现行决定）与从接下委托起算（对照）。
// 3. 探路委托的可行性：下一层有没有祝福房或道具房，机器人要多走多少步。
// 4. 收集委托：每层能捡到的道具个数（拾取物＋道具房＋挑战房奖励的期望）。
// 地图来自 8.2 参考生成器（map-feasibility.mjs），探险房间来自 8.3 草案的分配（rooms-83.mjs）。
//
// 运行（Node 24）：node --experimental-strip-types tools/verify/commissions-84.mjs [--seeds 300] [--out 路径.json]
import {writeFileSync} from 'node:fs';
import {roomCells,center} from '../../src/core/dungeon.ts';
import {referenceFloor,bfs,k,DIRS,inRect} from './map-feasibility.mjs';
import {assignRooms} from './rooms-83.mjs';

const args=process.argv.slice(2);
const opt=(n,d)=>{const i=args.indexOf(n);return i>=0?args[i+1]:d;};
const SEEDS=Number(opt('--seeds',300)),OUT=opt('--out',null);

/** 玩家地图的揭示：mode 'old'＝现行 G4.4（走廊直线 4 格）；'d19'＝D-20261101-19。房间内两者相同（整间）。墙格只在 d19 下记入。 */
export function revealFrom(f,p,seen,mode){
  seen.add(k(p));
  const room=f.rooms.find(r=>inRect(p,r));
  if(room)roomCells(room).forEach(c=>seen.add(k(c)));
  for(const d of DIRS){let c=p;const side=[{x:d.y,y:d.x},{x:-d.y,y:-d.x}];
    for(let n=1;n<=4;n++){c={x:c.x+d.x,y:c.y+d.y};const floor=f.cells.has(k(c));
      if(mode==='d19'){seen.add(k(c));for(const s of side)seen.add(k({x:c.x+s.x,y:c.y+s.y}));}
      else if(floor)seen.add(k(c));
      if(!floor)break;}}
}
/**
 * 迷雾机器人：每回合走一步。targets(seen) 返回当前已知的目标格（按优先顺序）；有已知目标就走最短已知路，
 * 否则去最近的“边界格”（已揭示地面，且有一个相邻格还没揭示）。只在已揭示的地面上走。
 */
export function walk(f,start,targetsFn,mode,seen=new Set(),max=3000){
  let pos=start;revealFrom(f,pos,seen,mode);
  for(let step=0;step<max;step++){
    const goals=targetsFn(seen,pos);
    if(goals.reached)return {steps:step,pos,seen};
    // 边界格：已揭示的地面格，且有一个相邻地面格还没揭示（与 8.2 的 fogSteps 同一判定，两种视野可比）。
    const known=c=>seen.has(k(c))&&f.cells.has(k(c));
    const frontier=c=>DIRS.some(d=>{const n={x:c.x+d.x,y:c.y+d.y};return f.cells.has(k(n))&&!seen.has(k(n));});
    const prev=new Map();let target=null;
    const goalSet=new Set(goals.cells.map(k));
    const search=useGoal=>{prev.clear();prev.set(k(pos),null);const q=[pos];
      for(let i=0;i<q.length;i++){const cur=q[i];
        if(useGoal?goalSet.has(k(cur)):frontier(cur))return cur;
        for(const d of DIRS){const n={x:cur.x+d.x,y:cur.y+d.y};if(known(n)&&!prev.has(k(n))){prev.set(k(n),cur);q.push(n);}}}
      return null;};
    // 目标已看见但还没有已知的路通过去时，先去最近的边界继续探索。
    target=(goalSet.size?search(true):null)??search(false);
    if(!target||k(target)===k(pos))return {steps:Infinity,pos,seen};
    let c=target;while(prev.get(k(c))&&k(prev.get(k(c)))!==k(pos))c=prev.get(k(c));
    pos=c;revealFrom(f,pos,seen,mode);
  }
  return {steps:Infinity,pos,seen};
}
const stairsGoal=f=>(seen,pos)=>({reached:k(pos)===k(f.down),cells:seen.has(k(f.down))?[f.down]:[]});
/** 房间的任一格被揭示就知道它在哪；目标＝走进房间（任一格）。 */
const roomGoal=(f,ri)=>(seen,pos)=>{const r=f.rooms[ri];if(inRect(pos,r))return {reached:true,cells:[]};
  const known=roomCells(r).filter(c=>seen.has(k(c)));return {reached:false,cells:known};};

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const q=(xs,p)=>{const s=[...xs].sort((a,b)=>a-b);return s.length?s[Math.floor(p*(s.length-1))]:null;};
  const st=xs=>{const v=xs.filter(Number.isFinite);return {n:xs.length,unfinished:xs.length-v.length,p10:q(v,.1),p50:q(v,.5),p90:q(v,.9),max:Math.max(...v)};};
  const share=(xs,lim)=>+(xs.filter(x=>x<=lim).length/xs.length*100).toFixed(1);
  const R={seeds:SEEDS,node:process.version,platform:process.platform};
  const ratio={old:[],d19:[]},steps={old:[],d19:[]};
  const speedFloor=[],speedAccept=[],commissionSeen=[],pathfinder=[],pathfinderExtra=[],itemsPerFloor={1:[],2:[],3:[]};
  for(let seed=1;seed<=SEEDS;seed++){
    const floors=[1,2,3].map(level=>{const f=referenceFloor(seed,level);return {f,a:assignRooms(f,seed,level)};});
    for(const [i,{f,a}] of floors.entries()){
      const level=i+1;
      // 收集：本层可捡的道具（拾取物：每层 1 个橙橙果，第 2 层另有 PP 补剂；道具房 1 件；挑战房奖励 25％ 给 1 件）
      const pick=1+(level===2?1:0),itemRooms=a.assigned.filter(o=>o.type==='item').length,chal=a.assigned.filter(o=>o.type==='challenge').length;
      itemsPerFloor[level].push(pick+itemRooms+0.25*chal);
      if(!f.down)continue;
      const d=bfs(f.cells,f.arrival).get(k(f.down)),N=Math.ceil(2.5*d);
      for(const mode of ['old','d19']){const w=walk(f,f.arrival,stairsGoal(f),mode);steps[mode].push(w.steps);ratio[mode].push(w.steps/d);}
      // 速通委托：机器人先去本层的委托房接委托（看到委托房就去），再找楼梯
      const comm=a.assigned.find(o=>o.type==='commission');
      if(comm){
        const w1=walk(f,f.arrival,roomGoal(f,comm.room),'d19');commissionSeen.push(w1.steps);
        const w2=walk(f,w1.pos,stairsGoal(f),'d19',w1.seen);
        const fromAccept=bfs(f.cells,w1.pos).get(k(f.down));
        speedFloor.push((w1.steps+w2.steps)<=N?1:0);
        speedAccept.push(w2.steps<=Math.ceil(2.5*fromAccept)?1:0);
      }
      // 探路（只在第 1 层接、第 2 层完成才可能：第 3 层没有楼梯）：下一层要有祝福房或道具房
      if(level===1){const {f:g,a:b}=floors[1];const targets=b.assigned.filter(o=>o.type==='blessing'||o.type==='item');
        pathfinder.push(targets.length?1:0);
        if(targets.length){const direct=walk(g,g.arrival,stairsGoal(g),'d19').steps;
          let best=Infinity;for(const t of targets){const w1=walk(g,g.arrival,roomGoal(g,t.room),'d19');const w2=walk(g,w1.pos,stairsGoal(g),'d19',w1.seen);best=Math.min(best,w1.steps+w2.steps);}
          pathfinderExtra.push(best-direct);}}
    }
  }
  const mean=xs=>+(xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(2);
  Object.assign(R,{
    fogSteps:{old:st(steps.old),d19:st(steps.d19)},
    fogRatio:{old:st(ratio.old.map(x=>+x.toFixed(2))),d19:st(ratio.d19.map(x=>+x.toFixed(2)))},
    within:{old:{'1.5':share(ratio.old,1.5),'2':share(ratio.old,2),'2.5':share(ratio.old,2.5),'3':share(ratio.old,3)},d19:{'1.5':share(ratio.d19,1.5),'2':share(ratio.d19,2),'2.5':share(ratio.d19,2.5),'3':share(ratio.d19,3)}},
    speedrunWithCommissionDetour:{floors:speedFloor.length,fromFloorEntry:+(mean(speedFloor)*100).toFixed(1),fromAcceptance:+(mean(speedAccept)*100).toFixed(1)},
    stepsToFindCommissionRoom:st(commissionSeen),
    pathfinder:{floor1Runs:pathfinder.length,nextFloorHasTarget:+(mean(pathfinder)*100).toFixed(1),extraSteps:st(pathfinderExtra)},
    itemsPerFloor:{1:mean(itemsPerFloor[1]),2:mean(itemsPerFloor[2]),3:mean(itemsPerFloor[3])}});
  console.log(`# 8.4 委托验证（${SEEDS} 种子；${process.platform} ${process.version}）`);
  console.log(`迷雾机器人找楼梯步数 旧视野 ${JSON.stringify(R.fogSteps.old)}；D-19 视野 ${JSON.stringify(R.fogSteps.d19)}`);
  console.log(`步数/最短路 旧 ${JSON.stringify(R.fogRatio.old)}；D-19 ${JSON.stringify(R.fogRatio.d19)}`);
  console.log(`在 x 倍最短路内到楼梯的层％ 旧 ${JSON.stringify(R.within.old)}；D-19 ${JSON.stringify(R.within.d19)}`);
  console.log(`速通（先去委托房接委托再找楼梯，N=⌈2.5×最短路⌉）：从进入本层起算 ${R.speedrunWithCommissionDetour.fromFloorEntry}％，从接委托起算 ${R.speedrunWithCommissionDetour.fromAcceptance}％（${R.speedrunWithCommissionDetour.floors} 层有委托房）`);
  console.log(`找到并走进委托房的步数 ${JSON.stringify(R.stepsToFindCommissionRoom)}`);
  console.log(`探路：第 2 层有祝福或道具房 ${R.pathfinder.nextFloorHasTarget}％；先进房再到楼梯比直接找楼梯多走 ${JSON.stringify(R.pathfinder.extraSteps)} 步`);
  console.log(`每层可捡道具期望 ${JSON.stringify(R.itemsPerFloor)}`);
  if(OUT)writeFileSync(OUT,JSON.stringify(R,null,1));
}
