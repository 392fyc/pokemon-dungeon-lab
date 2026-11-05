import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCellDarkness,
  buildDarkness,
  darknessBackground,
  darknessTint,
  DungeonDarkness,
  unknownDarkness,
} from '../../src/render/darkness.ts';

const key = (x,y)=>x+','+y;
const allCells = (width,height)=>new Set(Array.from({length:width*height},(_,i)=>key(i%width,Math.floor(i/width))));
const fieldOf = (width,height,overrides={})=>({
  width,height,known:new Set(),visible:new Set(),lights:[],...overrides,
});
const alphaAt = (pixels,width,x,y)=>pixels[y*(width*4)+x];

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
      image(){
        return {
          setOrigin(){return this;},
          setDepth(){return this;},
          setDisplaySize(width,height){state.imageSizes.push([width,height]);return this;},
          destroy(){state.imageDestroys++;},
        };
      },
      graphics(){
        const border={
          setDepth(){return this;},
          fillStyle(color,alpha){border.color=color;border.alpha=alpha;return this;},
          fillRect(x,y,width,height){state.borderRects.push([x,y,width,height]);return this;},
          destroy(){state.borderDestroys++;},
        };
        state.borders.push(border);
        return border;
      },
    },
  };
  return {scene,state};
}

function capturedAlpha(state,width,x,y) {
  assert.ok(state.latest,'mock texture received a frame');
  return state.latest[(y*(width*4)+x)*4+3];
}

test('350 cell values use known-and-visible status, 8-neighbor edge, and wall RGB mean',()=>{
  const width=9,height=9,known=allCells(width,height);
  known.delete(key(0,0));
  const field=fieldOf(width,height,{
    known,
    visible:new Set([key(4,4),key(0,0)]),
    wallColor:[100,100,100],
    lights:[],
  });
  const values=buildCellDarkness(field);
  const at=(x,y)=>values[y*width+x];
  assert.equal(at(4,4),0,'visible known cell is clear');
  assert.ok(Math.abs(at(3,3)-.3)<1e-6,'diagonal neighbor is a revealed edge');
  assert.ok(Math.abs(at(1,1)-.58)<1e-6,'revealed cell away from visible cells is dim');
  assert.ok(Math.abs(at(0,0)-.74)<1e-6,'unknown wins even if a two-step visibility set contains it');
  assert.ok(Math.abs(at(1,0)-.58)<1e-6,'an unknown visible neighbor does not create a revealed edge');
  assert.equal(unknownDarkness([0,0,0]),.7,'black wall RGB follows the lower clamp');
  assert.ok(Math.abs(unknownDarkness([300,300,300])-.9)<1e-6,'bright wall RGB follows the upper clamp');
  assert.equal(darknessTint('moss').join(','),'20,16,13','mask tint uses this theme wall[0]');
  const board=darknessBackground('moss',[100,100,100]);
  const expected=darknessTint('moss').map(channel=>Math.round(100+(channel-100)*.74));
  assert.equal(board,((expected[0]<<16)|(expected[1]<<8)|expected[2])>>>0,'outside-map color blends wall RGB toward the theme tint');
});

test('350 mask interpolation and two blur rounds remove cell-sized hard steps',()=>{
  const width=8,height=8,known=allCells(width,height),visible=new Set();
  for(let y=0;y<height;y++)for(let x=0;x<3;x++)visible.add(key(x,y));
  const pixels=buildDarkness(fieldOf(width,height,{known,visible,lights:[],seed:44}));
  const row=4*4+1;
  const line=Array.from({length:20},(_,i)=>alphaAt(pixels,width,2*4+i,row));
  const largestStep=Math.max(...line.slice(1).map((value,i)=>Math.abs(value-line[i])));
  const boundaryCell=new Set(line.slice(4,8));
  assert.ok(boundaryCell.size>1,'subcell samples vary across one tile instead of forming a flat square');
  assert.ok(largestStep<40,'neighboring mask samples change smoothly; largest byte step was '+largestStep);
});

test('350 floor-seeded noise is repeatable and changes only with the seed',()=>{
  const width=18,height=15,known=allCells(width,height),visible=new Set();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if((x+y)%2===0)visible.add(key(x,y));
  const make=(seed)=>buildDarkness(fieldOf(width,height,{known,visible,lights:[],seed}));
  const first=make(350),again=make(350),otherFloor=make(351);
  assert.deepEqual(first,again,'same floor seed produces identical samples');
  assert.notDeepEqual(first,otherFloor,'another floor seed bends the sample coordinates differently');
});

