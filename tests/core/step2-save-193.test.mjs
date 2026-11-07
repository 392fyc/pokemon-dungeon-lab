import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialStore,decode,BUILD_ID} from '../../src/core/save.ts';
import {RULE_VERSION,CONTENT_VERSION,closeOut,createExpedition} from '../../src/core/engine.ts';
import {MAX_CARRY,applyBase,initialProfile,profileProblem,settleRun,squadOf} from '../../src/core/base.ts';
import {learnableMove} from '../../src/core/roster.ts';

function storage(initial=null){
 let value=initial,writes=0;
 return {getItem:()=>value,setItem:(_key,next)=>{value=next;writes++;},raw:()=>value,writes:()=>writes};
}

function profileWithTwoPermanentTms(){
 const profile=initialProfile();
 profile.vault.protect=2;profile.vault.roar=2;
 for(const move of ['protect','roar']){
  const learned=learnableMove('charmander',move);
  assert.ok(learned,`Charmander must be compatible with ${move}`);
  const result=applyBase(profile,{type:'learn',inst:'P1',move});
  assert.equal(result.ok,true,result.error);
  Object.assign(profile,result.profile);
 }
 return profile;
}

test('camp can carry four distinct learned moves while retaining strict subset and duplicate checks',()=>{
 assert.equal(MAX_CARRY,4);
 const profile=profileWithTwoPermanentTms(),moves=profile.roster[0].learned.map(move=>move.move);
 assert.equal(moves.length,4);
 const result=applyBase(profile,{type:'carry',inst:'P1',moves});
 assert.equal(result.ok,true,result.error);
 assert.deepEqual(result.profile.roster[0].carry,moves);
 assert.equal(profileProblem(result.profile),null,'the four carried moves all belong to the learned list');
 const current={format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:1,profile:result.profile};
 assert.deepEqual(decode(JSON.stringify(current)).profile.roster[0].carry,moves,'the strict archive decoder accepts a four-move camp record');

 const duplicate=applyBase(profile,{type:'carry',inst:'P1',moves:[moves[0],moves[1],moves[2],moves[0]]});
 assert.equal(duplicate.ok,false);
 assert.match(duplicate.error,/不能携带两次/);
 const unknown=applyBase(profile,{type:'carry',inst:'P1',moves:[...moves.slice(0,3),'not-learned']});
 assert.equal(unknown.ok,false);
 assert.match(unknown.error,/还没有学会/);
 const overLimit=applyBase(profile,{type:'carry',inst:'P1',moves:[...moves,'fifth-move']});
 assert.equal(overLimit.ok,false);
 assert.match(overLimit.error,/最多携带4招/);

 const invalid=structuredClone(result.profile);
 invalid.roster[0].carry[3]='not-learned';
 assert.match(profileProblem(invalid),/不是已学招式的子集/);
 const oldTwoMove=initialProfile();
 assert.deepEqual(oldTwoMove.roster[0].carry,['scratch','ember']);
 assert.equal(profileProblem(oldTwoMove),null,'legacy two-move carries remain valid');
});

test('trial-rules-5 content-5 and content-6 camp records migrate to the active version and keep their profile',async()=>{
 assert.equal(RULE_VERSION,'trial-rules-6');
 assert.equal(CONTENT_VERSION,'trial-content-7');
 for(const content of ['trial-content-5','trial-content-6']){
  const prior=profileWithTwoPermanentTms(),expected=structuredClone(prior);
  const old={format:2,rules:'trial-rules-5',content,build:BUILD_ID,sequence:7,profile:prior};
  const port=storage(JSON.stringify(old)),store=new TrialStore(port,`step2-save-${content}`);
  assert.equal(await store.whenReady,true,store.error);
  assert.equal(store.status,'ready');
  assert.equal(store.envelope.rules,RULE_VERSION);
  assert.equal(store.envelope.content,CONTENT_VERSION);
  assert.equal(store.envelope.sequence,8);
  assert.deepEqual(store.profile,expected,'migration preserves the roster, both move lists, permanent TM knowledge, and vault');
  assert.deepEqual(store.profile.roster[0].carry,['scratch','ember','protect','roar'],'migration keeps the carried list as saved (both machines were learned with room to carry them)');
  assert.deepEqual(store.profile.vault,{protect:1,roar:1});
  assert.equal(port.writes(),1,'a valid old camp is upgraded and written once');
 }
});

test('a move learned during the expedition is discarded at settlement while permanent TM learning remains',()=>{
 const profile=profileWithTwoPermanentTms();
 const world=createExpedition('step2-save-193-run',37,3,squadOf(profile));
 const leader=world.units[world.queue[0]];
 assert.equal(leader.inst,'P1');
 leader.learned.push('slash'); // Represents the run-only level-up learning handled by the engine.
 world.phase='ended';world.end=closeOut(world,'won');

 const settled=settleRun(profile,world);
 assert.ok(settled);
 assert.deepEqual(settled.roster[0].learned,profile.roster[0].learned);
 assert.ok(settled.roster[0].learned.some(move=>move.move==='protect'));
 assert.ok(settled.roster[0].learned.some(move=>move.move==='roar'));
 assert.ok(!settled.roster[0].learned.some(move=>move.move==='slash'));
});
