import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {applyCommand,key} from '../../src/core/engine.ts';
import {effectFixture} from './fx194.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TRIAL_URL;
if(!base)throw Error('Set TRIAL_URL.');
const artifact=process.env.FX228_ARTIFACT||'.tmp/lane-dev/fx228/';
fs.mkdirSync(artifact,{recursive:true});
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const report={platform:process.platform,browser:await browser.version(),caseEvidence:[]};
const floors=(w)=>new Set(w.floor.filter(p=>w.seen.includes(key(p))).map(key));
function fixture(move,template,from,to,hole=null,wall=null){
 const w=effectFixture(move,template),xs=Array.from({length:14},(_,i)=>i+1),ys=xs;
 w.floor=xs.flatMap(x=>ys.filter(y=>!wall||x!==wall.x||y!==wall.y).map(y=>({x,y})));
 w.rooms=[{x:1,y:1,w:14,h:14}];w.units.A.pos={...from};w.units.H.pos={...to};w.seen=w.floor.filter(p=>!hole||p.x!==hole.x||p.y!==hole.y).map(key);w.seenWalls=[];
 w.units.A.stages.acc=3;w.units.A.tactic='wait';w.units.A.pp[move]=5;w.units.A.maxPp[move]=5;
 w.units.H.hp=w.units.H.maxHp=100;w.units.H.waitOnly=true;
 for(const id of w.enemies){w.units[id].hp=w.units[id].maxHp=100;w.units[id].waitOnly=true;}
 w.noCrit=true;return w;
}
async function open(viewport){
 const context=await browser.newContext({viewport});
 await context.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__terrainSource='dtef';});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();await page.goto(base+'?dev=1');await page.locator('#start').waitFor();
 return {context,page,errors};
}
const ready=p=>p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady(),null,{timeout:20000});
const state=p=>p.evaluate(()=>window.trial.getState());
async function startMemory(p,w){await p.evaluate(w=>window.trial.store.start(w),w);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await ready(p);}
async function clickCell(p,pos){
 const canvas=p.locator('canvas');
 for(let attempt=0;attempt<4;attempt++){
  const v=await p.evaluate(()=>window.trial.view()),g=v.geometry,cam=await p.evaluate(()=>window.trial.camera()),box=await canvas.boundingBox();
  const worldX=g.ox+(pos.x-g.minX+.5)*g.cell,worldY=g.oy+(pos.y-g.minY+.5)*g.cell;
  const x=(worldX-cam.x)*box.width/v.cameraView.width,y=(worldY-cam.y)*box.height/v.cameraView.height;
  assert.ok(x>=0&&x<box.width&&y>=0&&y<box.height,'target is visible on the map canvas');
  await p.mouse.move(box.x+x,box.y+y);await p.waitForTimeout(120);
  const after=await canvas.boundingBox(),next=await p.evaluate(()=>window.trial.camera());
  if(Math.abs(after.x-box.x)<.5&&Math.abs(after.y-box.y)<.5&&next.x===cam.x&&next.y===cam.y){await p.mouse.click(box.x+x,box.y+y);await ready(p);return;}
 }
 assert.fail('map canvas did not settle before the click');
}
const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
function insidePolygon(x,y,p){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function inspectDraw(view,allowed,hidden,template){
 const g=view.geometry;let left=false,right=false,polygons=0;
 for(const effect of view.combatEffects.filter(e=>e.template===template)){
  assert.deepEqual(new Set(effect.visibleCells),allowed,'the renderer publishes its current seen-floor whitelist');
  for(const p of effect.actualGeometry??[]){
   polygons++;const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]),x1=Math.min(...xs),x2=Math.max(...xs),y1=Math.min(...ys),y2=Math.max(...ys);
   for(let y=y1+1;y<y2;y+=Math.max(2,g.cell/12))for(let x=x1+1;x<x2;x+=Math.max(2,g.cell/12))if(insidePolygon(x,y,p)){
    const cellX=Math.floor((x-g.ox)/g.cell)+g.minX,cellY=Math.floor((y-g.oy)/g.cell)+g.minY,k=cellX+','+cellY;
    assert.ok(allowed.has(k),template+' drew a real Graphics pixel outside revealed floor at '+k);
    assert.notEqual(k,hidden,template+' drew through the unrevealed hole');
    if(hidden){const hx=g.ox+(Number(hidden.split(',')[0])-g.minX+.5)*g.cell;left ||= x<hx;right ||= x>hx;}
   }
  }
 }
 return {polygons,left,right};
}
function inspectFloatBounds(view){
 const hp=Object.entries(view.units).filter(([,u])=>u).flatMap(([id,u])=>[{id,kind:'current frame',bounds:u.hpBounds},{id,kind:'Idle/active animation motion envelope',bounds:u.hpMotionBounds}]).filter(v=>v.bounds),groups=new Map();let checks=0;
 for(const t of view.floatTexts){if(!t.bounds)continue;for(const b of hp){assert.equal(intersects(t.bounds,b.bounds),false,'float '+t.text+' '+JSON.stringify(t.bounds)+' overlaps '+b.kind+' HP bounds for '+b.id+' '+JSON.stringify(b.bounds));checks++;}
  if(t.group!==undefined){const rows=groups.get(t.group)??[];rows.push(t);groups.set(t.group,rows);}}
 const visible=view.floatTexts.filter(t=>t.alpha>0&&t.bounds);
 for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){assert.equal(intersects(visible[i].bounds,visible[j].bounds),false,'visible float texts overlap: '+visible[i].text+' '+JSON.stringify(visible[i].bounds)+' / '+visible[j].text+' '+JSON.stringify(visible[j].bounds));checks++;}
 for(const t of visible){const c=view.cameraView;assert.ok(t.bounds.left>=c.x&&t.bounds.right<=c.x+c.width&&t.bounds.top>=c.y&&t.bounds.bottom<=c.y+c.height,'visible float text stays inside the camera frame: '+t.text);if(t.placement)assert.equal(t.x,Math.round(t.placement.anchorX+t.placement.dx),'debug offset matches the real text x position');}
 for(const rows of groups.values()){
  const damage=rows.find(t=>/^\d+!?$/.test(t.text)),label=rows.find(t=>t.text==='效果绝佳'||t.text==='效果不好');
  if(damage&&label){assert.ok(label.bounds.bottom<damage.bounds.top,'effectiveness label stays above its damage number with a visible gap');checks++;}
 }
 return {checks,groups:groups.size};
}
async function castReal(p,w,move,target){
 const expected=applyCommand(w,{type:'round',action:{type:'skill',skill:move,target}});assert.equal(expected.ok,true,expected.error);
 await p.clock.pauseAt(await p.evaluate(()=>Date.now()+100));
 await p.locator('[data-hud-skill="'+move+'"]').click();await clickCell(p,w.units[target].pos);
 assert.equal(await p.evaluate(()=>window.trial.animating()),true,move+' enters a real UI action animation');
 return expected.state;
}
try{
 // Long beam and shot directions: the cast crosses a real floor cell that exists in World.floor but is still hidden from the player's map.
 const directions=[
  {from:{x:3,y:4},to:{x:10,y:4},hole:{x:6,y:4}},
  {from:{x:10,y:4},to:{x:3,y:4},hole:{x:6,y:4}},
  {from:{x:4,y:3},to:{x:4,y:10},hole:{x:4,y:6}},
  {from:{x:4,y:10},to:{x:4,y:3},hole:{x:4,y:6}},
  {from:{x:3,y:3},to:{x:9,y:9},hole:{x:6,y:6}},
  {from:{x:9,y:3},to:{x:3,y:9},hole:{x:6,y:6}},
  {from:{x:9,y:9},to:{x:3,y:3},hole:{x:6,y:6}},
  {from:{x:3,y:9},to:{x:9,y:3},hole:{x:6,y:6}}
 ];
 for(let i=0;i<directions.length;i++){
  const {from,to,hole}=directions[i],move=i<4?'aurorabeam':'gunkshot',template=i<4?'beam':'shot',size=i===0?{width:1280,height:870}:{width:1920,height:1440};
   const {context,page:p,errors}=await open(size),w=fixture(move,template,from,to,hole,{x:13,y:13});
  try{
   await startMemory(p,w);const cellSize=(await p.evaluate(()=>window.trial.view().geometry.cell));
   if(i===0)assert.equal(cellSize,48,'the small browser fixture exercises the 48px map cell');
   if(i===4)assert.ok(cellSize>48,'the large browser fixture exercises a larger map cell');
   const expected=await castReal(p,w,move,'H'),allowed=floors(w),hidden=hole.x+','+hole.y;let sawEffect=false,sawLeft=false,sawRight=false;
   for(let elapsed=0;elapsed<480;elapsed+=12){await p.clock.runFor(12);const view=await p.evaluate(()=>window.trial.view()),draw=inspectDraw(view,allowed,hidden,template);sawEffect ||= draw.polygons>0;sawLeft ||= draw.left;sawRight ||= draw.right;
    if(i===0&&elapsed===120)await p.screenshot({path:path.join(artifact,'fx228-beam-east-hole.png')});}
   if(i===0){assert.ok(sawLeft&&sawRight,'beam keeps visible segments on both sides of the hidden hole');await p.screenshot({path:path.join(artifact,'fx228-beam-east-impact.png')});}
   for(let waited=0;waited<2500&&await p.evaluate(()=>window.trial.animating());waited+=20)await p.clock.runFor(20);
   assert.equal(await p.evaluate(()=>window.trial.animating()),false,'the full beam/shot round stays inside its existing budget');
   assert.deepEqual(await state(p),expected,'rendering and its cell clipping preserve the real engine result');
   const done=await p.evaluate(()=>window.trial.view());assert.equal(done.temporaryObjects,0);assert.deepEqual(done.combatEffects,[]);assert.ok(sawEffect);
   report.caseEvidence.push({move,template,from,to,hole,cell:cellSize,sawLeft,sawRight,normalCleanup:true});assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 // Knockback streak travels beyond an adjacent target; clip its actual Graphics geometry at an unseen floor cell.
 {
  const {context,page:p,errors}=await open({width:1920,height:1080}),from={x:5,y:6},to={x:6,y:6},hole={x:8,y:6},w=fixture('whirlwind','blow',from,to,hole,{x:7,y:5});
  try{
   await startMemory(p,w);const expected=await castReal(p,w,'whirlwind','H'),allowed=floors(w),hidden=hole.x+','+hole.y;let pixels=0;
   for(let elapsed=0;elapsed<350;elapsed+=10){await p.clock.runFor(10);const view=await p.evaluate(()=>window.trial.view());pixels+=inspectDraw(view,allowed,hidden,'blow').polygons;}
   assert.ok(pixels>0,'whirlwind draws streaks in the actual scene');
   for(let waited=0;waited<2500&&await p.evaluate(()=>window.trial.animating());waited+=20)await p.clock.runFor(20);
   assert.equal(await p.evaluate(()=>window.trial.animating()),false,'the knockback round ends within its existing budget');
   assert.deepEqual(await state(p),expected);const done=await p.evaluate(()=>window.trial.view());assert.equal(done.temporaryObjects,0);assert.deepEqual(done.combatEffects,[]);assert.deepEqual(errors,[]);
   report.caseEvidence.push({move:'whirlwind',template:'blow',from,to,hole,normalCleanup:true});
  }finally{await context.close();}
 }
 // A real three-target super-effective cast exercises old/new HP widths and keeps each effectiveness label above its own damage number.
 {
  const {context,page:p,errors}=await open({width:1920,height:1080}),w=effectFixture('thunderbolt','around');
  w.floor=Array.from({length:12*7},(_,i)=>({x:i%12+1,y:Math.floor(i/12)+1}));w.rooms=[{x:1,y:1,w:12,h:7}];const aroundHole={x:6,y:4};w.seen=w.floor.filter(p=>p.x!==aroundHole.x||p.y!==aroundHole.y).map(key);
  w.units.A.stages.acc=3;w.units.A.maxHp=w.units.A.hp=100;w.units.A.tactic='wait';
  for(const id of w.enemies){w.units[id].hp=w.units[id].maxHp=100;w.units[id].waitOnly=true;}
  try{
   await startMemory(p,w);const expected=await castReal(p,w,'thunderbolt','H'),allowed=floors(w);let checked=0,paired=0,maxTargetDistance=0,aroundPolygons=0,aroundLeft=false,aroundRight=false;
   for(let elapsed=0;elapsed<700;elapsed+=12){await p.clock.runFor(12);const view=await p.evaluate(()=>window.trial.view());
    const around=inspectDraw(view,allowed,aroundHole.x+','+aroundHole.y,'around');aroundPolygons+=around.polygons;aroundLeft ||= around.left;aroundRight ||= around.right;
    if(elapsed===120)await p.screenshot({path:path.join(artifact,'fx228-around-east-hole.png')});
    if(elapsed===240){await p.screenshot({path:path.join(artifact,'fx228-multitarget-floating-bounds.png')});fs.writeFileSync(path.join(artifact,'fx228-floating-debug.json'),JSON.stringify({floats:view.floatTexts,units:Object.fromEntries(Object.entries(view.units).map(([id,u])=>[id,{x:u.x,y:u.y,row:u.row,animation:u.animation,originY:u.originY,frame:u.frame,hpBounds:u.hpBounds,hpMotionBounds:u.hpMotionBounds}]))},null,2));}
    const r=inspectFloatBounds(view);checked+=r.checks;
    for(const t of view.floatTexts.filter(t=>/^\d+!?$/.test(t.text)&&t.group!==undefined)){const target=view.units[w.enemies[t.group-1]];assert.ok(target,'each damage label is attached to one of the real three hit targets');const distance=Math.hypot(t.x-target.x,t.y-target.y);maxTargetDistance=Math.max(maxTargetDistance,distance);assert.ok(distance<=view.geometry.cell*2.25,'damage text remains near its target; distance='+distance+' cell='+view.geometry.cell);}
    const groups=new Map();for(const t of view.floatTexts)if(t.group!==undefined){const a=groups.get(t.group)??[];a.push(t);groups.set(t.group,a);}
    paired+=[...groups.values()].filter(a=>a.some(t=>t.text==='效果绝佳')&&a.some(t=>/^\d+!?$/.test(t.text))).length;
   }
   assert.ok(aroundPolygons>0,'the real around ring draws geometry next to the unknown boundary');assert.ok(aroundLeft&&aroundRight,'visible around-ring pieces remain on both sides of the unknown boundary');report.caseEvidence.push({move:'thunderbolt',template:'around',unknownAdjacentCell:aroundHole,geometrySamples:aroundPolygons,sawLeft:aroundLeft,sawRight:aroundRight});
   assert.ok(checked>0,'actual Phaser text bounds are sampled throughout the animation');assert.ok(paired>0,'the real engine supplies same-target efficacy and damage text pairs');
   for(let waited=0;waited<2500&&await p.evaluate(()=>window.trial.animating());waited+=20)await p.clock.runFor(20);
   assert.equal(await p.evaluate(()=>window.trial.animating()),false,'the multi-target round ends within its existing budget');
   assert.deepEqual(await state(p),expected);const done=await p.evaluate(()=>window.trial.view());assert.equal(done.temporaryObjects,0);assert.deepEqual(errors,[]);
   report.floatingText={boundsChecks:checked,pairedFrames:paired,maxTargetDistance,normalCleanup:true};
  }finally{await context.close();}
 }
 // Shift skip uses a real beam event. Its rule result is committed once, and cleanup destroys every temporary Phaser object.
 {
  const {context,page:p,errors}=await open({width:1440,height:900}),from={x:3,y:4},to={x:10,y:4},w=fixture('aurorabeam','beam',from,to,{x:6,y:4});
  try{
   await startMemory(p,w);const committed=await castReal(p,w,'aurorabeam','H');await p.clock.runFor(90);await p.screenshot({path:path.join(artifact,'fx228-shift-before.png')});await p.keyboard.press('Shift');
   assert.equal(await p.evaluate(()=>window.trial.animating()),false);let view=await p.evaluate(()=>window.trial.view());assert.equal(view.temporaryObjects,0);assert.deepEqual(view.combatEffects,[]);
   await p.clock.runFor(1000);assert.deepEqual(await state(p),committed,'Shift does not replay or revert the committed world');view=await p.evaluate(()=>window.trial.view());assert.equal(view.temporaryObjects,0);assert.deepEqual(errors,[]);
   report.skip={worldPreserved:true,temporaryObjects:0};
  }finally{await context.close();}
 }
 fs.writeFileSync(path.join(artifact,'fx228-results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
