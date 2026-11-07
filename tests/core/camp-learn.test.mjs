/* Playtest round 2 #4: a technique machine used at camp puts the move on the carried list when there is room, so the player sees it in the run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition} from '../../src/core/engine.ts';
import {initialProfile,learnTm,applyBase,squadOf,MAX_CARRY} from '../../src/core/base.ts';
import {learnableMove} from '../../src/core/roster.ts';

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
test('learning with four carried moves: the player chooses a replacement, or learns without carrying',()=>{
 const inst=initialProfile().roster[0],move=learnableFor(inst.species);
 const full=initialProfile();const target=full.roster[0];
 const extra=['quickattack','tackle','ember','absorb'].filter(m=>learnableMove(target.species,m)).slice(0,4);
 target.learned=extra.map(m=>learnableMove(target.species,m));target.carry=[...extra];
 if(target.carry.length<MAX_CARRY){console.log('species has fewer than four candidate moves; skipped');return;}
 full.vault={[move]:2};
 const keep=applyBase(full,{type:'learn',inst:target.id,move,replace:null});assert.equal(keep.ok,true,keep.error);
 const kept=keep.profile.roster[0];assert.deepEqual(kept.carry,target.carry,'learn only: the carried list is unchanged');assert.ok(kept.learned.some(l=>l.move===move));
 const swap=applyBase(keep.profile,{type:'carry',inst:target.id,moves:target.carry});assert.equal(swap.ok,true);
 const full2=initialProfile();full2.roster[0]=structuredClone(target);full2.vault={[move]:1};
 const replaced=applyBase(full2,{type:'learn',inst:target.id,move,replace:target.carry[1]});assert.equal(replaced.ok,true,replaced.error);
 const c=replaced.profile.roster[0].carry;assert.equal(c.length,4);assert.equal(c[1],move,'replaced in place');assert.ok(!c.includes(target.carry[1]));
 const bad=applyBase(full2,{type:'learn',inst:target.id,move,replace:'splash'});assert.equal(bad.ok,false);
});
