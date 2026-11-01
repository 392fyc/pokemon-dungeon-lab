import test from 'node:test';
import assert from 'node:assert/strict';
import {playSeed} from './soak-bot.mjs';

const POLICIES=['naive','tactical','tactical-stand','cautious'];

test('S81 all four policies finish only by boss victory or wipe, with settlement summaries',async()=>{
 for(const policy of POLICIES){
  const result=await playSeed(0,{policy,difficulty:policy==='cautious'?'hard':'normal'});
  assert.equal(result.policy,policy);
  assert.equal(result.difficulty,policy==='cautious'?'hard':'normal');
  assert.ok(result.games.length>=1);
  assert.equal(result.games.filter(g=>g.outcome==='timeout').length,0,'stuck games for '+policy+': '+result.games.filter(g=>g.outcome==='timeout').map(g=>g.reason).join(' | '));
  assert.ok(result.games.every(g=>g.outcome==='won'||g.outcome==='wipe'),policy+': unexpected outcome');
  assert.ok(result.st.probes>0&&result.st.rejections>0,policy+': soak did not verify rejected commands');
  for(const x of result.extra){
   assert.ok(Array.isArray(x.summary.brought),policy+': missing brought-partner summary');
   assert.ok(Array.isArray(x.summary.shards),policy+': missing shard summary');
  }
  result.games.forEach((g,n)=>{assert.ok(Number.isInteger(g.kills)&&g.kills>=0);assert.equal(result.extra[n].kills,g.kills);});
  for(const x of result.extra)if(x.bossRun){for(const k of ['reached','contacted','defeated','survivors','bossHpLeft'])assert.ok(Object.hasOwn(x,k),k);}
  const replay=await playSeed(0,{policy,difficulty:policy==='cautious'?'hard':'normal'});
  assert.deepEqual(result.games,replay.games);assert.deepEqual(result.st,replay.st);assert.deepEqual(result.extra,replay.extra);
 }
});

test('S81 difficult setting is passed into real expeditions and cautious keeps seeking the boss',async()=>{
 const result=await playSeed(1,{policy:'cautious',difficulty:'hard'});
 assert.equal(result.difficulty,'hard');
 assert.equal(result.games.filter(g=>g.outcome==='timeout').length,0);
 assert.ok(result.st.reachedBoss>0,'cautious did not reach the boss floor');
 assert.ok(result.st.bossContacts>0,'cautious reached the boss floor but never contacted the boss');
});
