import test from 'node:test';
import assert from 'node:assert/strict';
import {createMain,applyCommand,previewInvitation,clone} from '../../src/core/engine.ts';
import {createScenario} from '../../src/core/scenarios.ts';
import {TrialStore} from '../../src/core/save.ts';
const move=x=>({type:'move',to:{x,y:1}}), basic=target=>({type:'basic',target}), skill=(skill,target)=>({type:'skill',skill,target}), wait={type:'wait'}, interact=exit=>({type:'interact',exit});
function command(s,c){const r=applyCommand(s,c);assert.equal(r.ok,true,r.error);return r.state;}
const round=(s,action,override)=>command(s,{type:'round',action,override});
const reject=s=>s.phase==='invitation'?command(s,{type:'invite',choice:'reject'}):s;
const finish=s=>s.phase==='exit'?command(s,{type:'finishExit'}):s;
const positions=s=>s.queue.map(id=>s.units[id].pos?.x??null);
/** The scripted fixed-map route needs fixed targets: E and R only wait (the old harmless-block behaviour) and E has 16 HP, so three basic attacks (6 each) defeat it and nobody takes damage. */
function still(s){for(const id of s.enemies)s.units[id].waitOnly=true;s.units.E.hp=16;s.units.E.maxHp=16;return s;}
function prefix(invite=true){let s=still(createMain('main',invite));s=round(s,move(3));for(let i=0;i<3;i++)s=round(s,basic('E'));return s;}
test('M1/M2 and no-invitation routes preserve terminal resources',()=>{
 for(const invited of [true,false])for(const route of [1,2]){
 let s=reject(prefix(invited));s=round(s,move(4));s=round(s,interact(route===1));
 if(route!==1){s=round(s,move(5));assert.equal(s.seen.includes('9,1'),true);
 s=command(s,{type:'switch',actor:'B'});s=round(s,move(4));s=round(s,interact(true));}
 s=finish(s);assert.equal(s.round,route===1?6:9);assert.equal(s.end.outcome,'normal');assert.deepEqual(positions(s),route===1?[1,3,4]:[3,4,5]);assert.equal(s.units.C.hp,20);assert.equal(s.units.C.pp.quickattack,2);assert.equal(s.bag,0);
 }});
