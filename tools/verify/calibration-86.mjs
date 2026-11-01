// 8.6 校准试算汇总（main 云端工作者，只读）。
//
// 读入若干份 tools/soak/balance.mjs 的输出 JSON（每份是一个旋钮取值），只统计普通种子（非强制全灭种子）：
// 胜率（击败首领的局数／局数）与 95％ 置信区间、全灭率、到达首领层、接触首领、平均回合。
// 另外用“线性比赛模型”从基准组输掉的首领战里剩下的首领 HP，预测把首领 HP 乘 f（f<1）后会翻盘的局数，
// 与实测的同一旋钮对照，检验这个纸面模型能不能用来估算。
//
// 运行：node tools/verify/calibration-86.mjs base=<基准.json> <名字>=<文件.json> ... [--boss-scale 名字=倍数 ...]
// 例：node tools/verify/calibration-86.mjs base=/tmp/s7/base.json boss2.5=/tmp/s7/boss2.5.json --boss-hp 56 --boss-scale boss2.5=0.8333
import {readFileSync} from 'node:fs';

const args=process.argv.slice(2);
const runs=[],scales={};let bossHp=null;
for(let i=0;i<args.length;i++){
  if(args[i]==='--boss-hp'){bossHp=Number(args[++i]);continue;}
  if(args[i]==='--boss-scale'){const [n,v]=args[++i].split('=');scales[n]=Number(v);continue;}
  const [name,file]=args[i].split('=');runs.push({name,data:JSON.parse(readFileSync(file,'utf8'))});
}
const ordinary=d=>Object.values(d.policies).flatMap(p=>p.games).filter(g=>!g.doomed);
const pct=(n,d)=>d?+(100*n/d).toFixed(1):null;
/** Wilson 95％ 区间（百分比） */
const wilson=(k,n)=>{if(!n)return [null,null];const z=1.96,p=k/n,den=1+z*z/n,c=p+z*z/(2*n),h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));return [+(100*(c-h)/den).toFixed(1),+(100*(c+h)/den).toFixed(1)];};

const rows=[];
for(const r of runs){
  const g=ordinary(r.data),n=g.length,won=g.filter(x=>x.outcome==='won').length;
  rows.push({name:r.name,difficulty:r.data.difficulty,multiplier:r.data.multiplier,games:n,won,winPct:pct(won,n),ci95:wilson(won,n),
    wipePct:pct(g.filter(x=>x.outcome==='wipe').length,n),timeouts:g.filter(x=>x.outcome==='timeout').length,
    reached:g.filter(x=>x.run?.reached).length,contacted:g.filter(x=>x.run?.contacted).length,
    roundsMean:+(g.reduce((a,x)=>a+x.rounds,0)/n).toFixed(1)});
}
console.log('| 组 | 难度（倍率） | 局数 | 击败首领 | 胜率％ | 95％ 区间 | 全灭％ | 到达首领层 | 接触首领 | 平均回合 | 超时 |');
console.log('|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|');
for(const x of rows)console.log(`| ${x.name} | ${x.difficulty}（${x.multiplier}） | ${x.games} | ${x.won} | ${x.winPct} | ${x.ci95[0]}—${x.ci95[1]} | ${x.wipePct} | ${x.reached} | ${x.contacted} | ${x.roundsMean} | ${x.timeouts} |`);

// 线性比赛模型：基准组里接触过首领却输掉的局，剩余 HP 为 left、首领满 HP 为 H；首领 HP 乘 f 后，
// 队伍在同样的战斗过程里打出的 H−left 若 ≥ f·H 就翻盘。只用于 f<1（调低首领 HP）；调高时需要胜局的余量，长测没有记录。
const base=runs.find(r=>r.name==='base');
if(base){
  const g=ordinary(base.data),won=g.filter(x=>x.outcome==='won').length;
  const H=bossHp??Math.max(...g.map(x=>x.run?.bossHpLeft??0));
  const lefts=g.filter(x=>x.outcome!=='won'&&x.run?.contacted&&Number.isFinite(x.run?.bossHpLeft)).map(x=>x.run.bossHpLeft);
  console.log(`\n基准组：首领满 HP（--boss-hp，未给时取观察到的最大剩余值）${H}；接触后输掉的局 ${lefts.length} 局，剩余 HP ${JSON.stringify(lefts.sort((a,b)=>a-b))}`);
  for(const [name,f] of Object.entries(scales)){
    const flip=lefts.filter(l=>H-l>=f*H).length,actual=rows.find(x=>x.name===name);
    console.log(`首领 HP ×${f}：模型预测 ${won}+${flip}＝${won+flip}/${g.length}（${pct(won+flip,g.length)}％）；实测 ${actual?`${actual.won}/${actual.games}（${actual.winPct}％）`:'无'}`);
  }
}
