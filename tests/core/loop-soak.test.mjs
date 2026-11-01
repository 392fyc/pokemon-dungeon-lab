import test from 'node:test';
import assert from 'node:assert/strict';
import {playSeed,stats,ROUND_CAP} from './soak-bot.mjs';

const SEEDS=+(process.env.SOAK_SEEDS??30);
const sum=(xs,f)=>xs.reduce((a,x)=>a+f(x),0);
const pct=(n,d)=>d?((100*n/d).toFixed(1)+'%'):'-';

test('S81 loop soak: base -> roguelike expedition -> base, every step checked',async()=>{
 const t0=Date.now(),results=[];
 for(let i=0;i<SEEDS;i++)results.push(await playSeed(i));
 const games=results.flatMap(r=>r.games),total=games.length,st=stats();
 for(const r of results)for(const k of Object.keys(st))st[k]+=r.st[k];
 const wins=games.filter(g=>g.outcome==='won'),wipes=games.filter(g=>g.outcome==='wipe'),stuck=games.filter(g=>g.outcome==='timeout');
 const rounds=games.map(g=>g.rounds).sort((a,b)=>a-b);
 const evolved=games.filter(g=>g.evolutions>0).length;
 const lines=[
  'seeds '+SEEDS+', games '+total+', wall time '+((Date.now()-t0)/1000).toFixed(1)+' s',
  'outcome: boss victory '+wins.length+' ('+pct(wins.length,total)+'), wipe '+wipes.length+' ('+pct(wipes.length,total)+'), timeout/stuck '+stuck.length,
  'rounds per game: mean '+(sum(games,g=>g.rounds)/total).toFixed(1)+', median '+rounds[Math.floor(total/2)]+', min '+rounds[0]+', max '+rounds[rounds.length-1],
  'boss: reached '+st.reachedBoss+', contacted '+st.bossContacts+', defeated '+st.bossDefeated+', wiped on boss floor '+st.bossWipes,
  'evolutions: '+st.evolutions+' total; '+evolved+'/'+total+' games ('+pct(evolved,total)+')',
  'partners: '+st.partnersBrought+' brought to camp; '+st.shards+' duplicate-species shards',
  'technique machines: '+st.tmGot+' obtained; '+st.tmBrought+' brought back',
  'recruit invitations '+st.invites+': accepted '+st.accepted+' (with swap-out '+st.swapped+'), rejected '+st.rejected,
  'floor crossings '+st.transits+' (cancelled '+st.cancelledTransits+')',
  'backpack: berries '+st.berries+', tonics '+st.tonics+', rest points '+st.rests+', guards '+st.guards+', line attacks '+st.lines+', lead switches '+st.switches,
  'commands refused with state and saved bytes unchanged '+st.rejections+'; deliberate probes '+st.probes,
  'final rosters: mean '+(sum(results,r=>r.roster)/SEEDS).toFixed(1)+', max '+Math.max(...results.map(r=>r.roster))+'; duplicate shards '+sum(results,r=>Object.values(r.shards).reduce((a,n)=>a+n,0)),
  'stuck games (round cap '+ROUND_CAP+'): '+(stuck.length?stuck.map(g=>'seed '+g.seed+' game '+g.game+': '+g.reason).join(' | '):'none')
 ];
 console.log('\n[loop-soak]\n'+lines.map(l=>'  '+l).join('\n'));
 console.log('  per-game (seed:game outcome rounds): '+games.map(g=>g.seed+':'+g.game+' '+g.outcome[0]+g.rounds).join(', '));
 assert.equal(results.length,SEEDS);
 assert.ok(total>=SEEDS,'every seed must complete at least one game');
 assert.ok(st.probes>0&&st.rejections>0);
 assert.ok(st.doomedWipes>=1,'forced-wipe seeds did not produce a full-party wipe');
 assert.equal(stuck.length,0,'stuck games: '+stuck.map(g=>g.reason).join(' | '));
 assert.ok(st.reachedBoss>=1,'no run reached the boss floor');
 assert.ok(st.bossContacts>=1,'no run contacted the boss');
});

test('S81 the loop soak is deterministic for the same seed',async()=>{
 for(const i of [0,1]){const a=await playSeed(i),b=await playSeed(i);
 assert.deepEqual(a.games,b.games);assert.deepEqual(a.st,b.st);assert.deepEqual(a.extra,b.extra);}
});
