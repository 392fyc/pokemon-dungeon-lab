import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateFloor,THEME_FLOORS,themeCandidates,eligibleSpecies,WILD_SPECIES,BOSS,BOSS_CONFIG,streamSeed} from '../../src/core/dungeon.ts';
import {SPECIES} from '../../src/core/roster.ts';

test('7.8 boss.json has exactly the four typed modifiers and only roster species',()=>{
 const data=JSON.parse(readFileSync(new URL('../../src/data/boss.json',import.meta.url),'utf8'));
 for(const [id,row] of Object.entries(data.bosses)){
  assert.ok(SPECIES[id]);assert.deepEqual(Object.keys(row).sort(),['canBeBlownAway','canMove','hpMultiplier','levelBonus']);
  assert.ok(Number.isInteger(row.levelBonus)&&row.levelBonus>=0);
  assert.ok(typeof row.hpMultiplier==='number'&&Number.isFinite(row.hpMultiplier)&&row.hpMultiplier>0);
  assert.equal(typeof row.canMove,'boolean');assert.equal(typeof row.canBeBlownAway,'boolean');
 }
 assert.deepEqual(Object.keys(BOSS).sort(),['id','species']);
});

test('7.8 first-type themes exclude unavailable and legendary species, then filter evolution level',()=>{
 const typeSets=[['Normal','Grass','Bug','Rock','Ground','Flying'],['Water','Ice','Electric','Poison','Psychic','Fairy'],['Fire','Fighting','Dark','Ghost','Dragon','Steel']];
 const limits=[6,11,20];
 for(let i=0;i<3;i++){
  const all=Object.values(SPECIES).filter(s=>!s.legendary&&s.availability!=='暂不出场'&&typeSets[i].includes(s.types[0]));
  const eligible=all.filter(s=>s.evoLevel<=limits[i]).map(s=>s.id);
  assert.deepEqual(themeCandidates(THEME_FLOORS[i].theme),all);
  assert.deepEqual(eligibleSpecies(i+1),eligible);assert.ok(eligible.length>0);
 }
 assert.deepEqual(THEME_FLOORS.map(t=>themeCandidates(t.theme).length),[66,65,34]);
 assert.deepEqual([1,2,3].map(l=>eligibleSpecies(l).length),[36,29,21]);
 assert.ok(eligibleSpecies(3).includes('arcanine'));
 assert.equal(eligibleSpecies(1).includes('ivysaur'),false);
 for(const id of ['mew','mewtwo','articuno','zapdos','moltres','magikarp','metapod','kakuna','abra','ditto'])assert.equal(id in WILD_SPECIES,false,id);
});

test('7.8 independent streams, three enemies per floor, level bands and boss HP are deterministic',()=>{
 assert.deepEqual(['enemy-ai','enemy-level','enemy-species'].map(t=>streamSeed(12345,1,t)),[2257267927,3144851047,3858705323]);
 const bands=[[5,6],[8,11],[12,20]];
 for(let seed=1;seed<=30;seed++)for(let level=1;level<=3;level++){
  const params={width:20,height:14,floors:3,boss:true},g=generateFloor(seed,level,params);
  assert.deepEqual(g,generateFloor(seed,level,params));
  const ordinary=g.enemies.filter(e=>!e.boss);assert.equal(ordinary.length,3);
  for(const e of ordinary){
   const sp=SPECIES[e.species];assert.ok(eligibleSpecies(level).includes(e.species));
   assert.ok(e.level>=Math.max(bands[level-1][0],sp.evoLevel)&&e.level<=bands[level-1][1]);
   assert.equal(e.hp,Math.round((sp.maxHp+Math.max(0,e.level-5))*0.5)); // difficulty multiplier 0.5
   assert.equal(typeof e.asleep,'boolean');
  }
  assert.equal(g.enemyAiRng,(streamSeed(seed,level,'enemy-ai')+3*0x6D2B79F5)>>>0);
  if(level===3){const boss=g.enemies.find(e=>e.boss);assert.equal(boss.level,22);assert.equal(boss.hp,71);assert.equal(boss.asleep,false);assert.equal(BOSS_CONFIG.arcanine.canMove,false);}
 }
});
