/* Stage 7.8 level and evolution model (docs/玩法研究/敌我对等招式与强化模型规格.md section 13): evolution-level samples,
   round-end evolution (current HP kept, one stage per settlement, Eevee branch choice), recovery after the run, and recruits settled by the species they joined as.
   Experience facts used (worked by hand): a kill is worth the enemy's level; Lv L -> L+1 costs L, so the cumulative exp to reach Lv N is N(N-1)/2 - 10
   (Lv6 5, Lv16 110, Lv20 180, Lv21 200, Lv36 620). Max HP = roster HP + max(0, Lv-5). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {speciesUnit,recruitUnit,applyCommand,closeOut} from '../../src/core/engine.ts';
import {settleRun} from '../../src/core/base.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {world,row,pos,doCmd} from '../acceptance/fixtures.mjs';
import {foeOf} from './foe-fixture.mjs';

const roster=JSON.parse(readFileSync(new URL('../../src/data/roster.json',import.meta.url),'utf8')).species;
const rosterHp=id=>roster.find(s=>s.id===id).maxHp;

test('13.4 evolution levels: first stages 1, level evolutions at the original level, item/trade stages 20 and 36',()=>{
 const lv=id=>roster.find(s=>s.id===id).evoLevel;
 assert.equal(lv('ivysaur'),16);assert.equal(lv('pikachu'),1);assert.equal(lv('raichu'),20);assert.equal(lv('alakazam'),36);
 assert.equal(lv('bulbasaur'),1);assert.equal(lv('charmeleon'),16);assert.equal(lv('charizard'),36);
 assert.equal(lv('vaporeon'),20);assert.equal(lv('jolteon'),20);assert.equal(lv('flareon'),20);assert.equal(lv('arcanine'),20);
 assert.deepEqual(roster.find(s=>s.id==='eevee').evos,['vaporeon','jolteon','flareon']);
 assert.equal(SPECIES.ivysaur.evoLevel,16,'the runtime reads the same numbers');
});

/** A one-row run: A, B, C at x=0,1,2 (C leads) with the given species at the given level, one wait-only enemy of `foeLevel` at x=3, run level and exp as given. */
function run({species=['charmander','squirtle','bulbasaur'],level,exp,foeLevel,rng=1,hp={}}){
 const units={};
 ['A','B','C'].forEach((id,i)=>{const u=speciesUnit(id,species[i],level,{x:i,y:1});if(hp[id]!==undefined)u.hp=hp[id];units[id]=u;});
 const f=foeOf('w','rattata',3,1,6);f.level=foeLevel;f.waitOnly=true;units.w=f;
 const s=world(units,{floor:row(12),leader:'C',enemies:['w']});
 s.scenario='expedition';s.runId='lv';s.rooms=[{x:0,y:1,w:13,h:1}];
 s.dungeon={seed:1,width:13,height:4,floors:2,level:1,stored:{}};
 s.prog={level,exp,rng,made:0,kills:[],items:{berry:0,tonic:0}};s.purse=0;s.tms=[];
 return s;
}
const kill=(s)=>{const r=applyCommand(s,{type:'round',action:{type:'basic',target:'w'}});assert.equal(r.ok,true,r.error);return r.state;};
const idle=(s)=>{const r=applyCommand(s,{type:'round',action:{type:'wait'}});assert.equal(r.ok,true,r.error);return r.state;};

test('13.4 reaching an evolution level evolves at the round end: new max HP by the new species, current HP unchanged',()=>{
 // all three are Lv15 with 95 exp; one Lv15 kill is 110 exp = Lv16, the level of ivysaur, charmeleon and wartortle
 const s0=run({level:15,exp:95,foeLevel:15,hp:{C:12}});
 assert.deepEqual(['A','B','C'].map(i=>s0.units[i].species),['charmander','squirtle','bulbasaur']);
 assert.deepEqual(['A','B','C'].map(i=>s0.units[i].maxHp),[19+10,20+10,21+10]);
 const s=kill(s0);
 assert.equal(s.prog.level,16);
 assert.deepEqual(['A','B','C'].map(i=>s.units[i].species),['charmeleon','wartortle','ivysaur']);
 assert.deepEqual(['A','B','C'].map(i=>s.units[i].maxHp),[rosterHp('charmeleon')+11,rosterHp('wartortle')+11,rosterHp('ivysaur')+11],'max HP follows the new species at Lv16');
 assert.deepEqual(['A','B','C'].map(i=>s.units[i].hp),[29,30,12],'current HP is not healed by evolving');
 assert.deepEqual(['A','B','C'].map(i=>s.units[i].entrySpecies),['charmander','squirtle','bulbasaur'],'the form it joined the run as is remembered');
 assert.deepEqual(s.units.C.learned,s0.units.C.learned,'no new moves are learned by evolving');
 // below the level nothing evolves: Lv15 stays
 const early=kill(run({level:14,exp:81,foeLevel:14}));          // 81+14=95 exp = Lv15
 assert.equal(early.prog.level,15);assert.equal(early.units.A.species,'charmander');
});

