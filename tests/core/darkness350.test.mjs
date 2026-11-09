import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnownMask,
  circleLight,
  CIRCLE_INNER,
  CIRCLE_OUTER,
  composeMask,
  darknessBackground,
  darknessTint,
  DungeonDarkness,
  ROOM_FADE_MS,
  roomLight,
  unknownDarkness,
  deepDarkness,
} from '../../src/render/darkness.ts';

const S=6;   // texels per cell (SAMPLES_PER_CELL)
const key=(x,y)=>x+','+y;
const allCells=(width,height)=>new Set(Array.from({length:width*height},(_,i)=>key(i%width,Math.floor(i/width))));
const fieldOf=(width,height,overrides={})=>({width,height,known:allCells(width,height),lights:[],...overrides});
const mask=(width,height,{dark=.74,rooms=[],lights=[],known}={})=>{
  const out=new Float32Array(width*S*height*S);
  composeMask(width,height,dark,rooms,lights,undefined,out,known);
  return {out,at:(x,y)=>out[Math.floor(y*S)*width*S+Math.floor(x*S)]};
};

function makeMockScene() {
  const state={time:0,dimensions:null,latest:null,refreshes:0,removed:0,imageSizes:[],imageDestroys:0,borderRects:[],borderDestroys:0,borders:[]};
  const scene={
    time:{get now(){return state.time;},set now(value){state.time=value;}},
    textures:{
      createCanvas(_key,width,height){
        state.dimensions=[width,height];
        const context={
          createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
          putImageData(image){state.latest=image.data.slice();},
        };
        return {width,height,getContext:()=>context,refresh(){state.refreshes++;},setFilter(){}};
      },
      remove(){state.removed++;},
    },
    add:{
      image(){return {setOrigin(){return this;},setDepth(){return this;},setDisplaySize(width,height){state.imageSizes.push([width,height]);return this;},destroy(){state.imageDestroys++;}};},
      graphics(){
        const border={setDepth(){return this;},fillStyle(color,alpha){border.color=color;border.alpha=alpha;return this;},fillRect(x,y,width,height){state.borderRects.push([x,y,width,height]);return this;},destroy(){state.borderDestroys++;}};
        state.borders.push(border);
        return border;
      },
    },
  };
  return {scene,state};
}
const alphaOf=(state,width,x,y)=>state.latest[(Math.floor(y*S)*width*S+Math.floor(x*S))*4+3]/255;

test('350 darkness constants: one even darkness from wall brightness, tint from the theme, board colour blended toward the tint',()=>{
  assert.equal(unknownDarkness([0,0,0]),.7,'black wall RGB follows the lower clamp');
  assert.ok(Math.abs(unknownDarkness([300,300,300])-.9)<1e-6,'bright wall RGB follows the upper clamp');
  assert.equal(darknessTint('moss').join(','),'20,16,13','mask tint uses this theme wall[0]');
  const expected=darknessTint('moss').map(channel=>Math.round(100+(channel-100)*.74));
  assert.equal(darknessBackground('moss',[100,100,100]),((expected[0]<<16)|(expected[1]<<8)|expected[2])>>>0);
});

test('350 outside every light the mask is one even darkness: no cell-sized patches, whatever is explored',()=>{
  const {out}=mask(12,9,{dark:.74,lights:[{x:1,y:1}]});
  const far=[];
  for(let py=0;py<9*S;py++)for(let px=0;px<12*S;px++){const x=(px+.5)/S,y=(py+.5)/S;if(Math.hypot(x-1.5,y-1.5)>CIRCLE_OUTER+.2)far.push(out[py*12*S+px]);}
  assert.ok(far.length>1000);assert.ok(far.every(v=>Math.abs(v-.74)<1e-6),'every texel beyond the circle carries exactly the one darkness');
});

