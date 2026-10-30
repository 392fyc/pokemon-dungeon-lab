import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RULE_VERSION,CONTENT_VERSION,createExpedition,closeOut,recruitUnit} from '../../src/core/engine.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {TACTICS} from '../../src/core/tactics.ts';
import {applyBase,initialProfile,squadOf,settleRun,profileProblem,profileFitsWorld} from '../../src/core/base.ts';
import {BUILD_ID,TrialStore,decode,decodeLegacy} from '../../src/core/save.ts';

const memory=(raw=null)=>{let value=raw,writes=0;return {getItem:()=>value,setItem:(_key,next)=>{value=next;writes++;},raw:()=>value,writes:()=>writes};};
const copy=value=>structuredClone(value);
const oldV3=(profile=initialProfile())=>{
  const old=copy(profile);
  for(const instance of old.roster)delete instance.tactic;
  for(const entry of old.rescue)delete entry.inst.tactic;
  return {format:2,rules:'trial-rules-3',content:'trial-content-3',build:BUILD_ID,sequence:7,profile:old};
};
const currentEnvelope=profile=>({format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:1,profile});

test('rules/content 3 camp records add only the default tactic and persist as version 4',async()=>{
  const old=oldV3(),profileBefore=copy(old.profile),raw=JSON.stringify(old),port=memory(raw),store=new TrialStore(port);
  assert.equal(await store.whenReady,true,store.error);
  assert.equal(store.status,'ready');assert.equal(store.state,null);assert.equal(port.writes(),1);
  const expected=copy(profileBefore);
  for(const instance of expected.roster)instance.tactic='together';
  for(const entry of expected.rescue)entry.inst.tactic='together';
  assert.deepEqual(store.profile,expected,'all profile fields remain, with one default added per instance');
  assert.deepEqual(Object.keys(store.envelope).sort(),['build','content','format','profile','rules','sequence']);
  assert.equal(store.envelope.rules,'trial-rules-4');assert.equal(store.envelope.content,'trial-content-4');
  assert.deepEqual(decode(port.raw()).profile,expected);
  assert.equal(store.envelope.sequence,8);
});

test('all six camp tactics validate, persist on roster and rescue instances, and reject every other value',()=>{
  const start=initialProfile();
  for(const tactic of TACTICS){
    const result=applyBase(start,{type:'tactic',inst:'P1',tactic});
    assert.equal(result.ok,true,tactic);assert.equal(result.profile.roster[0].tactic,tactic);
    assert.equal(profileProblem(result.profile),null,tactic);
    const roundTrip=decode(JSON.stringify(currentEnvelope(result.profile)));
    assert.equal(roundTrip.profile.roster[0].tactic,tactic);
  }
  const invalid=applyBase(start,{type:'tactic',inst:'P1',tactic:'charge'});
  assert.equal(invalid.ok,false);assert.deepEqual(start.roster[0].tactic,'together');
  const bad=copy(currentEnvelope(start));bad.profile.roster[0].tactic='charge';
  assert.throws(()=>decode(JSON.stringify(bad)),/损坏/);
  const rescue=copy(start);rescue.next=5;
  rescue.rescue.push({inst:{...copy(rescue.roster[0]),id:'P4',species:'arcanine',learned:SPECIES.arcanine.kit.map(k=>({move:k.move,pp:k.pp})),carry:SPECIES.arcanine.kit.map(k=>k.move),tactic:'avoid',protected:false},paid:false,left:4});
  assert.equal(profileProblem(rescue),null,'ordinary Arcanine and its rescue-instance tactic are valid');
  rescue.rescue[0].inst.tactic='charge';assert.match(profileProblem(rescue),/结构错误/);
});

test('departure copies the camp tactic, a mid-run change stays in memory, and reopening restores the saved value',async()=>{
  const profile=initialProfile();profile.roster[0].tactic='followme';profile.team=['P1'];profile.leader='P1';
  const port=memory(),store=new TrialStore(port);
  assert.equal(await store.beginNewGame(profile,false),true,store.error);
  const savedCamp=port.raw();
  assert.equal(await store.depart('tactic-discard',9),true);
  assert.equal(store.state.units.A.entrySpecies,'charmander');
  assert.equal(store.state.units.A.tactic,'followme');
  const changed=await store.dispatch({type:'tactic',actor:'A',tactic:'avoid'});
  assert.equal(changed.ok,true,changed.error);
  assert.equal(store.state.units.A.tactic,'avoid');
  assert.equal(port.raw(),savedCamp,'the in-run change does not write the camp record');
  const reopened=new TrialStore(port);assert.equal(await reopened.whenReady,true,reopened.error);
  assert.equal(reopened.state,null);assert.equal(reopened.profile.roster[0].tactic,'followme');
});

