import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,estimateAttackDamage,speciesUnit} from '../../src/core/engine.ts';
import {world,row} from '../acceptance/fixtures.mjs';

// Literal results from #112's approved examples, never derived with the production calculator.
function duel(attacker,defender,{side='friend',level=5,move='tackle'}={}){
 const a=speciesUnit('A',attacker,level,{x:2,y:1});
 const d=speciesUnit('D',defender,5,{x:3,y:1});
 a.side=side;d.side=side==='friend'?'enemy':'friend';
 for(const u of [a,d]){u.hp=200;u.maxHp=200;u.tactic='gofoes';u.learned=[];u.pp={};u.maxPp={};}
 if(move){a.learned=[move];a.pp={[move]:5};a.maxPp={[move]:5};}
 d.waitOnly=true;
 const s=world({A:a,D:d},{floor:row(8),leader:side==='friend'?'A':'D',queue:[side==='friend'?'A':'D'],enemies:[side==='friend'?'D':'A']});
 s.enemyAiRng=12345;
 return s;
}
function strike(s,move){
 const before=structuredClone(s);
 const action=s.units.A.side==='enemy'?{type:'wait'}:move?{type:'skill',skill:move,target:'D'}:{type:'basic',target:'D'};
 const result=applyCommand(s,{type:'round',action});
 assert.equal(result.ok,true,result.error);assert.deepEqual(s,before,'damage preview/resolution must not mutate the input');
 return result.state;
}
for(const [attacker,defender,move,level,friendDamage,enemyDamage] of [
 ['mudkip','pidgey','tackle',5,16,8], // round(9*70/40)=16, then enemy round(16*.5)=8
 ['pidgey','mudkip','tackle',5,8,4], // round(9*45/50)=8
 ['charmander','squirtle','ember',5,9,5], // round(10*60/64)=9, then round(9*.5)=5
 ['arcanine','mudkip','bite',22,28,14], // (10+4)*clamp(110/50)=28
 ['mudkip','arcanine','tackle',5,8,4], // round(9*70/80)=8
 ['treecko','arcanine','tackle',5,5,3], // round(9*.6)=5
])for(const [side,expected] of [['friend',friendDamage],['enemy',enemyDamage]]){
 test(`#112 ${attacker} -> ${defender}, ${move}, Lv${level}, ${side}: ${expected}`,()=>{
  const s=duel(attacker,defender,{side,level,move});
  if(attacker==='arcanine')s.units.A.boss=true;
  if(defender==='arcanine')s.units.D.boss=true;
  assert.equal(estimateAttackDamage(s,'A','D',move),expected);
  const after=strike(s,move);
  assert.equal(after.units.A.lastMove,move);
  assert.equal(200-after.units.D.hp,expected);
 });
}

test('#112 普攻采用较高攻击对应的防御，相等时物理',()=>{
 for(const [attacker,defender,expected] of [
  ['mudkip','pidgey',11], // round(6*70/40)=11, Physical
  ['bulbasaur','geodude',12], // spa65 > atk49; 65/spd30 reaches the upper clamp
  ['pikachu','squirtle',5], // atk55 > spa50; round(6*55/65)=5
  ['pidgey','squirtle',4], // atk45 > spa35; round(6*45/65)=4
  ['mew','geodude',6], // atk=spa=100; def100 (not spd30)
 ]){
  const s=duel(attacker,defender,{move:null});
  assert.equal(estimateAttackDamage(s,'A','D'),expected,attacker);
  assert.equal(200-strike(s).units.D.hp,expected,attacker);
 }
});

test('#112 任一方无物种时比例为1，缺目标用于普通目标说明',()=>{
 for(const missing of ['A','D']){
  const s=duel('mudkip','pidgey');delete s.units[missing].species;
  assert.equal(estimateAttackDamage(s,'A','D','tackle'),9);
  assert.equal(200-strike(s,'tackle').units.D.hp,9);
 }
 assert.equal(estimateAttackDamage(duel('mudkip','pidgey'),'A',undefined,'tackle'),9);
});

test('#112 比例取整后乘难度，再处理阶段、屏障与反击；AI估算与实际一致',()=>{
 const s=duel('mudkip','pidgey',{side:'enemy'});
 s.units.A.stages.atk=2;s.units.D.stages.def=1;s.units.D.reflect=3;s.units.D.counter=3;
 // round(9*1.75)=16; round(16*.5)=8; +2-1=9; floor(9/2)=4.
 assert.equal(estimateAttackDamage(s,'A','D','tackle'),4);
 const after=strike(s,'tackle');
 assert.equal(after.units.D.hp,196);assert.equal(after.units.A.hp,196,'counter reflects actual lost HP');
 const guarded=structuredClone(s);guarded.units.D.protect=3;
 assert.equal(estimateAttackDamage(guarded,'A','D','tackle'),0);
 assert.equal(strike(guarded,'tackle').units.D.hp,200);
});

test('#112 自动选招比较物理和特殊的实际伤害',()=>{
 const s=duel('bulbasaur','geodude',{side:'enemy'});
 s.units.A.learned=['tackle','absorb'];s.units.A.pp={tackle:5,absorb:5};s.units.A.maxPp={...s.units.A.pp};
 // Physical: round(9*.6)=5 -> 3; Special: round(7*2)=14 -> 7.
 assert.equal(estimateAttackDamage(s,'A','D','tackle'),3);
 assert.equal(estimateAttackDamage(s,'A','D','absorb'),7);
 const after=strike(s);
 assert.equal(after.units.A.lastMove,'absorb');
 assert.equal(after.units.D.hp,193);
});
