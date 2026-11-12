/* PR 214 self-playtest: a partner with only a self-raising move (Withdraw) used it every round on an empty floor.
   G4.6: raising one's own stages is chosen only while an opponent is in the unit's sight. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {doCmd,friend,enemy,world,row,wait} from '../acceptance/fixtures.mjs';

const party=()=>{const A=friend('A',1,1,20,{tackle:5}),B=friend('B',2,1,20,{withdraw:5});A.species='bulbasaur';B.species='squirtle';return {A,B};};
const used=(s,id,move)=>s.log.some(l=>l.startsWith(id+'使用'+move)||l.includes(id)&&l.includes(move));

test('no opponent in sight: the partner does not raise its own stages',()=>{
 const {A,B}=party();const s=world({A,B},{floor:row(12),queue:['A','B']});
 const after=doCmd(s,{type:'round',action:wait});
 assert.equal(after.units.B.stages.def??0,0,'Withdraw was not used: '+after.log.join(' / '));
 assert.equal(after.units.B.pp.withdraw,5);
});

test('an opponent in sight: the partner may still raise its own stages',()=>{
 const {A,B}=party();const E=enemy('E',4,1,30,'melee',{waitOnly:true});
 const s=world({A,B,E},{floor:row(12),queue:['A','B'],enemies:['E']});
 const after=doCmd(s,{type:'round',action:wait});
 assert.ok((after.units.B.stages.def??0)>0,'Withdraw was used with an enemy in sight: '+after.log.join(' / '));
});
