import test from 'node:test';
import assert from 'node:assert/strict';
import {playSeed,explorationRoute} from './soak-bot.mjs';

const POLICIES=['naive','tactical','tactical-stand','cautious'];

function scoutWorld(){
 const floor=[],seen=[];
 for(let x=0;x<=15;x++)for(let y=0;y<=15;y++)floor.push({x,y});
 for(let x=0;x<=8;x++)for(let y=0;y<=12;y++)seen.push(`${x},${y}`);
 return {floor,seen,seenWalls:[],leader:'C',units:{C:{pos:{x:5,y:6}}}};
}

test('S82 scouting heads to the closest revealed edge and respects a wall already shown',()=>{
 const s=scoutWorld(),route=explorationRoute(s);
 assert.deepEqual(route,{to:{x:8,y:6},step:{x:6,y:6},len:3});
 assert.ok(route.len<s.seen.length,'the bot walks to a nearby edge instead of traversing all known ground');
 const blocked=structuredClone(s);blocked.floor=blocked.floor.filter(p=>p.x!==9||p.y!==6);blocked.seenWalls=['9,6'];
 assert.deepEqual(explorationRoute(blocked),{to:{x:8,y:7},step:{x:6,y:6},len:3},'8.8: one diagonal step shortens the detour; the directly blocked edge is skipped for the next open edge');
});

test('S82 remote unseen terrain changes do not redirect scouting',()=>{
 const original=scoutWorld(),changed=structuredClone(original);
 changed.floor=changed.floor.filter(p=>!(p.x>=14&&p.y>=14));
 for(let x=40;x<=42;x++)for(let y=40;y<=42;y++)changed.floor.push({x,y});
 assert.deepEqual(explorationRoute(changed),explorationRoute(original));
});

test('S81 all four policies finish only by boss victory or wipe, with settlement summaries',async()=>{
 for(const policy of POLICIES){
  const result=await playSeed(0,{policy,difficulty:policy==='cautious'?'hard':'normal'});
  assert.equal(result.policy,policy);
  assert.equal(result.difficulty,policy==='cautious'?'hard':'normal');
  assert.ok(result.games.length>=1);
  assert.equal(result.games.filter(g=>g.outcome==='timeout').length,0,'stuck games for '+policy+': '+result.games.filter(g=>g.outcome==='timeout').map(g=>g.reason).join(' | '));
  assert.ok(result.games.every(g=>g.outcome==='won'||g.outcome==='wipe'),policy+': unexpected outcome');
  assert.ok(result.st.probes>0&&result.st.rejections>0,policy+': soak did not verify rejected commands');
  assert.ok(result.games.every(g=>g.reckless===false),policy+': formal policy run is marked reckless');
  for(const x of result.extra){
   assert.ok(Array.isArray(x.summary.brought),policy+': missing brought-partner summary');
   assert.ok(Array.isArray(x.summary.shards),policy+': missing shard summary');
   assert.ok(x.activity?.rank&&x.summary?.rank,policy+': missing rank observation or settlement rank');
   assert.equal(x.activity.rank.cumulative,x.summary.rank.after,policy+': observed cumulative rank differs from the settled total');
   assert.equal(x.activity.rank.teamLevel,x.summary.rank.levelAfter,policy+': observed team level differs from the settled level');
   for(const [id,counters] of Object.entries(x.activity.commissions.byType)){
    assert.equal(counters.accepted,counters.completed+counters.failed,
     policy+'/'+id+': each accepted commission must be completed or counted as failed, including terminal voids');
   }
  }
  result.games.forEach((g,n)=>{assert.ok(Number.isInteger(g.kills)&&g.kills>=0);assert.equal(result.extra[n].kills,g.kills);});
  for(const x of result.extra)if(x.bossRun){for(const k of ['reached','contacted','defeated','survivors','bossHpLeft'])assert.ok(Object.hasOwn(x,k),k);}
  const replay=await playSeed(0,{policy,difficulty:policy==='cautious'?'hard':'normal'});
  assert.deepEqual(result.games,replay.games);assert.deepEqual(result.st,replay.st);assert.deepEqual(result.extra,replay.extra);
 }
});

// 固定 seed 8919（playSeed 索引 1；#193 相性与等级装配后的样本）验证 hard 难度传入真实局，且 cautious 继续寻找首领。
// 该样本不用于声明 8.6 机器人改版后仍是较小索引中的最早接触样本。
test('S81 difficult setting is passed into real expeditions and cautious keeps seeking the boss',async()=>{
 const result=await playSeed(1,{policy:'cautious',difficulty:'hard'});
 assert.equal(result.difficulty,'hard');
 assert.equal(result.games.filter(g=>g.outcome==='timeout').length,0);
 assert.ok(result.st.reachedBoss>0,'cautious did not reach the boss floor');
 assert.ok(result.st.bossContacts>0,'cautious reached the boss floor but never contacted the boss');
});
