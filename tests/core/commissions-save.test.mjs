import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialStore,decode} from '../../src/core/save.ts';
import {initialProfile} from '../../src/core/base.ts';
import {speciesUnit} from '../../src/core/engine.ts';

test('8.4 challenge TM and chosen boss TM settle once to camp and import without new World fields',async()=>{
 let raw=null,writes=0;
 const port={getItem:()=>raw,setItem:(_key,value)=>{raw=value;writes++;}};
 const store=new TrialStore(port,'commission-save');
 assert.equal(await store.beginNewGame(initialProfile(),false),true);
 assert.equal(await store.depart('challenge-tm-save',4,0),true);
 const before=raw,fixture=store.state;
 // Controlled memory fixture: a collected challenge TM and a nearly defeated boss.
 // The kill, invitations, terminal settlement, storage write and import use production commands.
 for(const id of fixture.enemies){fixture.units[id].hp=0;fixture.units[id].pos=null;}
 const lead=fixture.units[fixture.leader],at=fixture.floor.find(p=>
  fixture.floor.some(q=>q.x===p.x+1&&q.y===p.y));
 lead.pos={...at};lead.hp=lead.maxHp;lead.tactic='wait';
 for(const id of fixture.queue.filter(id=>id!==fixture.leader)){fixture.units[id].pos=null;fixture.units[id].hp=0;}
 const boss=speciesUnit('fixtureBoss','arcanine',22,{x:at.x+1,y:at.y});
 boss.side='enemy';boss.boss=true;boss.hp=1;boss.waitOnly=true;
 fixture.units.fixtureBoss=boss;fixture.enemies=['fixtureBoss'];
 fixture.seen=fixture.floor.map(p=>`${p.x},${p.y}`);
 fixture.tms=[{move:'protect',source:'challenge',fate:'held'}];
 fixture.blessings=['berryBoost','tmChoice'];fixture.tmChoiceReady=true;
 fixture.commissions=[{id:'hunter',room:0,floor:1,acceptedRound:0,progress:0,progressTarget:3}];
 store.world=fixture; // TypeScript private is a test-only fixture seam; no production API added.
 assert.equal(store.exportRecord(),before,'new run state never enters a mid-run export');
 let result=await store.dispatch({type:'round',action:{type:'basic',target:'fixtureBoss'}});
 assert.equal(result.ok,true,result.error);
 let choseBossTm=false;
 for(let n=0;store.state.phase!=='ended'&&n<8;n++){
  const phase=store.state.phase;
  assert.ok(['invitation','evolution','tmChoice'].includes(phase),phase);
  assert.equal(writes,1,'terminal write waits for all pending choices');assert.equal(store.exportRecord(),before);
  if(phase==='tmChoice'){
   const choice=store.state.pendingChoices[0];assert.equal(choice.source,'boss');assert.equal(choice.options.length,3);
   result=await store.dispatch({type:'tmChoice',move:choice.options[0]});choseBossTm=true;
  }else result=await store.dispatch(phase==='invitation'?{type:'invite',choice:'reject'}:{type:'evolve',species:null});
  assert.equal(result.ok,true,result.error);
 }
 assert.equal(store.state.phase,'ended');assert.equal(store.state.end.outcome,'won');
 assert.equal(choseBossTm,true);
 assert.equal(store.state.end.tms[0].source,'challenge');assert.equal(store.state.end.tms[0].fate,'brought');
 assert.equal(writes,2,'initial camp and the one terminal write');
 const envelope=decode(raw),expectedVault={};
 for(const tm of store.state.end.tms)if(tm.fate==='brought')expectedVault[tm.move]=(expectedVault[tm.move]??0)+1;
 assert.deepEqual(envelope.profile.vault,expectedVault);
 assert.deepEqual(Object.keys(envelope).sort(),['build','content','format','profile','rules','sequence']);
 assert.equal(raw.includes('pendingChoices'),false);assert.equal(raw.includes('commissions'),false);assert.equal(raw.includes('blessings'),false);
 const imported=new TrialStore({getItem:()=>null,setItem:()=>{}},'imported');
 assert.equal(await imported.importRecord(raw,false),true,imported.importError);
 assert.deepEqual(imported.profile,envelope.profile);assert.equal(imported.state,null);
 assert.equal(await imported.depart('fresh-after-import',5,0),true);
 assert.deepEqual(imported.state.commissions??[],[]);assert.deepEqual(imported.state.blessings??[],[]);
});
