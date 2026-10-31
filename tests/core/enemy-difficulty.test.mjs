/* Stage 7.8 difficulty multiplier (https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/04-%E8%A7%84%E6%A0%BC/%E6%95%8C%E6%88%91%E5%AF%B9%E7%AD%89%E6%8B%9B%E5%BC%8F%E4%B8%8E%E5%BC%BA%E5%8C%96%E6%A8%A1%E5%9E%8B%E8%A7%84%E6%A0%BC.md section 5.1): ENEMY_DIFFICULTY = 0.5.
   It multiplies an enemy's max HP and every hit an enemy deals (rounded, at least 1); the player's hits are not multiplied.
   All expected values are written as literals worked out by hand. Units are Lv5 (no level bonus): tackle = 6 + ceil(6/2) = 9, basic attack = 6. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {speciesUnit,applyCommand} from '../../src/core/engine.ts';
import {generateFloor} from '../../src/core/dungeon.ts';
import {world,row} from '../acceptance/fixtures.mjs';
import {foeOf} from './foe-fixture.mjs';

const wait={type:'wait'};
const mate=(id,x,y,hp=40)=>{const u=speciesUnit(id,'bulbasaur',5,{x,y});u.hp=hp;u.maxHp=hp;u.learned=['tackle'];u.pp={tackle:5};u.maxPp={tackle:5};u.tactic='together';return u;};
const W=units=>{const list=Object.values(units);const s=world(units,{floor:row(12),leader:'A',queue:list.filter(u=>u.side==='friend').map(u=>u.id),enemies:list.filter(u=>u.side==='enemy').map(u=>u.id)});s.enemyAiRng=12345;return s;};
const round=(s,action=wait)=>{const r=applyCommand(s,{type:'round',action});assert.equal(r.ok,true,r.error);return r.state;};

test('difficulty: an enemy hit is multiplied by 0.5 and rounded (tackle 9 -> 5)',()=>{
 const s=round(W({A:mate('A',3,1),E:foeOf('E','geodude',4,1,40,{tackle:5})}));   // A waits, E tackles A
 assert.equal(s.units.A.hp,35,'40 - round(9 x 0.5) = 40 - 5');
});

test('difficulty: a rounded enemy hit never drops below 1 (basic 6 -> 3, minus defence stage 3 -> 0, floored to 1)',()=>{
 const a=mate('A',3,1);a.stages.def=3;
 const s=round(W({A:a,E:foeOf('E','geodude',4,1,40,{})}));   // E knows no move: it basic-attacks A
 assert.equal(s.units.A.hp,39,'a hit that would deal 0 after the multiplier and defence still deals 1');
});

test('difficulty: the player is not multiplied (basic 6, tackle 9)',()=>{
 const dummy=()=>{const e=foeOf('E','geodude',4,1,40);e.waitOnly=true;return e;};
 let s=round(W({A:mate('A',3,1),E:dummy()}),{type:'basic',target:'E'});
 assert.equal(s.units.E.hp,34,'40 - 6, not 40 - 3');
 s=round(W({A:mate('A',3,1),E:dummy()}),{type:'skill',skill:'tackle',target:'E'});
 assert.equal(s.units.E.hp,31,'40 - 9, not 40 - 5');
});

test('difficulty: enemy max HP is the roster value times 0.5; the boss also takes its hpMultiplier',()=>{
 const f=generateFloor(3,2);
 assert.deepEqual(f.enemies.map(e=>[e.species,e.level,e.hp]),[['lickitung',5,15],['lickitung',5,15],['sandshrew',5,11]],'roster Lv5 HP 30, 30, 22 -> 15, 15, 11');
 const b=generateFloor(7,3,{width:20,height:14,floors:3,boss:true}).enemies.find(e=>e.boss);
 assert.deepEqual([b.species,b.level,b.hp],['arcanine',22,71],'Lv22 HP 47 x hpMultiplier 3 x 0.5 = 70.5 -> 71');
});