test('settlement writes the temporary tactic back and restores evolved units to their entry species',()=>{
  const profile=initialProfile();profile.team=['P1'];profile.leader='P1';profile.roster[0].tactic='followme';
  const world=createExpedition('entry-shape',11,2,squadOf(profile));
  const oldMember=world.units.A;
  assert.equal(oldMember.entrySpecies,'charmander');assert.equal(oldMember.tactic,'followme');
  oldMember.species='charmeleon';oldMember.tactic='avoid';
  world.units.N1=recruitUnit('N1','charizard',1);
  world.units.N1.entrySpecies='charmeleon';world.units.N1.species='charizard';world.units.N1.tactic='wait';
  world.units.N1.pos=null;world.camp.push('N1');
  assert.equal(profileFitsWorld(profile,world),true,'the instance is matched to its entry species while its run shape has evolved');
  world.phase='ended';world.request=null;world.anchor=null;world.end=closeOut(world,'normal');
  const settled=settleRun(profile,world);
  assert.equal(settled.roster.find(i=>i.id==='P1').species,'charmander');
  assert.equal(settled.roster.find(i=>i.id==='P1').tactic,'avoid');
  const recruit=settled.roster.find(i=>i.id==='P4');
  assert.equal(recruit.species,'charmeleon');assert.equal(recruit.tactic,'wait');
  assert.deepEqual(recruit.learned,SPECIES.charmeleon.kit.map(k=>({move:k.move,pp:k.pp})));
  assert.equal(profileProblem(settled),null);
});

test('invalid rules/content 3 tactic values remain blocked and export the original bytes unchanged',async()=>{
  const old=oldV3();old.profile.roster[0].tactic='charge';
  const raw=JSON.stringify(old),port=memory(raw),store=new TrialStore(port);
  assert.equal(await store.whenReady,false);assert.equal(store.status,'blocked');
  assert.equal(store.exportRaw(),raw);assert.equal(port.raw(),raw);assert.equal(port.writes(),0);
});

test('rules 1/2 World validation uses frozen 3e99e71 saves and keeps the old level model',async()=>{
  const fixtures=JSON.parse(readFileSync(new URL('./fixtures78/legacy-worlds.json',import.meta.url),'utf8'));
  assert.equal(fixtures.source,'3e99e712f481579808cbf5459ad249ffeed1492d');
  const legacy=(world,profile=fixtures.profile)=>({format:1,rules:'trial-rules-2',content:'trial-content-2',build:BUILD_ID,sequence:5,current:copy(world),recent:null,profile:copy(profile)});
  const active=legacy(fixtures.floor1),decoded=decodeLegacy(JSON.stringify(active));
  assert.equal(decoded.current.dungeon.level,1);assert.equal(decoded.current.prog.level,1);
  assert.ok(decoded.profile.roster.every(instance=>instance.tactic==='together'));
  const invalidLevel=legacy(fixtures.floor1);invalidLevel.current.prog.level=5;
  assert.throws(()=>decodeLegacy(JSON.stringify(invalidLevel)),/结构损坏/,'new start-level rules cannot make an old level-5 tag valid');
  const newPhase=legacy(fixtures.floor1);newPhase.current.phase='evolution';newPhase.current.pendingEvolutions=[];
  assert.throws(()=>decodeLegacy(JSON.stringify(newPhase)),/结构损坏/,'a runtime-only 7.8 phase cannot be accepted as an old checkpoint');
  const ended=copy(fixtures.floor3);ended.units.boss.hp=0;ended.units.boss.pos=null;
  ended.phase='ended';ended.request=null;ended.anchor=null;ended.end=closeOut(ended,'normal');
  const raw=JSON.stringify(legacy(ended)),port=memory(raw),store=new TrialStore(port);
  const old=decodeLegacy(raw),expected=settleRun(old.profile,old.current);
  assert.equal(await store.whenReady,true,store.error);assert.equal(store.state,null);
  assert.deepEqual(store.profile,expected);assert.equal(store.profile.expeditions,old.profile.expeditions+1);
  assert.equal(port.writes(),1,'a validated old terminal World settles and saves once');
  const newProfile=initialProfile();
  assert.ok(newProfile.roster.every(instance=>instance.tactic==='together'));
});
