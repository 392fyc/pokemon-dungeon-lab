/* PR 214 review #451: while a round plays, the small map shows only what the board draws.
   Enemies a challenge spawns this round have no sprite yet, so they stay off the small map even on explored cells. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand} from '../../src/core/engine.ts';
import {minimapDynamic,playbackMinimapWorld} from '../../src/render/minimap.ts';
import {enemy,friend,world} from '../acceptance/fixtures.mjs';

const key=p=>`${p.x},${p.y}`;
function challengeWorld(){
 const r={x:3,y:2,w:6,h:5},floor=[];
 for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)floor.push({x,y});
 for(let x=0;x<13;x++)for(const y of [3,4])floor.push({x,y});
 const unique=[...new Map(floor.map(p=>[key(p),p])).values()];
 const A=friend('A',5,4,200,{},200),B=friend('B',2,3,200,{},200),C=friend('C',0,3,200,{},200);
 for(const u of [A,B,C])u.tactic='wait';
 const X=enemy('X',9,3,30,'melee',{waitOnly:true}),E=enemy('E',7,5,30,'melee',{waitOnly:true});
 const s=world({A,B,C,X,E},{floor:unique,enemies:['X','E']});
 s.rooms=[r];s.dungeon={seed:1,width:13,height:9,floors:3,level:1,stored:{},boss:true,roguelike:true,tmPool:3};
 s.difficulty='normal';s.prog={level:5,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0,bigBerry:0,teamTonic:0}};
 s.purse=0;s.tms=[];s.enemyAiRng=1;
 s.adventureRooms=[{room:0,type:'challenge',state:'idle',interaction:{x:5,y:4},doors:[{x:3,y:3},{x:3,y:4},{x:8,y:3},{x:8,y:4}],sealedCells:[],enemyIds:[],reward:null,item:null,rewardItem:null}];
 s.seen=unique.map(key);   // the whole room is already explored
 return s;
}
const enemyDots=html=>(html.match(/hud-map-unit is-enemy/g)??[]).length;

test('enemies a challenge spawns this round stay off the small map until the board draws them',()=>{
 const before=challengeWorld(),r=applyCommand(before,{type:'round',action:{type:'interact',exit:false}});
 assert.equal(r.ok,true);const after=r.state;
 const spawned=after.enemies.filter(id=>!before.units[id]);assert.ok(spawned.length>=3,'the challenge spawned enemies');
 const drawn=id=>before.units[id]?.pos??undefined;   // the board starts the animation from the old state: only old units have sprites
 for(const revealed of [false,true]){
  const w=playbackMinimapWorld(before,after,revealed,drawn);
  for(const id of spawned)assert.equal(w.units[id].pos,null,`${id} is not drawn yet (revealed=${revealed})`);
  const html=minimapDynamic(w);
  for(const id of spawned){const q=after.units[id].pos;assert.ok(!html.includes(`cx="${q.x+.5}" cy="${q.y+.5}" r="0.34"`),`no dot where ${id} will appear (revealed=${revealed})`);}
 }
 const end=playbackMinimapWorld(before,after,true,id=>after.units[id].pos);   // once the board draws them they appear
 assert.ok(enemyDots(minimapDynamic(end))>=spawned.length);
});

test('a hidden sprite is off the map; a drawn one sits where the board draws it',()=>{
 const before=challengeWorld(),after=structuredClone(before);after.units.A.pos={x:6,y:4};
 assert.equal(playbackMinimapWorld(before,after,false,id=>id==='A'?null:before.units[id].pos).units.A.pos,null);
 assert.deepEqual(playbackMinimapWorld(before,after,false,id=>before.units[id].pos).units.A.pos,{x:5,y:4});
});
