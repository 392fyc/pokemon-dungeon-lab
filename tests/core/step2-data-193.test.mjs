import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {movesAtLevel,TM_MOVES,TM_MOVES_V3,TM_MOVES_V4,TM_MOVES_V5,LEGACY_TM_MOVES,tmPool} from '../../src/core/roster.ts';
import {moveType,typeEffectiveness,stabMultiplier} from '../../src/core/type-chart.ts';

const readJson=(path)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const roster=readJson('../../src/data/roster.json');
const moveSpecs=readJson('../../src/data/pmd-moves.json').moves;
const moveEffects=readJson('../../src/data/move-effects.json').moves;
const names=readJson('../../src/data/names-zh.json');
const chart=readJson('../../src/data/type-chart.json');

test('fixed source and generated roster contain modern 18-type and level-up data',()=>{
  assert.equal(roster.species.length,175);
  assert.equal(roster.source.files['typechart.ts'],'7b0eae126bdcf98edfd71cbe75af00b763f5f0d5db36024b6f3e7c5e4aea95ac');
  assert.equal(chart.source.githubCommit,'ccfaa20f32af363569cd21a9d501b2bc1ded26b1');
  assert.equal(chart.source.sha256,'7b0eae126bdcf98edfd71cbe75af00b763f5f0d5db36024b6f3e7c5e4aea95ac');
  assert.equal(chart.types.length,18);
  assert.equal(Object.keys(chart.effectiveness).length,18);
  for(const row of Object.values(chart.effectiveness))assert.equal(Object.keys(row).length,18);
  assert.ok(Object.hasOwn(chart.effectiveness,'Fairy'));
  assert.ok(Object.hasOwn(chart.effectiveness,'Dark'));
  assert.ok(roster.species.some(s=>s.levelUp.some(m=>m.level===0)),'level 0 evolution moves are preserved');
  for(const s of roster.species){
    assert.ok(Array.isArray(s.levelUp),s.id);
    for(const entry of s.levelUp){
      assert.ok(Number.isInteger(entry.level)&&entry.level>=0&&entry.level!==1,String(s.id)+' '+entry.move+' level '+entry.level);
      assert.ok(Number.isInteger(entry.pp)&&entry.pp>0,String(s.id)+' '+entry.move+' PP');
      assert.ok(s.learnable.some(m=>m.move===entry.move&&m.pp===entry.pp),String(s.id)+' '+entry.move+' is not an implemented learnable move');
    }
  }
});

test('type helpers apply weakness, resistance, immunity, dual type and STAB',()=>{
  assert.equal(moveType('thundershock'),'Electric');
  assert.equal(moveType('no-such-move'),undefined);
  assert.equal(typeEffectiveness('thundershock',['Ground']),0);
  assert.equal(typeEffectiveness('leafage',['Water','Ground']),4);
  assert.equal(typeEffectiveness('leafage',['Water','Dragon']),1);
  assert.equal(typeEffectiveness('no-such-move',['Water']),1);
  assert.equal(typeEffectiveness('thundershock',['not-a-type']),1);
  assert.equal(stabMultiplier('leafage',['Grass','Poison']),1.5);
  assert.equal(stabMultiplier('leafage',['Water']),1);
  assert.equal(stabMultiplier('no-such-move',['Grass']),1);
});

test('sleep admission uses fixed Explorers PP, accuracy, range and effect rows',()=>{
  const expected={
    hypnosis:[13,'88%','front','enemy','status:slp'],
    sleeppowder:[13,'80%','around','enemy','status:slp'],
    sing:[13,'87%','front','enemy','status:slp'],
    spore:[12,'88%','room','enemy','status:slp'],
    lovelykiss:[11,'88%','around','enemy','status:slp'],
    rest:[8,'—%','user','user','rest'],
    snore:[16,'95%','front','enemy','snore'],
    sleeptalk:[17,'—%','user','user','sleeptalk'],
  };
  for(const [id,[pp,accuracy,range,target,effect]] of Object.entries(expected)){
    const row=moveSpecs[id];
    assert.ok(row,id);
    assert.equal(Number(row.official.basePp),pp,id);
    assert.equal(row.official.accuracy,accuracy,id);
    assert.equal(row.range,range,id);
    assert.equal(row.target,target,id);
    assert.deepEqual(row.effects,[effect],id);
  }
  assert.equal(moveSpecs.snore.power,4);
  assert.equal(moveEffects.sleeppowder.powder,true);
  assert.equal(moveEffects.spore.powder,true);
  assert.equal(moveEffects.poisonpowder.powder,true);
  assert.equal(moveEffects.stunspore.powder,true);
  assert.equal(names.items.rawstBerry,'莓莓果');
  assert.equal(names.items.cheriBerry,'樱子果');
  assert.equal(names.items.chestoBerry,'零余果');
  for(const id of ['rest','sleeptalk'])assert.ok(names.tms[id],id+' TM label');
  for(const id of Object.keys(expected))assert.ok(names.moves[id],id+' move label');
});

test('movesAtLevel takes the latest four distinct learned moves and prepends kit fillers',()=>{
  assert.deepEqual(movesAtLevel('bulbasaur',16),[
    {move:'vinewhip',pp:15},{move:'razorleaf',pp:12},{move:'poisonpowder',pp:22},{move:'sleeppowder',pp:13},
  ]);
  assert.deepEqual(movesAtLevel('rattata',10),[
    {move:'tackle',pp:30},{move:'quickattack',pp:13},{move:'bite',pp:19},
  ]);
  assert.deepEqual(movesAtLevel('not-a-species',50),[]);
});

test('TM pool 5 adds only Rest and Sleep Talk while old pools keep their saved order',()=>{
  assert.deepEqual(TM_MOVES_V5,[...TM_MOVES_V4,'rest','sleeptalk']);
  assert.deepEqual(TM_MOVES_V4,[...TM_MOVES_V3,'calmmind','toxic','bulkup','willowisp','thunderwave','swordsdance']);
  assert.equal(TM_MOVES.length,6);
  assert.equal(LEGACY_TM_MOVES.length,3);
  assert.deepEqual(tmPool({boss:true}),TM_MOVES);
  assert.deepEqual(tmPool({boss:true,tmPool:3}),TM_MOVES_V3);
  assert.deepEqual(tmPool({boss:true,tmPool:4}),TM_MOVES_V4);
  assert.deepEqual(tmPool({boss:true,tmPool:5}),TM_MOVES_V5);
  assert.deepEqual(tmPool({boss:false,tmPool:5}),LEGACY_TM_MOVES);
});
