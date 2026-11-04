import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEM_NAMES,PICKUP_KINDS,createMain,applyCommand} from '../../src/core/engine.ts';
import {POINT_VISUALS,dungeonCellSize} from '../../src/render/point-visuals.ts';
import {inferEvents,newLines} from '../../src/render/animation.ts';
import fs from 'node:fs';
import ts from 'typescript';
const darknessSource=fs.readFileSync(new URL('../../src/render/darkness.ts',import.meta.url),'utf8');
const darknessJs=ts.transpileModule(darknessSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildDarkness,corridorLightEnd,DungeonDarkness}=await import('data:text/javascript;base64,'+Buffer.from(darknessJs).toString('base64'));

test('P194 pickup points retain their item names and never use the exit icon',()=>{
 for(const kind of PICKUP_KINDS){assert.equal(POINT_VISUALS[kind].name,ITEM_NAMES[kind]);assert.ok(['berry','tonic','seed'].includes(POINT_VISUALS[kind].icon),kind);}
 assert.equal(new Set(['berry','pechaBerry','rawstBerry','cheriBerry'].map(k=>POINT_VISUALS[k].color)).size,4);
 assert.equal(POINT_VISUALS.healSeed.icon,'seed');assert.equal(POINT_VISUALS.exit.icon,'exit');
});
test('P194 viewport scale uses source-pixel multiples and about nine vertical cells at delivery sizes',()=>{
 for(const height of [410,720,844,1080]){const cell=dungeonCellSize(height);assert.ok(cell>=48);assert.equal(cell%24,0);assert.ok(height/cell>=8&&height/cell<=10);}
});
test('P194 both lanes of a revealed corridor are lit while every unknown sample stays dark',()=>{
 for(const horizontal of [false,true]){
  const floor=new Set();for(let along=1;along<=7;along++)for(const lane of [3,4])floor.add(horizontal?along+','+lane:lane+','+along);
  const at=horizontal?{x:4,y:3}:{x:3,y:4},end=corridorLightEnd(at,floor);assert.deepEqual(end,horizontal?{x:4,y:4}:{x:4,y:4});
  const visible=new Set();for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)visible.add((at.x+dx)+','+(at.y+dy));
  const known=new Set([...floor,...visible]);const pixels=buildDarkness({width:9,height:9,known,visible,lights:[{...at,primary:true,fire:false,end}]});
  const sample=(x,y)=>pixels[y*36+x];
  for(const lane of [3,4])for(let a=0;a<4;a++)for(let b=0;b<4;b++)assert.equal(sample(horizontal?4*4+a:lane*4+a,horizontal?lane*4+b:4*4+b),0);
  const unknown=horizontal?{x:4,y:5}:{x:5,y:4};assert.ok(!known.has(unknown.x+','+unknown.y));
  for(let a=0;a<4;a++)for(let b=0;b<4;b++)assert.equal(sample(unknown.x*4+a,unknown.y*4+b),Math.round(.82*255));
 }
 assert.equal(corridorLightEnd({x:0,y:0},new Set(['0,0'])),undefined);
});
test('P194 resizing the same floor also resizes an unchanged darkness texture',()=>{
 const sizes=[],ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};
 const texture={width:8,height:8,getContext:()=>ctx,refresh(){},setFilter(){}};
 const image={setOrigin(){return this;},setDepth(){return this;},setDisplaySize(w,h){sizes.push([w,h]);return this;},destroy(){}};
 const scene={textures:{createCanvas:()=>texture,remove(){}},add:{image:()=>image},time:{now:0}};
 const d=new DungeonDarkness(scene,1),field={width:2,height:2,known:new Set(['0,0']),visible:new Set(['0,0']),lights:[]};
 d.show('same','moss',48,field,false);d.show('same','moss',96,field,true);assert.deepEqual(sizes.at(-1),[192,192]);d.clear();
});

test('P194 every air swing animates after the bounded log becomes identical',()=>{
 let world=createMain('repeat-air-194',false);world.enemies=[];world.invitations=[];
 for(const id of world.queue)world.units[id].tactic='wait';
 const command={type:'round',action:{type:'basicForward'}};let repeated;
 for(let round=0;round<100;round++){
  const before=world,result=applyCommand(before,command);assert.ok(result.ok);world=result.state;
  if(JSON.stringify(before.log)===JSON.stringify(world.log)){repeated={before,after:world};break;}
 }
 assert.ok(repeated,'real repeated air commands eventually fill the capped log with the same lines');
 assert.deepEqual(newLines(repeated.before.log,repeated.after.log),[]);
 const swings=inferEvents(repeated.before,repeated.after,command).filter(event=>event.k==='airAttack');
 assert.equal(swings.length,1,'the fresh round event still drives its swing even when textual logs match');
 assert.equal(swings[0].actor,world.leader);
});
