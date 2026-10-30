import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TM_MOVES} from '../../src/core/roster.ts';

/* Stage 7.7 regression checks: the first-batch definitions remain frozen while the expanded Pokédex adds more move rows. */
const data=JSON.parse(fs.readFileSync(new URL('../../src/data/pmd-moves.json',import.meta.url),'utf8'));
const roster=JSON.parse(fs.readFileSync(new URL('../../src/data/roster.json',import.meta.url),'utf8'));
const species=Array.isArray(roster)?roster:roster.species;

// [range, target, power (null when the move deals no damage), effects]
const SPEC={
 bite:['front','enemy',7,['damage']],poisonfang:['front','enemy',10,['damage']],pound:['front','enemy',6,['damage']],
 pursuit:['user','user',null,['counter']],quickattack:['front2','enemy',4,['damage']],scratch:['front','enemy',6,['damage']],
 slam:['front','enemy',16,['damage']],tackle:['front','enemy',6,['damage']],absorb:['front','enemy',1,['damage','drain']],
 ember:['front','enemy',7,['damage']],gust:['front','enemy',4,['damage']],magicalleaf:['front','enemy',12,['damage']],
 seedbomb:['front','enemy',16,['damage']],thundershock:['front','enemy',1,['damage']],watergun:['front','enemy',5,['damage']],
 mudslap:['front','enemy',4,['damage']],leafage:['front','enemy',6,['damage']],terablast:['front','enemy',12,['damage']],
 defensecurl:['user','user',null,['stage:def:+1']],harden:['user','user',null,['stage:def:+1']],protect:['user','user',null,['protect']],
 helpinghand:['room','teammates',null,['stage:atk:+1']],roar:['front','enemy',null,['blowaway']],whirlwind:['front','enemy',null,['blowaway']],
 dragontail:['front','enemy',3,['damage','blowaway']],
};
// Spec section 4 "本作伤害" column: 6 + ceil(power / 2).
const DAMAGE={bite:10,poisonfang:11,pound:9,quickattack:8,scratch:9,slam:14,tackle:9,absorb:7,ember:10,gust:8,magicalleaf:12,seedbomb:14,thundershock:7,watergun:9,mudslap:8,leafage:9,terablast:12,dragontail:8};

test('S77 pmd-moves.json covers every current kit and machine move and retains all 25 first-batch entries',()=>{
 const used=new Set([...species.flatMap(s=>s.kit.map(k=>k.move)),...TM_MOVES]);
 for(const id of used)assert.ok(Object.hasOwn(data.moves,id),`missing current move ${id}`);
 for(const id of Object.keys(SPEC))assert.ok(Object.hasOwn(data.moves,id),`missing first-batch move ${id}`);
});

test('S77 every first-batch move matches the spec table (range, target, power, effects) and the damage column',()=>{
 for(const [id,[range,target,power,effects]] of Object.entries(SPEC)){
  const m=data.moves[id];
  assert.equal(m.range,range,`${id} range`);assert.equal(m.target,target,`${id} target`);
  assert.equal(m.power,power,`${id} power`);assert.deepEqual(m.effects,effects,`${id} effects`);
  if(power!==null)assert.equal(6+Math.ceil(power/2),DAMAGE[id],`${id} damage`);
 }
});

test('S77 sources: Explorers data first, Gates to Infinity only where Explorers has no entry, self-defined moves say so',()=>{
 for(const id of Object.keys(SPEC)){
  const m=data.moves[id];
  if(id==='leafage'||id==='terablast'){assert.equal(m.source,'本作自定');assert.equal(m.game,null);assert.ok(m.note.length>0);continue;}
  assert.equal(m.source,'Bulbapedia');
  assert.equal(m.game,id==='dragontail'?'MDGtI':'MDTDS',`${id} game`);
 }
});