test('M5/M6 B damage belongs to B, both plans 11 rounds',()=>{
 for(const accept of [false,true]){let s=prefix();s=command(s,{type:'invite',choice:accept?'accept':'reject',...(accept?{outgoing:'C'}:{})});s=command(s,{type:'switch',actor:'B'});const p=accept?'N':'C';s=round(s,{type:'swap',target:p});assert.deepEqual(positions(s),[1,3,2]);for(const a of [move(4),interact(false),move(5),move(6),move(7),interact(true)])s=round(s,a);s=finish(s);assert.equal(s.round,11);assert.deepEqual(positions(s),[5,7,6]);assert.equal(s.units.B.hp,20);assert.equal(s.units[p].hp,accept?10:20);assert.equal(s.units.B.pp.protect,2);assert.deepEqual(s.camp,accept?['C']:[]);}
});
test('V1/V2 refusal is immutable and explicit waiting fixes known conflict',()=>{
 const s=createScenario('V1','v1'),before=JSON.stringify(s);const r=applyCommand(s,{type:'round',action:move(4)});assert.equal(r.ok,false);assert.strictEqual(r.state,s);assert.equal(JSON.stringify(s),before);
 const fixed=round(s,move(4),{actor:'B',action:wait});assert.deepEqual(positions(fixed),[2,3,4]);
});
test('M4 B already on exit; no extra return damage',()=>{
 let s=createScenario('V1','m4');s.units.R.waitOnly=true;s=round(s,move(6));s=command(s,{type:'switch',actor:'B'});s=finish(round(s,interact(true)));assert.deepEqual(positions(s),[3,4,5]);assert.equal(s.units.C.hp,20);assert.equal(s.round,9);
});
test('V3/V4 follow and V5/V6/V7 down membership',()=>{
 let s=createScenario('V3','v3');s=round(s,move(0));assert.deepEqual(positions(s),[3,2,0]);assert.equal(finish(round(s,interact(true))).phase,'ended');
 s=createScenario('V4','v4');s=round(s,wait,{actor:'C',action:{type:'move',to:{x:2,y:2}}});s=round(s,wait);assert.deepEqual(s.units.B.pos,{x:2,y:1});assert.deepEqual(s.units.C.pos,{x:3,y:2});
 s=createScenario('V5','v5');s=round(s,move(2));assert.equal(s.units.B.hp,8);   // V5's E only waits, so B beside it takes nothing
 assert.equal(s.units.C.pos.x,1);s=round(s,basic('E'));assert.equal(s.units.C.pos.x,1);assert.equal(s.queue.length,3);
 s=round(createScenario('V6','v6'),move(2));assert.equal(s.leader,'C');assert.equal(s.units.B.pos,null);
 s=finish(round(createScenario('V7','v7'),interact(true)));assert.equal(s.units.A.hp,0);assert.equal(s.end.outcome,'normal');
});
test('V8/V9/V10 admission preview and batch anchor',()=>{
 let s=createScenario('V8','v8');assert.equal(previewInvitation(s,'C').ok,false);assert.deepEqual(previewInvitation(s,'B').pos,{x:1,y:2});assert.equal(applyCommand(s,{type:'invite',choice:'accept',outgoing:'C'}).ok,false);
 s=command(createScenario('V9','v9'),{type:'invite',choice:'accept',outgoing:'C'});assert.deepEqual(s.units.N.pos,{x:3,y:2});assert.equal(s.units.C.hp,0);
 s=command(createScenario('V10','v10'),{type:'invite',choice:'accept',outgoing:'A'});assert.equal(s.leader,'B');assert.deepEqual(s.anchor,{x:2,y:2});s=command(s,{type:'invite',choice:'accept',outgoing:'C'});assert.deepEqual(s.queue,['B','N1','N2']);assert.deepEqual(s.units.N2.pos,{x:3,y:2});
});
test('V11/V12/V13 full-round transition and wipe priority',()=>{
 let s=round(createScenario('V11','v11'),interact(true));assert.equal(s.units.B.hp,0);assert.equal(s.bag,1);assert.equal(s.request,null);assert.equal(s.phase,'playing');
 s=round(createScenario('V12','v12'),interact(true));assert.equal(s.end.outcome,'wipe');assert.equal(s.end.acquired,1);assert.equal(s.end.brought,0);assert.deepEqual(s.end.camp,['C']);
 s=round(createScenario('V13','v13'),interact(true));assert.equal(s.phase,'invitation');assert.equal(s.request.locked,true);s=command(s,{type:'invite',choice:'accept',outgoing:'B'});assert.deepEqual(s.queue,['A','C','N']);s=finish(s);assert.equal(s.end.outcome,'normal');assert.equal(s.round,1);
});
test('K1 rejects protecting another unit and tackle uses move power',()=>{
 let s=createScenario('K1','k1');
 const refused=applyCommand(s,{type:'round',action:skill('tackle','H'),override:{actor:'B',action:skill('protect','A')}});
 assert.equal(refused.ok,false);assert.deepEqual(refused.state,s);
 s=round(s,skill('tackle','H'),{actor:'B',action:skill('protect','B')});assert.equal(s.units.H.hp,6);assert.equal(s.units.A.hp,7);   // A tackle 9 + C's default tackle 9 (24-18); H ember or bite (10, tie to ember by move order; 5 after the enemy difficulty multiplier 0.5) hits A first in queue order (12-5)
 assert.equal(s.units.B.pp.protect,0);
 s=round(s,skill('tackle','H'));assert.equal(s.units.H.hp,0);
});
test('K1 protect blocks a real enemy attack on its user',()=>{
 let s=createScenario('K1','k1-protect-hit');s.units.A.pos={x:1,y:2};s.units.A.learned=['quickattack'];s.units.A.pp={quickattack:1};s.units.A.maxPp={quickattack:1};
 s.units.B.pos={x:3,y:1};s.units.C.hp=0;s.units.C.pos=null;
 s=round(s,skill('quickattack','H'),{actor:'B',action:skill('protect','B')});
 assert.equal(s.units.H.hp,16);assert.equal(s.units.A.hp,12);assert.equal(s.units.B.hp,12);assert.equal(s.units.B.protect,2);
 assert.ok(s.log.includes('B受到0伤害，HP 12'));
});
test('K4/K5 quickattack retains obstruction and two-cell range limits',()=>{
 const blocked=createScenario('K4','k4');blocked.units.R.pos={x:4,y:1};const refusal=applyCommand(blocked,{type:'round',action:skill('quickattack','R')});assert.equal(refusal.ok,false);assert.match(refusal.error,/被B挡住/);
 let s=createScenario('K5','k5');s=command(s,{type:'invite',choice:'reject'});
 const r=applyCommand(s,{type:'round',action:skill('quickattack','R')});assert.equal(r.ok,false);assert.deepEqual(r.state,s);assert.equal(s.units.C.pp.quickattack,1);
});
class Memory {raw=null;writes=0;fail=false;getItem(){return this.raw;}setItem(_k,v){this.writes++;if(this.fail)throw Error('quota');this.raw=v;}}
test('S2/S3/S4/S5 process invitations and exit in memory, then developer restart leaves storage unchanged',async()=>{
 const port=new Memory(),store=new TrialStore(port,'test');
 assert.equal(await store.start(createScenario('V13','save')),true);
 const started=store.state;assert.equal(started.phase,'playing');assert.equal(store.envelope,null);
 assert.equal((await store.dispatch({type:'round',action:interact(true)})).ok,true);assert.equal(store.state.phase,'invitation');
 assert.equal((await store.dispatch({type:'invite',choice:'accept',outgoing:'B'})).ok,true);assert.equal(store.state.phase,'exit');
 assert.equal((await store.dispatch({type:'finishExit'})).ok,true);assert.equal(store.state.phase,'ended');
 assert.equal((await store.dispatch({type:'finishExit'})).ok,false);
 assert.equal(port.raw,null);assert.equal(port.writes,0);
 assert.equal(await store.newTrial(createMain('next')),true);assert.equal(store.state.runId,'next');assert.equal(store.state.round,0);
 const reopened=new TrialStore(port,'test');assert.equal(reopened.status,'empty');assert.equal(reopened.state,null);assert.equal(port.writes,0);
});
test('S6 a blocked record needs export before memory-only developer reset; original bytes stay on disk',async()=>{
 const port=new Memory();port.raw='{"format":999}';const store=new TrialStore(port,'broken');
 assert.equal(store.status,'blocked');assert.equal(await store.resetAfterExport(createMain('reset'),true),false);
 assert.equal(store.exportRaw(),'{"format":999}');assert.equal(port.raw,'{"format":999}');
 assert.equal(await store.resetAfterExport(createMain('reset'),false),false);
 assert.equal(await store.resetAfterExport(createMain('reset'),true),true);
 assert.equal(store.status,'ready');assert.equal(store.state.runId,'reset');
 assert.equal(port.raw,'{"format":999}');assert.equal(port.writes,0);
 const reopened=new TrialStore(port,'broken');assert.equal(reopened.status,'blocked');assert.equal(reopened.exportRaw(),'{"format":999}');
});
test('S7 rejected developer actions preserve their in-memory state and never write a World',async()=>{
 const port=new Memory();port.fail=true;const store=new TrialStore(port,'isolated');
 const world=createScenario('V1','memory-only');assert.equal(await store.start(world),true);
 const before=store.state;
 const rejected=await store.dispatch({type:'round',action:move(99)});
 assert.equal(rejected.ok,false);assert.deepEqual(store.state,before);
 assert.equal(port.raw,null);assert.equal(port.writes,0);assert.equal(store.status,'ready');
 assert.equal((await store.dispatch({type:'round',action:wait})).ok,true);
 assert.equal(store.state.round,before.round+1);assert.equal(port.raw,null);assert.equal(port.writes,0);
});
