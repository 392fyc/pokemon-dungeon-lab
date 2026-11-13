import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../../src/render/floating-text.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};new Function('require','module','exports',js)(()=>{throw new Error('unexpected runtime import');},module,module.exports);
const {strokedTextBounds,sweptTextBounds,nearestClearVerticalOffset,nearestClearTextOffset}=module.exports;
const makeText=({x=10,y=20,width=40,height=20,stroke=4,scaleX=1,scaleY=1}={})=>({scaleX,scaleY,style:{strokeThickness:stroke},getBounds:()=>({x,y,width,height,right:x+width,bottom:y+height})});

test('Phaser text bounds include stroke and maximum bounce scale along the full vertical path',()=>{
 const text=makeText({x:10,y:20,width:40,height:20,stroke:4});
 assert.deepEqual(strokedTextBounds(text),{left:8,top:18,right:52,bottom:42});
 const swept=sweptTextBounds(text,30,100,60,1.7),expected={left:-7.4,top:39.6,right:67.4,bottom:120.4};
 for(const side of Object.keys(expected))assert.ok(Math.abs(swept[side]-expected[side])<1e-9,side+' uses the scaled text extent');
});

test('vertical avoidance chooses the nearest whole-pixel safe offset while it stays within 0.75 cell',()=>{
 const moving={left:0,top:40,right:20,bottom:80},blocker={left:5,top:50,right:15,bottom:90};
 const offset=nearestClearVerticalOffset(moving,[blocker],120);
 assert.equal(offset,-31,'the closest safe direction is above the HP text');
 assert.ok(moving.bottom+offset<blocker.top);
 assert.equal(nearestClearVerticalOffset(moving,[{left:21,top:0,right:30,bottom:200}],120),0,'a horizontally separate HP label does not move the float');
 assert.deepEqual(nearestClearTextOffset(moving,[{...blocker,top:51}],40),{dx:0,dy:-30},'vertical remains the preferred move below the three-quarter-cell threshold');
});

test('large vertical moves fall back to the nearest safe horizontal position within the visible frame',()=>{
 const moving={left:0,top:40,right:20,bottom:80},blocker={left:5,top:50,right:15,bottom:90},viewport={left:-10,top:0,right:50,bottom:120};
 const offset=nearestClearTextOffset(moving,[blocker],40,viewport),placed={left:moving.left+offset.dx,top:moving.top+offset.dy,right:moving.right+offset.dx,bottom:moving.bottom+offset.dy};
 assert.deepEqual(offset,{dx:15,dy:0},'moving sideways is closer than a 31px vertical shift');
 assert.ok(placed.left>=viewport.left&&placed.right<=viewport.right&&placed.top>=viewport.top&&placed.bottom<=viewport.bottom,'text stays inside the camera frame');
 assert.ok(!intersects(placed,blocker),'the full swept text rectangle clears the HP blocker');
});

test('dense blockers still produce a vertical placement outside every HP rectangle',()=>{
 const moving={left:0,top:10,right:24,bottom:30},blockers=[
  {left:1,top:-20,right:23,bottom:14},{left:1,top:14,right:23,bottom:34},{left:1,top:34,right:23,bottom:65}
 ];
 const offset=nearestClearVerticalOffset(moving,blockers,1),placed={top:moving.top+offset,bottom:moving.bottom+offset};
 assert.ok(blockers.every(b=>placed.bottom<=b.top||placed.top>=b.bottom));
});

function intersects(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
