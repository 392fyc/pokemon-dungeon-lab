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
function makeStage(cell=24,scale=cell/24,effectCells,{reduceMotion=false}={}){
 const graphics=[],tweens=[],temp=new Set(),camera={x:10,y:20,moves:0,setPosition(x,y){this.x=x;this.y=y;this.moves++;return this;}};
 const scene={
  cameras:{main:camera},
  add:{graphics(){const g={active:true,rects:[],data:{},color:null,handlers:[],setDepth(){return this;},fillStyle(color,alpha){this.color={color,alpha};return this;},fillRect(x,y,w,h){this.rects.push({x,y,w,h,...this.color});return this;},fillPoints(pts){const xs=pts.map(q=>q.x),ys=pts.map(q=>q.y);this.rects.push({x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),poly:pts,...this.color});return this;},clear(){this.rects=[];return this;},setData(key,value){this.data[key]=value;return this;},getData(key){return this.data[key];},once(name,fn){this.handlers.push({name,fn});return this;},destroy(){if(!this.active)return this;for(const e of this.handlers.filter(e=>e.name==='destroy'))e.fn();this.handlers=[];this.active=false;return this;}};graphics.push(g);return g;}},
  tweens:{add(config){tweens.push(config);return {stop(){config.onStop?.();}};}},
  time:{delayedCall(){throw new Error('combat effects must not create timer events');}}
 };
 return {stage:{scene,views:new Map(),center:p=>({x:p.x*cell+cell/2,y:p.y*cell+cell/2}),cell,scale,temp,f:1,effectCells:effectCells?()=>effectCells:undefined,reduceMotion},graphics,tweens,temp,camera};
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

const hex=color=>Number.parseInt(color.slice(1),16);
/** A progress at which each template has something on screen. */
const PROBE={melee:.5,special:.5,shot:.5,beam:.5,around:.5,room:.3,up:.5,down:.5,status:.5,heal:.5,guard:.5,blow:.3};
const FIXED=new Set([0xffffff,0xff8a4a,0x6aa8ff,0x8affa0]);
const frame=(value,progress)=>{value.tween.onUpdate({}, {progress});return value.g.rects.map(r=>({...r}));};
const bounds=rects=>({x1:Math.min(...rects.map(r=>r.x)),x2:Math.max(...rects.map(r=>r.x+r.w)),y1:Math.min(...rects.map(r=>r.y)),y2:Math.max(...rects.map(r=>r.y+r.h))});
const center=p=>({x:p.x*24+12,y:p.y*24+12});

