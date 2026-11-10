/* Playtest round 4: no explanatory sentences on screen. The player log drops rule explanations, move cards say only what is not the default, status moves show their effect. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {moveRangeTag,moveShortEffect,moveSummary} from '../../src/core/describe.ts';

test('the engine writes no explanation when a room is entered; each choice leaves one short line of what happened',async()=>{
 const {createExpedition,applyCommand}=await import('../../src/core/engine.ts');
 const {initialProfile,squadOf}=await import('../../src/core/base.ts');
 const s=createExpedition('log-r6',5,3,squadOf(initialProfile()),0,true,3);
 for(const type of ['commission','blessing']){
  const w=structuredClone(s);const room=w.adventureRooms.find(r=>r.type===type);w.units[w.leader].pos={...room.interaction};for(const id of w.enemies)w.units[id].waitOnly=true;
  const r=applyCommand(w,{type:'round',action:{type:'interact',exit:false}});assert.equal(r.ok,true,r.error);
  assert.ok(!r.state.log.some(l=>/祝福房提供|委托房提出|三选一|也可放弃/.test(l)),type+': no line explaining the room: '+JSON.stringify(r.state.log.slice(-4)));
  if(type==='blessing'){
   const ok=applyCommand(r.state,{type:'blessingChoice',blessing:r.state.pendingChoices[0].options[0]});assert.match(ok.state.log.at(-1)+ok.state.log.at(-2),/获得祝福：[^。，]+$/m);assert.ok(!ok.state.log.some(l=>/获得祝福：.*。/.test(l)),'no effect sentence after the name');
   const skip=applyCommand(r.state,{type:'blessingChoice',blessing:null});assert.ok(skip.state.log.includes('放弃祝福'));
  }else{
   const yes=applyCommand(r.state,{type:'commissionChoice',choice:'accept'});assert.ok(yes.state.log.some(l=>/^接下委托：/.test(l)));
   const no=applyCommand(r.state,{type:'commissionChoice',choice:'reject'});assert.ok(no.state.log.includes('拒绝委托'));
  }
 }
});
test('range tags only for a non-default reach',()=>{
 assert.equal(moveRangeTag('tackle'),'','an adjacent single target says nothing');
 assert.equal(moveRangeTag('swordsdance'),'','self says nothing');
 assert.equal(moveRangeTag('thunderbolt'),'周围');assert.equal(moveRangeTag('growl'),'同房间');
 assert.doesNotMatch(moveSummary('tackle'),/相邻|斜向/);
});
test('a status move shows its effect, a damage move shows none',()=>{
 assert.equal(moveShortEffect('swordsdance'),'攻击 +2');assert.equal(moveShortEffect('growl'),'对手攻击 -1');
 assert.equal(moveShortEffect('sleeppowder'),'使对手睡眠');assert.equal(moveShortEffect('protect'),'守住');assert.equal(moveShortEffect('synthesis'),'回复一半 HP');
 assert.equal(moveShortEffect('tackle'),'');assert.equal(moveShortEffect('thunderbolt'),'');
});
test('card range text and effect tags (playtest 1110)',async()=>{
 const {moveRangeText,moveEffectTag}=await import('../../src/core/describe.ts');
 assert.deepEqual(['tackle','quickattack','aurasphere','thunderbolt','growl','swordsdance'].map(moveRangeText),['射程 1','射程 1–2','直线 10','周围 1','同房间','自身']);
 assert.equal(moveEffectTag('tackle'),'');
 assert.equal(moveEffectTag('fakeout'),'畏缩');assert.equal(moveEffectTag('swordsdance'),'攻击↑');assert.equal(moveEffectTag('growl'),'攻击↓');
 assert.equal(moveEffectTag('closecombat'),'自身防御↓、自身特防↓');assert.equal(moveEffectTag('sleeppowder'),'睡眠');assert.equal(moveEffectTag('drainpunch'),'吸取');
});
