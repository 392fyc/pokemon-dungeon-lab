/* Playtest round 2 #4: a technique machine used at camp puts the move on the carried list when there is room, so the player sees it in the run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition} from '../../src/core/engine.ts';
import {initialProfile,learnTm,applyBase,squadOf,MAX_CARRY} from '../../src/core/base.ts';
import {learnableMove,SPECIES,ALL_TM_MOVES} from '../../src/core/roster.ts';

const profileWith=(inst,move)=>{const p=initialProfile();p.vault={[move]:1};return p;};
function learnableFor(species){const p=initialProfile();for(const m of ['protect','reflect','lightscreen','quickguard','helpinghand','facade','swift','headbutt','rest','sleeptalk','snore','shadowball']){if(learnableMove(species,m)&&!p.roster.find(i=>i.species===species).learned.some(l=>l.move===m))return m;}throw Error('no learnable move for '+species);}
test('learning with room to spare: the move is carried and appears among the run moves',()=>{
 const base=initialProfile(),inst=base.roster[0],move=learnableFor(inst.species);
 assert.ok(inst.carry.length<MAX_CARRY);
 const p=initialProfile();p.vault={[move]:1};
 const r=applyBase(p,{type:'learn',inst:inst.id,move});assert.equal(r.ok,true,r.error);
 const mine=r.profile.roster.find(i=>i.id===inst.id);
 assert.ok(mine.learned.some(l=>l.move===move));assert.deepEqual(mine.carry,[...inst.carry,move],'appended to the carried list');
 const squad=squadOf(r.profile),member=squad.members.find(m=>m.inst===inst.id);assert.ok(member.carry.some(c=>c.move===move));
 const run=createExpedition('camp-learn',3,3,squad,0,true,3);
 const unit=Object.values(run.units).find(u=>u.inst===inst.id);assert.ok(unit.learned.includes(move),'the learned move is in the in-run kit');
});
/** A real instance that carries four moves and can still learn a machine move; the test fails if no species fits (it must never be skipped). */
function fullCarryFixture(){
 for(const sp of Object.values(SPECIES)){
  const own=[...sp.kit,...(sp.learnable??[])].map(k=>k.move).filter((m,i,a)=>a.indexOf(m)===i&&learnableMove(sp.id,m));
  const machine=ALL_TM_MOVES.find(m=>learnableMove(sp.id,m)&&!own.slice(0,4).includes(m));
  if(own.length>=4&&machine){
   const p=initialProfile(),inst=p.roster[0];inst.species=sp.id;inst.learned=own.slice(0,4).map(m=>learnableMove(sp.id,m));inst.carry=own.slice(0,4);p.vault={[machine]:3};
   return {profile:p,inst:p.roster[0],machine};
  }
 }
 throw Error('no species can carry four moves and still learn a machine move');
}
test('learning with four carried moves: only learn, replace in place, reject a bad replace, and cancel (the engine side of cancel is "no action")',()=>{
 const {profile,inst,machine}=fullCarryFixture();assert.equal(inst.carry.length,MAX_CARRY);
 const keep=applyBase(profile,{type:'learn',inst:inst.id,move:machine,replace:null});assert.equal(keep.ok,true,keep.error);
 const kept=keep.profile.roster[0];assert.deepEqual(kept.carry,inst.carry,'learn only: the carried list is unchanged');assert.ok(kept.learned.some(l=>l.move===machine));assert.equal(keep.profile.vault[machine],2,'one machine used');
 const swap=applyBase(profile,{type:'learn',inst:inst.id,move:machine,replace:inst.carry[1]});assert.equal(swap.ok,true,swap.error);
 const c=swap.profile.roster[0].carry;assert.equal(c.length,4);assert.equal(c[1],machine,'replaced in place');assert.ok(!c.includes(inst.carry[1]));
 assert.ok(swap.profile.roster[0].learned.some(l=>l.move===inst.carry[1]),'the replaced move is still learned');
 const bad=applyBase(profile,{type:'learn',inst:inst.id,move:machine,replace:'splash'});assert.equal(bad.ok,false);assert.match(bad.error,/没有消耗/);assert.deepEqual(profile.vault,{[machine]:3},'a refused learn spends nothing');
 // cancelling the window sends no action at all, so the profile is exactly as it was
 assert.deepEqual(profile.roster[0].carry,inst.carry);
 const plain=applyBase(profile,{type:'learn',inst:inst.id,move:machine});assert.equal(plain.ok,true);assert.deepEqual(plain.profile.roster[0].carry,inst.carry,'without a choice a full list is left as it was');
});