test('every template draws every type and normal completion removes its temporary Graphics object',async()=>{
 const fixture=makeStage(24,1,[{x:5,y:3},{x:6,y:3},{x:6,y:4}]);
 for(const template of expectedTemplates)for(const type of Object.keys(expectedPalette)){
  const {pending,g,tween}=run(fixture,{move:'fixture-move',template,type,superEffective:type==='Fire'});
  assert.equal(g.getData('combatEffect').template,template);
  assert.equal(g.getData('combatEffect').type,type);
  assert.equal(g.getData('combatEffect').move,'fixture-move');
  assert.ok(fixture.temp.has(g),'the active drawing is registered for game cleanup');
  tween.onUpdate({}, {progress:PROBE[template]});
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

test('drawn colours and particle shapes come from the move type, not from a fixed Normal palette',()=>{
 const sweep=(template,type,progresses)=>{
  const fixture=makeStage(24,1,[{x:5,y:3},{x:6,y:3},{x:6,y:4}]),value=run(fixture,{move:'m',template,type});
  const rects=progresses.flatMap(progress=>frame(value,progress));
  value.tween.onComplete();return rects;
 };
 const sweepAll=[...Array(41).keys()].map(i=>i/40);
 for(const template of ['melee','special','shot','beam','around','room','status','guard','blow']){
  for(const type of Object.keys(expectedPalette)){
   const palette=new Set(expectedPalette[type].map(hex)),colors=new Set(sweep(template,type,sweepAll).map(r=>r.color));
   for(const color of colors)assert.ok(palette.has(color)||FIXED.has(color),template+' '+type+' paints only its own palette: '+color.toString(16));
   assert.ok([...colors].some(color=>palette.has(color)),template+' '+type+' really uses the type colour');
  }
 }
 // Different particle shapes really differ; types sharing a shape share its geometry.
 const geometry=type=>JSON.stringify(sweep('special',type,[.3,.5]).map(r=>[r.x,r.y,r.w,r.h]));
 assert.notEqual(geometry('Fire'),geometry('Water'));
 assert.notEqual(geometry('Grass'),geometry('Electric'));
 assert.equal(geometry('Normal'),geometry('Fairy'));
 const colorsOf=type=>JSON.stringify([...new Set(sweep('special',type,[.5]).map(r=>r.color))]);
 assert.notEqual(colorsOf('Normal'),colorsOf('Fairy'),'same shape, different type colours');
 // The blow stream is always the streak particle whatever the type.
 const blow=type=>JSON.stringify(sweep('blow',type,[.2,.3]).map(r=>[r.x,r.y,r.w,r.h]));
 assert.equal(blow('Fire'),blow('Water'));
});

test('impact timing shares the mock phases, caps effect duration, scales pixels, and follows diagonal long-range coordinates',async()=>{
 assert.equal(effectImpactDelay({move:'x',template:'melee',type:'Fire'},320),100);
 assert.equal(effectImpactDelay({move:'x',template:'shot',type:'Fire'},320),200);
 assert.equal(effectImpactDelay({move:'x',template:'room',type:'Ice'},320),100);
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

test('room drawing is confined to the revealed-cell whitelist at every moment, falls from above, and abort cleanup leaves no timer, tween target, or unit movement',async()=>{
 const visible=[{x:1,y:1},{x:2,y:1},{x:2,y:2}],fixture=makeStage(24,1,visible);
 const unit={sprite:{x:50,y:60},gfx:{x:50,y:50}};
 fixture.stage.views.set('unit',unit);
 const start={...unit.sprite},fx=run(fixture,{move:'blizzard',template:'room',type:'Ice'},320,visible);
 const cellOf=(x,y)=>visible.some(p=>x>=p.x*24&&x<p.x*24+24&&y>=p.y*24&&y<p.y*24+24);
 const ys=new Set();let drawn=0;
 for(let i=0;i<=100;i++){
  for(const rect of frame(fx,i/100)){
   drawn++;
   for(const [x,y] of [[rect.x,rect.y],[rect.x+rect.w-.01,rect.y],[rect.x,rect.y+rect.h-.01],[rect.x+rect.w-.01,rect.y+rect.h-.01]])
    assert.ok(cellOf(x,y),'room pixel ('+rect.x+','+rect.y+') at progress '+i/100+' is inside a revealed floor cell');
   if(rect.w<24)ys.add(Math.round(rect.y/6));
  }
 }
 assert.ok(drawn>0);assert.ok(ys.size>3,'the particles fall downward through several heights');
 assert.deepEqual(fx.g.getData('combatEffect').cells,['1,1','2,1','2,2'],'the whitelist is exposed for the browser check');
 assert.equal(fixture.temp.size,1);
 fx.tween.onStop();
 await fx.pending;
 assert.equal(fixture.temp.size,0);
 assert.equal(fx.g.active,false);
 assert.deepEqual(unit.sprite,start,'the renderer never changes a unit position');
 assert.equal(fixture.tweens.length,1,'one tween owns the effect lifetime');
});

test('room paints a faint wash over the whitelist cells and falling particles, not a static grid',()=>{
 const visible=[1,2,3,4].map(x=>({x,y:1})),fixture=makeStage(24,1,visible),fx=run(fixture,{move:'blizzard',template:'room',type:'Ice'});
 const early=frame(fx,.1),late=frame(fx,.25);
 const wash=rects=>rects.filter(r=>r.w===24&&r.h===24);
 assert.equal(wash(early).length,4);assert.ok(wash(early).every(r=>r.alpha>0&&r.alpha<=.28&&r.color===hex(expectedPalette.Ice[0])));
 const particles=rects=>rects.filter(r=>r.w<24).map(r=>r.y);
 assert.notDeepEqual(particles(early),particles(late),'particles move between frames');
 fx.tween.onComplete();
});

test('the fixed mock uses 8 orange rising arrows per target, 8 blue falling arrows, and a forward vertical guard arc',async()=>{
 for(const [template,color] of [['up',0xff8a4a],['down',0x6aa8ff]]){
  const fixture=makeStage(),value=run(fixture,{move:'fixture',template,type:'Normal'});
  const shafts=new Set();
  for(let i=0;i<=100;i++)for(const r of frame(value,i/100))if(r.color===color&&r.w===2&&r.h===7)shafts.add(r.x);
  assert.equal(shafts.size,8,template+' draws eight arrows');
  value.tween.onComplete();await value.pending;
 }
 const fixture=makeStage(),value=run(fixture,{move:'protect',template:'guard',type:'Normal'}),target=fixture.stage.center(positions.at);
 value.tween.onUpdate({}, {progress:.5});
 assert.ok(value.g.rects.every(rect=>rect.x>target.x),'the shield stands in front of the model instead of underneath it');
 assert.ok(value.g.rects.some(rect=>rect.y<target.y)&&value.g.rects.some(rect=>rect.y>target.y),'the shield spans the upper and lower body');
 value.tween.onComplete();await value.pending;
});

test('up and down arrows land on each target, never on the caster',async()=>{
 for(const template of ['up','down']){
  const fixture=makeStage(),mates=[{x:8,y:2},{x:9,y:5}],caster=center(positions.from);
  const value=run(fixture,{move:'helpinghand',template,type:'Normal'},320,mates);
  const color=template==='up'?0xff8a4a:0x6aa8ff,all=[];
  for(let i=0;i<=100;i++)all.push(...frame(value,i/100).filter(r=>r.color===color));
  for(const mate of mates.map(center))assert.ok(all.some(r=>Math.abs(r.x-mate.x)<=20&&Math.abs(r.y-mate.y)<=40),template+' blocks fall on the teammate at '+JSON.stringify(mate));
  assert.ok(all.every(r=>Math.abs(r.x-caster.x)>30||Math.abs(r.y-caster.y)>60),template+' draws nothing on the caster');
  value.tween.onComplete();await value.pending;
 }
});

test('melee draws three slashes on the target only, white first and the type colour after',()=>{
 const fixture=makeStage(),value=run(fixture,{move:'pound',template:'melee',type:'Fire'}),target=center(positions.at),caster=center(positions.from);
 const slashes=rects=>rects.filter(r=>r.w===2&&r.h===2);
 assert.deepEqual(frame(value,.2),[],'nothing flies from the caster before the strike');
 const expected=color=>Array.from({length:3},(_,k)=>Array.from({length:14},(_,i)=>({x:Math.round(target.x-14+k*7+i),y:Math.round(target.y-14+i*1.6),color})).flat()).flat();
 const white=slashes(frame(value,.364)).filter(r=>r.color===0xffffff);assert.equal(white.length,42);
 const after=frame(value,.464);
 for(const cell of expected(hex('#ffd24a')))assert.ok(after.some(r=>r.x===cell.x&&r.y===cell.y&&r.w===2&&r.h===2&&r.color===cell.color),'slash block at '+JSON.stringify(cell));
 assert.equal(after.filter(r=>r.color===0xffffff).length,0,'the white flash is gone after half the slash');
 assert.ok(white.every(r=>Math.abs(r.x-target.x)<=22&&Math.abs(r.y-target.y)<=22&&Math.hypot(r.x-caster.x,r.y-caster.y)>60));
 value.tween.onComplete();
});

test('beam starts in front of the caster, runs continuously to the target, flickers 5/7 wide with a 2-wide bright core, also when slanted',()=>{
 const horizontal=makeStage(),flat=run(horizontal,{move:'aurorabeam',template:'beam',type:'Ice'},320,[{x:6,y:1}]);
 const caster=center(positions.from),target=center({x:6,y:1});
 const widths=new Set();
 for(const progress of [.2,.25,.3,.35,.4,.45]){
  const rects=frame(flat,progress);
  const core=rects.filter(r=>r.h===2&&r.color===hex(expectedPalette.Ice[1])),outer=rects.filter(r=>(r.h===5||r.h===7)&&r.color===hex(expectedPalette.Ice[0]));
  assert.equal(core.length,1,'one continuous bright line, not dots');assert.equal(outer.length,1);
  widths.add(outer[0].h);
  assert.equal(core[0].x,caster.x+12,'the beam leaves 12 units in front of the caster');
  assert.equal(core[0].x+core[0].w,target.x,'and reaches the target');
 }
 assert.deepEqual([...widths].sort(),[5,7],'the width alternates between 5 and 7');
 flat.tween.onComplete();
 const slanted=makeStage(),diag=run(slanted,{move:'aurorabeam',template:'beam',type:'Ice'}),far=center(positions.at);
 const polys=frame(diag,.35).filter(r=>r.poly);assert.equal(polys.length,2);
 const core=polys.find(r=>r.color===hex(expectedPalette.Ice[1]));
 const length=Math.hypot(far.x-caster.x,far.y-caster.y),direction={x:(far.x-caster.x)/length,y:(far.y-caster.y)/length};
 const [p0,p1,p2,p3]=core.poly,near={x:(p0.x+p3.x)/2,y:(p0.y+p3.y)/2},tail={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2};
 assert.ok(Math.abs(Math.hypot(near.x-caster.x,near.y-caster.y)-12)<.01,'the slanted beam also starts 12 units clear of the caster');
 assert.ok(Math.abs(Math.hypot(tail.x-near.x,tail.y-near.y)-(length-12))<.01,'and runs to the target');
 assert.ok(Math.abs((tail.x-near.x)/(length-12)-direction.x)<1e-6&&Math.abs((tail.y-near.y)/(length-12)-direction.y)<1e-6,'along the true direction');
 diag.tween.onComplete();
});

test('around has an expanding oval ring, heal crosses are fixed green, and guard turns from white to the type colour',()=>{
 const around=run(makeStage(),{move:'x',template:'around',type:'Fire'}),first=frame(around,.4),later=frame(around,.55);
 const ring=rects=>rects.filter(r=>r.w===2&&r.h===2&&r.color===hex(expectedPalette.Fire[1]));
 const spread=rects=>{const b=bounds(rects);return b.x2-b.x1;};
 assert.ok(ring(first).length>=28&&ring(later).length>=28);
 assert.ok(spread(ring(later))>spread(ring(first)),'the ring expands outward');
 around.tween.onComplete();
 const heal=run(makeStage(),{move:'x',template:'heal',type:'Fire'});
 const crosses=frame(heal,.5);assert.ok(crosses.length>0&&crosses.every(r=>r.color===0x8affa0),'heal is green whatever the type');
 heal.tween.onComplete();
 const guard=run(makeStage(),{move:'protect',template:'guard',type:'Fire'});
 assert.ok(frame(guard,.29).every(r=>r.color===0xffffff));
 assert.ok(frame(guard,.31).every(r=>r.color===hex(expectedPalette.Fire[1])));
 guard.tween.onComplete();
});

test('super-effective hits shake the main camera by at most 2 units for 0.14 draft seconds and always restore it',async()=>{
 const sweep=options=>{
  const fixture=makeStage(24,1,undefined,options),value=run(fixture,{move:'x',template:'melee',type:'Fire',superEffective:true});
  const base={x:fixture.camera.x,y:fixture.camera.y},offsets=[];
  for(let i=0;i<=100;i++){value.tween.onUpdate({}, {progress:i/100});offsets.push([fixture.camera.x-base.x,fixture.camera.y-base.y]);}
  return {fixture,value,base,offsets};
 };
 const moved=offsets=>offsets.some(([x,y])=>x||y);
 let r=sweep();
 assert.ok(moved(r.offsets),'the camera really shakes');assert.ok(r.offsets.every(([x,y])=>Math.abs(x)<=2&&Math.abs(y)<=2),'at most 2 draft units');
 assert.ok(r.offsets.findLastIndex(([x,y])=>x||y)<80,'the shake ends soon after the strike, not at the end');
 r.value.tween.onComplete();await r.value.pending;assert.deepEqual([r.fixture.camera.x,r.fixture.camera.y],[r.base.x,r.base.y],'restored on completion');
 // mid-shake abort through the tween's own stop
 let fixture=makeStage(),value=run(fixture,{move:'x',template:'melee',type:'Fire',superEffective:true});
 let base={x:fixture.camera.x,y:fixture.camera.y};
 for(let i=36;i<=44;i++)value.tween.onUpdate({}, {progress:i/100});
 value.tween.onStop();await value.pending;assert.deepEqual([fixture.camera.x,fixture.camera.y],[base.x,base.y],'restored on stop');
 // the live skip path kills tweens (no onStop) and destroys the object
 fixture=makeStage();value=run(fixture,{move:'x',template:'melee',type:'Fire',superEffective:true});base={x:fixture.camera.x,y:fixture.camera.y};
 for(let i=30;i<100&&fixture.camera.x===base.x&&fixture.camera.y===base.y;i++)value.tween.onUpdate({}, {progress:i/100});
 assert.ok(fixture.camera.x!==base.x||fixture.camera.y!==base.y,'the camera is displaced when the object is destroyed');
 value.g.destroy();
 await value.pending;
 assert.deepEqual([fixture.camera.x,fixture.camera.y],[base.x,base.y],'destroy without onStop restores the camera and resolves the promise');
 assert.equal(fixture.temp.has(value.g),false);
 // reduced motion and ordinary hits never move the camera
 r=sweep({reduceMotion:true});assert.equal(moved(r.offsets),false,'reduced motion keeps the camera still');r.value.tween.onComplete();
 fixture=makeStage();value=run(fixture,{move:'x',template:'melee',type:'Fire'});for(let i=0;i<=100;i++)value.tween.onUpdate({}, {progress:i/100});
 assert.equal(fixture.camera.moves,0,'a normal hit does not shake');value.tween.onComplete();
});
