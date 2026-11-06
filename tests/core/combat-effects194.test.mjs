import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function loadTs(relativePath){
 const source=fs.readFileSync(new URL(relativePath,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',js)(()=>{throw new Error('unexpected runtime import');},module,module.exports);
 return module.exports;
}
const fx=loadTs('../../src/render/combat-effects.ts');
const {EFFECT_TEMPLATES,EFFECT_TYPES,EFFECT_PALETTE,EFFECT_SHAPE,effectImpactDelay,playCombatEffect}=fx;
const expectedPalette={
 Normal:['#e8e4d8','#ffffff','#9a9486'],Fire:['#f0702a','#ffd24a','#a82c14'],Water:['#3f8fe0','#a8e0ff','#1f4f9a'],Grass:['#4fb83f','#c8f07a','#1f6a2a'],Electric:['#f5d02a','#fff8b0','#b08a10'],Ice:['#7fdcec','#eaffff','#3f8fb0'],Fighting:['#d8483a','#ffc0a0','#8a2020'],Poison:['#a050c8','#e0a8f0','#5a2478'],Ground:['#c49a4a','#f0d890','#7a5a24'],Flying:['#a8c8f0','#ffffff','#5f86b8'],Psychic:['#f05a9a','#ffc0e0','#a02a68'],Bug:['#a0c030','#e0f080','#5a7a18'],Rock:['#a8946a','#d8c8a0','#5f5238'],Ghost:['#7a60c0','#c8b0ff','#3f2f78'],Dragon:['#6a58e8','#b8b0ff','#2f2a98'],Dark:['#5a4a42','#a08a7a','#241c18'],Steel:['#a8b8c8','#ffffff','#5a6a7a'],Fairy:['#f08ac0','#ffe0f0','#b04a88']
};
const expectedShape={Normal:'star',Fire:'flame',Water:'drop',Grass:'leaf',Electric:'bolt',Ice:'shard',Fighting:'star',Poison:'bubble',Ground:'rock',Flying:'streak',Psychic:'ring',Bug:'dot',Rock:'rock',Ghost:'wisp',Dragon:'shard',Dark:'claw',Steel:'spark',Fairy:'star'};
const expectedTemplates=['melee','special','shot','beam','around','room','up','down','status','heal','guard','blow'];
const positions={from:{x:1,y:1},at:{x:6,y:4}};
function makeStage(cell=24,scale=cell/24,visibleCells){
 const graphics=[],tweens=[],temp=new Set();
 const scene={
  add:{graphics(){const g={active:true,rects:[],data:{},color:null,setDepth(){return this;},fillStyle(color,alpha){this.color={color,alpha};return this;},fillRect(x,y,w,h){this.rects.push({x,y,w,h,...this.color});return this;},clear(){this.rects=[];return this;},setData(key,value){this.data[key]=value;return this;},getData(key){return this.data[key];},destroy(){this.active=false;return this;}};graphics.push(g);return g;}},
  tweens:{add(config){tweens.push(config);return {stop(){config.onStop?.();}};}},
  time:{delayedCall(){throw new Error('combat effects must not create timer events');}}
 };
 return {stage:{scene,views:new Map(),center:p=>({x:p.x*cell+cell/2,y:p.y*cell+cell/2}),cell,scale,temp,f:1,visibleCells},graphics,tweens,temp};
}
const run=(fixture,effect,duration=320,impacts=[positions.at])=>{
 const pending=playCombatEffect(fixture.stage,effect,positions.from,positions.at,impacts,duration);
 return {pending,g:fixture.graphics.at(-1),tween:fixture.tweens.at(-1)};
};

test('the renderer carries all 12 mock templates and exact 18-type palette and particle map',()=>{
 assert.deepEqual(EFFECT_TEMPLATES,expectedTemplates);
 assert.deepEqual(EFFECT_TYPES,Object.keys(expectedPalette));
 assert.deepEqual(EFFECT_PALETTE,expectedPalette);
 assert.deepEqual(EFFECT_SHAPE,expectedShape);
});

test('every template draws every type and normal completion removes its temporary Graphics object',async()=>{
 const fixture=makeStage();
 for(const template of expectedTemplates)for(const type of Object.keys(expectedPalette)){
  const {pending,g,tween}=run(fixture,{move:'fixture-move',template,type,superEffective:type==='Fire'});
  assert.equal(g.getData('combatEffect').template,template);
  assert.equal(g.getData('combatEffect').type,type);
  assert.equal(g.getData('combatEffect').move,'fixture-move');
  assert.ok(fixture.temp.has(g),'the active drawing is registered for game cleanup');
  tween.onUpdate({}, {progress:.2});
  assert.ok(g.rects.length>0,template+' draws for '+type);
  assert.ok(tween.duration<=500);
  tween.onComplete();
  await pending;
  assert.equal(g.active,false);
  assert.equal(fixture.temp.has(g),false);
 }
 assert.equal(fixture.graphics.length,12*18);
 assert.equal(fixture.tweens.length,12*18);
});

test('impact timing shares the mock phases, caps effect duration, scales pixels, and follows diagonal long-range coordinates',async()=>{
 assert.equal(effectImpactDelay({move:'x',template:'melee',type:'Fire'},320),100);
 assert.equal(effectImpactDelay({move:'x',template:'shot',type:'Fire'},320),200);
 assert.equal(effectImpactDelay({move:'x',template:'room',type:'Ice'},320),280);
 assert.equal(effectImpactDelay({move:'x',template:'blow',type:'Flying'},220),120);
 const one=makeStage(24,1),two=makeStage(48,2);
 const a=run(one,{move:'shot',template:'shot',type:'Fire'},900);
 const b=run(two,{move:'shot',template:'shot',type:'Fire'},900);
 assert.equal(a.tween.duration,500);
 assert.equal(b.tween.duration,500);
 a.tween.onUpdate({}, {progress:.3});b.tween.onUpdate({}, {progress:.3});
 const maxA=Math.max(...a.g.rects.map(r=>r.w)),maxB=Math.max(...b.g.rects.map(r=>r.w));
 assert.equal(maxB,maxA*2,'pixel blocks scale with the stage zoom');
 assert.ok(a.g.rects.some(r=>r.x>48&&r.x<180),'the shot travels through intermediate points on a diagonal, long path');
 a.tween.onStop();b.tween.onStop();
 await Promise.all([a.pending,b.pending]);
});

test('room drawing is confined to the revealed-cell whitelist, and abort cleanup leaves no timer, tween target, or unit movement',async()=>{
 const visible=[{x:1,y:1},{x:2,y:1}],fixture=makeStage(24,1,visible);
 const unit={sprite:{x:50,y:60},gfx:{x:50,y:50}};
 fixture.stage.views.set('unit',unit);
 const start={...unit.sprite},fx=run(fixture,{move:'blizzard',template:'room',type:'Ice'},320,visible);
 fx.tween.onUpdate({}, {progress:.2});
 const allowed=visible.map(p=>({x:p.x*24,y:p.y*24}));
 assert.ok(fx.g.rects.length>0);
 for(const rect of fx.g.rects){
  assert.ok(allowed.some(cell=>rect.x>=cell.x&&rect.y>=cell.y&&rect.x+rect.w<=cell.x+24&&rect.y+rect.h<=cell.y+24),
   'every room pixel is inside an already revealed floor cell');
 }
 assert.equal(fixture.temp.size,1);
 fx.tween.onStop();
 await fx.pending;
 assert.equal(fixture.temp.size,0);
 assert.equal(fx.g.active,false);
 assert.deepEqual(unit.sprite,start,'the renderer never changes a unit position');
 assert.equal(fixture.tweens.length,1,'one tween owns the effect lifetime');
});


test('the fixed mock uses orange rising arrows, blue falling arrows, and a forward vertical guard arc',async()=>{
 for(const [template,color] of [['up',0xff8a4a],['down',0x6aa8ff]]){
  const fixture=makeStage(),value=run(fixture,{move:'fixture',template,type:'Normal'});
  value.tween.onUpdate({}, {progress:.5});
  assert.ok(value.g.rects.some(rect=>rect.color===color),template+' keeps the directional mock colour');
  value.tween.onComplete();await value.pending;
 }
 const fixture=makeStage(),value=run(fixture,{move:'protect',template:'guard',type:'Normal'}),center=fixture.stage.center(positions.at);
 value.tween.onUpdate({}, {progress:.5});
 assert.ok(value.g.rects.every(rect=>rect.x>center.x),'the shield stands in front of the model instead of underneath it');
 assert.ok(value.g.rects.some(rect=>rect.y<center.y)&&value.g.rects.some(rect=>rect.y>center.y),'the shield spans the upper and lower body');
 value.tween.onComplete();await value.pending;
});