test('350 a party circle: clear inside about 1.9 cells, soft to nothing at 3, monotone, no hard step',()=>{
  assert.equal(circleLight(CIRCLE_INNER-.01),1);assert.equal(circleLight(CIRCLE_OUTER+.01),0);
  const half=circleLight((CIRCLE_INNER+CIRCLE_OUTER)/2);assert.ok(Math.abs(half-.5)<.01,'the half-light radius is about 2.5 cells');
  const {out}=mask(14,14,{lights:[{x:6,y:6}]});const row=Math.floor(6.5*S)*14*S,cx=Math.floor(6.5*S);
  let prev=out[row+cx],maxStep=0;
  for(let px=cx;px<cx+4*S;px++){const v=out[row+px];assert.ok(v>=prev-1e-6,'darkness only grows moving away from the light');maxStep=Math.max(maxStep,v-prev);prev=v;}
  assert.ok(maxStep<=.74*.3,'the largest texel-to-texel step along a radius is '+maxStep.toFixed(3)+', well below a hard edge (0.74)');
  assert.equal(out[row+cx],0,'the centre is fully lit');
  for(const [px,py] of [[cx+Math.floor(2.4*S),Math.floor(6.5*S)],[Math.floor((6.5+1.7)*S),Math.floor((6.5+1.7)*S)],[Math.floor((6.5-1.7)*S),Math.floor((6.5+1.7)*S)]]){const dist=Math.hypot((px+.5)/S-6.5,(py+.5)/S-6.5);assert.ok(Math.abs(out[py*14*S+px]-.74*(1-circleLight(dist)))<1e-5,'the darkness depends on the distance only (round light): '+dist.toFixed(2));}
});

test('350 a lit room is the room plus its ring (corners too) as a rounded rectangle with a soft edge',()=>{
  const room={x:3,y:3,w:5,h:4};   // lit rectangle: cells 2..8 x 2..7
  assert.ok(roomLight(room,5.5,5)>.999,'inside');
  assert.ok(roomLight(room,2.5,2.5)>.9,'the ring corner cell centre is lit');
  assert.ok(roomLight(room,2.02,2.02)<.5,'the very corner is rounded off (radius about half a cell)');
  assert.ok(roomLight(room,1.6,5)<.05&&roomLight(room,9.4,5)<.05,'beyond the ring the light is gone (soft edge about 0.3 cell)');
  const {out}=mask(12,10,{rooms:[{room,level:1}]});const row=Math.floor(5*S)*12*S;
  const across=[];for(let px=Math.floor(1.5*S);px<=Math.floor(2.6*S);px++)across.push(out[row+px]);
  const middle=across.filter(v=>v>.05&&v<.69);assert.ok(middle.length>=2,'the edge passes through at least two intermediate values, so it is feathered: '+across.map(v=>v.toFixed(2)).join(' '));
  for(let i=1;i<across.length;i++)assert.ok(across[i]<=across[i-1]+1e-6,'monotone across the edge');
  assert.ok(out[Math.floor(5*S)*12*S+Math.floor(5.5*S)]<1e-6,'the whole room interior is not dimmed');
  assert.ok(out[Math.floor(0.5*S)*12*S+Math.floor(0.5*S)]>.73,'outside stays dark');
});

test('350 party circles do not light cells that are not revealed; the cut-off is soft',()=>{
  const width=12,height=6,bits=new Uint8Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<6;x++)bits[y*width+x]=1;
  const km=buildKnownMask(width,height,bits);
  const {at}=mask(width,height,{lights:[{x:5,y:2}],known:km});
  assert.ok(at(4.5,2.5)<.05,'a revealed cell next to the light is lit');
  assert.ok(at(8.5,2.5)>.73,'an unrevealed cell inside the circle radius stays dark');
  const ramp=[5.4,5.6,5.8,6.0,6.2,6.4,6.6,6.8,7.0,7.2].map(x=>at(x,2.5));
  for(let i=1;i<ramp.length;i++)assert.ok(ramp[i]>=ramp[i-1]-1e-6&&ramp[i]-ramp[i-1]<.4,'the edge of the revealed area fades over cells, not in one step: '+ramp.map(v=>v.toFixed(2)).join(' '));
});

