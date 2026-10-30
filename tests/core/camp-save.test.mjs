import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TrialStore,decode,decodeLegacy} from '../../src/core/save.ts';
import {RULE_VERSION,CONTENT_VERSION,createExpedition} from '../../src/core/engine.ts';
import {newGameProfile,squadOf,settleRun} from '../../src/core/base.ts';
import {serviceRoll} from '../../src/core/dungeon.ts';

function storage(initial=null){
 let value=initial,writes=0,attempts=0,failNext=false;
 return {
  getItem:()=>value,
  setItem:(_key,next)=>{attempts++;if(failNext){failNext=false;throw Error('disk full');}value=next;writes++;},
  raw:()=>value,writes:()=>writes,attempts:()=>attempts,failNext:()=>{failNext=true;}
 };
}
function profile(){const made=newGameProfile('charmander','squirtle');assert.equal(made.ok,true);return made.profile;}
function oldFixture(name){return JSON.parse(readFileSync(new URL(`./fixtures77-regression/${name}`,import.meta.url),'utf8'));}
async function makeSavedBase(port=storage(),camp=profile()){
 const store=new TrialStore(port,'camp-test');
 assert.equal(await store.beginNewGame(camp,true),true,store.error);
 return {port,store};
}
async function finishFromFirstExit(store){
 for(let n=0;n<12;n++){
  const s=store.state;assert.ok(s,`state disappeared before terminal at step ${n}`);
  if(s.phase==='ended')return s;
  if(s.phase==='invitation'){
   const r=await store.dispatch({type:'invite',choice:'reject'});assert.equal(r.ok,true,r.error);continue;
  }
  if(s.phase==='exit'){
   const r=await store.dispatch({type:'finishExit'});assert.equal(r.ok,true,r.error);continue;
  }
  if(s.phase==='transit'){
   const r=await store.dispatch({type:'finishTransit'});assert.equal(r.ok,true,r.error);continue;
  }
  assert.equal(s.phase,'playing');
  const leader=s.units[s.leader],exit=s.points.find(p=>p.kind==='exit'&&leader.pos&&p.pos.x===leader.pos.x&&p.pos.y===leader.pos.y);
  if(exit){const r=await store.dispatch({type:'round',action:{type:'interact',exit:true}});assert.equal(r.ok,true,r.error);}
  else {const r=await store.dispatch({type:'round',action:{type:'wait'}});assert.equal(r.ok,true,r.error);}
 }
 assert.fail('deterministic expedition did not reach a terminal state');
}
function huntEnemy(s){
 const lead=s.units[s.leader],floor=new Set(s.floor.map(p=>`${p.x},${p.y}`)),blocked=new Set(s.enemies.filter(id=>s.units[id].hp>0).map(id=>`${s.units[id].pos.x},${s.units[id].pos.y}`));
 const dirs=[[1,0],[0,1],[-1,0],[0,-1]],key=p=>`${p.x},${p.y}`,distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
 const q=[lead.pos],parent=new Map([[key(lead.pos),null]]);let goal=null,target=null;
 for(let n=0;n<q.length&&!goal;n++){
  const p=q[n];for(const id of s.enemies){const e=s.units[id];if(e.hp>0&&distance(p,e.pos)===1){goal=p;target=id;break;}}
  if(goal)break;
  for(const [dx,dy] of dirs){const next={x:p.x+dx,y:p.y+dy},k=key(next);if(floor.has(k)&&!blocked.has(k)&&!parent.has(k)){parent.set(k,key(p));q.push(next);}}
 }
 if(!goal)return {type:'round',action:{type:'wait'}};
 const path=[];for(let k=key(goal);k;k=parent.get(k))path.unshift(k);
 if(path.length===1)return {type:'round',action:{type:'basic',target}};
 const [x,y]=path[1].split(',').map(Number);return {type:'round',action:{type:'move',to:{x,y}}};
}
async function finishByWipe(store){
 for(let n=0;n<80;n++){
  const s=store.state;assert.ok(s,`state disappeared before wipe at step ${n}`);
  if(s.phase==='ended')return s;
  const cmd=s.phase==='playing'?huntEnemy(s):s.phase==='invitation'?{type:'invite',choice:'reject'}:s.phase==='exit'?{type:'finishExit'}:null;
  assert.ok(cmd,`unexpected phase ${s.phase}`);
  const result=await store.dispatch(cmd);assert.equal(result.ok,true,result.error);
 }
 assert.fail('deterministic expedition did not wipe within the bounded turn limit');
}

