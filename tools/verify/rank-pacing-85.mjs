// 8.5 探险队等级的升级节奏纸面模拟（main 云端工作者，只读，不调用 src）。
//
// 问题（8.5 Q4）：8.3 房间、8.4 委托加入后，每局探险队经验变多；天赋又会抬高首领击败率，击败首领再多拿分。
// 门槛 2L(L−1) 下，到 Lv5、Lv10、Lv16 要几局？要不要提高门槛？
//
// 模型（每局独立抽签，按 8.5 第 2 节计分；每个输入都写在 SCEN 里，便于改）：
// - 胜负：0 点天赋时的击败率 p0（8.6 校准目标 50—65％，取 57.5％；cautious 取 8.1 长测的 34.8％）。
//   天赋按 8.5 第 5 节的倍数 a×b（体质每级 HP ×1.05，攻势每级伤害 ×1.03）提高击败率，
//   击败率随倍数的变化取 8.5 第 5 节表的分段线性插值（相对 0 点的增量），再加到 p0 上，上限 95％。
// - 深度：胜利局 3；失败局按 lossDepth 抽（8.5 第 3.1 节失败局平均 3.39 分，减去招募约 0.7，深度约 2.7）。
// - 委托：到过的每一层，探险房 2 或 3 间（各 50％），每间是委托房的概率 0.344（rooms-83.mjs 1000 种子）；
//   每间委托房接下的概率 accept，接下后完成的概率 complete；计入上限 3。
// - 招式机：胜利局 1 张（首领掉落）＋ 捡到第 3 层 T 的概率 tPick，计入上限 2；失败局 0。
// - 新招募：每局 Poisson(recruit)，计入上限 2。
// - 天赋分配：每升一级得 1 点，体质与攻势交替加（体质先），每支上限 5；补给不加（不影响首领战模型）。
//
// 运行（Node 24）：node tools/verify/rank-pacing-85.mjs [--players 4000] [--runs 80]
const args=process.argv.slice(2);
const opt=(n,d)=>{const i=args.indexOf(n);return i>=0?args[i+1]:d;};
const PLAYERS=Number(opt('--players',4000)),RUNS=Number(opt('--runs',80));

function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const poisson=(rng,l)=>{let k=0,p=1;const L=Math.exp(-l);do{k++;p*=rng();}while(p>L);return k-1;};

// 8.5 第 5 节：倍数 → 击败率（tactical、cautious；普通档 115 局）
const TABLE={tactical:[[1,57.4],[1.03,58.3],[1.166,64.3],[1.25,67.8],[1.4375,73.9]],cautious:[[1,34.8],[1.03,34.8],[1.166,40.0],[1.25,43.5],[1.4375,53.9]]};
function talentGain(policy,m){const t=TABLE[policy];if(m<=1)return 0;
  for(let i=1;i<t.length;i++)if(m<=t[i][0]){const [x0,y0]=t[i-1],[x1,y1]=t[i];return (y0+(y1-y0)*(m-x0)/(x1-x0)-t[0][1])/100;}
  const [x0,y0]=t[t.length-2],[x1,y1]=t[t.length-1];return (y1+(y1-y0)/(x1-x0)*(m-x1)-t[0][1])/100;}
const mult=pts=>{const hp=Math.min(5,Math.ceil(pts/2)),atk=Math.min(5,Math.floor(pts/2));return (1+0.05*hp)*(1+0.03*atk);};

const level=(exp,c)=>{let L=1;while(c*(L+1)*L<=exp)L++;return L;}; // 门槛 c·L(L−1)；8.5 原为 c=2，main 2026-11-02 按本模拟改为 c=3