test('350 a room fades in as one whole shape over about 225 ms; a skip or reduced motion settles at once',()=>{
  const width=12,height=10,room={x:3,y:3,w:4,h:3},{scene,state}=makeMockScene(),darkness=new DungeonDarkness(scene,1);
  const base=fieldOf(width,height,{seed:5,wallColor:[90,90,90]});
  state.time=0;darkness.show('floor-a','moss',24,{...base,litRooms:[]},false);
  assert.ok(alphaOf(state,width,4.5,4.5)>.7,'the room starts dark');
  state.time=100;darkness.show('floor-a','moss',24,{...base,litRooms:[room]},true,200);
  assert.equal(darkness.debug().rooms.length,1);assert.equal(darkness.debug().rooms[0].level,0,'the fade starts from nothing');
  darkness.update(100+ROOM_FADE_MS/2);
  const a=alphaOf(state,width,3.5,3.5),b=alphaOf(state,width,5.5,4.5),c=alphaOf(state,width,6.5,5.5);
  assert.ok(Math.abs(a-b)<.01&&Math.abs(b-c)<.01,'half way, every cell of the room has the same brightness (no cell-by-cell spreading): '+[a,b,c].join(' '));
  assert.ok(a>.05&&a<.7,'half way the room is half lit: '+a);
  darkness.update(100+ROOM_FADE_MS+1);assert.ok(alphaOf(state,width,5.5,4.5)<.01,'after the fade the room is fully lit');
  assert.equal(darkness.debug().transition.progress,1);
  // leaving fades out as a whole too
  state.time=1000;darkness.show('floor-a','moss',24,{...base,litRooms:[]},true,200);darkness.update(1000+ROOM_FADE_MS/2);
  const out=alphaOf(state,width,5.5,4.5);assert.ok(out>.05&&out<.7,'the room dims gradually when left: '+out);
  darkness.update(1000+ROOM_FADE_MS+1);assert.ok(alphaOf(state,width,5.5,4.5)>.7,"back to the even darkness");assert.equal(darkness.debug().rooms.length,0);
  // skip: a final repaint settles at once
  state.time=2000;darkness.show('floor-a','moss',24,{...base,litRooms:[room]},false);assert.ok(alphaOf(state,width,5.5,4.5)<.01,'a non-animated repaint is the final state');
  // reduced motion
  darkness.show('floor-a','moss',24,{...base,litRooms:[]},false);
  globalThis.window={matchMedia:()=>({matches:true})};
  try{state.time=3000;darkness.show('floor-a','moss',24,{...base,litRooms:[room]},true,200);assert.ok(alphaOf(state,width,5.5,4.5)<.01,'reduced motion switches straight to the final state');}
  finally{delete globalThis.window;}
  darkness.clear();
});

test('350 a new floor starts with its rooms already lit; tint and border follow the theme and the map size',()=>{
  const {scene,state}=makeMockScene(),darkness=new DungeonDarkness(scene,1);
  const room={x:1,y:1,w:2,h:2};
  darkness.show('floor-1','moss',24,fieldOf(8,8,{seed:1,litRooms:[room]}),true,200);
  assert.ok(alphaOf(state,8,2.5,2.5)<.01,'no fade-in on arrival at a floor');
  assert.deepEqual(Array.from(state.latest.slice(0,3)),[20,16,13]);
  assert.equal(state.borders.at(-1).alpha,deepDarkness([...Array(3)].map(()=>0)) ,'border veil uses the deep darkness of an unknown cell when no wall colour is given or the theme default');
  darkness.show('floor-1','wet',48,fieldOf(9,8,{seed:1,litRooms:[room]}),false);
  assert.deepEqual(state.dimensions,[9*S,8*S]);
  assert.deepEqual(Array.from(state.latest.slice(0,3)),[10,17,18],'new canvas gets the wet wall[0] tint');
  darkness.clear();
});