test('350 party lights move as circles and static lights only illuminate revealed sources',()=>{
  const width=12,height=12,known=allCells(width,height);
  known.delete(key(9,9));
  const staticLights=[
    {x:2,y:2,inner:.3,outer:1.25,strength:.45},
    {x:9,y:9,inner:.4,outer:1.7,strength:.55},
  ];
  const base=fieldOf(width,height,{known,visible:new Set(),lights:[],staticLights,wallColor:[120,120,120],seed:5});
  const noStatic=buildDarkness({...base,staticLights:[]});
  const hiddenOnly=buildDarkness({...base,staticLights:[staticLights[1]]});
  assert.deepEqual(hiddenOnly,noStatic,'an undiscovered static source has no lighting effect');
  const lava={x:6,y:6,inner:.4,outer:1.7,strength:.55};
  const withStairs=buildDarkness({...base,staticLights:[staticLights[0],lava]});
  assert.ok(alphaAt(withStairs,width,2*4+2,2*4+2)<alphaAt(noStatic,width,2*4+2,2*4+2),'revealed stair source multiplies the base darkness');
  assert.ok(alphaAt(withStairs,width,6*4+2,6*4+2)<alphaAt(noStatic,width,6*4+2,6*4+2),'revealed magma source multiplies the base darkness');

  const roundLight=buildDarkness(fieldOf(12,12,{known,visible:new Set(),lights:[{x:5,y:5,primary:true,fire:false}],wallColor:[120,120,120],seed:5}));
  assert.ok(Math.abs(alphaAt(roundLight,width,6*4+2,5*4+2)-alphaAt(roundLight,width,5*4+2,6*4+2))<=1,'equal-radius samples around a party light have equal attenuation');

  const {scene,state}=makeMockScene(),darkness=new DungeonDarkness(scene,1);
  const moving=fieldOf(width,height,{
    known,visible:new Set(),seed:5,wallColor:[120,120,120],
    lights:[{x:4.25,y:5.5,primary:true,fire:false},{x:5,y:5,primary:false,fire:true}],
    staticLights,
  });
  darkness.show('floor-a','moss',24,moving,false);
  let debug=darkness.debug();
  assert.equal(debug.lights.length,2,'static lights are cached in the base and are not per-frame lights');
  assert.deepEqual(debug.lights.map(({primary,fire})=>[primary,fire]),[[true,false],[false,true]]);
  assert.ok(Math.abs(debug.lights[0].inner-.9)<1e-5 && Math.abs(debug.lights[0].outer-1.95)<1e-5 && debug.lights[0].strength===1);
  assert.ok(Math.abs(debug.lights[1].inner-.95)<1e-5 && debug.lights[1].outer===2.25 && Math.abs(debug.lights[1].strength-.85)<1e-5);
  assert.equal(debug.lights[0].centerX,4.75,'grid coordinate plus one half is the sample center');

  const oldCenter=capturedAlpha(state,width,4*4+3,5*4+3);
  const movedLocationBefore=capturedAlpha(state,width,1*4+3,2*4+3);
  darkness.update(16,[{x:1.25,y:2.5,primary:true,fire:true}]);
  debug=darkness.debug();
  assert.equal(debug.lights.length,1);
  assert.equal(debug.lights[0].x,1.25);
  assert.equal(debug.lights[0].centerY,3);
  assert.equal(debug.lights[0].primary,true);
  assert.equal(debug.lights[0].fire,true);
  const movedCenter=capturedAlpha(state,width,1*4+3,2*4+3);
  assert.ok(oldCenter>=0 && movedCenter<movedLocationBefore,'per-frame composition follows the moved sprite center');
  assert.ok(debug.drawMs>=0,'draw time is exposed without counting base-build time');
  darkness.clear();
});