test('format 2 stores only camp data; departure, purchases, and exchange actions do not write',async()=>{
 const baseProfile=profile();baseProfile.account=40;
 const port=storage(),{store}=await makeSavedBase(port,baseProfile);
 const before=port.raw(),writes=port.writes(),campEnvelope=store.envelope;
 assert.equal(campEnvelope.format,2);assert.equal(campEnvelope.rules,RULE_VERSION);assert.equal(campEnvelope.content,CONTENT_VERSION);
 assert.equal(Object.hasOwn(campEnvelope,'current'),false);assert.equal(Object.hasOwn(campEnvelope,'recent'),false);
 assert.deepEqual(decode(JSON.stringify(campEnvelope)),campEnvelope);

 assert.equal(await store.depart('memory-run',103,20),true);
 assert.equal(port.writes(),writes,'departure stays in memory');assert.equal(port.raw(),before);
 assert.deepEqual(store.envelope,campEnvelope,'the exported record remains the pre-departure camp');
 assert.equal(store.state.dungeon.tmPool,3);
 assert.equal(store.profile.account,20,'wallet money is deducted from the run profile only');
 const reopened=new TrialStore(port,'camp-test');assert.equal(await reopened.whenReady,true);
 assert.equal(reopened.profile.account,40,'reopening during the run restores the pre-departure account');
 assert.equal(reopened.state,null);assert.equal(port.raw(),before);
 assert.equal(await store.dispatch({type:'round',action:{type:'wait'}}).then(r=>r.ok),true);
 assert.equal(port.writes(),writes,'an ordinary run action stays in memory');

 const p=profile(),roll=serviceRoll(103,3);assert.equal(roll.shop.level,1);assert.equal(roll.exchange.level,1);
 const baseRun=createExpedition('service-memory',103,3,squadOf(p),200,undefined,3);
 const shopPoint=baseRun.points.find(q=>q.kind==='shop'),exchangePoint=baseRun.points.find(q=>q.kind==='exchange');
 assert.ok(shopPoint&&exchangePoint,'seed 103 puts both services on the first floor');
 const shopWorld=structuredClone(baseRun);shopWorld.enemies=[];shopWorld.units[shopWorld.leader].pos=structuredClone(shopPoint.pos);
 const shopPort=storage(),shopStore=new TrialStore(shopPort,'shop-memory');
 assert.equal(await shopStore.start(shopWorld,p),true);assert.equal(shopPort.writes(),0);
 assert.equal((await shopStore.dispatch({type:'buy',item:'berry'})).ok,true);
 assert.equal(shopStore.state.shop.trades.length,1);assert.equal(shopPort.writes(),0);assert.equal(shopPort.raw(),null);

 const exchangeWorld=structuredClone(baseRun);exchangeWorld.enemies=[];exchangeWorld.units[exchangeWorld.leader].pos=structuredClone(exchangePoint.pos);
 const exchangePort=storage(),exchangeStore=new TrialStore(exchangePort,'exchange-memory');
 assert.equal(await exchangeStore.start(exchangeWorld,p),true);assert.equal(exchangePort.writes(),0);
 const partner=exchangeStore.state.queue.find(id=>id!==exchangeStore.state.leader);
 const sent=await exchangeStore.dispatch({type:'round',action:{type:'exchange',target:partner,cargo:[]}});
 assert.equal(sent.ok,true,sent.error);assert.equal(exchangeStore.state.exchange.used,true);
 assert.equal(exchangePort.writes(),0);assert.equal(exchangePort.raw(),null);
});

