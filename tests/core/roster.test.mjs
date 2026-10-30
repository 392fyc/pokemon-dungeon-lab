import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const roster=JSON.parse(readFileSync(new URL('../../src/data/roster.json',import.meta.url),'utf8'));
const by=Object.fromEntries(roster.species.map(s=>[s.id,s]));
const MOVES=JSON.parse(readFileSync(new URL('../../src/data/pmd-moves.json',import.meta.url),'utf8')).moves;
const ids=['bulbasaur','charmander','squirtle','pidgey','rattata','spearow','pikachu','zubat','geodude','chikorita','cyndaquil','totodile','treecko','torchic','mudkip']; // stage 7.1 appended the six generation 2-3 starters after the original nine
const dexes=['0001','0004','0007','0016','0019','0021','0025','0041','0074','0152','0155','0158','0252','0255','0258'];
const established23=[...ids,'sandshrew','growlithe','magnemite','onix','dratini','wooper','houndour','makuhita'];
const establishedDexes=[...dexes,'0027','0058','0081','0095','0147','0194','0228','0296'];

test('R1 the expanded roster retains the established 23-species prefix and the same starters',()=>{
 assert.equal(roster.species.length,160);
 assert.deepEqual(roster.species.slice(0,23).map(s=>s.id),established23);
 assert.deepEqual(roster.species.slice(0,23).map(s=>s.dex),establishedDexes);
 assert.equal(new Set(roster.species.map(s=>s.id)).size,160);
 assert.equal(new Set(roster.species.map(s=>s.dex)).size,160);
 for(const s of roster.species)assert.match(s.dex,/^\d{4}$/);
 assert.deepEqual(roster.species.filter(s=>s.starter).map(s=>s.id),['bulbasaur','charmander','squirtle','chikorita','cyndaquil','totodile','treecko','torchic','mudkip']);
 assert.deepEqual(roster.source.files['moves.json'],'26909a321a7e4528d14a7dffd24173aa03a6845776cf41c39cc3d76f8e14616b');
 assert.equal(roster.source.githubCommit,'ccfaa20f32af363569cd21a9d501b2bc1ded26b1');
});

// Literal expectations worked out by hand from the Showdown JSON (maxHp = 12 + floor(hp / 5)).
test('R2 maxHp and base stats match hand-computed values',()=>{
 assert.equal(by.bulbasaur.maxHp,21);   // hp 45
 assert.equal(by.charmander.maxHp,19);  // hp 39
 assert.equal(by.rattata.maxHp,18);     // hp 30
 assert.equal(by.pikachu.maxHp,19);     // hp 35
 assert.deepEqual(by.geodude.baseStats,{hp:40,atk:80,def:100,spa:30,spd:30,spe:20});
 assert.deepEqual(by.zubat.types,['Poison','Flying']);
});

test('R3 kits for specific species',()=>{
 // Bulbasaur: tackle (35 PP -> 3) at 9L1, seedbomb (15 PP -> 1), a no-contact attack.
 assert.deepEqual(by.bulbasaur.kit,[{move:'tackle',pp:3},{move:'seedbomb',pp:1}]);
 // Geodude: tackle 9L1 and defensecurl 9L1 (40 PP -> 4) give strong + guard (same level: strong listed first).
 assert.deepEqual(by.geodude.kit,[{move:'tackle',pp:3},{move:'defensecurl',pp:4}]);
 // Zubat (generation 8): absorb 8L1 (25 PP -> 2, bp 20, no contact), poisonfang 8L15 (15 PP -> 1).
 assert.deepEqual(by.zubat.kit,[{move:'absorb',pp:2},{move:'poisonfang',pp:1}]);
 // Rattata has only contact attacks by level-up in generation 7: one behavior.
 assert.deepEqual(by.rattata.kit,[{move:'tackle',pp:3}]);
});

test('R4 learnable mapping of specific moves',()=>{
 const find=(id,move)=>by[id].learnable.find(e=>e.move===move);
 assert.deepEqual(find('geodude','protect'),{move:'protect',pp:1});
 assert.deepEqual(find('charmander','roar'),{move:'roar',pp:2});
 assert.deepEqual(find('charmander','dragontail'),{move:'dragontail',pp:1});
 assert.deepEqual(find('pidgey','whirlwind'),{move:'whirlwind',pp:2});
 assert.deepEqual(find('pikachu','thundershock'),{move:'thundershock',pp:3});
 assert.equal(find('bulbasaur','growl'),undefined); // Status move outside the override tables is unmapped
 assert.equal(find('rattata','superfang'),undefined); // basePower 0
});

test('R5 every kit holds at most two distinct legal moves and PP within 1-4; unavailable catalog entries may have no kit',()=>{
 for(const s of roster.species){
  const min=s.availability==='暂不出场'?0:1;
  assert.ok(s.kit.length>=min&&s.kit.length<=2,s.id);
  assert.equal(new Set(s.kit.map(k=>k.move)).size,s.kit.length,s.id);
  for(const k of [...s.kit,...s.learnable]){
   assert.ok(Object.hasOwn(MOVES,k.move),`${s.id} ${k.move}`);
   assert.ok(Number.isInteger(k.pp)&&k.pp>=1&&k.pp<=4,`${s.id} ${k.move}`);
  }
  for(const k of s.kit)assert.ok(s.learnable.some(e=>e.move===k.move&&e.pp===k.pp),`${s.id} kit ${k.move} not learnable`);
 }
});
