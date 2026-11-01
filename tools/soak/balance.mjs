/**
 * v0.1 roguelike balance report. Uses the same player-visible bot and TrialStore checks as the core soak.
 *
 *   node --experimental-strip-types tools/soak/balance.mjs [--seeds 30]
 *     [--policy naive,tactical,tactical-stand,cautious] [--difficulty easy|normal|hard]
 *     [--out .tmp/lane-main/balance-<time>.json]
 *
 * Seeds with index i % 4 === 3 are forced-wipe checks. Their results are reported separately and excluded
 * from the ordinary-seed wipe rate. Rescue, account and evacuation statistics do not apply to v0.1.
 */
import fs from 'node:fs';
import path from 'node:path';
import {playSeed,stats,GAMES,ROUND_CAP,COMMAND_CAP} from '../../tests/core/soak-bot.mjs';
import {DIFFICULTY} from '../../src/core/dungeon.ts';

const args=process.argv.slice(2);
const opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0&&args[i+1]!==undefined?args[i+1]:fallback;};
const SEEDS=Number(opt('seeds','30'));
const POLICIES=opt('policy','naive,tactical,tactical-stand,cautious').split(',').map(s=>s.trim()).filter(Boolean);
const DIFFICULTY_NAME=opt('difficulty','normal');
if(!Number.isSafeInteger(SEEDS)||SEEDS<1)throw new Error('--seeds must be a positive integer');
if(!Object.hasOwn(DIFFICULTY,DIFFICULTY_NAME))throw new Error('--difficulty must be easy, normal, or hard');
for(const p of POLICIES)if(!['naive','tactical','tactical-stand','cautious'].includes(p))throw new Error('unknown policy '+p);
if(!POLICIES.length)throw new Error('--policy must name at least one policy');
if(args.includes('--no-pay')||args.includes('--rescue-compare'))throw new Error('救援与账户统计在 v0.1 不适用');
if(args.includes('--boss')||args.includes('--sweep'))throw new Error('旧版首领扫描不适用于 v0.1');

