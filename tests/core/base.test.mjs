import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createExpedition,createMain,applyCommand,recruitUnit,closeOut,RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {initialProfile,learnTm,setCarry,setTeam,squadOf,settleRun,profileProblem} from '../../src/core/base.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {TrialStore,decode,decodeLegacy,BUILD_ID} from '../../src/core/save.ts';
// Stage 6.5 rule tests. Every expected value below is a literal written from docs/玩法研究/基地与培养.md and the roster data
// (charmander kit scratch+ember, squirtle tackle+watergun, bulbasaur tackle+seedbomb); none is computed with the code under test.

const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);},map:m};};
const withVault=(vault)=>({...initialProfile(),vault});
/** A finished expedition made from the initial squad: hand-set end fields, as the engine would leave them. */
function ended({outcome='normal',tm='protect',camp=[],wipe=outcome==='wipe',legacy=false}={}){
 const s=legacy?createExpedition('run-a',7):createExpedition('run-a',7,2,squadOf(initialProfile()));
 s.goal=true;s.prog.exp=2;s.bag=1;if(tm)s.tms=[{move:tm,source:'target',fate:'held'}];
 for(const [id,sp] of camp){s.units[id]=recruitUnit(id,sp,1);s.units[id].pos=null;s.camp.push(id);}
 if(wipe)for(const id of s.queue){s.units[id].hp=0;s.units[id].pos=null;}
 s.phase='ended';s.request=null;s.anchor=null;
 s.end=closeOut(s,outcome);
 return s;
}
const envelope=(over)=>({format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:3,profile:initialProfile(),...over});
const legacyEnvelope=(current,profile=initialProfile())=>({format:1,rules:'trial-rules-2',content:'trial-content-2',build:BUILD_ID,sequence:3,current,recent:null,profile});

test('B1 the initial profile: three starters, their kits learned and carried, empty vault',()=>{
 const p=initialProfile();
 assert.deepEqual(p.roster.map(i=>[i.id,i.species,i.carry]),[['P1','charmander',['scratch','ember']],['P2','squirtle',['tackle','watergun']],['P3','bulbasaur',['tackle','seedbomb']]]);
 assert.deepEqual(p.roster[0].learned,[{move:'scratch',pp:3},{move:'ember',pp:2}]);
 assert.deepEqual(p.vault,{});assert.equal(p.expeditions,0);assert.deepEqual(p.team,['P1','P2','P3']);assert.equal(p.leader,'P3');
 assert.equal(profileProblem(p),null);
});

test('Arcanine can be an ordinary roster member and a lost partner',()=>{
 const p=initialProfile(),sp=SPECIES.arcanine;
 p.roster[0]={...p.roster[0],species:'arcanine',learned:sp.kit.map(k=>({move:k.move,pp:k.pp})),carry:sp.kit.map(k=>k.move)};
 assert.equal(profileProblem(p),null);
 p.next=5;p.lost=[{id:'P4',species:'arcanine',expedition:1}];
 assert.equal(profileProblem(p),null);
});

test('暂不出场的图鉴物种不能通过手改存档进入名册或救援池',()=>{
 for(const species of ['metapod','kakuna','abra','magikarp','ditto']){
  assert.equal(SPECIES[species].availability,'暂不出场');
  for(const destination of ['roster','rescue']){
   const p=initialProfile();
   const inst={id:'P4',species,protected:false,tactic:'together',learned:[],carry:[]};
   p.next=5;
   if(destination==='roster')p.roster.push(inst);
   else p.rescue.push({inst,paid:false,left:1});
   assert.match(profileProblem(p),new RegExp(`物种${species}暂不出场`),destination);
   assert.throws(()=>decode(JSON.stringify(envelope({profile:p}))),/损坏|不兼容/,`${species}/${destination}`);
  }
 }
 assert.doesNotThrow(()=>decode(JSON.stringify(envelope())));
});

test('B2 normal exit: the new recruit joins the roster, the brought machine enters the vault, old members keep what they had',()=>{
 const p=settleRun(initialProfile(),ended({camp:[['N1','pidgey']]}));
 assert.deepEqual(p.roster.map(i=>[i.id,i.species]),[['P1','charmander'],['P2','squirtle'],['P3','bulbasaur'],['P4','pidgey']]);
 assert.deepEqual(p.roster[3].learned,[{move:'tackle',pp:3},{move:'gust',pp:3}]);
 assert.deepEqual(p.roster[3].carry,['tackle','gust']);
 assert.deepEqual(p.vault,{protect:1});assert.equal(p.expeditions,1);assert.equal(p.next,5);
 assert.deepEqual(p.roster[0],initialProfile().roster[0]);
});

