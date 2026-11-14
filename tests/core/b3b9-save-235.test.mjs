import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialStore,decode,BUILD_ID,SAVE_KEY} from '../../src/core/save.ts';
import {RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {initialProfile,applyBase,profileProblem} from '../../src/core/base.ts';

function storage(initial=null){
  let value=initial,writes=0,fail=false;
  return {getItem:()=>value,setItem:(_key,next)=>{if(fail)throw Error('disk full');value=next;writes++;},
    raw:()=>value,writes:()=>writes,fail:()=>{fail=true;}};
}
function cultivated(){
  let p=initialProfile();p.vault={protect:3};
  const learned=applyBase(p,{type:'learn',inst:'P1',move:'protect'});assert.equal(learned.ok,true,learned.error);p=learned.profile;
  p.expeditions=3;p.account=80;p.difficulty='hard';p.rankExp=36;p.talents={offense:2};p.shards={charmander:7};
  p.roster[0].tactic='avoid';p.team=['P2','P1','P3'];p.leader='P1';
  p.rescue=[{inst:{...structuredClone(p.roster[0]),id:'P4',protected:false},paid:false,left:2}];
  p.lost=[{id:'P5',species:'pidgey',expedition:1}];p.next=6;
  assert.equal(profileProblem(p),null);return p;
}
function oldCamp(profile=cultivated()){
  return {format:2,rules:'trial-rules-6',content:'trial-content-7',build:BUILD_ID,sequence:17,profile};
}

test('B3/B9 explicit 6/7 migration preserves cultivated camp data on open and import',async()=>{
  assert.equal(RULE_VERSION,'trial-rules-7');assert.equal(CONTENT_VERSION,'trial-content-8');
  assert.equal(SAVE_KEY,'dungeon-trial.player.v1');
  const old=oldCamp(),raw=JSON.stringify(old);
  for(const route of ['open','import']){
    const port=storage(route==='open'?raw:null),store=new TrialStore(port);
    assert.equal(await store.whenReady,true,store.error);
    if(route==='import')assert.equal(await store.importRecord(raw,true),true,store.importError);
    assert.deepEqual(store.profile,old.profile,`${route} preserves IDs, moves, PP, training, queue, rescue, lost, and vault`);
    assert.deepEqual(store.envelope,{...old,rules:RULE_VERSION,content:CONTENT_VERSION,sequence:18});
    assert.equal(port.writes(),1);
    assert.deepEqual(decode(port.raw()),store.envelope);
    const reopened=new TrialStore(port);assert.equal(await reopened.whenReady,true,reopened.error);
    assert.deepEqual(reopened.profile,old.profile);assert.equal(port.writes(),1,'current saves need no migration write');
  }
});

test('B3/B9 migration rejects malformed 6/7 and current records without changing original bytes',async()=>{
  const edits=[
    e=>{e.profile.roster[0].species='unknown';},
    e=>{e.profile.roster[0].learned[0].move='unknown';},
    e=>{e.profile.roster[0].learned[0].pp=999;},
    e=>{e.profile.rescue[0].inst.learned[0].pp=-1;},
    e=>{e.profile.extra=true;},
    e=>{e.current=null;},
    e=>{e.sequence=Number.MAX_SAFE_INTEGER+1;},
  ];
  for(const version of [['trial-rules-6','trial-content-7'],[RULE_VERSION,CONTENT_VERSION]])for(const edit of edits){
    const bad=oldCamp();[bad.rules,bad.content]=version;edit(bad);const raw=JSON.stringify(bad);
    const blockedPort=storage(raw),blocked=new TrialStore(blockedPort);
    assert.equal(await blocked.whenReady,false);assert.equal(blocked.status,'blocked');
    assert.equal(blocked.exportRaw(),raw);assert.equal(blockedPort.raw(),raw);assert.equal(blockedPort.writes(),0);
    const goodPort=storage(),good=new TrialStore(goodPort);
    assert.equal(await good.beginNewGame(initialProfile(),true),true);const before=goodPort.raw(),writes=goodPort.writes();
    assert.equal(await good.importRecord(raw,true),false);assert.equal(goodPort.raw(),before);assert.equal(goodPort.writes(),writes);
  }
});

test('B3/B9 accepts only registered historical version pairs and retains earlier PP normalization',async()=>{
  for(const [rules,content] of [['trial-rules-5','trial-content-5'],['trial-rules-5','trial-content-6'],['trial-rules-4','trial-content-4'],['trial-rules-3','trial-content-3']]){
    const old=oldCamp(initialProfile());old.rules=rules;old.content=content;
    if(rules!=='trial-rules-5')for(const k of ['difficulty','shards','rankExp','talents'])delete old.profile[k];
    old.profile.roster[0].learned[0].pp=3;
    const port=storage(JSON.stringify(old)),store=new TrialStore(port);assert.equal(await store.whenReady,true,`${rules}/${content}: ${store.error}`);
    assert.deepEqual(store.profile,initialProfile());assert.equal(port.writes(),1);assert.equal(store.envelope.rules,RULE_VERSION);
  }
  for(const [rules,content] of [['trial-rules-6','trial-content-8'],['trial-rules-7','trial-content-7'],['trial-rules-5','trial-content-7'],['trial-rules-99','trial-content-99']]){
    const old=oldCamp();old.rules=rules;old.content=content;const raw=JSON.stringify(old),port=storage(raw),store=new TrialStore(port);
    assert.equal(await store.whenReady,false);assert.equal(port.raw(),raw);assert.equal(store.exportRaw(),raw);assert.equal(port.writes(),0);
  }
});

test('B3/B9 failed migration persistence leaves old bytes available; maximum sequence stays readable',async()=>{
  const old=oldCamp();old.sequence=Number.MAX_SAFE_INTEGER;const raw=JSON.stringify(old),port=storage(raw);port.fail();
  const store=new TrialStore(port);assert.equal(await store.whenReady,false);assert.equal(store.status,'failed');
  assert.equal(port.raw(),raw);assert.equal(store.exportRaw(),raw);assert.equal(port.writes(),0);
  assert.equal(store.envelope.sequence,Number.MAX_SAFE_INTEGER);assert.deepEqual(decode(JSON.stringify(store.envelope)).profile,old.profile);
});
