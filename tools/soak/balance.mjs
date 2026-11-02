/**
 * 8.6 balance report: real visible-information bot, five consecutive games per seed.
 * node --experimental-strip-types tools/soak/balance.mjs --seeds 30
 *   --policy naive,tactical,tactical-stand,cautious --difficulty normal
 *   --talents 0  (or vitality:2,offense:2 for the Lv5 reference group)
 *   --out .tmp/balance-153/baseline.json
 * Forced-wipe indices i % 4 === 3 are reported separately from ordinary games.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {playSeed,stats,GAMES,ROUND_CAP,COMMAND_CAP} from '../../tests/core/soak-bot.mjs';
import {DIFFICULTY} from '../../src/core/dungeon.ts';

const args=process.argv.slice(2);
const opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0&&args[i+1]!==undefined?args[i+1]:fallback;};
const SEEDS=Number(opt('seeds','30'));
const POLICIES=opt('policy','naive,tactical,tactical-stand,cautious').split(',').map(s=>s.trim()).filter(Boolean);
const DIFFICULTY_NAME=opt('difficulty','normal');
function parseTalents(value){
 if(value==='0')return 0;
 const talents={};
 for(const part of value.split(',')){
  const match=/^(vitality|offense|supplies):([0-5])$/.exec(part.trim());
  if(!match||Object.hasOwn(talents,match[1]))throw new Error('--talents must be 0 or unique vitality/offense/supplies:0..5 entries');
  talents[match[1]]=Number(match[2]);
 }
 if(Object.values(talents).reduce((a,n)=>a+n,0)>4)throw new Error('the Lv5 reference group has at most four talent points');
 return Object.values(talents).some(n=>n>0)?Object.fromEntries(Object.entries(talents).filter(([,n])=>n>0)):0;
}
const TALENTS=parseTalents(opt('talents','0'));
if(!Number.isSafeInteger(SEEDS)||SEEDS<1)throw new Error('--seeds must be a positive integer');
if(!Object.hasOwn(DIFFICULTY,DIFFICULTY_NAME))throw new Error('--difficulty must be easy, normal, or hard');
for(const p of POLICIES)if(!['naive','tactical','tactical-stand','cautious'].includes(p))throw new Error('unknown policy '+p);
if(!POLICIES.length||new Set(POLICIES).size!==POLICIES.length)throw new Error('--policy must name distinct policies');
if(args.includes('--no-pay')||args.includes('--rescue-compare'))throw new Error('救援与账户统计在 v0.1 不适用');
if(args.includes('--boss')||args.includes('--sweep'))throw new Error('旧版首领扫描不适用于 v0.1');
const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15);
const OUT=opt('out','.tmp/balance-153/balance-'+stamp+'.json');
const sum=(xs,f=x=>x)=>xs.reduce((a,x)=>a+f(x),0);
const count=(xs,f)=>xs.filter(f).length;
const mean=xs=>xs.length?sum(xs)/xs.length:null;
const pct=(n,d)=>d?Number((100*n/d).toFixed(1)):null;
const span=xs=>({count:xs.length,mean:mean(xs),min:xs.length?Math.min(...xs):null,max:xs.length?Math.max(...xs):null});
function wilson(wins,n){
 if(!n)return null;
 const z=1.959963984540054,p=wins/n,d=1+z*z/n,center=(p+z*z/(2*n))/d,radius=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
 return [100*(center-radius),100*(center+radius)].map(x=>Number(x.toFixed(2)));
}
function addCounts(target,source={}){for(const [k,n] of Object.entries(source))target[k]=(target[k]??0)+n;return target;}
function combineRows(rows){
 const out={offered:0,accepted:0,rejected:0,completed:0,failed:0,rewardExp:0,failures:{}};
 for(const row of rows){for(const k of ['offered','accepted','rejected','completed','failed','rewardExp'])out[k]+=row?.[k]??0;addCounts(out.failures,row?.failures);}
 out.completionRate=pct(out.completed,out.accepted);return out;
}
function activitySummary(games,results){
 const activity=games.map(g=>g.run?.activity).filter(Boolean),rooms={};
 assert.equal(activity.length,games.length,'every observed game must contain the complete 8.6 activity record');
 for(const type of ['challenge','item','commission','blessing']){
  const rows=activity.map(a=>a.rooms?.[type]);
  const seen=sum(rows,r=>r?.seen??0),entered=sum(rows,r=>r?.entered??0),handled=sum(rows,r=>r?.handled??0);
  rooms[type]={seen,entered,handled,entryRate:pct(entered,seen),handlingRate:pct(handled,seen)};
 }
 const challenge={started:0,cleared:0,wiped:0,rewards:{}},items={},roomItems={},usedItems={},offered={},selected={};let declined=0;
 for(const a of activity){for(const k of ['started','cleared','wiped'])challenge[k]+=a.challenge?.[k]??0;addCounts(challenge.rewards,a.challenge?.rewards);addCounts(items,a.items);addCounts(roomItems,a.roomItems);addCounts(usedItems,a.usedItems);addCounts(offered,a.blessings?.offered);addCounts(selected,a.blessings?.selected);declined+=a.blessings?.declined??0;}
 const byType={},byFloor={};
 for(const id of ['hunter','collector','scout','guardian','speedrun'])byType[id]=combineRows(activity.map(a=>a.commissions?.byType?.[id]));
 for(const floor of [1,2,3]){byFloor[floor]={};for(const id of Object.keys(byType))byFloor[floor][id]=combineRows(activity.map(a=>a.commissions?.byFloor?.[floor]?.[id]));}
 const c=activity.map(a=>a.commissions??{}),rewardExp=sum(c,r=>r.rewardExp??0),totalTeamExp=sum(c,r=>r.totalTeamExp??0),concurrentTotal=sum(c,r=>r.concurrentTotal??0),concurrentSamples=sum(c,r=>r.concurrentSamples??0);
 const ranks=activity.map(a=>a.rank).filter(Boolean),rankScores={};
 for(const k of ['depth','boss','commissions','recruits','tms','total'])rankScores[k]=span(ranks.map(r=>r[k]).filter(Number.isFinite));
 const perSeed=results.map(r=>{const rank=r.extra.at(-1)?.activity?.rank;return {seed:r.seed,games:r.games.length,rankExp:rank?.after??null,rankLevel:rank?.levelAfter??null,talents:rank?.talents??{},talentPoints:rank?.talentPoints??null};});
 const entries=activity.map(a=>a.bossRoom).filter(Boolean),winHp=activity.map(a=>a.winHpRatio).filter(Number.isFinite);
 return {recordedGames:activity.length,rooms,challenge,items,roomItems,usedItems,
  commissions:{byType,byFloor,rewardExp,totalTeamExp,expShare:totalTeamExp?rewardExp/totalTeamExp:null,meanGameExpShare:mean(c.map(r=>r.expShare).filter(Number.isFinite)),concurrentTotal,concurrentSamples,concurrentMean:concurrentSamples?concurrentTotal/concurrentSamples:null,speedRemaining:span(c.flatMap(r=>r.speedRemaining??[])),guardianFailures:sum(c,r=>r.guardianFailures??0)},
  blessings:{offered,selected,declined},rank:{scores:rankScores,perSeed,talentPoints:span(ranks.map(r=>r.talentPoints).filter(Number.isFinite))},
  bossRoom:{entries:entries.length,hpRatio:span(entries.map(r=>r.hpRatio)),items:span(entries.map(r=>r.items)),blessings:entries.map(r=>r.blessings)},winHpRatio:span(winHp)};
}
function summarize(results){
 const st=stats();for(const r of results)for(const key of Object.keys(st))st[key]+=r.st[key]??0;
 const games=results.flatMap(r=>r.games.map((g,n)=>({...g,run:r.extra[n]}))),total=games.length;
 const reached=games.filter(g=>g.run?.reached),contacted=games.filter(g=>g.run?.contacted),defeated=games.filter(g=>g.run?.defeated),evolved=games.filter(g=>(g.evolutions??0)>0),shardsBySpecies={};
 for(const game of games)for(const row of game.run?.summary?.shards??[])shardsBySpecies[row.species]=(shardsBySpecies[row.species]??0)+row.count;
 const rounds=games.map(g=>g.rounds),ordered=[...rounds].sort((a,b)=>a-b);
 return {seeds:results.length,games:total,outcomes:{won:count(games,g=>g.outcome==='won'),wipe:count(games,g=>g.outcome==='wipe'),timeout:count(games,g=>g.outcome==='timeout')},wipeRate:pct(count(games,g=>g.outcome==='wipe'),total),
  boss:{arrived:reached.length,contacted:contacted.length,defeated:defeated.length,defeatRate:pct(defeated.length,total),wilson95: wilson(defeated.length,total),wipedOnBossFloor:st.bossWipes,hpLeft:span(games.map(g=>g.run?.bossHpLeft).filter(Number.isFinite))},
  evolution:{total:st.evolutions,games:evolved.length,rate:pct(evolved.length,total)},partners:{brought:st.partnersBrought,shards:st.shards,shardsBySpecies},techniqueMachines:{obtained:st.tmGot,brought:st.tmBrought},kills:{mean:mean(games.map(g=>g.kills))},
  commands:span(games.map(g=>g.commands)),rounds:{...span(rounds),median:rounds.length?(ordered[Math.floor((rounds.length-1)/2)]+ordered[Math.floor(rounds.length/2)])/2:null},stats:st,activity:activitySummary(games,results)};
}
const fmt=n=>Number.isFinite(n)?n.toFixed(2):'-';
function rowsFor(policy,name,s){
 const b=s.boss,a=s.activity,c=a.commissions,ci=b.wilson95?.join('—')??'-';
 return ['| '+[policy,name,s.games,s.outcomes.wipe,s.outcomes.timeout,b.arrived,b.contacted,b.defeated+' ('+b.defeatRate+'%; '+ci+')',fmt(s.rounds.mean)+' / '+s.rounds.max].join(' | ')+' |',
  ...Object.entries(a.rooms).map(([type,r])=>'| '+[policy,name,type,r.seen,r.entered,r.handled,r.handlingRate??'-'].join(' | ')+' |'),
  ...Object.entries(c.byType).map(([id,r])=>'| '+[policy,name,id,r.offered,r.accepted,r.rejected,r.completed,r.failed,r.completionRate??'-'].join(' | ')+' |')];
}
fs.mkdirSync(path.dirname(OUT),{recursive:true});
const report={generated:new Date().toISOString(),stage:'baseline-or-calibration',difficulty:DIFFICULTY_NAME,multiplier:DIFFICULTY[DIFFICULTY_NAME],talents:TALENTS,initialRankExp:TALENTS===0?0:60,seedsPerPolicy:SEEDS,gamesPerSeed:GAMES,roundCap:ROUND_CAP,commandCap:COMMAND_CAP,exploration:'nearest-visible-frontier',policies:{}};
report.sourceFiles=Object.fromEntries(['tests/core/soak-bot.mjs','tools/soak/balance.mjs'].map(file=>[file,createHash('sha256').update(fs.readFileSync(new URL('../../'+file,import.meta.url))).digest('hex')]));
const sections=[];
for(const policy of POLICIES){
 const started=Date.now(),results=[];
 for(let i=0;i<SEEDS;i++){
  const result=await playSeed(i,{policy,difficulty:DIFFICULTY_NAME,talents:TALENTS});
  results.push(result);
  console.error(policy+' seed '+(i+1)+'/'+SEEDS+' done: '+result.games.map(g=>g.outcome+'@'+g.rounds).join(', '));
  for(const game of result.games)if(game.outcome==='timeout')console.error('TIMEOUT '+JSON.stringify(game));
 }
 const ordinary=summarize(results.filter(r=>!r.doomed)),forced=summarize(results.filter(r=>r.doomed)),all=summarize(results);
 report.policies[policy]={seconds:(Date.now()-started)/1000,all,ordinary,forcedWipeSeeds:forced,games:results.flatMap(r=>r.games.map((g,n)=>({policy,seed:r.seed,doomed:r.doomed,...g,run:r.extra[n]})))};
 fs.writeFileSync(OUT,JSON.stringify(report));
 for(const [name,s] of [['普通种子',ordinary],['强制全灭',forced]]){
  const rows=rowsFor(policy,name,s),a=s.activity,c=a.commissions;
  sections.push(rows[0],...rows.slice(1,5));
  console.log('\n策略 '+policy+' / '+name+'；挑战开始/清场/全灭 '+a.challenge.started+'/'+a.challenge.cleared+'/'+a.challenge.wiped+'；委托经验占比 '+fmt(c.expShare===null?null:c.expShare*100)+'%；平均同时生效 '+fmt(c.concurrentMean)+'；rankExp均分 '+fmt(a.rank.scores.total.mean)+'；已用天赋点 '+fmt(a.rank.talentPoints.mean)+'；胜局剩余HP '+fmt(a.winHpRatio.mean));
  console.log('| 策略 | 种子组 | 委托 | 出现 | 接下 | 拒绝 | 完成 | 失败 | 完成率% |\n|---|---|---|---:|---:|---:|---:|---:|---:|\n'+rows.slice(5).join('\n'));
  console.log('祝福被选中：'+JSON.stringify(a.blessings.selected)+'；五局探险队累计：'+JSON.stringify(a.rank.perSeed));
 }
}
console.log('\n难度 '+DIFFICULTY_NAME+'；天赋 '+JSON.stringify(TALENTS)+'；每策略 '+SEEDS+' 种子 × '+GAMES+' 局；上限 '+ROUND_CAP+' 回合 / '+COMMAND_CAP+' 命令。首领区间为Wilson 95%。');
for(let i=0;i<sections.length;i+=5){console.log('\n| 策略 | 种子组 | 局数 | 全灭 | 超时 | 到达首领层 | 接触首领 | 击败首领 (比例;95%区间) | 回合均值 / 最大 |\n|---|---|---:|---:|---:|---:|---:|---|---|\n'+sections[i]);console.log('| 策略 | 种子组 | 房间 | 看到 | 进入 | 处理 | 处理比例% |\n|---|---|---|---:|---:|---:|---:|\n'+sections.slice(i+1,i+5).join('\n'));}
console.log('\n全部逐局统计及按层委托统计：'+OUT);
const timeouts=sum(Object.values(report.policies),p=>p.all.outcomes.timeout);
if(timeouts){console.error('发现 '+timeouts+' 局超时；报告已保留。');process.exitCode=1;}