test('B3 wipe: everyone is still on the roster (none lost), the machine is not brought',()=>{
 const p=settleRun(initialProfile(),ended({outcome:'wipe',camp:[['N1','zubat']]}));
 assert.deepEqual(p.roster.map(i=>i.species),['charmander','squirtle','bulbasaur','zubat']);
 assert.deepEqual(p.vault,{});assert.equal(p.expeditions,1);
});

test('B3b a run saved before the base existed: its A/B/C are the starters, not three new people; no profile means the initial one',()=>{
 const p=settleRun(null,ended({legacy:true,camp:[['N1','rattata']]}));
 assert.deepEqual(p.roster.map(i=>i.species),['charmander','squirtle','bulbasaur','rattata']);
 assert.deepEqual(p.vault,{protect:1});
 assert.equal(settleRun(null,{...ended(),phase:'playing'}),null);
});

test('B4 learning: a compatible machine teaches and is used up; incompatible or known ones are refused and not used up',()=>{
 const p=withVault({protect:1,roar:1,whirlwind:1});
 const ok=learnTm(p,'P1','protect');assert.equal(ok.ok,true);
 assert.deepEqual(ok.profile.roster[0].learned.at(-1),{move:'protect',pp:1});
 assert.deepEqual(ok.profile.vault,{roar:1,whirlwind:1});
 assert.deepEqual(p.vault,{protect:1,roar:1,whirlwind:1},'input untouched');
 for(const [inst,move] of [['P2','roar'],['P1','whirlwind'],['P3','roar']]){
  const r=learnTm(p,inst,move);assert.equal(r.ok,false);assert.match(r.error,/不能学习/);assert.match(r.error,/没有消耗/);}
 const again=learnTm({...ok.profile,vault:{protect:1}},'P1','protect');
 assert.equal(again.ok,false);assert.match(again.error,/已经学会/);
 assert.equal(learnTm(ok.profile,'P1','protect').ok,false,'no machine left');
 assert.equal(learnTm(initialProfile(),'P1','protect').ok,false);
 assert.equal(learnTm(p,'P1','tackle').ok,false,'tackle is not a machine');
 assert.equal(learnTm(p,'P9','protect').ok,false);
});

test('B5 carry: at most two distinct learned moves, only learned ones; taking one off keeps it learned',()=>{
 let p=learnTm(withVault({protect:1}),'P1','protect').profile;
 const c=setCarry(p,'P1',['scratch','protect']);assert.equal(c.ok,true);
 assert.deepEqual(c.profile.roster[0].carry,['scratch','protect']);
 assert.deepEqual(c.profile.roster[0].learned.map(l=>l.move),['scratch','ember','protect']);
 assert.equal(setCarry(p,'P1',['scratch','ember','protect']).ok,false,'three moves');
 assert.equal(setCarry(p,'P1',['scratch','whirlwind']).ok,false,'not learned');
 assert.equal(setCarry(p,'P1',['scratch','scratch']).ok,false,'same move twice');
 // Scratch and Ember both deal front damage, but are distinct moves and may be carried together.
 assert.equal(setCarry(p,'P1',['scratch','ember']).ok,true);
 assert.equal(setCarry(p,'P1',[]).ok,true);
});

test('B6 team: 1 to 3 distinct roster members, the leader is one of them',()=>{
 const p=initialProfile();
 assert.equal(setTeam(p,['P2'],'P2').ok,true);
 assert.equal(setTeam(p,[],'P1').ok,false);
 assert.equal(setTeam(p,['P1','P2','P3','P1'],'P1').ok,false);
 assert.equal(setTeam(p,['P1','P1'],'P1').ok,false);
 assert.equal(setTeam(p,['P1','P9'],'P1').ok,false);
 assert.equal(setTeam(p,['P1','P2'],'P3').ok,false);
});

test('B7 departure: the squad in selection order, full HP and PP, carried moves only, run level 5',()=>{
 let p=learnTm(withVault({protect:1}),'P1','protect').profile;
 p=setCarry(p,'P1',['scratch','protect']).profile;
 p=setTeam(p,['P3','P1'],'P1').profile;
 const s=createExpedition('go',11,2,squadOf(p));
 assert.deepEqual(s.queue,['A','B']);assert.equal(s.leader,'B');
 assert.deepEqual([s.units.A.species,s.units.B.species],['bulbasaur','charmander']);
 assert.deepEqual([s.units.A.inst,s.units.B.inst],['P3','P1']);
 assert.deepEqual([s.units.B.hp,s.units.B.maxHp,s.units.B.learned,s.units.B.moves],[19,19,['scratch','protect'],['scratch','protect']]);
 assert.deepEqual([s.units.B.pp,s.units.B.maxPp],[{scratch:3,protect:1},{scratch:3,protect:1}]);
 assert.deepEqual([s.units.A.hp,s.units.A.pp],[21,{tackle:3,seedbomb:1}]);
 assert.equal(s.prog.level,5);assert.equal(s.prog.exp,0);assert.equal(s.dungeon.base,true);
});