test('350 revealed stairs and magma glow locally; a hidden source does nothing and the static layer is rebuilt only when its set changes',()=>{
  const width=8,height=8,known=allCells(width,height);known.delete(key(7,7));
  const {scene,state}=makeMockScene(),darkness=new DungeonDarkness(scene,1);
  const base=fieldOf(width,height,{known,seed:7,wallColor:[90,90,90]});
  darkness.show('f','moss',24,base,false);const plain=alphaOf(state,width,2.5,2.5);const count=darkness.debug().baseBuildCount;
  darkness.show('f','moss',24,{...base,staticLights:[{x:7,y:7,inner:.4,outer:1.7,strength:.55}]},false);
  assert.equal(darkness.debug().baseBuildCount,count,'a source on an unrevealed cell changes nothing');
  darkness.show('f','moss',24,{...base,staticLights:[{x:2,y:2,inner:.3,outer:1.25,strength:.45}]},false);
  assert.equal(darkness.debug().baseBuildCount,count+1);assert.ok(alphaOf(state,width,2.5,2.5)<plain*.6,'the glow lowers the darkness around the source');
  darkness.show('f','moss',24,{...base,staticLights:[{x:2,y:2,inner:.3,outer:1.25,strength:.45}]},false);
  assert.equal(darkness.debug().baseBuildCount,count+1,'the same set is not rebuilt');
  darkness.clear();
});

test('350 the primary light follows the sprite pixel position every frame',()=>{
  const {scene,state}=makeMockScene(),darkness=new DungeonDarkness(scene,1);
  darkness.show('f','moss',24,fieldOf(10,10,{seed:2,wallColor:[90,90,90],lights:[{x:2.25,y:3.5,primary:true}]}),false);
  assert.equal(darkness.debug().lights[0].x,2.25);assert.equal(darkness.debug().lights[0].centerX,2.75);
  const before=alphaOf(state,10,6.5,3.5);
  darkness.update(16,[{x:5.5,y:3.5,primary:true}]);
  assert.equal(darkness.debug().lights[0].x,5.5);assert.ok(alphaOf(state,10,6.5,3.5)<before,'the lit spot moved with the light');
  assert.ok(darkness.debug().drawMs>=0);
  darkness.clear();
});

test('350 the outer border is four rectangles reaching 64 cells out; resizing keeps the samples; clear frees everything',()=>{
  const width=6,height=6,known=allCells(width,height),field=fieldOf(width,height,{known,seed:77,wallColor:[90,90,90]});
  const {scene,state}=makeMockScene(),darkness=new DungeonDarkness(scene,1);
  darkness.show('floor-77','moss',24,field,false);
  assert.equal(darkness.debug().baseBuildCount,1);
  assert.deepEqual(state.dimensions,[width*S,height*S],'the texture covers only the map at the sample density');
  assert.equal(state.borderRects.length,4,'the map margin is four static rectangles');
  assert.equal(state.borders[0].alpha,deepDarkness([90,90,90]),'the outside veil uses the same darkness as an unknown cell');
  assert.equal(state.borderRects[0][0],-64*24,'the border reaches 64 cells beyond the map');
  darkness.show('floor-77','moss',48,field,false);
  assert.equal(darkness.debug().baseBuildCount,1,'resizing does not rebuild the samples');
  assert.deepEqual(state.imageSizes.at(-1),[width*48,height*48],'resize only updates the display size');
  darkness.clear();
  assert.equal(state.removed,1,'the texture is removed');
  assert.equal(state.imageDestroys,1,'the image is destroyed');
  assert.ok(state.borderDestroys>=1,'the border is destroyed');
  darkness.show('floor-77','moss',48,field,false);
  assert.equal(darkness.debug().baseBuildCount,2,'clear drops the cache, so the next show builds once');
  darkness.clear();
});