test('finishing an expedition settles once; a failed terminal write retries the same camp record',async()=>{
 const port=storage(),{store}=await makeSavedBase(port);
 assert.equal(await store.depart('terminal-retry',103,0),true);
 const startWrites=port.writes();port.failNext();
 const ended=await finishFromFirstExit(store);
 assert.equal(ended.phase,'ended');assert.equal(ended.end.outcome,'normal');assert.equal(store.status,'failed');
 assert.ok(store.settlementSummary);assert.equal(port.writes(),startWrites);
 assert.equal(store.envelope.profile.expeditions,1,'the pending candidate is already settled in memory');
 assert.equal(JSON.parse(port.raw()).profile.expeditions,0,'disk remains at the pre-run camp until retry succeeds');
 const summary=store.settlementSummary;
 assert.equal(await store.retry(),true,store.error);assert.equal(store.status,'ready');
 assert.equal(port.writes(),startWrites+1);assert.equal(store.envelope.profile.expeditions,1);
 assert.deepEqual(store.settlementSummary,summary);
 const restored=new TrialStore(port,'camp-test');assert.equal(await restored.whenReady,true);
 assert.equal(restored.profile.expeditions,1,'reopening cannot settle the same run again');
 const committed=port.raw(),writes=port.writes();
 assert.equal(await store.returnToBase(),true);assert.equal(store.state,null);assert.equal(store.atBase,true);
 assert.equal(port.raw(),committed);assert.equal(port.writes(),writes,'returning only changes the screen');
});

test('a real one-member expedition wipe is settled and saved at the terminal transition',async()=>{
 const one=profile();one.team=['P1'];one.leader='P1';
 const port=storage(),{store}=await makeSavedBase(port,one),beforeWrites=port.writes();
 assert.equal(await store.depart('terminal-wipe',1,0) /* seed 1: seed 3 no longer wipes a lone member once enemies deal half damage (searched: seeds 1-60) */,true);
 assert.equal(port.writes(),beforeWrites,'departing did not write');
 const ended=await finishByWipe(store);
 assert.equal(ended.end.outcome,'wipe');assert.equal(store.status,'ready');
 assert.equal(port.writes(),beforeWrites+1,'the wipe causes exactly one write');
 assert.equal(store.envelope.profile.expeditions,1);
 assert.equal(JSON.parse(port.raw()).profile.expeditions,1);
 const reopened=new TrialStore(port,'camp-test');assert.equal(await reopened.whenReady,true);
 assert.equal(reopened.profile.expeditions,1,'reopening does not settle the wipe again');
});

test('old ended saves validate, settle, and save immediately; a failed migration save retries without settling twice',async()=>{
 const raw=JSON.stringify(oldFixture('ended-before72.json'));
 const legacy=decodeLegacy(raw),expected=settleRun(legacy.profile,legacy.current);
 assert.ok(expected);
 const port=storage(raw),store=new TrialStore(port,'old-ended');
 assert.equal(store.status,'saving');assert.equal(await store.whenReady,true,store.error);
 assert.equal(port.writes(),1);assert.equal(store.status,'ready');assert.equal(store.state,null);
 assert.equal(store.envelope.format,2);assert.deepEqual(store.profile,expected);
 assert.equal(store.profile.expeditions,legacy.profile.expeditions+1);
 assert.equal(Object.hasOwn(JSON.parse(port.raw()),'current'),false);

 const failedPort=storage(raw);failedPort.failNext();
 const failed=new TrialStore(failedPort,'old-ended-failed');
 assert.equal(await failed.whenReady,false);assert.equal(failed.status,'failed');
 assert.equal(failedPort.writes(),0);assert.equal(failed.envelope.profile.expeditions,expected.expeditions);
 assert.equal(await failed.retry(),true);assert.equal(failed.status,'ready');
 assert.equal(failedPort.writes(),1);assert.equal(failed.envelope.profile.expeditions,expected.expeditions);
 assert.equal((await new TrialStore(failedPort,'old-ended-failed').whenReady),true);
 assert.equal(new TrialStore(failedPort,'old-ended-failed').profile.expeditions,expected.expeditions);
});