test('350 base cache and transition timing follow the supplied movement duration',()=>{
  const width=6,height=6,known=allCells(width,height);
  const before=fieldOf(width,height,{known,visible:new Set([key(2,2)]),lights:[],seed:77,wallColor:[90,90,90]});
  const after=fieldOf(width,height,{known,visible:new Set([key(2,2),key(3,2)]),lights:[],seed:77,wallColor:[90,90,90]});
  const {scene,state}=makeMockScene(),darkness=new DungeonDarkness(scene,1);

  scene.time.now=10;
  darkness.show('floor-77','moss',24,before,false);
  assert.equal(darkness.debug().baseBuildCount,1);
  assert.deepEqual(state.dimensions,[width*4,height*4],'the dynamic texture covers only the map at four samples per cell');
  assert.equal(state.borderRects.length,4,'the map margin is four static rectangles');
  assert.equal(state.borders[0].alpha,unknownDarkness([90,90,90]),'the outside veil preserves the repeated wall texture under the same unknown opacity');
  assert.equal(state.borderRects[0][0],-64*24);

  scene.time.now=30;
  darkness.show('floor-77','moss',24,{...before,known:new Set(known),visible:new Set(before.visible)},true,500);
  assert.equal(darkness.debug().baseBuildCount,1,'same base field is reused');
  assert.equal(darkness.debug().transition.end,10,'same animated field does not restart an interpolation');

  scene.time.now=100;
  darkness.show('floor-77','moss',24,after,true,400);
  assert.equal(darkness.debug().baseBuildCount,2);
  assert.deepEqual(darkness.debug().transition,{start:100,end:500,progress:0});
  scene.time.now=300;
  darkness.show('floor-77','moss',24,{...after,known:new Set(known),visible:new Set(after.visible)},true,900);
  assert.equal(darkness.debug().baseBuildCount,2);
  assert.equal(darkness.debug().transition.start,100,'same target does not restart the movement fade');
  assert.equal(darkness.debug().transition.end,500);
  assert.ok(Math.abs(darkness.debug().transition.progress-.5)<.02,'progress follows the actual elapsed duration');

  scene.time.now=500;
  darkness.update(500);
  assert.equal(darkness.debug().transition.progress,1);
  scene.time.now=520;
  darkness.show('floor-77','moss',48,after,false);
  assert.equal(darkness.debug().baseBuildCount,2,'final repaint does not rebuild the target field');
  assert.deepEqual(darkness.debug().transition,{start:520,end:520,progress:1},'non-animated final repaint settles to the target');
  assert.deepEqual(state.imageSizes.at(-1),[width*48,height*48],'resize updates display size without rebuilding samples');

  darkness.clear();
  assert.equal(state.removed,1);
  assert.equal(state.imageDestroys,1);
  assert.equal(state.borderDestroys>=1,true);
  scene.time.now=600;
  darkness.show('floor-77','moss',48,before,true);
  assert.equal(darkness.debug().baseBuildCount,3,'clear removes its cache and the next show builds once');
  assert.equal(darkness.debug().transition.progress,1,'missing duration means immediate arrival');
  darkness.clear();
});

test('350 changing a hidden static source does not rebuild the visible base',()=>{
  const width=4,height=4,known=allCells(width,height);
  known.delete(key(3,3));
  const {scene}=makeMockScene(),darkness=new DungeonDarkness(scene,1);
  const hidden={x:3,y:3,inner:.4,outer:1.7,strength:.55};
  const base=fieldOf(width,height,{known,visible:new Set(),lights:[],staticLights:[hidden],seed:7});
  darkness.show('floor-7','moss',24,base,false);
  const count=darkness.debug().baseBuildCount;
  darkness.show('floor-7','moss',24,{...base,staticLights:[{...hidden,strength:.9}]},true,300);
  assert.equal(darkness.debug().baseBuildCount,count,'unknown static sources do not affect cached pixels');
  const revealed={x:1,y:1,inner:.3,outer:1.25,strength:.45};
  darkness.show('floor-7','moss',24,{...base,staticLights:[revealed]},true,300);
  assert.equal(darkness.debug().baseBuildCount,count+1,'revealing a static source changes and rebuilds the cached base');
  darkness.clear();
});

test('350 theme change and map-size change refresh texture tint and border bounds',()=>{
  const {scene,state}=makeMockScene(),darkness=new DungeonDarkness(scene,1);
  const first=fieldOf(2,2,{known:allCells(2,2),visible:new Set(),lights:[],seed:11});
  darkness.show('floor-11','moss',24,first,false);
  assert.deepEqual(Array.from(state.latest.slice(0,3)),[20,16,13]);
  const resized=fieldOf(3,2,{known:allCells(3,2),visible:new Set(),lights:[],seed:11});
  darkness.show('floor-11','wet',48,resized,false);
  assert.deepEqual(state.dimensions,[12,8]);
  assert.deepEqual(Array.from(state.latest.slice(0,3)),[10,17,18],'new canvas gets the wet wall[0] tint');
  assert.deepEqual(state.imageSizes.at(-1),[3*48,2*48]);
  assert.equal(state.borders.at(-1).color,0x0a1112,'outside masking uses the same wet cliff tint as the map');
  darkness.clear();
});


test('350 physical movement progress wins over a Scene clock that runs ahead',()=>{
 const {scene}=makeMockScene(),darkness=new DungeonDarkness(scene,1),known=allCells(3,3);
 const before=fieldOf(3,3,{known,visible:new Set(['1,1']),lights:[],seed:350}),after={...before,visible:new Set(known)};
 scene.time.now=0;darkness.show('physical','moss',72,before,false);
 darkness.setMovementProgress(0);scene.time.now=10;darkness.show('physical','moss',72,after,true,180);
 darkness.update(1000);assert.equal(darkness.debug().transition.progress,0,'a stalled sprite also stalls the reveal despite elapsed Scene time');
 darkness.setMovementProgress(.5);darkness.update(1001);assert.equal(darkness.debug().transition.progress,.5,'half a real movement displays half the base transition');
 darkness.setMovementProgress(1);darkness.update(1010);assert.equal(darkness.debug().transition.progress,1);assert.equal(darkness.debug().transition.end,1010,'transition completion follows the actual movement');darkness.clear();
});