function runOne(rng,s,p){
  const win=rng()<p;
  const depth=win?3:(r=>r<s.lossDepth[0]?1:r<s.lossDepth[0]+s.lossDepth[1]?2:3)(rng());
  let comm=0;
  for(let f=1;f<=depth;f++){const rooms=rng()<.5?2:3;for(let i=0;i<rooms;i++)if(rng()<0.344&&rng()<s.accept&&rng()<s.complete)comm++;}
  const tms=win?Math.min(2,1+(rng()<s.tPick?1:0)):0;
  const rec=Math.min(2,poisson(rng,s.recruit));
  return {win,score:depth+(win?6:0)+Math.min(3,comm)+2*tms+rec,comm:Math.min(3,comm)};
}
function simulate(s,c,policy,seed=1){
  const rng=mulberry32(seed),reach={5:[],10:[],16:[]},score=[],commN=[],winAt={1:[],5:[],10:[],20:[],40:[]};
  for(let pl=0;pl<PLAYERS;pl++){let exp=0;const got={};
    for(let r=1;r<=RUNS;r++){const L=level(exp,c),pts=s.talents?Math.min(10,L-1):0;
      const p=Math.min(.95,s.p0+talentGain(policy,mult(pts)));
      if(winAt[r])winAt[r].push(p);
      const o=runOne(rng,s,p);exp+=o.score;score.push(o.score);commN.push(o.comm);
      const L2=level(exp,c);for(const t of [5,10,16])if(L2>=t&&!got[t]){got[t]=r;reach[t].push(r);}}
    for(const t of [5,10,16])if(!got[t])reach[t].push(Infinity);}
  const q=(xs,p)=>{const v=[...xs].sort((a,b)=>a-b);const x=v[Math.floor(p*(v.length-1))];return Number.isFinite(x)?x:`>${RUNS}`;};
  const mean=xs=>+(xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(2);
  return {perRun:mean(score),commPerRun:mean(commN),
    lv5:`${q(reach[5],.5)}（${q(reach[5],.1)}—${q(reach[5],.9)}）`,lv10:`${q(reach[10],.5)}（${q(reach[10],.1)}—${q(reach[10],.9)}）`,lv16:`${q(reach[16],.5)}（${q(reach[16],.1)}—${q(reach[16],.9)}）`,
    winRate:Object.fromEntries(Object.entries(winAt).map(([r,v])=>[r,+(mean(v)*100).toFixed(1)]))};
}

// 情景：8.1 现状（没有委托、不捡 T）用来对照 8.5 第 3.1 节的实测（tactical 每局 8.30 分、5 局 13/23 到 Lv5）。
const base={lossDepth:[0.05,0.15],recruit:0.75,talents:true};
const SCEN={
  '8.1 现状（无委托、不捡 T）':{...base,p0:.574,accept:0,complete:0,tPick:0},
  '8.4 现行委托（完成约 90％）':{...base,p0:.575,accept:.8,complete:.9,tPick:.8,recruit:.9},
  '8.6 校准后委托（完成约 72％）':{...base,p0:.575,accept:.8,complete:.72,tPick:.8,recruit:.9},
  '同上但天赋不加击败率（对照）':{...base,p0:.575,accept:.8,complete:.72,tPick:.8,recruit:.9,talents:false},
};
console.log(`# 8.5 升级节奏纸面模拟（每组 ${PLAYERS} 名玩家 × ${RUNS} 局；${process.platform} ${process.version}）`);
for(const policy of ['tactical','cautious'])for(const [name,s0] of Object.entries(SCEN)){
  const s={...s0,p0:policy==='cautious'?(name.startsWith('8.1')?.348:.348):s0.p0};
  for(const c of [2,3,4]){const r=simulate(s,c,policy);
    console.log(`${policy} | ${name} | 门槛 ${c}L(L−1) | 每局 ${r.perRun} 分（委托 ${r.commPerRun}） | 到 Lv5 ${r.lv5} 局 | Lv10 ${r.lv10} | Lv16 ${r.lv16} | 第 1/5/10/20/40 局击败率 ${JSON.stringify(r.winRate)}`);}
}