test('B8 the swapped-out member keeps what it learned: a machine learned, then left off the team, is still learned after another run',()=>{
 let p=learnTm(withVault({protect:1}),'P1','protect').profile;
 p=setTeam(p,['P2','P3'],'P3').profile;
 const after=settleRun(p,ended({camp:[]}));
 assert.deepEqual(after.roster[0].learned.map(l=>l.move),['scratch','ember','protect']);
});

/* ---------- technique machine from T ---------- */
function atFloor2(seed){
 let s=createExpedition('t'+seed,seed,2,squadOf(initialProfile()));
 s.units.C.pos=s.points.find(p=>p.kind==='down').pos;
 s=applyCommand(s,{type:'round',action:{type:'interact',exit:true}}).state;
 return applyCommand(s,{type:'finishTransit'}).state;
}
test('B9 T gives one machine drawn from the saved random state; reload and later rounds never redraw',()=>{
 const expected={3:'roar',4:'whirlwind',7:'protect'};
 for(const [seed,move] of Object.entries(expected)){
  let s=atFloor2(Number(seed));for(const id of ['A','B']){s.units[id].hp=0;s.units[id].pos=null;}
  s.units.C.pos=s.points.find(p=>p.kind==='item').pos;
  const r=applyCommand(s,{type:'round',action:{type:'interact',exit:false}});assert.equal(r.ok,true);
  assert.deepEqual(r.state.tms,[{move,source:'target',fate:'held'}],`seed ${seed}`);assert.equal(r.state.bag,1);
  const rng=r.state.prog.rng;
  const text=JSON.stringify(r.state);assert.equal(JSON.parse(text).tms[0].move,move);
  const w=applyCommand(JSON.parse(text),{type:'round',action:{type:'wait'}});
  assert.equal(w.state.tms[0].move,move);
  // T is used: a second interact is refused and draws nothing
  assert.equal(applyCommand(r.state,{type:'round',action:{type:'interact',exit:false}}).ok,false);
  assert.equal(r.state.prog.rng,rng);
 }
});

/* ---------- rest point ---------- */
test('B11 rest point: floor 2 of a base run only, next to the arrival stairs; none in older generated runs',()=>{
 const s=atFloor2(3);
 assert.deepEqual(s.points.filter(p=>p.kind==='rest'),[{pos:{x:14,y:9},kind:'rest',used:false}]);
 const old=createExpedition('old',3);old.units.C.pos=old.points.find(p=>p.kind==='down').pos;
 let o=applyCommand(old,{type:'round',action:{type:'interact',exit:true}}).state;o=applyCommand(o,{type:'finishTransit'}).state;
 assert.equal(o.points.some(p=>p.kind==='rest'),false);
 assert.equal(createExpedition('f1',3,2,squadOf(initialProfile())).points.some(p=>p.kind==='rest'),false,'not on floor 1');
});

test('B12 rest point: lowest-ratio move of each living member gets +2 PP once; full PP is refused without using the chance',()=>{
 const s=atFloor2(3);
 for(const id of ['A','B']){s.units[id].hp=0;s.units[id].pos=null;}
 s.units.C.pos={x:14,y:9};
 const full=applyCommand(s,{type:'round',action:{type:'interact',exit:false}});
 assert.equal(full.ok,false);assert.match(full.error,/PP都已满/);assert.match(full.error,/没有消耗/);
 assert.deepEqual(full.state,s);assert.equal(s.points.find(p=>p.kind==='rest').used,false);
 s.units.C.pp={tackle:1,seedbomb:0};
 const r=applyCommand(s,{type:'round',action:{type:'interact',exit:false}});assert.equal(r.ok,true);
 assert.deepEqual(r.state.units.C.pp,{tackle:1,seedbomb:1});// line 0/1 is lowest; +2 stops at the maximum 1
 assert.equal(r.state.points.find(p=>p.kind==='rest').used,true);assert.equal(r.state.round,s.round+1);
 const again=applyCommand(r.state,{type:'round',action:{type:'interact',exit:false}});
 assert.equal(again.ok,false);assert.match(again.error,/已使用/);
});

