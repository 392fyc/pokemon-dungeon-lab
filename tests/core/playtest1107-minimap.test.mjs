/* PR 214 review B1: the Luminous Orb shows terrain only. The small map must still hide enemies and unexplored points. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {hudMinimap} from '../../src/render/minimap.ts';
import {terrainKnown} from '../../src/render/point-visuals.ts';
import {friend,world,row,pos} from '../acceptance/fixtures.mjs';
import {foeOf} from './foe-fixture.mjs';

function scene(){
 const a=friend('A',1,1,20,{tackle:5},20);a.species='mudkip';
 const e=foeOf('E','geodude',9,1,40);e.waitOnly=true;
 const s=world({A:a,E:e},{floor:row(12),queue:['A'],enemies:['E'],points:[{pos:pos(2),kind:'berry',used:false},{pos:pos(10),kind:'slumberOrb',used:false},{pos:pos(11),kind:'down',used:false}]});
 s.seen=['0,1','1,1','2,1','3,1'];s.dungeon={seed:1,width:16,height:4,floors:3,level:1,stored:{},boss:true,roguelike:true,tmPool:3};
 return s;
}
const count=(html,cls)=>(html.match(new RegExp('class="[^"]*'+cls,'g'))??[]).length;
test('a revealed floor draws every floor cell but no unexplored point and no unseen enemy',()=>{
 const s=scene();s.mapRevealed=true;
 const html=hudMinimap(s);
 assert.equal(count(html,'hud-map-floor'),13,'all 13 floor cells are drawn');
 assert.equal(count(html,'is-enemy'),0,'the enemy in an unseen cell stays hidden');
 assert.equal(count(html,'hud-map-point'),1,'only the explored berry point is drawn');
 assert.ok(html.includes('is-berry')&&!html.includes('is-slumberOrb')&&!html.includes('is-down'));
});
test('without the orb the map is unchanged, and seen enemies and points do show',()=>{
 const s=scene();s.seen.push('9,1','10,1');
 const html=hudMinimap(s);
 assert.equal(count(html,'hud-map-floor'),6);assert.equal(count(html,'is-enemy'),1);assert.equal(count(html,'hud-map-point'),2);
 assert.deepEqual(terrainKnown(scene()).seen,scene().seen,'terrainKnown is the plain explored set without the orb');
});

/* Round 12 review F2: an exit mark is a function of what the player knows. The cell beyond the last known ground may be a real wall or real floor;
   the mark must be identical in both cases (an implementation that reads the real map would differ). */
const exitCells=html=>[...html.matchAll(/class="hud-map-exit" cx="([\d.]+)" cy="([\d.]+)"/g)].map(m=>Math.floor(+m[1])+','+Math.floor(+m[2]));
function fogScene(realBeyond){
 const s=scene();s.mapRevealed=false;
 s.floor=row(realBeyond==='floor'?12:3);   // ground 0..2 is known; (3,1) is real floor in one world and real wall in the other
 s.seen=['0,1','1,1','2,1'];
 s.seenWalls=['-1,1','0,0','1,0','2,0','0,2','1,2','2,2'];   // everything around the known ground is known except the cell at x=3
 s.points=[];s.units.E.pos={x:2,y:1};s.units.E.hp=0;
 return s;
}
test('an exit mark sits on known ground next to an unknown cell, whether that cell is really a wall or really floor',()=>{
 for(const beyond of ['wall','floor']){
  const html=hudMinimap(fogScene(beyond));
  assert.deepEqual(exitCells(html),['2,1'],'real cell beyond is '+beyond+': only the ground touching the unknown cell is marked');
 }
 assert.equal(hudMinimap(fogScene('wall')).match(/hud-map-exit/g).length,hudMinimap(fogScene('floor')).match(/hud-map-exit/g).length);
});
test('once the neighbour is known the mark goes, and nothing unrevealed is drawn',()=>{
 const s=fogScene('floor');s.seen.push('3,1');s.seenWalls.push('3,0','3,2');
 assert.deepEqual(exitCells(hudMinimap(s)),['3,1'],'the mark moves on to the new edge of the known ground');
 const html=hudMinimap(s);assert.equal(count(html,'hud-map-floor'),4);
});
