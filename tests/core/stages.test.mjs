/* Ability stages follow the Mystery Dungeon table (Bulbapedia "Stat (Mystery Dungeon)"): -10...+10 for attack, special attack, defence and special defence, multipliers in 256ths, applied outside the 0.5-2 stat-ratio clamp. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {attackStageMultiplier,defenceStageMultiplier,damageStage,estimateAttackDamage,applyCommand,createExpedition,jumpToFloor,speciesUnit,STAGE_LIMIT} from '../../src/core/engine.ts';
import {initialProfile,squadOf} from '../../src/core/base.ts';
import {world,pos,row} from '../acceptance/fixtures.mjs';

const ATK=[128,133,138,143,148,153,161,171,179,204,256,307,332,358,384,409,422,435,448,460,473];
const DEF=[7,12,25,38,51,64,76,102,128,179,256,332,409,486,537,588,640,691,742,793,844];
test('every stage multiplier matches the table, and the range is -10...+10',()=>{
 assert.equal(STAGE_LIMIT,10);
 for(let stage=-10;stage<=10;stage++){
  assert.equal(attackStageMultiplier(stage),ATK[stage+10]/256,'attack stage '+stage);
  assert.equal(defenceStageMultiplier(stage),DEF[stage+10]/256,'defence stage '+stage);
 }
 assert.equal(attackStageMultiplier(0),1);assert.equal(defenceStageMultiplier(0),1);
 assert.equal(attackStageMultiplier(11),473/256,'beyond +10 is held at +10');assert.equal(defenceStageMultiplier(-12),7/256);
});
function duel({atk=0,def=0,crit=false}={}){
 const a=speciesUnit('A','mudkip',5,pos(1)),t=speciesUnit('T','pidgey',5,pos(2));t.side='enemy';t.waitOnly=true;t.hp=t.maxHp=500;   // Lv5: attack 12 against defence 9
 a.learned=['tackle'];a.pp={tackle:5};a.maxPp={tackle:5};a.stages.atk=atk;t.stages.def=def;
 const s=world({A:a,T:t},{floor:row(6),leader:'A',queue:['A'],enemies:['T']});s.prog={level:5,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0}};s.rooms=[{x:0,y:0,w:7,h:3}];
 return s;
}
const hit=s=>estimateAttackDamage(s,'A','T','tackle');
test('no stage: tackle 9 x (12/9) = 12; Sword Dance twice (+4) makes the attack x1.5 (384/256)',()=>{
 assert.equal(hit(duel()),12);
 assert.equal(hit(duel({atk:4})),18,'12 x 1.5');
 assert.equal(hit(duel({atk:-10})),Math.round(9*(12/9)*128/256),'-10 attack halves');
});
test('defence -10 leaves 3% of the defence: the damage grows about 36 times; +10 divides it by 3.3',()=>{
 assert.equal(defenceStageMultiplier(-10).toFixed(3),'0.027');
 assert.equal(hit(duel({def:-10})),Math.round(9*(12/9)*256/7),'439');
 assert.equal(hit(duel({def:10})),Math.round(9*(12/9)*256/844),'a +10 defence cuts it to 4');
});
test('the stage multiplier sits outside the 0.5-2 ratio clamp, so a boost is not eaten by it',()=>{
 const a=speciesUnit('A','arcanine',22,pos(1)),t=speciesUnit('T','pidgey',5,pos(2));   // attack 53 against defence 9: the ratio is clamped to 2
 const mk=atk=>{const u=structuredClone(a);u.stages.atk=atk;u.learned=['tackle'];u.pp={tackle:5};u.maxPp={tackle:5};t.side='enemy';t.waitOnly=true;t.hp=t.maxHp=900;
  const s=world({A:u,T:t},{floor:row(6),leader:'A',queue:['A'],enemies:['T']});s.prog={level:22,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0}};s.rooms=[{x:0,y:0,w:7,h:3}];return s;};
 assert.equal(estimateAttackDamage(mk(0),'A','T','tackle'),26,'tackle 9 + level bonus 4 = 13, ratio clamped to 2');
 assert.equal(estimateAttackDamage(mk(4),'A','T','tackle'),39,'13 x 2 x 1.5: the +4 is not cut by the clamp');
});
test('a move changes a stage by its own amount up to +10; accuracy keeps its +-3 limit',()=>{
 const s=duel();s.units.A.learned=['swordsdance'];s.units.A.pp={swordsdance:20};s.units.A.maxPp={swordsdance:20};
 let cur=s;for(let i=0;i<7;i++){const r=applyCommand(cur,{type:'round',action:{type:'skill',skill:'swordsdance',target:'A'}});assert.equal(r.ok,true,r.error);cur=r.state;}
 assert.equal(cur.units.A.stages.atk,10,'+2 seven times is held at +10');
});
test('a floor change clears every stage; the hunter commission lowers defence by one stage on the table',()=>{
 const s=createExpedition('stages-floor',5,3,squadOf(initialProfile()),0,true,3);
 s.units.A.stages.atk=7;s.units.A.stages.def=-4;s.units.B.stages.spd=5;
 const next=jumpToFloor(s,2);
 for(const id of next.queue)for(const k of ['atk','def','spa','spd'])assert.equal(damageStage(next,next.units[id],k),0,id+' '+k);
 const w=duel();w.commissions=[{id:'hunter',floor:1,acceptedRound:0,progress:0,progressTarget:3,speedLimit:null}];
 assert.equal(damageStage(w,w.units.A,'def'),-1);
});