test('13.4 evolution is at most one stage per round-end settlement',()=>{
 // charmander Lv35 (585 exp) kills a Lv36 enemy: 621 exp = Lv36, which allows both charmeleon (16) and charizard (36), but only one stage now
 const s0=run({species:['charmander','squirtle','bulbasaur'],level:35,exp:585,foeLevel:36});
 const s1=kill(s0);
 assert.equal(s1.prog.level,36);
 assert.equal(s1.units.A.species,'charmeleon','first stage this round');
 const s2=idle(s1);
 assert.equal(s2.units.A.species,'charizard','second stage at the next settlement');
 assert.equal(s2.units.A.hp,s1.units.A.hp,'HP unchanged across both steps');
 assert.equal(s2.units.A.maxHp,rosterHp('charizard')+31);
 assert.equal(idle(s2).units.A.species,'charizard','nothing further');
});

test('13.4 Eevee: the choice is asked after the level-up and before recruiting; closing it defers to the next level-up; the choice must be one of the options',()=>{
 // Eevee Lv19 with 161 exp kills a Lv19 enemy (rng state 7 draws 0.0117: an invitation follows): 180 exp = Lv20
 let s=kill(run({species:['eevee','squirtle','bulbasaur'],level:19,exp:161,foeLevel:19,rng:7,hp:{A:10}}));
 assert.equal(s.prog.level,20);assert.equal(s.phase,'evolution','the choice comes first');
 assert.deepEqual(s.pendingEvolutions,[{actor:'A',choices:['vaporeon','jolteon','flareon']}]);
 assert.equal(s.invitations.length,0,'the recruit draw has not happened yet');
 assert.equal(applyCommand(s,{type:'round',action:{type:'wait'}}).ok,false,'no rounds while the choice is open');
 assert.equal(applyCommand(s,{type:'evolve',species:'arcanine'}).ok,false);
 // close the box: no evolution, the settlement goes on to the recruit draw
 s=doCmd(s,{type:'evolve',species:null});
 assert.equal(s.units.A.species,'eevee');assert.equal(s.phase,'invitation','after the choice the recruit invitation appears');
 s=doCmd(s,{type:'invite',choice:'reject'});
 // another round at the same level does not ask again
 assert.equal(idle(s).phase,'playing');
 // the next level-up (Lv21 needs 200 exp: a Lv20 kill from 180) asks again; choose jolteon
 s.units.w=foeOf('w','rattata',3,1,6);s.units.w.level=20;s.units.w.waitOnly=true;s.enemies=['w'];s.prog.rng=1;
 s=kill(s);
 assert.equal(s.prog.level,21);assert.equal(s.phase,'evolution');
 s=doCmd(s,{type:'evolve',species:'jolteon'});
 assert.equal(s.units.A.species,'jolteon');assert.equal(s.units.A.hp,10,'HP stays at 10');assert.equal(s.units.A.maxHp,rosterHp('jolteon')+16);
 assert.equal(s.phase,'playing');
});

/** A recruit unit that joins the team in an invitation, to be accepted in place of A. */
function withInvite(s,unit){s.phase='invitation';s.anchor=structuredClone(s.units[s.leader].pos);s.invitations=[{id:'lv:invite:1',unit,status:'pending'}];return s;}

test('13.4 a recruit already above its evolution level evolves one stage at the first round-end after joining; the recruit keeps its joined species for settlement',()=>{
 const base=run({level:20,exp:180,foeLevel:1});
 base.units.w.pos=pos(9);     // keep the cell beside the leader free for the newcomer
 const pikachu=recruitUnit('N1','pikachu',20);
 let s=doCmd(withInvite(base,pikachu),{type:'invite',choice:'accept',outgoing:'A'});
 assert.equal(s.units.N1.species,'pikachu');
 const hpBefore=s.units.N1.hp;
 s=idle(s);
 assert.equal(s.units.N1.species,'raichu');assert.equal(s.units.N1.hp,hpBefore);assert.equal(s.units.N1.maxHp,rosterHp('raichu')+15);
 assert.equal(s.units.N1.entrySpecies,'pikachu');
 // a recruit that was already evolved when it was recruited joins as that species
 const joined=recruitUnit('N2','raichu',20);
 assert.equal(joined.species,'raichu');assert.equal(joined.entrySpecies,'raichu');
});

test('13.4 after the run every member is restored to the form it entered with; recruits are settled by the species they joined as',()=>{
 // A, B, C evolve in the run; N1 (pikachu) evolves to raichu; N2 was recruited as raichu. Settlement keeps the entry forms.
 let s=kill(run({level:15,exp:95,foeLevel:15}));
 assert.deepEqual(['A','B','C'].map(i=>s.units[i].species),['charmeleon','wartortle','ivysaur']);
 const n1=recruitUnit('N1','pikachu',16),n2=recruitUnit('N2','raichu',16);
 n1.species='raichu';          // it evolved during the run (the run-time species changes, the entry species does not)
 s.units.N1=n1;s.units.N2=n2;s.queue=['A','B','C'];s.camp=['N1','N2'];
 s.end=closeOut(s,'normal');s.phase='ended';
 const p=settleRun(null,s);
 assert.ok(p,'the run settles');
 assert.deepEqual(p.roster.slice(0,3).map(i=>i.species),['charmander','squirtle','bulbasaur'],'founding members are back to their entry forms');
 assert.deepEqual(p.roster.slice(3).map(i=>i.species).sort(),['pikachu','raichu'],'N1 becomes a pikachu, N2 a raichu');
});
