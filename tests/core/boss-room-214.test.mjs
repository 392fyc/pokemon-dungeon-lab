/* D-20261110-07 (G7.7): the boss never leaves its room, but inside it moves toward opponents it sees and turns on whoever hits it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {doCmd,friend,enemy,world,wait} from '../acceptance/fixtures.mjs';

const inRoom=(p,r)=>p.x>=r.x&&p.y>=r.y&&p.x<r.x+r.w&&p.y<r.y+r.h;
function scene(leaderAt){
 const room={x:1,y:1,w:7,h:7},floor=[];
 for(let y=1;y<8;y++)for(let x=1;x<8;x++)floor.push({x,y});
 for(let x=8;x<16;x++)floor.push({x,y:4});   // a corridor east from the door at (7,4)
 const A=friend('A',leaderAt.x,leaderAt.y,200,{},200);A.species='bulbasaur';A.tactic='wait';
 const B=enemy('boss',4,4,300,'melee');B.boss=true;B.learned=[];B.pp={};B.maxPp={};
 const s=world({A,boss:B},{floor,queue:['A'],enemies:['boss']});
 s.rooms=[room];s.bossRoom=0;return {s,room};
}

test('a boss that sees an opponent in its room walks toward it',()=>{
 const {s}=scene({x:7,y:4});const after=doCmd(s,{type:'round',action:wait});
 assert.notDeepEqual(after.units.boss.pos,{x:4,y:4},'the boss moved: '+after.log.join(' / '));
 assert.ok(Math.abs(after.units.boss.pos.x-7)<Math.abs(4-7));
});

test('a boss chasing someone outside its room stops at the room edge',()=>{
 let {s,room}=scene({x:12,y:4});
 for(let i=0;i<8;i++){s.units.boss.targetMemory={x:12,y:4};s=doCmd(s,{type:'round',action:wait});assert.ok(inRoom(s.units.boss.pos,room),'still inside: '+JSON.stringify(s.units.boss.pos));}
 assert.equal(s.units.boss.pos.x,7,'it waits on the room cell nearest the attacker');
});

test('a boss that is hit remembers the attacker',()=>{
 const {s}=scene({x:12,y:4});s.units.A.learned=['flamethrower'];s.units.A.pp={flamethrower:5};s.units.A.maxPp={flamethrower:5};s.units.A.facing={x:-1,y:0};
 const before=s.units.boss.targetMemory??null;assert.equal(before,null);
 const after=doCmd(s,{type:'round',action:{type:'skill',skill:'flamethrower',target:'boss'}});
 assert.ok(after.units.boss.hp<300,'the line attack hit (main-series Flamethrower always hits here): '+after.log.join(' / '));
 assert.ok(after.units.boss.pos.x>4,'after being hit the boss heads for the attacker in the same round: '+after.log.join(' / '));
});

test('a confused boss never wanders out of its room, whatever the random step',()=>{
 let escaped=0,moved=0;
 for(let n=1;n<=60;n++){
  const {s,room}=scene({x:4,y:7});s.units.boss.pos={x:7,y:4};s.units.boss.status={confusion:{left:5}};s.battleRng=(n*2654435761)>>>0;
  const after=doCmd(s,{type:'round',action:wait});
  if(!inRoom(after.units.boss.pos,room))escaped++;
  if(after.units.boss.pos.x!==7||after.units.boss.pos.y!==4)moved++;
 }
 assert.equal(escaped,0,'no seed puts the boss on the corridor');
 assert.ok(moved>0,'the fixture does make the boss move on some seeds, so the check is not vacuous');
});

test('a boss that sees someone else keeps the attacker it was hit by',()=>{
 const {s}=scene({x:12,y:4});s.units.boss.pos={x:7,y:4};
 const A=s.units.A;A.learned=['flamethrower'];A.pp={flamethrower:5};A.maxPp={flamethrower:5};A.facing={x:-1,y:0};
 const B=friend('B',4,7,200,{},200);B.species='bulbasaur';B.tactic='wait';s.units.B=B;s.queue=['A','B'];
 const after=doCmd(s,{type:'round',action:{type:'skill',skill:'flamethrower',target:'boss'}});
 assert.ok(after.units.boss.hp<300,'the hit landed: '+after.log.join(' / '));
 assert.deepEqual(after.units.boss.targetMemory,{x:12,y:4},'memory is the attacker, not the visible bystander');
});
