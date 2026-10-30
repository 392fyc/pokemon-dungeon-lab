import test from 'node:test';
import assert from 'node:assert/strict';
import {playSeed} from './soak-bot.mjs';
import {ECON} from '../../src/core/economy.ts';

/* Stage 7.4: the tactical policy of the shared soak bot finishes its games (no round-cap timeout) and replays identically from the same seed. */
test('S74 tactical-stand policy: one seed replays identically',async()=>{
 const a=await playSeed(1,{policy:'tactical-stand'}),b=await playSeed(1,{policy:'tactical-stand'});
 assert.deepEqual(a.games,b.games);assert.deepEqual(a.st,b.st);assert.deepEqual(a.extra,b.extra);
});

test('S74 tactical policy: two seeds finish without a stuck game and replay identically',async()=>{
 for(const i of [0,1]){
  const a=await playSeed(i,{policy:'tactical'}),b=await playSeed(i,{policy:'tactical'});
  assert.equal(a.games.filter(g=>g.outcome==='timeout').length,0,`seed ${i}: stuck games: ${a.games.filter(g=>g.outcome==='timeout').map(g=>g.reason).join(' | ')}`);
  assert.ok(a.games.length>=1);
  assert.deepEqual(a.games,b.games);assert.deepEqual(a.st,b.st);assert.deepEqual(a.extra,b.extra);
 }
});

/* Stage 7.4 part 2 (7.8: seed 4 no longer loses a partner under the new enemy behaviour, so seed 5 replaces it; of seeds 0-29 seeds 3,5,7,11,15,18,19,23,24,27 lose a partner and 5 does so with one paid rescue and one return). The tactical bot pays rescues at the base. Seed 5 (formerly 4) is an ordinary (not forced-wipe) seed where a recruit goes missing in a wipe (found by playing seeds 0-13 with the 7.7 move-model tactical bot; seed 2, used before, no longer loses a partner because the new tactical bot plays it better).
 * The paying run replays identically, pays at least once, and every payment costs ECON.rescueCost; the same seed with payment switched off pays nothing and keeps the partner waiting. */
test('S74 tactical policy pays rescues: seed 5 replays identically and pays at least once; the switch turns it off',async()=>{
 const a=await playSeed(5,{policy:'tactical'}),b=await playSeed(5,{policy:'tactical'}),off=await playSeed(5,{policy:'tactical',payRescue:false});
 assert.deepEqual(a.games,b.games);assert.deepEqual(a.st,b.st);assert.deepEqual(a.extra,b.extra);assert.deepEqual(a.accTrail,b.accTrail);
 assert.equal(a.payRescue,true);assert.equal(off.payRescue,false);
 assert.ok(a.st.lostPartners>=1,'seed 5 must lose a partner');
 assert.ok(a.st.paid>=1,'seed 5 must pay at least one rescue');
 assert.equal(a.st.spent,a.st.paid*ECON.rescueCost);
 assert.ok(a.st.returned>=1,'a paid partner returns');
 assert.equal(off.st.paid,0);assert.equal(off.st.spent,0);
 assert.ok(off.st.lostPartners>=1);assert.equal(off.st.returned,0); // unpaid: the partner keeps waiting
 assert.equal(off.games.filter(g=>g.outcome==='timeout').length,0);
});
