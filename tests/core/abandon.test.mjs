/* Playtest round 2 #2: giving up an expedition ends the run through the same path as a wipe. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition,applyCommand,jumpToFloor} from '../../src/core/engine.ts';
import {initialProfile,squadOf,settleRun,settleSummary} from '../../src/core/base.ts';

const start=()=>createExpedition('abandon-1',5,3,squadOf(initialProfile()),0,true,3);
const abandon=s=>{const before=structuredClone(s),r=applyCommand(s,{type:'abandon'});assert.deepEqual(s,before,'input untouched');return r;};
test('abandoning ends the run as a wipe: machines lost, pending choices dropped, depth counted',()=>{
 let s=jumpToFloor(start(),2);s.tms=[{move:'protect',source:'target',fate:'held'}];
 s.pendingChoices=[{type:'blessing',source:'challenge',room:null,options:['scholar']}];s.phase='blessing';
 const r=abandon(s);assert.equal(r.ok,true,r.error);const e=r.state;
 assert.equal(e.phase,'ended');assert.equal(e.end.outcome,'wipe');assert.equal(e.pendingChoices,undefined);
 assert.ok(e.end.tms.length&&e.end.tms.every(t=>t.fate==='lost'),'technique machines are lost');
 const profile=initialProfile(),summary=settleSummary(profile,e);
 assert.equal(summary.rank.depth,2,'rank experience counts the floor reached');
 assert.ok(summary.rank.total>=2);
 const after=settleRun(profile,e);assert.equal(after.expeditions,profile.expeditions+1);assert.deepEqual(after.team,profile.team,'the squad is back in camp');
});
test('abandon is refused once the run is over or when there is no run',()=>{
 let e=abandon(start()).state;const again=applyCommand(e,{type:'round',action:{type:'wait'}});assert.equal(again.ok,false);
 assert.equal(applyCommand(e,{type:'abandon'}).ok,false);
});
test('pending invitations are cancelled and the leaving log line names the choice',()=>{
 const s=start();s.phase='invitation';s.anchor={...s.units[s.leader].pos};s.invitations=[{id:'i1',unit:structuredClone(s.units[s.queue[1]]),status:'pending'}];
 const e=abandon(s).state;assert.ok(e.invitations.every(i=>i.status!=='pending'));assert.ok(e.log.some(l=>l.includes('放弃')));
});

test('through the store: abandoning settles once into the saved camp like a wipe (rank experience by depth, machines lost)',async()=>{
 const {TrialStore,decode}=await import('../../src/core/save.ts');
 let raw=null,writes=0;
 const store=new TrialStore({getItem:()=>raw,setItem:(_k,v)=>{raw=v;writes++;}},'abandon-save');
 assert.equal(await store.beginNewGame(initialProfile(),false),true);assert.equal(await store.depart('abandon-save',4,0),true);
 const written=writes,before=structuredClone(store.profile);
 store.state.tms=[{move:'protect',source:'target',fate:'held'}];
 const r=await store.dispatch({type:'abandon'});assert.equal(r.ok,true,r.error);
 assert.equal(store.state.phase,'ended');assert.equal(store.state.end.outcome,'wipe');assert.equal(writes,written+1,'one write for the settlement');
 const saved=decode(raw).profile;
 assert.equal(saved.expeditions,before.expeditions+1);assert.equal(saved.rankExp,before.rankExp+1,'depth 1 = 1 rank experience, no boss reward');
 assert.deepEqual(saved.vault,before.vault,'the lost machine did not reach the vault');
 assert.deepEqual(saved.team,before.team);
});