test('B13 rest point with two living members: each picks its own lowest ratio; ties go to the first move; fallen members are skipped',()=>{
 const s=atFloor2(3);
 s.units.B.hp=0;s.units.B.pos=null;
 s.units.A.pos={x:14,y:11};s.units.C.pos={x:14,y:9};
 s.units.A.pp={scratch:2,ember:1};   // 2/3 and 1/2: line is lower
 s.units.B.pp={tackle:0,watergun:0};   // fallen: untouched
 s.units.C.pp={tackle:1,seedbomb:1};   // 1/3 and 1/1: strong is lower
 const r=applyCommand(s,{type:'round',action:{type:'interact',exit:false}});assert.equal(r.ok,true);
 assert.deepEqual(r.state.units.A.pp,{scratch:2,ember:2});
 assert.deepEqual(r.state.units.B.pp,{tackle:0,watergun:0});
 assert.deepEqual(r.state.units.C.pp,{tackle:3,seedbomb:1});
});

test('B14 rest point cannot be used as an exit',()=>{
 const s=atFloor2(3);s.units.C.pos={x:14,y:9};s.units.C.pp={tackle:0,seedbomb:0};
 const r=applyCommand(s,{type:'round',action:{type:'interact',exit:true}});assert.equal(r.ok,false);assert.match(r.error,/不是出口/);
});

/* ---------- save: camp profile ---------- */
test('B15 camp edits persist; departure keeps the saved camp and leaves the new World in memory',async()=>{
 const profile=settleRun(initialProfile(),ended({camp:[['N1','pidgey']]}));
 const port=memory(),store=new TrialStore(port);
 assert.equal(await store.beginNewGame(profile,false),true);
 assert.deepEqual(store.profile.vault,{protect:1});assert.equal(store.profile.roster.length,4);
 let reopened=new TrialStore(port);assert.equal(reopened.status,'ready');assert.deepEqual(reopened.profile,store.profile);
 assert.deepEqual((await store.baseAction({type:'learn',inst:'P4',move:'whirlwind'})).ok,false);
 assert.equal((await store.baseAction({type:'learn',inst:'P4',move:'protect'})).ok,true);
 assert.deepEqual(store.profile.vault,{});assert.equal((await store.baseAction({type:'carry',inst:'P4',moves:['gust','protect']})).ok,true);
 assert.equal((await store.baseAction({type:'team',team:['P4','P1'],leader:'P4'})).ok,true);
 reopened=new TrialStore(port);assert.deepEqual(reopened.profile,store.profile);
 const campRaw=port.map.get('dungeon-trial.player.v1');
 assert.equal(await store.depart('run-b',99),true);
 const s=store.state;assert.deepEqual(s.queue,['A','B']);assert.equal(s.units.A.species,'pidgey');assert.deepEqual(s.units.A.moves,['gust','protect']);
 assert.equal(port.map.get('dungeon-trial.player.v1'),campRaw,'departure does not save a new World or deduct the persisted account');
 reopened=new TrialStore(port);assert.equal(reopened.status,'ready');assert.equal(reopened.state,null);assert.deepEqual(reopened.profile,store.profile);
 assert.deepEqual(Object.keys(reopened.envelope).sort(),['build','content','format','profile','rules','sequence']);
});

test('B16 a write that fails freezes base edits; retry saves the same record',async()=>{
 const port=memory(),store=new TrialStore(port);await store.beginNewGame(initialProfile(),false);
 const real=port.setItem;port.setItem=()=>{throw Error('quota');};
 assert.deepEqual(await store.baseAction({type:'team',team:['P1'],leader:'P1'}),{ok:true,saved:false});
 assert.equal(store.status,'failed');
 assert.equal((await store.baseAction({type:'team',team:['P2'],leader:'P2'})).ok,false,'frozen until the write is retried');
 port.setItem=real;assert.equal(await store.retry(),true);
 assert.deepEqual(new TrialStore(port).profile.team,['P1']);
});

test('B17 a legacy World without a camp profile is preserved and must be exported',async()=>{
 const old=legacyEnvelope(ended({legacy:true}));delete old.profile;
 const raw=JSON.stringify(old),port=memory();port.map.set('dungeon-trial.player.v1',raw);
 const store=new TrialStore(port);assert.equal(await store.whenReady,false);
 assert.equal(store.status,'blocked');assert.equal(store.exportRaw(),raw);
 assert.equal(port.map.get('dungeon-trial.player.v1'),raw);assert.equal(port.map.size,1);
});

