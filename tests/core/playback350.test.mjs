import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const getEaseFunction=require('../../node_modules/phaser/src/tweens/builders/GetEaseFunction.js');
function loadTs(relativePath,dependencies){
 const source=fs.readFileSync(new URL(relativePath,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 const localRequire=specifier=>{
  if(Object.hasOwn(dependencies,specifier))return dependencies[specifier];
  throw new Error(`Unexpected runtime import ${specifier} from ${relativePath}`);
 };
 new Function('require','module','exports',js)(localRequire,module,module.exports);
 return module.exports;
}
const animation=loadTs('../../src/render/animation.ts',{
 '../core/engine.ts':{key:p=>`${p.x},${p.y}`,plus:(p,d)=>({x:p.x+d.x,y:p.y+d.y}),same:(a,b)=>a.x===b.x&&a.y===b.y},
 '../core/moves.ts':{moveOf:()=>undefined},
 './reach.ts':{adjacentReachable:()=>true,floorIndex:()=>new Set(),rayReachable:()=>true},
});
const {BASE_MS,ROUND_CAP_MS,animationBatches,movementDuration,plan}=animation;
const {playEvents}=loadTs('../../src/render/playback.ts',{
 './sprites.ts':{animKey:()=>'',facingRow:()=>0,sheet:()=>null,groundOriginY:()=>0,UNIT_GROUND_FRACTION:.4},
 './animation.ts':animation,
});

const move=(id,x0,x1)=>({k:'move',by:id,id,from:{x:x0,y:0},to:{x:x1,y:0}});
const swap=(a,b,xa,xb)=>({k:'swap',by:a,a,b,pa:{x:xa,y:0},pb:{x:xb,y:0}});
const airAttack=actor=>({k:'airAttack',by:actor,actor,from:{x:0,y:0},to:{x:1,y:0}});

function makeStage(ids){
 const tweens=[],timers=[],trace=[];
 const views=new Map(ids.map(id=>{
  const sprite={x:0,y:0,setPosition(x,y){this.x=x;this.y=y;return this;},setOrigin(){return this;}};
  const gfx={x:0,y:0,setPosition(x,y){this.x=x;this.y=y;return this;}};
  return [id,{sprite,gfx,labels:[],dex:'pikachu',row:0}];
 }));
 const scene={
  anims:{exists:()=>false},
  tweens:{add(config){tweens.push(config);trace.push('tween');return {}; }},
  add:{image(){return {setDepth(){return this;},setScale(){return this;},setAlpha(){return this;},setRotation(){return this;},destroy(){}};}},
  time:{delayedCall(ms,callback){timers.push({ms,callback});return {remove(){}};}},
 };
 const stage={scene,views,center:p=>({x:p.x*10,y:p.y*10}),cell:10,scale:1,temp:new Set(),f:1,
  onMovementStart:duration=>{trace.push('movement-start');stage.movementDurations.push(duration);},onMovementProgress:progress=>stage.movementProgress.push(progress),movementDurations:[],movementProgress:[]};
 return {stage,tweens,timers,trace};
}

const update=(config,progress)=>config.onUpdate({}, {t:getEaseFunction(config.ease)(progress)});
const finish=(config)=>{if(config.onUpdate)update(config,1);config.onComplete();};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('animationBatches moves every ordinary move and swap to the first movement slot',()=>{
 const events=[airAttack('A'),move('B',0,1),{k:'hit',by:'B',target:'C',at:{x:1,y:0}},swap('D','E',2,3),{k:'blowaway',by:'F',target:'G',actorAt:{x:0,y:0},from:{x:1,y:0},to:{x:2,y:0}},move('H',4,5),airAttack('I')];
 const batches=animationBatches(events);
 assert.deepEqual(batches.map(batch=>batch.map(event=>event.k)),[['airAttack'],['move','swap','move'],['hit'],['blowaway'],['airAttack']]);
 assert.deepEqual(batches.flat().filter(event=>event.k!=='move'&&event.k!=='swap'),[events[0],events[2],events[4],events[6]],'all non-movement events keep their original relative order');
 assert.deepEqual(events.map(event=>event.k),['airAttack','move','hit','swap','blowaway','move','airAttack'],'grouping leaves its input untouched');
});

test('plan charges one movement batch by its longest move and swap, then applies the round cap',()=>{
 const short=[move('A',0,1),{k:'hit',by:'B',target:'C',at:{x:0,y:0}},swap('D','E',2,3),move('F',4,5),airAttack('G')];
 assert.equal(movementDuration(short),BASE_MS.swap);
 assert.equal(movementDuration(short,.5),BASE_MS.swap*.5);
 assert.equal(movementDuration([airAttack('A')]),0);
 assert.deepEqual(plan(short),{scale:1,total:BASE_MS.hit+BASE_MS.swap+BASE_MS.airAttack});

 const capped=[...Array.from({length:5},(_,i)=>({k:'hit',by:`A${i}`,target:'T',at:{x:0,y:0}})),move('M',0,1),swap('S','T',2,3),airAttack('Z')];
 const p=plan(capped);
 assert.equal(p.scale,ROUND_CAP_MS/(5*BASE_MS.hit+BASE_MS.swap+BASE_MS.airAttack));
 assert.equal(p.total,ROUND_CAP_MS);
 assert.equal(movementDuration(capped,p.scale),BASE_MS.swap*p.scale);
 assert.equal(plan([]),null);
 assert.equal(plan(Array.from({length:20},(_,i)=>({k:'hit',by:`A${i}`,target:'T',at:{x:0,y:0}}))),null,'rounds below the readable minimum scale are skipped');
});

test('playEvents starts the concurrent move/swap batch together, drives linear motion, and waits only for its longest tween',async()=>{
 const {stage,tweens,timers,trace}=makeStage(['A','B','C','X','Y','Z']);
 stage.onMovementStart=duration=>{trace.push('movement-start');stage.movementDurations.push(duration);};
 const events=[airAttack('X'),move('A',0,4),airAttack('Y'),swap('B','C',1,3),airAttack('Z')];
 let ended=false;
 const playback=playEvents(stage,events).then(()=>{ended=true;});
 assert.deepEqual(timers.map(timer=>timer.ms),[BASE_MS.airAttack],'the first non-movement event starts before the later movement batch');
 assert.equal(tweens.length,0);
 timers.shift().callback();
 await flush();
 assert.equal(tweens.length,3,'the move and both sides of the swap have all started before any finishes');
 assert.deepEqual(trace,['movement-start','tween','tween','tween'],'the duration callback runs immediately before the shared batch starts');
 assert.deepEqual(stage.movementDurations,[BASE_MS.swap]);
 assert.deepEqual(tweens.map(tween=>tween.duration),[BASE_MS.move,BASE_MS.swap,BASE_MS.swap]);
 assert.equal(timers.length,0,'movement relies on its tweens and does not add a separate timed pause');
 assert.ok(tweens.every(tween=>tween.ease==='Linear'),'Phaser resolves each movement tween to its linear easing function');

 for(const [progress,expected] of [[.25,.25],[.5,.5],[.75,.75]]){
  for(const tween of tweens)update(tween,progress);
  assert.equal(stage.views.get('A').gfx.x,40*expected,'a move travels the same fraction of its path as elapsed tween progress');
  assert.equal(stage.views.get('B').gfx.x,10+20*expected,'the first swap member follows linear progress');
  assert.equal(stage.views.get('C').gfx.x,30-20*expected,'the second swap member follows linear progress');
 }
 update(tweens[0],1);
 update(tweens[1],.9);update(tweens[2],.9);
 assert.equal(stage.movementProgress.at(-1),.9,'the 180ms move finishing cannot advance the shared progress beyond the 200ms swap');
 update(tweens[1],.95);update(tweens[2],.95);
 assert.equal(stage.movementProgress.at(-1),.95,'batch progress follows the slowest event while it is still moving');

 finish(tweens[0]);
 assert.equal(ended,false,'the shared batch does not finish when only its shortest tween ends');
 assert.equal(stage.movementProgress.at(-1),.95,'finishing the short move leaves progress tied to the longer swap');
 finish(tweens[1]);
 assert.equal(ended,false,'the shared batch is still waiting for every movement tween');
 finish(tweens[2]);
 await flush();
 assert.equal(stage.movementProgress.at(-1),1,'the shared movement batch reports completion at 1');
 assert.equal(ended,false,'the next ordered non-movement event starts after the whole movement batch');
 assert.deepEqual(timers.map(timer=>timer.ms),[BASE_MS.airAttack]);
 timers.shift().callback();
 await flush();
 assert.deepEqual(timers.map(timer=>timer.ms),[BASE_MS.airAttack],'the remaining non-movement events stay in order');
 timers.shift().callback();
 await playback;
 assert.equal(ended,true);
 assert.deepEqual(stage.movementDurations,[BASE_MS.swap]);
});

test('blowaway starts its movement callback after the 60ms pre-slide wait',async()=>{
 const {stage,tweens,timers,trace}=makeStage(['A','T']);
 stage.views.get('T').sprite.setPosition(10,3);
 stage.views.get('T').gfx.setPosition(10,0);
 const event={k:'blowaway',by:'A',target:'T',actorAt:{x:0,y:0},from:{x:1,y:0},to:{x:3,y:0}};
 const playback=playEvents(stage,[event]);
 assert.deepEqual(timers.map(timer=>timer.ms),[200,30,60],'the attack, push effect, and target slide keep their original independent delays');
 assert.deepEqual(stage.movementDurations,[],'the displacement callback has not run before the 60ms wait');
 assert.equal(tweens.length,0);

 const fireTimer=ms=>{const index=timers.findIndex(timer=>timer.ms===ms);assert.notEqual(index,-1,`expected a pending ${ms}ms event`);timers.splice(index,1)[0].callback();};
 fireTimer(30);
 await flush();
 assert.equal(tweens.length,1,'the push effect starts at 30ms');
 assert.equal(tweens[0].onUpdate,undefined,'the 30ms tween is the push effect, not target movement');
 assert.deepEqual(stage.movementDurations,[],'the target movement callback still waits for 60ms');

 fireTimer(60);
 await flush();
 assert.deepEqual(stage.movementDurations,[160*stage.f],'the callback receives the 160ms target-slide duration');
 assert.deepEqual(trace.slice(-2),['movement-start','tween'],'the callback and target tween start in the same continuation, in that order');
 const slide=tweens.find(tween=>typeof tween.onUpdate==='function');
 assert.ok(slide);
 assert.equal(slide.duration,160);
 assert.equal(slide.delay,0);
 assert.equal(60+slide.duration,BASE_MS.blowaway*stage.f,'push wait plus target slide remains the original 220ms');
 assert.equal(stage.views.get('T').gfx.x,10,'the target has not moved before its slide tween is advanced');
 update(slide,.4);
 assert.equal(stage.movementProgress.at(-1),.4,'the independent blowaway reports its actual target-slide progress');
 for(const tween of tweens)finish(tween);
 await flush();
 assert.equal(timers.length,1);
 assert.equal(timers[0].ms,200,'the attack still waits its original 200ms in parallel');
 fireTimer(200);
 await playback;
 assert.equal(stage.views.get('T').gfx.x,30,'the target reaches its pushed destination');
});
