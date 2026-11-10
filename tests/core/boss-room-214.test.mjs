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
