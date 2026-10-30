import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createExpedition,traceRound,closeOut,RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {newGameProfile,squadOf,profileProblem,settleRun} from '../../src/core/base.ts';
import {TrialStore,decode,SAVE_KEY} from '../../src/core/save.ts';
import {SPECIES,STARTER_IDS,ALL_TM_MOVES} from '../../src/core/roster.ts';
import {speciesZh,moveZh,typeZh,tmZh,itemZh,NAME_TABLE} from '../../src/core/names.ts';
import {enemyInfo,localizeLog,orderLine,stepRows} from '../../src/core/describe.ts';
import {createScenario} from '../../src/core/scenarios.ts';
// Stage 7.1 tests: the nine-starter roster, the Chinese name table, the new-game profile and the new-game save path.

const roster=JSON.parse(readFileSync(new URL('../../src/data/roster.json',import.meta.url),'utf8'));
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);},map:m};};
const frozenSpecies=s=>({id:s.id,starter:s.starter,maxHp:s.maxHp,kit:s.kit});

test('N1 the roster has nine starters: the original three plus six generation 2-3 starters, in a fixed order',()=>{
 assert.deepEqual(STARTER_IDS,['bulbasaur','charmander','squirtle','chikorita','cyndaquil','totodile','treecko','torchic','mudkip']);
 assert.deepEqual(roster.species.slice(9,15).map(s=>[s.id,s.dex]),[['chikorita','0152'],['cyndaquil','0155'],['totodile','0158'],['treecko','0252'],['torchic','0255'],['mudkip','0258']]);
 for(const s of roster.species.slice(9,15)){assert.equal(s.starter,true);assert.ok(s.kit.length>=1&&s.kit.length<=2);assert.ok(s.learnable.length>0);}
});

test('N2 the original nine species retain their frozen starter, HP and kit fields while learnable may expand',()=>{
 // Checked against the pre-expansion roster. New learnset entries are deliberately outside this frozen projection.
 assert.equal(createHash('sha256').update(JSON.stringify(roster.species.slice(0,9).map(frozenSpecies))).digest('hex'),'a9cf1abed815470319a4698c247cf7dd141f0602eca6489bba85ff300fa17899');
});

test('N3 every species, type, kit move, learnable move and technique-machine move has a Chinese name',()=>{
 for(const s of roster.species){
  assert.ok(NAME_TABLE.species[s.id],`species ${s.id}`);
  for(const t of s.types)assert.ok(NAME_TABLE.types[t],`type ${t}`);
  for(const k of [...s.kit,...s.learnable])if(k.move!=='visegrip')assert.ok(NAME_TABLE.moves[k.move],`move ${k.move}`);
 }
 for(const m of ALL_TM_MOVES){assert.ok(NAME_TABLE.moves[m],`tm move ${m}`);assert.ok(NAME_TABLE.tms[m],`tm ${m}`);}
 for(const i of ['berry','tonic'])assert.ok(NAME_TABLE.items[i]);
 assert.equal(speciesZh('treecko'),'木守宫');assert.equal(moveZh('leafage'),'树叶');  // official name per wiki.52poke.com move list, checked 2026-10-30assert.equal(typeZh('Grass'),'草');assert.equal(tmZh('protect'),'守住');assert.equal(itemZh('berry'),'橙橙果');
 assert.equal(moveZh('visegrip'),'visegrip','the documented PokeAPI spelling exception falls back to its Showdown id');
 assert.equal(moveZh('not-a-move'),'not-a-move','unknown ids fall back to the id instead of throwing');
 for(const v of Object.values({...NAME_TABLE.species,...NAME_TABLE.moves}))assert.match(v,/[一-鿿]/,'every name contains Chinese characters');
});

test('N4 a new game profile has exactly two members: the main (leader) and a different deputy; it validates',()=>{
 const r=newGameProfile('torchic','mudkip');assert.ok(r.ok);
 const p=r.profile;
 assert.deepEqual(p.roster.map(i=>[i.id,i.species]),[['P1','torchic'],['P2','mudkip']]);
 assert.deepEqual(p.team,['P1','P2']);assert.equal(p.leader,'P1');assert.equal(p.next,3);assert.equal(p.expeditions,0);assert.deepEqual(p.vault,{});
 assert.deepEqual(p.roster[0].carry,['scratch','ember']);assert.deepEqual(p.roster[1].carry,['tackle','watergun']);
 assert.equal(profileProblem(p),null);
 for(const a of STARTER_IDS)for(const b of STARTER_IDS)assert.equal(newGameProfile(a,b).ok,a!==b,`${a}/${b}`);
 assert.equal(newGameProfile('pikachu','mudkip').ok,false,'a non-starter cannot be the main');
 assert.equal(newGameProfile('mudkip','geodude').ok,false,'a non-starter cannot be the deputy');
});

