import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialStore,decode,BUILD_ID} from '../../src/core/save.ts';
import {RULE_VERSION,CONTENT_VERSION,recruitUnit} from '../../src/core/engine.ts';
import {initialProfile,profileProblem,settleRun,settleSummary} from '../../src/core/base.ts';
import {SPECIES} from '../../src/core/roster.ts';

function storage(initial=null){
 let value=initial,writes=0;
 return {getItem:()=>value,setItem:(_key,next)=>{value=next;writes++;},raw:()=>value,writes:()=>writes};
}
function oldV4Profile(){
 const profile=structuredClone(initialProfile());
 delete profile.difficulty;delete profile.shards;delete profile.rankExp;delete profile.talents;
 return profile;
}
function oldV4Record(profile=oldV4Profile()){
 return {format:2,rules:'trial-rules-4',content:'trial-content-4',build:BUILD_ID,sequence:7,profile};
}
async function run(profile,outcome='won'){
 const port=storage(),store=new TrialStore(port,`settlement-${outcome}`);
 assert.equal(await store.beginNewGame(profile,false),true);
 const started=await store.depart(`settlement-${outcome}`,19,0);assert.equal(started,true);
 const world=store.state;assert.equal(world.dungeon.roguelike,true);
 world.phase='ended';world.end={id:`settlement-${outcome}:end`,outcome,team:[...world.queue],camp:[],goal:outcome==='won',acquired:1,brought:outcome==='won'?1:0,boss:outcome==='won',tms:[{move:'protect',source:'target',fate:outcome==='won'?'brought':'lost'}]};
 return world;
}
function duplicateWorld(world){
 for(const [id,species] of [['N1','pidgey'],['N2','pidgey'],['N3','squirtle']]){
  const unit=recruitUnit(id,species,1);unit.pos=null;world.units[id]=unit;world.end.camp.push(id);
 }
 return world;
}
function archivedPartner(id,species){
 const kit=SPECIES[species].kit;
 return {id,species,learned:kit.map(({move,pp})=>({move,pp})),carry:kit.map(({move})=>move),protected:false,tactic:'together'};
}

test('trial-rules-4 profiles are strictly checked, then receive only the four trial-rules-5 defaults',async()=>{
 const prior=oldV4Record(),port=storage(JSON.stringify(prior)),store=new TrialStore(port,'v4-good');
 assert.equal(await store.whenReady,true,store.error);assert.equal(port.writes(),1);
 assert.equal(store.envelope.rules,RULE_VERSION);assert.equal(store.envelope.content,CONTENT_VERSION);assert.equal(store.envelope.sequence,8);
 assert.equal(store.profile.difficulty,'normal');assert.deepEqual(store.profile.shards,{});assert.equal(store.profile.rankExp,0);assert.deepEqual(store.profile.talents,{});
 const kept=structuredClone(store.profile);delete kept.difficulty;delete kept.shards;delete kept.rankExp;delete kept.talents;
 assert.deepEqual(kept,prior.profile,'migration preserves every old profile field');

 const corrupted=oldV4Record();corrupted.profile.unrecognized=true;
 const raw=JSON.stringify(corrupted),badPort=storage(raw),bad=new TrialStore(badPort,'v4-bad');
 assert.equal(await bad.whenReady,false);assert.equal(bad.status,'blocked');assert.equal(badPort.raw(),raw);assert.equal(badPort.writes(),0);
});

test('new profile fields reject invalid difficulty, shards, rank experience, talents, and dangerous keys',()=>{
 const valid=initialProfile();assert.equal(profileProblem(valid),null);
 const invalid=[];
 for(const [label,edit] of [
  ['difficulty',p=>{p.difficulty='nightmare';}],
  ['unknown species shard',p=>{p.shards.not_a_species=1;}],
  ['negative shard count',p=>{p.shards.pidgey=-1;}],
  ['fractional shard count',p=>{p.shards.pidgey=0.5;}],
  ['negative rank experience',p=>{p.rankExp=-1;}],
  ['fractional rank experience',p=>{p.rankExp=1.5;}],
  ['invalid talent rank',p=>{p.talents.constitution=-1;}],
  ['dangerous talent key',p=>{Object.defineProperty(p.talents,'__proto__',{value:1,enumerable:true});}],
 ]){const p=structuredClone(valid);edit(p);invalid.push([label,p]);}
 for(const [label,p] of invalid)assert.notEqual(profileProblem(p),null,label);
 const unsafeShard=structuredClone(valid);Object.defineProperty(unsafeShard.shards,'constructor',{value:1,enumerable:true});
 assert.match(profileProblem(unsafeShard),/物种|危险/);
});

