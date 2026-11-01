// 8.4 委托“须当层完成”的重算（main 云端工作者，只读）。用户决定（#132 评论 6559677985）：
// 不能主动放弃委托，委托必须在接下的那一层完成；下楼请求成立时本层未完成的委托全部失败。
//
// 用正式生成器（main 的 src/core/dungeon.ts，含 8.3 的探险房间与交互格）生成地图，让迷雾机器人
// （D-20261101-19 视野，与 commissions-84.mjs 相同的探索规则）从到达点走到委托点接委托，然后统计：
//   速通：接下后在 N＝⌈2.5×委托点到楼梯的最短路⌉ 步内到楼梯的比例（只算走路，第 1、2 层）
//   收集：接下时本层还没被走过的道具（拾取物＋道具房道具）个数分布 → 本层能凑够 1／2 个的比例（上限）
//   探路（本层版）：本层有没有祝福房或道具房（委托房以外）；先进目标房再下楼比直接下楼多走的步数
//   猎手：接下时本层还没被走过的普通敌人出生格数（上限）；以及按“接下后剩余的探索步数比例”折算的被动击杀期望
//
// 运行（Node 24）：node --experimental-strip-types tools/verify/commissions-84-perfloor.mjs [--seeds 300] [--kills-per-floor 4.07]
import {roomCells,center,generateFloor} from '../../src/core/dungeon.ts';
import {revealFrom} from './commissions-84.mjs';

const args=process.argv.slice(2);
const opt=(n,d)=>{const i=args.indexOf(n);return i>=0?args[i+1]:d;};
const SEEDS=Number(opt('--seeds',300));
/** 8.2 长测（PR #127，tactical 普通档）每局平均击杀 12.21，按 3 层平均分摊，约每层 4.07 只；只作被动击杀的粗略基准。 */
const KILLS_PER_FLOOR=Number(opt('--kills-per-floor',4.07));
const PARAMS={width:36,height:24,floors:3,boss:true,roguelike:true};
const k=p=>`${p.x},${p.y}`;
const DIRS=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const inRect=(p,r)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;

function bfs(cells,start){const d=new Map([[k(start),0]]),q=[start];
  for(let i=0;i<q.length;i++)for(const s of DIRS){const n={x:q[i].x+s.x,y:q[i].y+s.y};if(cells.has(k(n))&&!d.has(k(n))){d.set(k(n),d.get(k(q[i]))+1);q.push(n);}}return d;}
/** 与 commissions-84.mjs 的 walk 相同的迷雾机器人，另外记下走过的格。 */
function walk(f,start,goal,seen=new Set(),path=new Set(),max=3000){
  let pos=start;revealFrom(f,pos,seen,'d19');path.add(k(pos));
  for(let step=0;step<max;step++){
    const g=goal(seen,pos);if(g.reached)return {steps:step,pos,seen,path};
    const known=c=>seen.has(k(c))&&f.cells.has(k(c));
    const frontier=c=>DIRS.some(d=>{const n={x:c.x+d.x,y:c.y+d.y};return f.cells.has(k(n))&&!seen.has(k(n));});
    const goalSet=new Set(g.cells.map(k)),prev=new Map();
    const search=useGoal=>{prev.clear();prev.set(k(pos),null);const q=[pos];
      for(let i=0;i<q.length;i++){const cur=q[i];if(useGoal?goalSet.has(k(cur)):frontier(cur))return cur;
        for(const d of DIRS){const n={x:cur.x+d.x,y:cur.y+d.y};if(known(n)&&!prev.has(k(n))){prev.set(k(n),cur);q.push(n);}}}return null;};
    const target=(goalSet.size?search(true):null)??search(false);
    if(!target||k(target)===k(pos))return {steps:Infinity,pos,seen,path};
    let c=target;while(prev.get(k(c))&&k(prev.get(k(c)))!==k(pos))c=prev.get(k(c));
    pos=c;revealFrom(f,pos,seen,'d19');path.add(k(pos));
  }
  return {steps:Infinity,pos,seen,path};
}
const cellGoal=cell=>(seen,pos)=>({reached:k(pos)===k(cell),cells:seen.has(k(cell))?[cell]:[]});
const roomGoal=r=>(seen,pos)=>inRect(pos,r)?{reached:true,cells:[]}:{reached:false,cells:roomCells(r).filter(c=>seen.has(k(c)))};

