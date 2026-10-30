import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateFloor,mulberry32,WILD_SPECIES} from '../../src/core/dungeon.ts';
const roster=JSON.parse(readFileSync(new URL('../../src/data/roster.json',import.meta.url),'utf8'));
const k=p=>p.x+','+p.y;
// Independent flood fill: every floor cell must be reachable from the first one.
function connected(cells){
 const set=new Set(cells.map(k)),seen=new Set([k(cells[0])]),q=[cells[0]];
 for(let i=0;i<q.length;i++)for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const c={x:q[i].x+dx,y:q[i].y+dy};if(set.has(k(c))&&!seen.has(k(c))){seen.add(k(c));q.push(c);}}
 return seen.size===set.size;
}
test('D1 mulberry32 is deterministic and in [0,1)',()=>{
 const a=mulberry32(7),b=mulberry32(7),xs=[a(),a(),a()];
 assert.deepEqual(xs,[b(),b(),b()]);
 assert.ok(xs.every(x=>x>=0&&x<1));const c=mulberry32(8);assert.notDeepEqual(xs,[c(),c(),c()]);
});
test('D2 same seed and level give identical floors, whatever was generated before',()=>{
 const first=JSON.stringify(generateFloor(12345,2));
 generateFloor(12345,1);generateFloor(99,2);
 assert.equal(JSON.stringify(generateFloor(12345,2)),first);
});
test('D3 pinned regression values for seed 12345 (observed once, then frozen)',()=>{
 const g=generateFloor(12345,1);
 assert.equal(g.floor.length,118);assert.equal(g.rooms.length,7);
 assert.deepEqual(g.points,[{pos:{x:4,y:9},kind:'exit',used:false},{pos:{x:16,y:2},kind:'down',used:false},{pos:{x:17,y:5},kind:'goal',used:false}]);
 assert.deepEqual(g.enemies.map(e=>[e.id,e.species,e.pos.x,e.pos.y]),[['w1a','tauros',15,12],['w1b','omanyte',13,8],['w1c','bellsprout',4,3]]);
 const h=generateFloor(12345,2);
 assert.deepEqual(h.points.map(p=>[p.kind,p.pos.x,p.pos.y]),[['up',9,5],['item',5,10]]);
});
test('D4 different seeds give different floors; different levels differ too',()=>{
 const shapes=new Set();for(let seed=1;seed<=40;seed++)shapes.add(JSON.stringify(generateFloor(seed,1).floor));
 assert.equal(shapes.size,40);
 assert.notEqual(JSON.stringify(generateFloor(5,1).floor),JSON.stringify(generateFloor(5,2).floor));
});
test('D5 across 300 seeds: every floor is one connected region inside the map border',()=>{
 for(let seed=0;seed<300;seed++)for(const level of [1,2]){
  const g=generateFloor(seed,level);
  assert.equal(new Set(g.floor.map(k)).size,g.floor.length,'duplicate cell');
  assert.ok(g.floor.every(p=>p.x>=1&&p.y>=1&&p.x<=g.width-2&&p.y<=g.height-2),'cell on border');
  assert.ok(connected(g.floor),`seed ${seed} level ${level} not connected`);
  assert.ok(g.rooms.length>=4);assert.equal(g.width,20);assert.equal(g.height,14);
 }
});
test('D6 stairs, points and enemies sit on legal, distinct cells',()=>{
 for(let seed=0;seed<300;seed++)for(const level of [1,2]){
  const g=generateFloor(seed,level),cells=new Set(g.floor.map(k));
  const kinds=g.points.map(p=>p.kind).sort();
  assert.deepEqual(kinds,level===1?['down','exit','goal']:['item','up']);
  assert.equal(g.up!==null,level===2);assert.equal(g.down!==null,level===1);
  const spots=[...g.points.map(p=>k(p.pos)),...g.enemies.map(e=>k(e.pos))];
  assert.equal(new Set(spots).size,spots.length,'overlap');
  assert.ok(spots.every(s=>cells.has(s)));
  assert.ok(g.points.every(p=>p.used===false));
  const arrival=g.points.find(p=>p.kind===(level===1?'exit':'up')).pos;
  assert.deepEqual(g.arrival,arrival);
  for(const e of g.enemies){
   assert.notDeepEqual(e.pos,arrival);
   for(const p of g.points)assert.ok(Math.abs(p.pos.x-e.pos.x)+Math.abs(p.pos.y-e.pos.y)>=2,'enemy beside a point');
  }
  assert.equal(g.enemies.length,3);
  assert.ok(g.enemies.every(e=>e.level===5));
 }
});
test('D7 enemy HP comes from the shared roster and developer floors use Lv5',()=>{
 const g=generateFloor(3,2),by=Object.fromEntries(roster.species.map(s=>[s.id,s]));
 for(const e of g.enemies){assert.equal(e.level,5);assert.equal(e.hp,Math.round(by[e.species].maxHp*0.5)); // difficulty multiplier 0.5 on enemy HP
 assert.equal(e.damage,undefined);assert.equal(e.ai,undefined);}
 for(const [id,dex] of Object.entries(WILD_SPECIES))assert.equal(by[id].dex,dex);
 assert.ok('arcanine' in WILD_SPECIES);
});
