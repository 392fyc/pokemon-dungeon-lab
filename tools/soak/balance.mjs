/*
 * Stage 7.4 balance statistics. Plays the shared soak bot (tests/core/soak-bot.mjs) over many seeds with one or more policies and prints a Chinese Markdown summary;
 * the full numbers (aggregates and every game record) go to a JSON file.
 *
 *   node --experimental-strip-types tools/soak/balance.mjs [--seeds 30] [--policy naive,tactical]  (tactical-stand = tactical without the retreat rule, for measuring the boss fight itself) [--out .tmp/lane-main/balance-<time>.json]
 *   --no-pay   tactical policies do not pay rescues (default: they pay every rescue the account allows at the base; naive never pays)
 *   --rescue-compare   run `tactical` twice (pay / no pay) over the same seeds and print the comparison table and the rescue-burden tables
 *
 * `--seeds N` plays N seeds x 5 games per policy. Seeds with i % 4 === 3 are the forced-wipe seeds of the soak (HP is cut to 1 on purpose);
 * they are summarised in their own section and never mixed into the ordinary seeds' wipe rate.
 * Every step of every game still runs the soak's invariant checks (save round trip, refused commands change nothing); a violation throws and stops the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import {playSeed,stats,GAMES,ROUND_CAP} from '../../tests/core/soak-bot.mjs';
import {ECON} from '../../src/core/economy.ts';
import {ALL_TM_MOVES} from '../../src/core/roster.ts';
import {BOSS_CONFIG} from '../../src/core/dungeon.ts';

const args=process.argv.slice(2),opt=(name,def)=>{const i=args.indexOf('--'+name);return i>=0&&args[i+1]!==undefined?args[i+1]:def;};
const SEEDS=+opt('seeds',30),POLICIES=opt('policy','naive,tactical').split(',').map(s=>s.trim()).filter(Boolean);
for(const p of POLICIES)if(!['naive','tactical','tactical-stand'].includes(p)){console.error(`unknown policy ${p}`);process.exit(2);}
// The old hp/damage/attacks sweep described a retired combat model. Do not silently report those switches as applied.
if(args.includes('--boss')||args.includes('--sweep'))throw new Error('7.8已取消旧首领hp/damage/attacks扫描；本工具按当前boss.json共用招式模型运行');
const NO_PAY=args.includes('--no-pay'),COMPARE=args.includes('--rescue-compare');
const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15);
const OUT=opt('out',`.tmp/lane-main/balance-${stamp}.json`);

const sum=(xs,f=x=>x)=>xs.reduce((a,x)=>a+f(x),0);
const pct=(n,d)=>d?`${(100*n/d).toFixed(1)}%`:'-';
const mean=xs=>xs.length?sum(xs)/xs.length:null,fmt=(v,n=1)=>v===null||v===undefined?'-':(+v).toFixed(n);
const median=xs=>{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y),m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2;};
const count=(xs,f)=>xs.filter(f).length;

/** Aggregates one group of seed results (a list of playSeed results). */
function summarize(results){
 const st=stats();for(const r of results)for(const k of Object.keys(st))st[k]+=r.st[k];
 const games=results.flatMap(r=>r.games.map((g,n)=>({...g,x:r.extra[n]}))),total=games.length;
 const by=o=>count(games,g=>g.outcome===o),rounds=games.map(g=>g.rounds);
 const bossGames=games.filter(g=>g.x.bossRun),defeated=bossGames.filter(g=>g.x.defeated);
 const accounts=results.map(r=>r.account).filter(a=>a!==null);
 const vault=Object.fromEntries(ALL_TM_MOVES.map(m=>[m,sum(results,r=>r.vault[m]??0)]));
 return {seeds:results.length,games:total,
  outcome:{normal:by('normal'),wipe:by('wipe'),timeout:by('timeout')},goalDone:count(games,g=>g.goal),
  rounds:{mean:mean(rounds),median:median(rounds),min:rounds.length?Math.min(...rounds):null,max:rounds.length?Math.max(...rounds):null},
  levels:Object.fromEntries([...new Set(games.map(g=>g.level))].sort((a,b)=>a-b).map(l=>[l,count(games,g=>g.level===l)])),
  evolutions:{total:sum(games,g=>g.evolutions??0),games:count(games,g=>(g.evolutions??0)>0)},
  boss:{runsWithBoss:bossGames.length,reached:count(bossGames,g=>g.x.reached),defeated:defeated.length,wipedOnBossFloor:count(bossGames,g=>g.x.bossWipe),
   bossHpLeft:(h=>({mean:mean(h),min:h.length?Math.min(...h):null,max:h.length?Math.max(...h):null,games:h.length}))(bossGames.filter(g=>g.x.reached&&g.x.bossHpLeft!==null).map(g=>g.x.bossHpLeft)),
   lobbyExit:count(bossGames,g=>g.x.lobbyExit),retreatDecided:count(bossGames,g=>g.x.retreat),
   survivorsWhenDefeated:{0:count(defeated,g=>g.x.survivors===0),1:count(defeated,g=>g.x.survivors===1),2:count(defeated,g=>g.x.survivors===2),3:count(defeated,g=>g.x.survivors===3)}},
  rescue:{lostPartners:st.lostPartners,paid:st.paid,returned:st.returned,goneForGood:st.goneForGood,
   account:{mean:mean(accounts),min:accounts.length?Math.min(...accounts):null,max:accounts.length?Math.max(...accounts):null,seeds:accounts.length}},
  tm:{got:st.tmGot,brought:st.tmBrought,learned:st.learned,vaultUnused:sum(Object.values(vault)),vaultByMove:vault},
  invites:{total:st.invites,accepted:st.accepted,rejected:st.rejected,swappedOut:st.swapped},
  moveUse:(m=>{for(const r of results)for(const [k,v] of Object.entries(r.moveUse??{}))m[k]=(m[k]??0)+v;return Object.fromEntries(Object.entries(m).sort((a,b)=>b[1]-a[1]));})({}),
  usage:{berries:st.berries,tonics:st.tonics,rests:st.rests,guards:st.guards,lines:st.lines,switches:st.switches},
  floor3:floor3(games),
  stats:st};
}
/** Boss-floor statistics (boss-marked runs only): the team on arrival, at first contact with the boss, damage by ordinary enemies on that floor, and where wipes happened. */
function floor3(games){
 const bossGames=games.filter(g=>g.x.bossRun),dist=(xs,k)=>Object.fromEntries([0,1,2,3].map(n=>[n,count(xs,v=>v[k]===n)]));
 const entry=bossGames.filter(g=>g.x.entry).map(g=>g.x.entry),contact=bossGames.filter(g=>g.x.contact).map(g=>g.x.contact);
 const f3=bossGames.filter(g=>g.x.f3rounds);
 const wipes=games.filter(g=>g.outcome==='wipe');
 return {entry:{games:entry.length,alive:dist(entry,'alive'),memberHpRatio:mean(entry.flatMap(e=>e.ratios)),aliveMemberHpRatio:mean(entry.flatMap(e=>e.ratios.filter(r=>r>0))),teamHpRatio:mean(entry.map(e=>e.hp/e.max)),teamHpRatioMin:entry.length?Math.min(...entry.map(e=>e.hp/e.max)):null,teamHp:mean(entry.map(e=>e.hp)),teamMax:mean(entry.map(e=>e.max))},
  contact:{games:contact.length,neverTouched:bossGames.filter(g=>g.x.reached).length-contact.length,alive:dist(contact,'alive'),teamHp:mean(contact.map(c=>c.hp)),teamMax:mean(contact.map(c=>c.max)),teamHpRatio:mean(contact.map(c=>c.hp/c.max)),teamHpRatioMin:contact.length?Math.min(...contact.map(c=>c.hp/c.max)):null},
  otherDamage:{games:f3.length,meanPerGame:mean(f3.map(g=>g.x.f3dmg)),max:f3.length?Math.max(...f3.map(g=>g.x.f3dmg)):null,meanPerRound:f3.length?sum(f3,g=>g.x.f3dmg)/sum(f3,g=>g.x.f3rounds):null,rounds:sum(f3,g=>g.x.f3rounds)},
  wipeFloor:{1:count(wipes,g=>g.x.wipeFloor===1),2:count(wipes,g=>g.x.wipeFloor===2),3:count(wipes,g=>g.x.wipeFloor===3),all:wipes.length}};
}
function section(title,s){
 if(!s.games)return `#### ${title}\n\n没有对局。\n`;
 const f=s.floor3,o=s.outcome,b=s.boss,lv=s.levels,r=s.rescue,t=s.tm,u=s.usage,i=s.invites;
 return `#### ${title}（${s.seeds} 个种子，${s.games} 局）

- 结局：正常撤离 ${o.normal}（${pct(o.normal,s.games)}），全灭 ${o.wipe}（${pct(o.wipe,s.games)}），超时/卡住 ${o.timeout}（${pct(o.timeout,s.games)}）；完成目标 G：${s.goalDone} 局（${pct(s.goalDone,s.games)}）。
- 轮数：平均 ${fmt(s.rounds.mean)}，中位 ${fmt(s.rounds.median)}，最小 ${s.rounds.min}，最大 ${s.rounds.max}。
- 结束时本局等级：Lv1 ${lv[1]}，Lv2 ${lv[2]}，Lv3 ${lv[3]}，Lv4 ${lv[4]}，Lv5 ${lv[5]}（局数）。
- 首领（${b.runsWithBoss} 局带首领）：到达首领层 ${b.reached}，击败首领 ${b.defeated}（到达首领层的局结束时首领剩余 HP：平均 ${fmt(b.bossHpLeft.mean)}，最小 ${b.bossHpLeft.min??'-'}，最大 ${b.bossHpLeft.max??'-'}，满 ${BOSS.hp}），在首领层全灭 ${b.wipedOnBossFloor}，从大厅出口撤离 ${b.lobbyExit}（其中机器人判定“打不过”而撤退 ${b.retreatDecided} 局）；击败首领时存活成员数：1 人 ${b.survivorsWhenDefeated[1]}，2 人 ${b.survivorsWhenDefeated[2]}，3 人 ${b.survivorsWhenDefeated[3]}。
- 走失与救援：走失伙伴 ${r.lostPartners}，支付救援 ${r.paid}，成功归来 ${r.returned}，永久失去 ${r.goneForGood}；每个种子 ${GAMES} 局后账户余额：平均 ${fmt(r.account.mean)}，最小 ${r.account.min??'-'}，最大 ${r.account.max??'-'}（${r.account.seeds} 个种子）。
- 招式机：获得 ${t.got}，带回 ${t.brought}，基地学会 ${t.learned}，局后金库未用 ${t.vaultUnused}（${ALL_TM_MOVES.map(m=>`${m} ${t.vaultByMove[m]}`).join('，')}）。
- 进入首领层时：${f.entry.games} 局有记录；存活 3 人 ${f.entry.alive[3]}，2 人 ${f.entry.alive[2]}，1 人 ${f.entry.alive[1]}；每名成员（含已倒下者按 0）HP 比例平均 ${fmt(f.entry.memberHpRatio,2)}，仅存活者平均 ${fmt(f.entry.aliveMemberHpRatio,2)}；全队 HP 平均 ${fmt(f.entry.teamHp)}/${fmt(f.entry.teamMax)}（${fmt(f.entry.teamHpRatio,2)}，最低 ${fmt(f.entry.teamHpRatioMin,2)}）。
- 首次与首领相邻或进入首领射线时：${f.contact.games} 局发生，${f.contact.neverTouched} 局到达首领层却始终没接触；存活 3 人 ${f.contact.alive[3]}，2 人 ${f.contact.alive[2]}，1 人 ${f.contact.alive[1]}；全队 HP 平均 ${fmt(f.contact.teamHp)}/${fmt(f.contact.teamMax)}（${fmt(f.contact.teamHpRatio,2)}，最低 ${fmt(f.contact.teamHpRatioMin,2)}）。
- 首领层上普通敌人（不含首领）造成的伤害：${f.otherDamage.games} 局共 ${f.otherDamage.rounds} 回合，平均每局 ${fmt(f.otherDamage.meanPerGame)}，最多 ${f.otherDamage.max??'-'}，平均每回合 ${fmt(f.otherDamage.meanPerRound,2)}。
- 全灭发生的楼层（共 ${f.wipeFloor.all} 次）：第 1 层 ${f.wipeFloor[1]}，第 2 层 ${f.wipeFloor[2]}，第 3 层 ${f.wipeFloor[3]}。
- 邀请与招募：邀请 ${i.total}，接受 ${i.accepted}（含换出 ${i.swappedOut}），拒绝 ${i.rejected}。
- 领队主动出手次数（招式 id → 次数；basic=普攻，只统计领队，伙伴按默认行为出手不计）：${Object.entries(s.moveUse).map(([k,v])=>`${k} ${v}`).join('，')||'-'}。
- 背包与动作使用次数：树果 ${u.berries}，PP补剂 ${u.tonics}，休整点 ${u.rests}，保护 ${u.guards}，直线 ${u.lines}，领队切换 ${u.switches}。
`;
}