test('old in-progress World is discarded without validation; a damaged old terminal World is blocked byte-for-byte',async()=>{
 const running=oldFixture('run-before72.json');running.current.round=-700;
 const runningRaw=JSON.stringify(running),runningPort=storage(runningRaw),runningStore=new TrialStore(runningPort,'old-running');
 assert.equal(await runningStore.whenReady,true,runningStore.error);
 assert.equal(runningStore.status,'ready');assert.equal(runningStore.state,null);assert.ok(runningStore.profile);
 assert.equal(runningPort.writes(),1);assert.equal(JSON.parse(runningPort.raw()).format,2);

 const ended=oldFixture('ended-before72.json');ended.current.round=-700;
 const damagedRaw=JSON.stringify(ended),damagedPort=storage(damagedRaw),damaged=new TrialStore(damagedPort,'old-ended-damaged');
 assert.equal(await damaged.whenReady,false);assert.equal(damaged.status,'blocked');
 assert.equal(damagedPort.writes(),0);assert.equal(damagedPort.raw(),damagedRaw);
 assert.equal(damaged.exportRecord(),null);assert.equal(damaged.exportRaw(),damagedRaw);

 const noProfile=oldFixture('run-before72.json');delete noProfile.profile;
 const noProfileRaw=JSON.stringify(noProfile),noProfilePort=storage(noProfileRaw),noProfileStore=new TrialStore(noProfilePort,'old-no-profile');
 assert.equal(await noProfileStore.whenReady,false);assert.equal(noProfileStore.status,'blocked');
 assert.equal(noProfilePort.writes(),0);assert.equal(noProfilePort.raw(),noProfileRaw);
});

test('failed import restores the active memory World, run profile, envelope, and original storage',async()=>{
 const targetPort=storage(),{store}=await makeSavedBase(targetPort);
 assert.equal(await store.depart('memory-import-rollback',103,0),true);
 await store.dispatch({type:'round',action:{type:'wait'}});
 const beforeState=store.state,beforeProfile=store.profile,beforeEnvelope=store.envelope,beforeRaw=targetPort.raw(),beforeWrites=targetPort.writes();
 const source=await makeSavedBase();const incoming=source.store.exportRecord();assert.ok(incoming);
 targetPort.failNext();
 assert.equal(await store.importRecord(incoming,true),false);
 assert.equal(store.status,'ready');assert.equal(store.atBase,false);
 assert.deepEqual(store.state,beforeState);assert.deepEqual(store.profile,beforeProfile);assert.deepEqual(store.envelope,beforeEnvelope);
 assert.equal(targetPort.raw(),beforeRaw);assert.equal(targetPort.writes(),beforeWrites);
 assert.match(store.importError,/导入保存失败/);
});

test('format 1 accepts explicit rules version 2, while new format rejects any World field',async()=>{
 const old=decodeLegacy(JSON.stringify(oldFixture('base-before72.json')));
 assert.equal(old.rules,'trial-rules-2');assert.equal(old.content,'trial-content-2');
 assert.equal(decodeLegacy(JSON.stringify(old)).rules,'trial-rules-2');
 const made=profile(),record={format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:'test',sequence:1,profile:made,current:null};
 assert.throws(()=>decode(JSON.stringify(record)),/结构损坏/);
});

test('an imported maximum save counter stays readable after camp edits and terminal settlement',async()=>{
 const {port,store}=await makeSavedBase();
 const incoming=store.envelope;incoming.sequence=Number.MAX_SAFE_INTEGER;
 assert.equal(await store.importRecord(JSON.stringify(incoming),true),true);
 assert.equal((await store.baseAction({type:'team',team:incoming.profile.team,leader:incoming.profile.leader})).ok,true);
 assert.equal(decode(port.raw()).sequence,Number.MAX_SAFE_INTEGER);
 assert.equal(await store.depart('maximum-counter',103,0),true);
 await finishFromFirstExit(store);
 assert.equal(store.status,'ready');
 const reopened=new TrialStore(port,'camp-test');
 assert.equal(await reopened.whenReady,true,reopened.error);
 assert.equal(reopened.profile.expeditions,1);
 assert.equal(reopened.envelope.sequence,Number.MAX_SAFE_INTEGER);
 const legacy=oldFixture('ended-before72.json');legacy.sequence=Number.MAX_SAFE_INTEGER;
 const legacyPort=storage(JSON.stringify(legacy)),migrated=new TrialStore(legacyPort,'legacy-maximum');
 assert.equal(await migrated.whenReady,true,migrated.error);
 assert.equal(decode(legacyPort.raw()).sequence,Number.MAX_SAFE_INTEGER);
 assert.equal(migrated.profile.expeditions,legacy.profile.expeditions+1);
});
