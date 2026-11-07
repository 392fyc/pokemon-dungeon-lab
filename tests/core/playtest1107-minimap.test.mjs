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