const q=(xs,p)=>{const s=[...xs].filter(Number.isFinite).sort((a,b)=>a-b);return s.length?s[Math.floor(p*(s.length-1))]:null;};
const pct=(n,d)=>d?+(100*n/d).toFixed(1):null;
const poissonAtLeast=(lambda,n)=>{let p=0,t=Math.exp(-lambda);for(let i=0;i<n;i++){p+=t;t*=lambda/(i+1);}return 1-p;};
const byLevel={1:[],2:[],3:[]};
for(let seed=1;seed<=SEEDS;seed++)for(let level=1;level<=3;level++){
  const g=generateFloor(seed,level,PARAMS);
  const f={cells:new Map(g.floor.map(c=>[k(c),c])),rooms:g.rooms,down:g.down};
  const rooms=g.adventureRooms??[];
  for(const comm of rooms.filter(r=>r.type==='commission')){
    const room=g.rooms[comm.room];
    const w1=walk(f,g.arrival,roomGoal(room));
    const w2=walk(f,w1.pos,cellGoal(comm.interaction),w1.seen,w1.path);
    const before=new Set(w2.path);const acceptSteps=w1.steps+w2.steps;
    const rec={seed,level,acceptSteps};
    // 收集：本层还没走过的道具格（拾取物＋未处理的道具房道具）
    const items=[...g.pickups.map(p=>p.pos),...rooms.filter(r=>r.type==='item').map(r=>r.interaction)];
    rec.itemsLeft=items.filter(p=>!before.has(k(p))).length;rec.itemsTotal=items.length;
    // 猎手：本层还没走过的普通敌人出生格（上限，不算敌人走动与先前的击杀）；挑战房另计
    rec.enemiesLeft=g.enemies.filter(e=>!e.boss&&!before.has(k(e.pos))).length;
    rec.challenge=rooms.some(r=>r.type==='challenge');
    if(g.down){
      const d=bfs(f.cells,comm.interaction).get(k(g.down)),N=Math.ceil(2.5*d);
      const w3=walk(f,w2.pos,cellGoal(g.down),new Set(w2.seen),new Set(w2.path));
      rec.speedOk=w3.steps<=N;rec.afterShare=w3.steps/(acceptSteps+w3.steps);
      // 探路（本层版）：委托房以外的祝福房或道具房
      const targets=rooms.filter(r=>(r.type==='blessing'||r.type==='item')&&r.room!==comm.room);
      rec.pathTarget=targets.length>0;
      if(targets.length){let best=Infinity;
        for(const t of targets){const a=walk(f,w2.pos,roomGoal(g.rooms[t.room]),new Set(w2.seen),new Set());
          const b=walk(f,a.pos,cellGoal(g.down),a.seen,new Set());best=Math.min(best,a.steps+b.steps);}
        rec.pathExtra=best-w3.steps;}
    }else{
      // 第 3 层没有楼梯：接下后剩余的探索量用“走到首领房”估算
      const boss=g.rooms[g.bossRoom];const w3=walk(f,w2.pos,roomGoal(boss),new Set(w2.seen),new Set(w2.path));
      rec.afterShare=w3.steps/(acceptSteps+w3.steps);
    }
    byLevel[level].push(rec);
  }
}
console.log(`# 8.4 当层完成重算（正式生成器 main；${SEEDS} 种子；${process.platform} ${process.version}）`);
for(const level of [1,2,3]){
  const R=byLevel[level],n=R.length;if(!n)continue;
  const share=R.map(r=>r.afterShare).filter(Number.isFinite),meanShare=share.reduce((a,b)=>a+b,0)/share.length;
  const lambda=KILLS_PER_FLOOR*meanShare;
  console.log(`\n## 第 ${level} 层：有委托房的层 ${n}（委托房按 8.3 分配）`);
  console.log(`接委托前走的步数 中位 ${q(R.map(r=>r.acceptSteps),.5)}（10%—90%：${q(R.map(r=>r.acceptSteps),.1)}—${q(R.map(r=>r.acceptSteps),.9)}）；接下后的探索量占本层 中位 ${q(share,.5)?.toFixed(2)}、均值 ${meanShare.toFixed(2)}`);
  console.log(`收集：接下时本层还剩道具 ≥1 的 ${pct(R.filter(r=>r.itemsLeft>=1).length,n)}％、≥2 的 ${pct(R.filter(r=>r.itemsLeft>=2).length,n)}％（本层道具总数均值 ${(R.reduce((a,r)=>a+r.itemsTotal,0)/n).toFixed(2)}）`);
  console.log(`猎手：接下时本层还没走过的普通敌人出生格 ≥2 的 ${pct(R.filter(r=>r.enemiesLeft>=2).length,n)}％、≥3 的 ${pct(R.filter(r=>r.enemiesLeft>=3).length,n)}％、≥4 的 ${pct(R.filter(r=>r.enemiesLeft>=4).length,n)}％；本层有挑战房 ${pct(R.filter(r=>r.challenge).length,n)}％`);
  console.log(`猎手（被动击杀粗估，λ＝${KILLS_PER_FLOOR}×${meanShare.toFixed(2)}＝${lambda.toFixed(2)}）：≥2 只 ${(100*poissonAtLeast(lambda,2)).toFixed(1)}％、≥3 只 ${(100*poissonAtLeast(lambda,3)).toFixed(1)}％、≥4 只 ${(100*poissonAtLeast(lambda,4)).toFixed(1)}％`);
  if(level<3){
    console.log(`速通（从委托点起算，N＝⌈2.5×最短路⌉，只走路）：${pct(R.filter(r=>r.speedOk).length,n)}％`);
    const P=R.filter(r=>r.pathTarget);
    console.log(`探路（本层版）：本层另有祝福房或道具房 ${pct(P.length,n)}％；先进目标房再下楼比直接下楼多走 中位 ${q(P.map(r=>r.pathExtra),.5)}、90% 分位 ${q(P.map(r=>r.pathExtra),.9)} 步`);
  }
}
