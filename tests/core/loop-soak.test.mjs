import test from 'node:test';
import assert from 'node:assert/strict';
import {ALL_TM_MOVES} from '../../src/core/roster.ts';
import {playSeed,stats,ROUND_CAP} from './soak-bot.mjs';

/*
 * Stage 6.6 (automatic part): full-loop soak. The bot, its invariants and its per-step round-trip / illegal-command checks live in ./soak-bot.mjs
 * (shared with tools/soak/balance.mjs, stage 7.4). This file only runs the default (naive) policy over many seeds and prints the statistics.
 * Statistics are printed, never asserted (this is a soak, not a balance test). Specification: https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/02-%E8%BF%9B%E5%BA%A6/%E8%87%AA%E6%B5%8B%E8%AE%B0%E5%BD%95/%E9%98%B6%E6%AE%B56%E2%80%94%E5%AE%8C%E6%95%B4%E5%BE%AA%E7%8E%AF%E8%87%AA%E6%B5%8B%E6%8A%A5%E5%91%8A.md.
 */
const SEEDS=+(process.env.SOAK_SEEDS??30);

const sum=(xs,f)=>xs.reduce((a,x)=>a+f(x),0);
const pct=(n,d)=>d?`${(100*n/d).toFixed(1)}%`:'-';
test('S66 loop soak: base -> expedition -> base -> expedition, many seeds, every step checked',async()=>{
 const t0=Date.now(),results=[];
 for(let i=0;i<SEEDS;i++)results.push(await playSeed(i));
 const games=results.flatMap(r=>r.games),total=games.length,st=stats();
 for(const r of results)for(const k of Object.keys(st))st[k]+=r.st[k];
 const by=o=>games.filter(g=>g.outcome===o);
 const rounds=games.map(g=>g.rounds).sort((a,b)=>a-b);
 const stuck=games.filter(g=>g.outcome==='timeout');
 const lines=[
  `seeds ${SEEDS}, games ${total}, wall time ${((Date.now()-t0)/1000).toFixed(1)} s`,
  `outcome: normal exit ${by('normal').length} (${pct(by('normal').length,total)}), wipe ${by('wipe').length} (${pct(by('wipe').length,total)}), timeout/stuck ${stuck.length} (${pct(stuck.length,total)})`,
  `rounds per game: mean ${(sum(games,g=>g.rounds)/total).toFixed(1)}, median ${rounds[Math.floor(total/2)]}, min ${rounds[0]}, max ${rounds[total-1]}`,
  `goal G reached in ${games.filter(g=>g.goal).length} games; ended on floor 2 in ${games.filter(g=>g.floor===2).length}, on floor 3 in ${games.filter(g=>g.floor===3).length}`,
  `boss (7.3, for 7.4 calibration, no threshold): runs that reached the boss floor ${st.reachedBoss}, boss defeated ${st.bossDefeated}, wiped on the boss floor ${st.bossWipes}, left by the lobby exit ${st.lobbyExits}`,
  `recruit invitations ${st.invites}: accepted ${st.accepted} (with a swap-out ${st.swapped}), rejected ${st.rejected}`,
  `run level-ups ${st.levelUps} (mean final level ${(sum(games,g=>g.level)/total).toFixed(2)}), evolutions ${st.evolutions}`,
  `technique machines obtained ${st.tmGot}, brought out ${st.tmBrought}, learned at base ${st.learned}`,
  `floor crossings ${st.transits} (cancelled ${st.cancelledTransits})`,
  `backpack: berries used ${st.berries}, tonics used ${st.tonics}, rest point used ${st.rests}, guard used ${st.guards}, line used ${st.lines}, lead switches ${st.switches}`,
  `failure and rescue: wipes ${st.wipes} (forced-wipe seeds ${st.doomedWipes}), partners gone missing ${st.lostPartners}, rescues paid ${st.paid}, paid partners returned ${st.returned}, lost for good ${st.goneForGood}; shop purchases ${st.bought}, exchanger uses ${st.exchanged}`,
  `commands refused (state verified unchanged) ${st.rejections}, deliberate illegal probes ${st.probes}`,
  `final rosters: mean ${(sum(results,r=>r.roster)/SEEDS).toFixed(1)}, max ${Math.max(...results.map(r=>r.roster))}; unused vault machines at the end ${sum(results,r=>sum(Object.values(r.vault),n=>n))} (${ALL_TM_MOVES.map(m=>m+' '+sum(results,r=>r.vault[m]??0)).join(', ')})`,
  `seeds with at least 2 completed games: ${results.filter(r=>r.games.filter(g=>g.outcome!=='timeout').length>=2).length}/${SEEDS}`,
  `stuck games (round cap ${ROUND_CAP}): ${stuck.length?stuck.map(g=>`seed ${g.seed} game ${g.game}: ${g.reason}`).join(' | '):'none'}`,
 ];
 console.log('\n[loop-soak]\n'+lines.map(l=>'  '+l).join('\n'));
 console.log('  per-game (seed:game outcome rounds): '+games.map(g=>`${g.seed}:${g.game} ${g.outcome[0]}${g.rounds}`).join(', '));
 // Hard requirements: the loop ran, and the rules held at every step (the checks above throw otherwise).
 assert.equal(results.length,SEEDS);
 assert.ok(total>=SEEDS,'every seed must complete at least one game');
 assert.ok(st.probes>0&&st.rejections>0);
 assert.ok(st.doomedWipes>=1,'the forced-wipe variant must produce at least one wipe');
 // 7.3: no stuck game; every finished game went back to the base (checked in playSeed) and the boss floor was reached by someone.
 assert.equal(stuck.length,0,'stuck games: '+stuck.map(g=>g.reason).join(' | '));
 assert.ok(st.reachedBoss>=1,'at least one run must reach the boss floor');
});

test('S66 the soak is deterministic: the same seed replays to the same game records',async()=>{
 for(const i of [0,1]){const a=await playSeed(i),b=await playSeed(i);assert.deepEqual(a.games,b.games);assert.deepEqual(a.st,b.st);}
});