/** 7.4 part 2: rescue burden of one group of seed results. Each game's account/roster figure is read after its settlement (before the next base turn). */
function burden(results){
 const st=stats();for(const r of results)for(const k of Object.keys(st))st[k]+=r.st[k];
 const n=results.length,trail=(key,g)=>results.map(r=>r[key][g]).filter(v=>v!==undefined);
 const acc=[0,1,2,3,4].map(g=>{const v=trail('accTrail',g);return {games:v.length,mean:mean(v),min:v.length?Math.min(...v):null};});
 const ros=results.map(r=>({first:r.rosterTrail[0],last:r.rosterTrail.at(-1),min:Math.min(...r.rosterTrail)}));
 const perSeed=results.map(r=>({seed:r.seed,lost:r.st.lostPartners,paid:r.st.paid,spent:r.st.spent,returned:r.st.returned,gone:r.st.goneForGood,
  wait:r.st.waitN?r.st.waitSum/r.st.waitN:null,income:r.st.income,purseZero:r.st.purseZeroByRescue,acc:r.accTrail,roster:r.rosterTrail}));
 return {seeds:n,st:{lost:st.lostPartners,paid:st.paid,spent:st.spent,returned:st.returned,gone:st.goneForGood,waitN:st.waitN,wait:st.waitN?st.waitSum/st.waitN:null,income:st.income,refund:st.refund,purseZero:st.purseZeroByRescue,wipes:st.wipes},
  acc,rosterFirst:mean(ros.map(x=>x.first)),rosterLast:mean(ros.map(x=>x.last)),rosterMin:mean(ros.map(x=>x.min)),rosterShrank:count(ros,x=>x.last<x.first),perSeed};
}
function burdenMd(title,b){
 const t=b.st,seedsWithLoss=count(b.perSeed,r=>r.lost>0);
 const head=`#### ${title}（${b.seeds} 个种子）
| 项目 | 数值 |
|---|---|
| 走失人次 | ${t.lost}（${seedsWithLoss}/${b.seeds} 个种子发生过走失；全灭 ${t.wipes} 局） |
| 支付次数 / 总花费 | ${t.paid} 次 / ${t.spent}（每次 ${ECON.rescueCost}） |
| 成功归来 | ${t.returned} |
| 永久失去 | ${t.gone} |
| 走失到归来的平均有效探险数 | ${fmt(t.wait,2)}（${t.waitN} 人次） |
| 基础收入总额（reward）/ 钱袋退款 | ${t.income} / ${t.refund} |
| 因救援花费使该局钱袋为 0 的局数 | ${t.purseZero} |
| 名册规模（第 1 局后 → 第 5 局后，种子均值） | ${fmt(b.rosterFirst,2)} → ${fmt(b.rosterLast,2)}（途中最小均值 ${fmt(b.rosterMin,2)}；${b.rosterShrank} 个种子缩小） |

每局结束后账户余额（结算后、下一次基地回合之前）：

| 第几局 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| 均值 | ${b.acc.map(a=>fmt(a.mean)).join(' | ')} |
| 最小 | ${b.acc.map(a=>a.min??'-').join(' | ')} |
`;
 const rows=b.perSeed.map(r=>`| ${r.seed} | ${r.lost} | ${r.paid} | ${r.spent} | ${r.returned} | ${r.gone} | ${fmt(r.wait,1)} | ${r.income} | ${r.purseZero} | ${r.acc.join('→')} | ${r.roster.join('→')} |`);
 return head+`
按种子：

| 种子 | 走失 | 支付 | 花费 | 归来 | 失去 | 平均等待 | 收入 | 钱袋归零局 | 账户 | 名册 |
|---|---|---|---|---|---|---|---|---|---|---|
`+rows.join('\n')+'\n';
}
async function runPolicy(policy,payRescue=!NO_PAY){
 const t0=Date.now(),results=[];
 for(let i=0;i<SEEDS;i++)results.push(await playSeed(i,{policy,payRescue}));
 const normal=results.filter(r=>!r.doomed),forced=results.filter(r=>r.doomed);
 return {results,secs:(Date.now()-t0)/1000,all:summarize(results),ordinary:summarize(normal),forcedWipeSeeds:summarize(forced)};
}
const rowGames=(results,policy)=>results.flatMap(r=>r.games.map((g,n)=>({policy,seed:r.seed,doomed:r.doomed,...g,boss:r.extra[n]})));
fs.mkdirSync(path.dirname(OUT),{recursive:true});
if(COMPARE){
 const runs={};for(const pay of [true,false])runs[pay?'pay':'nopay']=await runPolicy('tactical',pay);
 const row=(name,r)=>{const o=r.ordinary,b=o.boss,u=burden(r.results.filter(x=>!x.doomed)),t=u.st;
  return `| ${name} | ${o.games} | ${pct(o.outcome.normal,o.games)} | ${pct(o.outcome.wipe,o.games)} | ${o.outcome.timeout} | ${pct(b.defeated,b.reached)}（${b.defeated}/${b.reached}） | ${t.lost} | ${t.paid} | ${t.spent} | ${t.returned} | ${t.gone} | ${fmt(t.wait,2)} | ${fmt(o.rescue.account.mean)} | ${t.purseZero} | ${fmt(u.rosterLast,2)} |`;};
 const md=[`## 7.4 救援对照（tactical，${SEEDS} 个种子 × ${GAMES} 局，普通种子口径；强制全灭种子单列）
`,
  '| 策略 | 局数 | 正常撤离 | 全灭 | 超时 | 首领击败率 | 走失 | 支付 | 总花费 | 归来 | 永久失去 | 平均等待(有效探险) | 5局后账户均值 | 钱袋归零局 | 5局后名册均值 |','|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  row('支付救援',runs.pay),row('不支付',runs.nopay),''];
 for(const [name,r] of Object.entries(runs)){
  md.push(`### ${name==='pay'?'支付救援':'不支付'}：救援负担（耗时 ${r.secs.toFixed(0)} 秒）
`);
  md.push(burdenMd('普通种子',burden(r.results.filter(x=>!x.doomed))));
  md.push(burdenMd('强制全灭种子（HP 被刻意削到 1；该组基地回合自带付费逻辑，与开关无关）',burden(r.results.filter(x=>x.doomed))));
 }
 const report={generated:new Date().toISOString(),mode:'rescue-compare',seeds:SEEDS,variants:Object.fromEntries(Object.entries(runs).map(([k,r])=>[k,{seconds:r.secs,ordinary:r.ordinary,forcedWipeSeeds:r.forcedWipeSeeds,burdenOrdinary:burden(r.results.filter(x=>!x.doomed)),burdenForced:burden(r.results.filter(x=>x.doomed))}]))};
 fs.writeFileSync(OUT,JSON.stringify(report));
 console.log(md.join('\n'));console.log(`JSON 已写入 ${OUT}`);
}else{
 const report={generated:new Date().toISOString(),seedsPerPolicy:SEEDS,gamesPerSeed:GAMES,roundCap:ROUND_CAP,boss:BOSS_CONFIG.arcanine,policies:{}};
 const md=[`## 7.8 平衡长测（每种策略 ${SEEDS} 个种子 × ${GAMES} 局，回合上限 ${ROUND_CAP}；首领等级加值 ${BOSS_CONFIG.arcanine.levelBonus} / HP倍率 ${BOSS_CONFIG.arcanine.hpMultiplier} / 共用名单招式）\n`];
 for(const policy of POLICIES){
  const r=await runPolicy(policy);
  report.policies[policy]={seconds:r.secs,all:r.all,ordinary:r.ordinary,forcedWipeSeeds:r.forcedWipeSeeds,games:rowGames(r.results,policy),
   seedAccounts:r.results.map(x=>({seed:x.seed,doomed:x.doomed,account:x.account,roster:x.roster}))};
  md.push(`### 策略：${policy}（耗时 ${r.secs.toFixed(0)} 秒）\n`);
  md.push(section('普通种子（不含强制全灭）',r.ordinary));
  md.push(burdenMd('救援负担：普通种子（不含强制全灭）',burden(r.results.filter(x=>!x.doomed))));
  md.push(section('强制全灭种子（i%4===3，只用来检验失败回归，不代表全灭率）',r.forcedWipeSeeds));
  const stuck=r.results.flatMap(x=>x.games.filter(g=>g.outcome==='timeout').map(g=>`种子 ${g.seed} 第 ${g.game} 局：${g.reason}`));
  md.push(stuck.length?`卡住的局：\n${stuck.map(s=>'- '+s).join('\n')}\n`:'没有卡住的局。\n');
 }
 fs.writeFileSync(OUT,JSON.stringify(report));
 console.log(md.join('\n'));
 console.log(`JSON 已写入 ${OUT}`);
}
