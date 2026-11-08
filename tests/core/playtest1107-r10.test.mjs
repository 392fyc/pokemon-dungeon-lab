/* Playtest round 10: click-to-walk path, HP colour thresholds, stage/status floaters, and the next-floor species plan used for sprite preloading. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {walkPath} from '../../src/render/reach.ts';
import {hpLevel,hpFillClass,hpTextColor} from '../../src/render/hpbar.ts';
import {stageTags,inferEvents,TAG_COLORS,animationDuration,plan,BASE_MS,ROUND_CAP_MS} from '../../src/render/animation.ts';
import {createExpedition,clone} from '../../src/core/engine.ts';
import {initialProfile,squadOf} from '../../src/core/base.ts';
import {plannedEnemySpecies} from '../../src/core/dungeon.ts';

const k=(x,y)=>x+','+y;
const grid=(w,h,walls=[])=>{const wall=new Set(walls.map(([x,y])=>k(x,y))),cells=new Set();for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(!wall.has(k(x,y)))cells.add(k(x,y));return cells;};

test('walkPath: shortest eight-direction route, ending on the target', ()=>{
 const f=grid(8,5),path=walkPath(f,f,{x:0,y:0},{x:5,y:3},new Set());
 assert.equal(path.length,5,'chebyshev distance');assert.deepEqual(path.at(-1),{x:5,y:3});
 let at={x:0,y:0};for(const p of path){assert.equal(Math.max(Math.abs(p.x-at.x),Math.abs(p.y-at.y)),1);at=p;}
});
test('walkPath: no corner cutting, no walking through blockers or unrevealed cells', ()=>{
 // a diagonal gap between two wall cells may not be used
 const f=grid(3,3,[[1,0],[0,1]]);assert.equal(walkPath(f,f,{x:0,y:0},{x:1,y:1},new Set()),null,'the only way is the corner cut');
 // a corridor held by an enemy
 const row=grid(5,1);assert.equal(walkPath(row,row,{x:0,y:0},{x:4,y:0},new Set([k(2,0)])),null,'blocked');
 // an unrevealed cell on the route
 const seen=grid(5,1);seen.delete(k(2,0));assert.equal(walkPath(row,seen,{x:0,y:0},{x:4,y:0},new Set()),null,'unrevealed');
 assert.equal(walkPath(row,seen,{x:0,y:0},{x:2,y:0},new Set()),null,'an unrevealed target does not count');
 assert.equal(walkPath(row,row,{x:1,y:0},{x:1,y:0},new Set()),null,'already there');
});
test('walkPath: items and stairs are avoided when there is another way, crossed when there is none', ()=>{
 const f=grid(5,3),path=walkPath(f,f,{x:0,y:1},{x:4,y:1},new Set(),new Set([k(2,1)]));
 assert.ok(!path.some(p=>p.x===2&&p.y===1),'goes around the item');assert.equal(path.length,4);
 const row=grid(5,1),through=walkPath(row,row,{x:0,y:0},{x:4,y:0},new Set(),new Set([k(2,0)]));
 assert.equal(through.length,4,'a corridor has no way around, the walk crosses it (and stops there)');
 assert.deepEqual(walkPath(f,f,{x:0,y:1},{x:2,y:1},new Set(),new Set([k(2,1)])).at(-1),{x:2,y:1},'the target itself may be an item');
});

test('HP colour: green above half, yellow at half or below, red at a fifth or below', ()=>{
 assert.equal(hpLevel(51,100),'high');assert.equal(hpLevel(50,100),'mid');assert.equal(hpLevel(21,100),'mid');
 assert.equal(hpLevel(20,100),'low');assert.equal(hpLevel(1,100),'low');assert.equal(hpLevel(0,100),'empty');
 assert.equal(hpFillClass(80,100),'');assert.equal(hpFillClass(40,100),' is-mid');assert.equal(hpFillClass(10,100),' is-low');
 assert.notEqual(hpTextColor(80,100),hpTextColor(40,100));assert.notEqual(hpTextColor(40,100),hpTextColor(10,100));
});

test('stage and status floaters: arrows per step, status names, a pale cross when one ends', ()=>{
 const b={queue:['A'],enemies:['E'],units:{A:{hp:9,side:'friend',pos:{x:1,y:1},stages:{},status:{},asleep:false},E:{hp:9,side:'enemy',pos:{x:2,y:1},stages:{atk:0},status:{slp:{left:3}},asleep:false}}};
 const a=clone(b);a.units.A.stages={atk:1};a.units.E.stages={def:-2};a.units.E.status={par:{left:3}};
 const tags=stageTags(b,a,()=>true),by=(id)=>tags.filter(t=>t.target===id).map(t=>t.text);
 assert.deepEqual(by('A'),['攻击↑']);
 assert.ok(by('E').includes('防御↓↓'),'two steps, two arrows');assert.ok(by('E').includes('麻痹'));assert.ok(by('E').includes('睡眠×'),'sleep ended');
 assert.equal(tags.find(t=>t.text==='攻击↑').color,TAG_COLORS.up);assert.equal(tags.find(t=>t.text==='防御↓↓').color,TAG_COLORS.down);
 assert.equal(tags.find(t=>t.text==='睡眠×').color,TAG_COLORS.ended);
 // an enemy out of sight shows nothing; no change shows nothing
 assert.deepEqual(stageTags(b,a,()=>false).filter(t=>t.target==='E'),[]);assert.deepEqual(stageTags(b,clone(b),()=>true),[]);
});

test('the species plan for a floor is exactly what the floor generator draws', ()=>{
 for(const seed of [3,7,19,4243]){
  const s=createExpedition('plan-'+seed,seed,3,squadOf(initialProfile()),0,true,5);
  const planned=plannedEnemySpecies(seed,1,true);
  const real=s.enemies.filter(id=>/^w1/.test(id)).map(id=>s.units[id].species);
  assert.deepEqual([...real].sort(),[...planned].sort(),'seed '+seed);
 }
});

test('the word step is planned as long as it plays: the unit with the most words sets the length, and the round stays under its cap',()=>{
 const at={x:1,y:1},w=(target,text)=>({target,at,text,color:'#fff'});
 const one={k:'tags',by:'A',items:[w('A','攻击↑')]},three={k:'tags',by:'A',items:[w('A','攻击↑'),w('A','防御↑'),w('A','命中↑'),w('E','麻痹')]};
 assert.equal(animationDuration(one),BASE_MS.tags+30);
 assert.equal(animationDuration(three),BASE_MS.tags+30+2*110,'three words on one unit: the third starts 220 ms after the first');
 const hits=Array.from({length:4},(_,i)=>({k:'hit',by:'E'+i,attacker:null,target:'A',from:null,at,fx:null,amount:3,dead:false}));
 const p=plan([...hits,three]);assert.ok(p,'a long round is still played');assert.ok(p.total<=ROUND_CAP_MS+1,'and fits the cap: '+p.total);
});