test('B18 developer newTrial replaces an in-memory run without changing the saved camp',async()=>{
 const port=memory(),store=new TrialStore(port);
 assert.equal(await store.start(ended()),true);
 const terminal=store.state;
 assert.equal(await store.newTrial(createExpedition('run-z',5)),true);
 assert.equal(store.state.runId,'run-z');assert.equal(store.state.phase,'playing');
 assert.notDeepEqual(store.state,terminal);assert.equal(port.map.size,0);
 const based=new TrialStore(memory());await based.beginNewGame(initialProfile(),false);assert.equal(await based.depart('run-y',5),true);
 assert.equal(await based.newTrial(createExpedition('run-y2',5)),false);
});

test('B19 tampered profiles and records are refused on load',()=>{
 const good=envelope();assert.doesNotThrow(()=>decode(JSON.stringify(good)));
 const bad=(edit)=>{const e=envelope();edit(e);return JSON.stringify(e);};
 const refused=[
  ['duplicate instance id',e=>{e.profile.roster[1].id='P1';}],
  ['unknown species',e=>{e.profile.roster[0].species='mew';}],
  ['learned move not learnable',e=>{e.profile.roster[0].learned.push({move:'hyperbeam',pp:1});}],
  ['learned move outside the species list',e=>{e.profile.roster[0].learned[0].move='quickattack';}],
  ['carry not learned',e=>{e.profile.roster[0].carry=['scratch','protect'];}],
  ['carry three',e=>{e.profile.roster[0].learned.push({move:'protect',pp:1});e.profile.roster[0].carry=['scratch','ember','protect'];}],
  ['carry a move not learnable by the species',e=>{e.profile.roster[2].learned.push({move:'roar',pp:2});e.profile.roster[2].carry=['tackle','roar'];}],
  ['negative machine count',e=>{e.profile.vault={protect:-1};}],
  ['fractional machine count',e=>{e.profile.vault={protect:1.5};}],
  ['unknown machine',e=>{e.profile.vault={tackle:1};}],
  ['team empty',e=>{e.profile.team=[];}],
  ['team too long',e=>{e.profile.team=['P1','P2','P3','P1'];}],
  ['leader off the team',e=>{e.profile.team=['P1','P2'];e.profile.leader='P3';}],
  ['id counter behind',e=>{e.profile.next=3;}],
  ['at base without a profile',e=>{delete e.profile;}],
 ];
 for(const [name,edit] of refused)assert.throws(()=>decode(bad(edit)),/损坏|不兼容/,name);
 assert.throws(()=>decode(JSON.stringify({...good,current:createMain('m',false)})),/损坏/,'camp records cannot embed a fixed-map World');
});

test('B20 decodeLegacy validates old ended unit/profile agreement and terminal machine records',()=>{
 const frozen=JSON.parse(readFileSync(new URL('./fixtures78/legacy-worlds.json',import.meta.url),'utf8'));
 const finished=structuredClone(frozen.floor1);finished.phase='ended';finished.request=null;finished.anchor=null;
 finished.end=closeOut(finished,'normal');
 const raw=world=>JSON.stringify({format:1,rules:'trial-rules-2',content:'trial-content-2',build:BUILD_ID,sequence:3,current:world,recent:null,profile:structuredClone(frozen.profile)});
 assert.doesNotThrow(()=>decodeLegacy(raw(finished)));
 const wrongSpecies=structuredClone(finished);wrongSpecies.units.A.species='squirtle';
 assert.throws(()=>decodeLegacy(raw(wrongSpecies)),/结构损坏/);
 const wrongMoves=structuredClone(finished);wrongMoves.units.A.moves=['ember','scratch'];
 assert.throws(()=>decodeLegacy(raw(wrongMoves)),/结构损坏/);
 const withTm=structuredClone(finished);withTm.tms=[{move:'protect',source:'target',fate:'held'}];withTm.bag=1;withTm.end=closeOut(withTm,'normal');
 assert.doesNotThrow(()=>decodeLegacy(raw(withTm)));
 const wrongTm=structuredClone(withTm);wrongTm.end.tms[0].move='roar';
 assert.throws(()=>decodeLegacy(raw(wrongTm)),/结构损坏/);
 const missingTm=structuredClone(withTm);delete missingTm.end.tms;
 assert.throws(()=>decodeLegacy(raw(missingTm)),/结构损坏/);
 const unknownTm=structuredClone(withTm);unknownTm.tms[0].move='tackle';unknownTm.end.tms[0].move='tackle';
 assert.throws(()=>decodeLegacy(raw(unknownTm)),/结构损坏/);
});