test('N5 a two-member squad runs in memory; the stored record contains only the camp profile',async()=>{
 const p=newGameProfile('chikorita','cyndaquil').profile;
 const w=createExpedition('r1',11,2,squadOf(p));
 assert.deepEqual(w.queue,['A','B']);assert.equal(w.leader,'A');assert.equal(w.units.A.species,'chikorita');assert.equal(w.units.B.species,'cyndaquil');
 assert.ok(w.units.A.pos&&w.units.B.pos);
 const port=memory(),store=new TrialStore(port);assert.equal(await store.beginNewGame(p,false),true);
 assert.deepEqual(decode(port.map.get(SAVE_KEY)),store.envelope);
 assert.equal(Object.hasOwn(store.envelope,'current'),false);assert.equal(Object.hasOwn(store.envelope,'recent'),false);
 assert.equal(await store.depart('r1-live',11),true);assert.deepEqual(store.state.queue,['A','B']);
 assert.deepEqual(new TrialStore(port).state,null,'reopening returns to the saved camp');
 const done=structuredClone(w);done.phase='ended';done.end=closeOut(done,'normal');
 const after=settleRun(p,done);assert.deepEqual(after.roster.map(i=>i.species),['chikorita','cyndaquil']);assert.equal(after.expeditions,1);
});

test('N6 beginNewGame: free on an empty store; needs confirmation over a record; a refusal or a failed write changes nothing',async()=>{
 const port=memory();const store=new TrialStore(port);
 const first=newGameProfile('bulbasaur','squirtle').profile,second=newGameProfile('treecko','torchic').profile;
 assert.equal(store.status,'empty');
 assert.equal(await store.beginNewGame({...first,team:[]},false),false,'an invalid profile is refused');assert.equal(port.map.size,0);
 assert.equal(await store.beginNewGame(first,false),true);assert.equal(store.status,'ready');assert.equal(store.atBase,true);
 const saved=port.map.get(SAVE_KEY);
 assert.equal(await store.beginNewGame(second,false),false,'overwrite needs confirmation');assert.equal(port.map.get(SAVE_KEY),saved);
 // a failing write keeps the old record in memory and in storage
 port.setItem=()=>{throw Error('quota');};
 assert.equal(await store.beginNewGame(second,true),false);assert.equal(port.map.get(SAVE_KEY),saved);assert.deepEqual(store.profile.roster.map(i=>i.species),['bulbasaur','squirtle']);assert.equal(store.status,'ready');
 port.setItem=(k,v)=>{port.map.set(k,v);};
 assert.equal(await store.beginNewGame(second,true),true);
 assert.deepEqual(new TrialStore(port).profile.roster.map(i=>i.species),['treecko','torchic']);
});

test('N7 beginNewGame over an unreadable record needs the original bytes exported first',async()=>{
 const port=memory();port.map.set(SAVE_KEY,'{broken');const store=new TrialStore(port);
 assert.equal(store.status,'blocked');
 const profile=newGameProfile('mudkip','torchic').profile;
 assert.equal(await store.beginNewGame(profile,true),false);assert.equal(port.map.get(SAVE_KEY),'{broken');
 assert.equal(store.exportRaw(),'{broken');
 assert.equal(await store.beginNewGame(profile,false),false,'still needs confirmation');
 assert.equal(await store.beginNewGame(profile,true),true);assert.equal(store.status,'ready');
});

test('N8 enemyInfo shows only what the player has seen: species, HP, behavior and damage; nothing for hidden or fallen enemies',()=>{
 const s=createScenario('K1','x');
 const info=enemyInfo(s,'H');assert.equal(info.hp,24);assert.equal(info.maxHp,24);assert.match(info.behavior,/追击/);assert.match(info.damage,/^8/);
 const r=createScenario('K4','x');assert.match(enemyInfo(r,'R').behavior,/远程.*3格/);
 s.seen=s.seen.filter(k=>k!==`${s.units.H.pos.x},${s.units.H.pos.y}`);assert.equal(enemyInfo(s,'H'),null,'an unrevealed cell hides the enemy');
 const f=createScenario('K1','x');f.units.H.hp=0;f.units.H.pos=null;assert.equal(enemyInfo(f,'H'),null);
 assert.equal(enemyInfo(f,'A'),null,'friends are not enemies');
 const e=createExpedition('r',5,2,squadOf(newGameProfile('mudkip','torchic').profile));
 for(const id of e.enemies){const u=e.units[id];if(u.pos&&e.seen.includes(`${u.pos.x},${u.pos.y}`))assert.match(enemyInfo(e,id).name,/[一-鿿]/);}
});

test('N9 traceRound lists each member in queue order with default behavior marked, and executes nothing',()=>{
 const s=createScenario('K1','x');const before=JSON.stringify(s);
 const steps=traceRound(s,{type:'round',action:{type:'wait'},override:{actor:'B',action:{type:'wait'}}});
 assert.deepEqual(steps.map(t=>[t.id,t.explicit]),[['A',true],['B',true],['C',false]]);
 assert.equal(JSON.stringify(s),before,'the state is untouched');
 assert.equal(steps[2].action.type,'basic','C stands next to H, so the default behavior is a basic attack');
 assert.match(orderLine(s,steps),/^A.*→.*B.*→.*C.*→ 敌方$/);
 assert.ok(stepRows(s,steps)[2].text.includes('默认行为'));
 assert.equal(traceRound(s,{type:'round',action:{type:'move',to:{x:9,y:9}}}),null,'an illegal draft has no preview');
});

test('N10 localizeLog names units and species in Chinese without touching other letters',()=>{
 const e=createExpedition('r',5,2,squadOf(newGameProfile('mudkip','torchic').profile));
 assert.equal(localizeLog(e,'A受到6伤害，HP 14'),'A 水跃鱼受到6伤害，HP 14');
 assert.equal(localizeLog(e,'rattata被击败，没有发出邀请'),'小拉达被击败，没有发出邀请');
 assert.equal(localizeLog(e,'A取得招式机：protect'),'A 水跃鱼取得招式机：守住');
});