const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15);
const OUT=opt('out','.tmp/lane-main/balance-'+stamp+'.json');
const sum=(xs,f=x=>x)=>xs.reduce((a,x)=>a+f(x),0);
const count=(xs,f)=>xs.filter(f).length;
const mean=xs=>xs.length?sum(xs)/xs.length:null;
const pct=(n,d)=>d?Number((100*n/d).toFixed(1)):null;
function combinedStats(results){
 const total=stats();for(const r of results)for(const key of Object.keys(total))total[key]+=r.st[key]??0;return total;
}
function summarize(results){
 const st=combinedStats(results),games=results.flatMap(r=>r.games.map((g,n)=>({...g,run:r.extra[n]}))),total=games.length;
 const reached=games.filter(g=>g.run?.reached),contacted=games.filter(g=>g.run?.contacted),defeated=games.filter(g=>g.run?.defeated);
 const evolved=games.filter(g=>(g.evolutions??0)>0),shardsBySpecies={};
 for(const game of games)for(const row of game.run?.summary?.shards??[])shardsBySpecies[row.species]=(shardsBySpecies[row.species]??0)+row.count;
 const rounds=games.map(g=>g.rounds),orderedRounds=[...rounds].sort((a,b)=>a-b);
 return {seeds:results.length,games:total,
  outcomes:{won:count(games,g=>g.outcome==='won'),wipe:count(games,g=>g.outcome==='wipe'),timeout:count(games,g=>g.outcome==='timeout')},
  wipeRate:pct(count(games,g=>g.outcome==='wipe'),total),
  boss:{arrived:reached.length,contacted:contacted.length,defeated:defeated.length,wipedOnBossFloor:st.bossWipes},
  evolution:{total:st.evolutions,games:evolved.length,rate:pct(evolved.length,total)},
  partners:{brought:st.partnersBrought,shards:st.shards,shardsBySpecies},
  techniqueMachines:{obtained:st.tmGot,brought:st.tmBrought},
  kills:{mean:mean(games.map(g=>g.kills))},rounds:{mean:mean(rounds),median:rounds.length?(orderedRounds[Math.floor((rounds.length-1)/2)]+orderedRounds[Math.floor(rounds.length/2)])/2:null,min:rounds.length?Math.min(...rounds):null,max:rounds.length?Math.max(...rounds):null},
  stats:st};
}
function mdRow(policy,name,s){
 const o=s.outcomes,b=s.boss,e=s.evolution,p=s.partners,t=s.techniqueMachines;
 return '| '+policy+' | '+name+' | '+s.seeds+' | '+s.games+' | '+o.wipe+' ('+(s.wipeRate??'-')+'%) | '+o.timeout+' | '+b.arrived+' | '+b.contacted+' | '+b.defeated+' | '+e.games+' ('+(e.rate??'-')+'%) | '+p.brought+' | '+p.shards+' | '+t.brought+' / '+t.obtained+' | '+(s.kills.mean?.toFixed(2)??'-')+' | '+(s.rounds.mean?.toFixed(2)??'-')+' / '+s.rounds.median+' / '+s.rounds.max+' |';
}
async function runPolicy(policy){
 const started=Date.now(),results=[];
 for(let i=0;i<SEEDS;i++)results.push(await playSeed(i,{policy,difficulty:DIFFICULTY_NAME}));
 const ordinary=results.filter(r=>!r.doomed),forced=results.filter(r=>r.doomed);
 return {seconds:(Date.now()-started)/1000,all:summarize(results),ordinary:summarize(ordinary),forcedWipeSeeds:summarize(forced),
  games:results.flatMap(r=>r.games.map((g,n)=>({policy,seed:r.seed,doomed:r.doomed,...g,run:r.extra[n]})))};
}

fs.mkdirSync(path.dirname(OUT),{recursive:true});
const report={generated:new Date().toISOString(),difficulty:DIFFICULTY_NAME,multiplier:DIFFICULTY[DIFFICULTY_NAME],seedsPerPolicy:SEEDS,gamesPerSeed:GAMES,roundCap:ROUND_CAP,commandCap:COMMAND_CAP,exploration:'nearest-visible-frontier',policies:{}};
const rows=[];
for(const policy of POLICIES){
 const result=await runPolicy(policy);
 report.policies[policy]={seconds:result.seconds,all:result.all,ordinary:result.ordinary,forcedWipeSeeds:result.forcedWipeSeeds,games:result.games};
 rows.push(mdRow(policy,'普通种子',result.ordinary),mdRow(policy,'强制全灭种子（单列）',result.forcedWipeSeeds));
}
fs.writeFileSync(OUT,JSON.stringify(report));
console.log([
 '## v0.1 平衡长测（难度：'+DIFFICULTY_NAME+'，敌人 HP／伤害倍率 '+DIFFICULTY[DIFFICULTY_NAME]+'；每种策略 '+SEEDS+' 个种子 × '+GAMES+' 局；回合上限 '+ROUND_CAP+'，命令上限 '+COMMAND_CAP+'；探索最近已知边界）',
 '',
 '| 策略 | 种子组 | 种子数 | 局数 | 全灭 | 超时／卡住 | 到达首领层 | 接触首领 | 击败首领 | 进化局数 | 带回伙伴 | 碎片 | 带回招式机 / 获得 | 平均击杀 | 回合均值 / 中位 / 最大 |',
 '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
 ...rows,
 '',
 '逐局记录已写入 '+OUT
].join('\n'));
const timeoutCount=Object.values(report.policies).reduce((n,p)=>n+p.all.outcomes.timeout,0);
if(timeoutCount){console.error('错误：发现 '+timeoutCount+' 局超时／卡住；报告已保留。');process.exitCode=1;}