test('difficulty changes persist at camp and determine the next memory-only expedition; a nonzero purse is refused',async()=>{
 const p=initialProfile();p.account=55;
 const port=storage(),store=new TrialStore(port,'difficulty-camp');assert.equal(await store.beginNewGame(p,false),true);
 assert.equal((await store.baseAction({type:'difficulty',difficulty:'hard'})).saved,true);
 const saved=port.raw(),reopened=new TrialStore(port,'difficulty-camp');assert.equal(await reopened.whenReady,true);
 assert.equal(reopened.profile.difficulty,'hard');
 assert.equal(await reopened.depart('difficulty-run',21,10),false);
 assert.equal(await reopened.depart('difficulty-run',21,0),true);
 assert.equal(reopened.state.difficulty,'hard');assert.equal(reopened.state.purse,0);
 assert.equal(reopened.profile.account,55);assert.equal(port.raw(),saved,'departure does not write or change the saved camp');
});

test('won and wiped roguelike runs retain partners, restore their entry forms, convert duplicate recruits to shards, and preserve legacy pools',async()=>{
 const p=initialProfile();p.account=90;p.next=6;
 p.rescue=[{inst:archivedPartner('P4','pidgey'),paid:false,left:2}];
 p.lost=[{id:'P5',species:'zubat',expedition:1}];
 p.roster[0].learned.push({move:'protect',pp:1});p.roster[0].carry=['scratch','protect'];
 const original=structuredClone(p);
 const won=duplicateWorld(await run(p,'won'));
 const lead=won.units[won.queue[0]];lead.species='charizard';lead.tactic='avoid'; // entry form stays charmander; the in-run tactic change is saved
 const after=settleRun(p,won),summary=settleSummary(p,won);
 assert.ok(after);assert.ok(summary);
 assert.equal(after.expeditions,p.expeditions+1);
 assert.deepEqual(after.rescue,original.rescue);assert.deepEqual(after.lost,original.lost);assert.equal(after.account,original.account);
 assert.equal(after.roster.find(i=>i.id==='P1').species,'charmander');
 assert.deepEqual(after.roster.find(i=>i.id==='P1').learned,original.roster[0].learned);
 assert.equal(after.roster.find(i=>i.id==='P1').tactic,'avoid');
 assert.equal(after.roster.find(i=>i.id==='P6').species,'pidgey');
 assert.deepEqual(after.shards,{pidgey:1,squirtle:1});assert.deepEqual(after.vault,{protect:1});
 assert.ok(summary.brought.some(i=>i.id==='P6'&&i.species==='pidgey'));
 assert.deepEqual(summary.shards,[{species:'pidgey',count:1},{species:'squirtle',count:1}]);
 assert.ok(!summary.brought.some(i=>i.species==='squirtle'&&i.id==='N3'),'duplicate species is represented only by shards');

 const wiped=duplicateWorld(await run(original,'wipe'));wiped.units[wiped.queue[0]].tactic='wait';
 const afterWipe=settleRun(original,wiped),wipeSummary=settleSummary(original,wiped);
 assert.ok(afterWipe);assert.ok(wipeSummary);
 assert.equal(afterWipe.roster.some(i=>i.species==='pidgey'),true,'a new recruit returns even after a wipe');
 assert.equal(afterWipe.roster.find(i=>i.id==='P1').tactic,'wait','a party tactic change is preserved on return after a wipe');
 assert.deepEqual(afterWipe.shards,{pidgey:1,squirtle:1});assert.deepEqual(afterWipe.vault,{},'wiped runs lose held TMs');
 assert.deepEqual(afterWipe.rescue,original.rescue);assert.deepEqual(afterWipe.lost,original.lost);assert.equal(afterWipe.account,original.account);
 assert.deepEqual(wipeSummary.shards,summary.shards);
});

test('current format requires every new profile field and rejects unsafe or malformed shard maps',()=>{
 const good={format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:1,profile:initialProfile()};
 assert.doesNotThrow(()=>decode(JSON.stringify(good)));
 const bad=edit=>{const record=structuredClone(good);edit(record.profile);return JSON.stringify(record);};
 for(const mutate of [
  p=>{delete p.shards;},
  p=>{p.shards.not_a_species=1;},
  p=>{p.shards.pidgey=-1;},
  p=>{p.shards.pidgey=1.2;},
  p=>{Object.defineProperty(p.shards,'__proto__',{value:1,enumerable:true});},
 ])assert.throws(()=>decode(bad(mutate)),/损坏|不兼容/);
});
