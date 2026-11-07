/* Playtest round 3: ability values grow with level (main-series formula, IV/EV 0, neutral nature) and the damage rule and the details window read the same numbers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {currentStats,statAtLevel,hpAtLevel} from '../../src/core/stats.ts';
import {SPECIES,speciesMaxHp,bossMaxHp} from '../../src/core/roster.ts';
import {speciesUnit,estimateAttackDamage,damageStage,applyCommand,applyTalentBonus} from '../../src/core/engine.ts';
import {statSheet,moveBaseDamage,moveSummary} from '../../src/core/describe.ts';
import {moveOf} from '../../src/core/moves.ts';
import {world,pos,row} from '../acceptance/fixtures.mjs';

const BULB=SPECIES.bulbasaur.baseStats;   // hp 45, atk 49, def 49, spa 65, spd 65, spe 45
test('the formulas at Lv5 and Lv20 (literal values worked out by hand)',()=>{
 assert.deepEqual([statAtLevel(49,5),statAtLevel(49,20),statAtLevel(100,50)],[9,24,105]);   // floor(2*49*5/100)+5 = 4+5; floor(2*49*20/100)+5 = 19+5
 assert.deepEqual([hpAtLevel(45,5),hpAtLevel(45,20),hpAtLevel(90,22)],[19,48,71]);      // floor(2*45*5/100)+5+10 = 4+15; floor(18)+20+10; floor(39.6)+22+10
 assert.equal(speciesMaxHp('bulbasaur',5),19);assert.equal(speciesMaxHp('bulbasaur',20),48);
 assert.equal(speciesMaxHp('bulbasaur',20,0.4),Math.round(48*0.4),'multipliers (stamina talent, difficulty) apply after the formula');
 for(const level of [5,20,63]){
  const u=speciesUnit('A','bulbasaur',level),c=currentStats(u);
  assert.deepEqual(c,{atk:statAtLevel(BULB.atk,level),def:statAtLevel(BULB.def,level),spa:statAtLevel(BULB.spa,level),spd:statAtLevel(BULB.spd,level),spe:statAtLevel(BULB.spe,level)});
  assert.equal(u.maxHp,hpAtLevel(BULB.hp,level));assert.equal(u.hp,u.maxHp);
 }
 assert.equal(currentStats({}),null,'a unit without a species has no ability values');
});
test('boss HP keeps the fixed 7.7 rule: 53 / 75 / 105 at Lv22 (the new HP formula would give 71 x multiplier)',()=>{
 assert.deepEqual([0.28,0.56,0.4].map(d=>bossMaxHp('arcanine',22,4*d)),[53,105,75]);
 assert.equal(speciesMaxHp('arcanine',22),71);
});
function duel(attackerLevel,defenderLevel,{attacker='bulbasaur',defender='pidgey'}={}){
 const a=speciesUnit('A',attacker,attackerLevel,pos(1)),d=speciesUnit('T',defender,defenderLevel,pos(2));d.side='enemy';d.waitOnly=true;d.hp=d.maxHp=500;   // a large HP so the estimate (capped at the target's HP) shows the full damage
 
 a.learned=['tackle'];a.pp={tackle:5};a.maxPp={tackle:5};
 const s=world({A:a,T:d},{floor:row(6),leader:'A',queue:['A'],enemies:['T']});s.prog={level:attackerLevel,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0}};s.rooms=[{x:0,y:0,w:7,h:3}];
 return s;
}
test('the same species at a higher level hits harder and takes less, and has more HP',()=>{
 const low=estimateAttackDamage(duel(5,5),'A','T','tackle'),high=estimateAttackDamage(duel(20,5),'A','T','tackle');
 assert.ok(high>low,`Lv20 hits harder than Lv5: ${high} vs ${low}`);
 // the defender side: attacker fixed at Lv20 against a Lv5 or Lv20 pidgey (def 9 vs 21 for the ratio)
 const soft=estimateAttackDamage(duel(20,5),'A','T','tackle'),hard=estimateAttackDamage(duel(20,20),'A','T','tackle');
 assert.ok(hard<soft,`a Lv20 defender takes less than a Lv5 one: ${hard} vs ${soft}`);
 assert.ok(speciesMaxHp('pidgey',20)>speciesMaxHp('pidgey',5));
});
test('the details table shows the numbers the damage rule uses, and follows an ability stage change',()=>{
 const s=duel(20,5),a=s.units.A,rows=Object.fromEntries(statSheet(s,a).map(r=>[r.key,r]));
 const c=currentStats(a);
 for(const k of ['atk','def','spa','spd','spe'])assert.equal(rows[k].value,c[k],k+' in the table is currentStats');
 assert.equal(rows.hp.value,a.maxHp);assert.equal(rows.spe.doesNotAffectAction,true);assert.equal(rows.atk.base,BULB.atk);
 // a level change moves the table and the damage together
 const before=estimateAttackDamage(s,'A','T','tackle');
 a.level=50;a.maxHp=hpAtLevel(BULB.hp,50);s.prog.level=50;
 assert.equal(statSheet(s,a).find(r=>r.key==='atk').value,statAtLevel(BULB.atk,50));
 assert.ok(estimateAttackDamage(s,'A','T','tackle')>before,'the damage reads the same, raised number');
 // an attack stage is a flat adjustment: the table shows it and the damage changes by exactly that many points
 const s2=duel(20,5);const base=estimateAttackDamage(s2,'A','T','tackle');
 s2.units.A.stages.atk=2;assert.equal(statSheet(s2,s2.units.A).find(r=>r.key==='atk').stage,2);assert.equal(damageStage(s2,s2.units.A,'atk'),2);
 assert.equal(estimateAttackDamage(s2,'A','T','tackle')-base,2,'+2 attack = +2 damage');
 s2.units.A.stages.atk=0;s2.units.T.stages.def=1;assert.equal(statSheet(s2,s2.units.T).find(r=>r.key==='def').stage,1);
 assert.equal(base-estimateAttackDamage(s2,'A','T','tackle'),1,'+1 defence = -1 damage');
 // the hunter commission's penalty is part of the stage the details show
 s2.units.T.stages.def=0;const mate=s2.units.A;s2.commissions=[{id:'hunter',floor:1,acceptedRound:0,progress:0,progressTarget:3,speedLimit:null}];
 assert.equal(damageStage(s2,mate,'def'),-1);assert.equal(statSheet(s2,mate).find(r=>r.key==='def').stage,-1);
 assert.equal(moveBaseDamage(duel(5,5),duel(5,5).units.A,'tackle'),9,'Lv5 tackle: 6 + half of its power 6 + level bonus 0');
});
test('evolving recomputes ability values and max HP from the new species',()=>{
 const s=duel(20,5);const a=s.units.A;s.phase='evolution';s.pendingEvolutions=[{actor:'A',choices:['ivysaur']}];
 const before=currentStats(a),r=applyCommand(s,{type:'evolve',species:'ivysaur'});assert.equal(r.ok,true,r.error);
 const u=r.state.units.A,iv=SPECIES.ivysaur.baseStats;
 assert.equal(u.species,'ivysaur');assert.equal(u.maxHp,applyTalentBonus(hpAtLevel(iv.hp,20),0));
 assert.deepEqual(currentStats(u),{atk:statAtLevel(iv.atk,20),def:statAtLevel(iv.def,20),spa:statAtLevel(iv.spa,20),spd:statAtLevel(iv.spd,20),spe:statAtLevel(iv.spe,20)});
 assert.ok(currentStats(u).spa>before.spa&&u.maxHp>hpAtLevel(BULB.hp,20));
});
test('the fixed base-damage text and the details number agree: with the level it includes the level bonus, without it (camp) it says it does not',()=>{
 const s=duel(21,5),a=s.units.A;   // the run is Lv21: level bonus floor((21-5)/4) = 4
 assert.equal(moveBaseDamage(s,a,'tackle'),13,'6 + 3 + 4');
 assert.match(moveSummary('tackle',undefined,'friend',21),/造成13点基础伤害$/);
 assert.match(moveSummary('tackle',undefined,'friend'),/造成9点基础伤害（不含等级加成）$/);
 assert.match(moveSummary('tackle',undefined,'friend',5),/造成9点基础伤害$/);
 // Snore is not a plain damage move but the engine estimates it from the same base
 const snorer=speciesUnit('S','bulbasaur',5,pos(1));snorer.learned=['snore'];
 const s2=world({S:snorer},{floor:row(6),leader:'S',queue:['S'],enemies:[]});s2.prog={level:5,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0}};
 assert.equal(moveBaseDamage(s2,snorer,'snore'),6+Math.ceil(moveOf('snore').power/2));
});
