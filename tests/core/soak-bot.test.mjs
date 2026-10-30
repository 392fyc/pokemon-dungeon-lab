import test from 'node:test';
import assert from 'node:assert/strict';
import {playSeed} from './soak-bot.mjs';

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
