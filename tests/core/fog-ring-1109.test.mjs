/* Round 14, item 3: light is shaped by the cells that are drawn (revealed ground and walls), with soft edges, and never reaches a cell that has no picture.
   The terrain stays secret beyond sight (windows.mjs 8.5b T9, 8.8 #166, fog350), so no ring of undrawn walls is added around seen ground. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKnownMask,composeMask,unknownDarkness} from '../../src/render/darkness.ts';

const S=6;   // texels per cell (SAMPLES_PER_CELL)
test('the revealed-map mask dies out inside the last revealed cell, so light never reaches an undrawn cell and the edge is soft',()=>{
  const W=12,H=8,bits=new Uint8Array(W*H);for(let y=2;y<=4;y++)for(let x=2;x<=6;x++)bits[y*W+x]=1;   // ground row 3 with its ring
  const mask=buildKnownMask(W,H,bits),at=(x,y)=>mask[Math.min(H*S-1,Math.floor(y*S))*W*S+Math.min(W*S-1,Math.floor(x*S))];
  assert.ok(at(4.5,3.5)>.99,'a revealed cell centre is fully inside');
  assert.ok(at(7.1,3.5)<.05,'the cell right outside is out: '+at(7.1,3.5));assert.ok(at(1.9,3.5)<.05);assert.ok(at(4.5,5.05)<.05,'below the ring');
  let step=0;for(let i=1;i<=6;i++)step=Math.max(step,Math.abs(at(6.5+i/6,3.5)-at(6.5+(i-1)/6,3.5)));
  assert.ok(step<.5,'no cell-sized step across the edge (largest step per texel): '+step);
});
test('a lit room is cut by the revealed map as well, so its edge cannot show a straight cell-aligned block of unknown ground',()=>{
  const W=14,H=10,room={x:4,y:3,w:5,h:3},bits=new Uint8Array(W*H);
  for(let y=room.y-1;y<=room.y+room.h;y++)for(let x=room.x-1;x<=room.x+room.w;x++)bits[y*W+x]=1;   // the room and its ring are revealed
  const known=buildKnownMask(W,H,bits),dark=unknownDarkness([60,60,60]),out=new Float32Array(W*S*H*S);
  composeMask(W,H,dark,[{room,level:1}],[],undefined,out,known);
  const at=(x,y)=>out[Math.floor(y*S)*W*S+Math.floor(x*S)];
  assert.ok(at(6.5,4.5)<.01,'the room is lit');
  assert.ok(at(room.x+room.w+1.6,4.5)>dark-.01,'a cell outside the ring (undrawn) stays dark');
  assert.ok(at(room.x-1+.04,4.5)>dark*.4,'the outer edge of the ring fades out instead of ending on a straight lit line: '+at(room.x-1+.04,4.5));
});
test('a party circle fades over a full cell inside the picture border, so a 3-cell-high strip is lit as a round lens, not a bar',()=>{
  const W=14,H=8,bits=new Uint8Array(W*H);for(let y=2;y<=4;y++)for(let x=1;x<=12;x++)bits[y*W+x]=1;
  const wide=buildKnownMask(W,H,bits,1),at=(x,y)=>wide[Math.floor(y*S)*W*S+Math.floor(x*S)];
  assert.ok(at(6.5,3.5)>.99,'the middle row is fully lit');
  assert.ok(at(6.5,2.5)>.4&&at(6.5,2.5)<.7,'the top row fades to about half at its centre: '+at(6.5,2.5));
  assert.ok(at(6.5,2.02)<.02,'and to 0 at the border of the picture');
  assert.ok(at(6.5,3.5)-at(6.5,2.5)>.3,'so the vertical profile is a curve');
});
test('the base darkness ramps from the revealed darkness to a deeper fog over the unrevealed cells, with no cell-aligned step',async()=>{
  const {deepDarkness,UNKNOWN_DARKNESS,CIRCLE_FEATHER,FOG_FEATHER}=await import('../../src/render/darkness.ts');
  const W=16,H=10,bits=new Uint8Array(W*H);for(let y=2;y<=7;y++)for(let x=2;x<=13;x++)bits[y*W+x]=1;
  const lightMask=buildKnownMask(W,H,bits,CIRCLE_FEATHER),dark=unknownDarkness([60,60,60]),deep=deepDarkness([60,60,60]),out=new Float32Array(W*S*H*S);
  assert.ok(deep>=UNKNOWN_DARKNESS-1e-9&&deep>dark,'the fog is deeper than the base darkness: '+deep+' vs '+dark);
  const fog=buildKnownMask(W,H,bits,FOG_FEATHER);composeMask(W,H,dark,[],[],undefined,out,lightMask,lightMask,deep,fog);
  const at=(x,y)=>out[Math.floor(y*S)*W*S+Math.floor(x*S)];
  assert.ok(Math.abs(at(8,4.5)-dark)<1e-3,'deep inside the revealed area the base darkness is unchanged: '+at(8,4.5));
  assert.ok(Math.abs(at(8,1.5)-deep)<1e-3&&Math.abs(at(0.5,0.5)-deep)<1e-3,'an unrevealed cell is the fog, whatever it really holds');
  let step=0;for(let i=1;i<=12;i++)step=Math.max(step,Math.abs(at(8,2+(i-1)/6)-at(8,2+i/6)));
  assert.ok(step<.06,'the change across the picture edge is spread over the ramp (largest step per texel '+step+')');
  assert.ok(at(8,2.1)>dark&&at(8,2.1)<deep+1e-6,'the revealed edge sinks into the fog');
});
