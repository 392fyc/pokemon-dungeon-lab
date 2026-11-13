import type Phaser from 'phaser';
import type {Pos} from '../core/engine.ts';
import type {EffectStyle,EffectTemplate} from './effect-spec.ts';
import type {Stage} from './playback.ts';

export const EFFECT_PALETTE:Record<string,readonly [string,string,string]>={
 Normal:['#e8e4d8','#ffffff','#9a9486'],Fire:['#f0702a','#ffd24a','#a82c14'],Water:['#3f8fe0','#a8e0ff','#1f4f9a'],Grass:['#4fb83f','#c8f07a','#1f6a2a'],Electric:['#f5d02a','#fff8b0','#b08a10'],Ice:['#7fdcec','#eaffff','#3f8fb0'],Fighting:['#d8483a','#ffc0a0','#8a2020'],Poison:['#a050c8','#e0a8f0','#5a2478'],Ground:['#c49a4a','#f0d890','#7a5a24'],Flying:['#a8c8f0','#ffffff','#5f86b8'],Psychic:['#f05a9a','#ffc0e0','#a02a68'],Bug:['#a0c030','#e0f080','#5a7a18'],Rock:['#a8946a','#d8c8a0','#5f5238'],Ghost:['#7a60c0','#c8b0ff','#3f2f78'],Dragon:['#6a58e8','#b8b0ff','#2f2a98'],Dark:['#5a4a42','#a08a7a','#241c18'],Steel:['#a8b8c8','#ffffff','#5a6a7a'],Fairy:['#f08ac0','#ffe0f0','#b04a88']
};
export const EFFECT_SHAPE:Record<string,string>={
 Normal:'star',Fire:'flame',Water:'drop',Grass:'leaf',Electric:'bolt',Ice:'shard',Fighting:'star',Poison:'bubble',Ground:'rock',Flying:'streak',Psychic:'ring',Bug:'dot',Rock:'rock',Ghost:'wisp',Dragon:'shard',Dark:'claw',Steel:'spark',Fairy:'star'
};
export const EFFECT_TEMPLATES:readonly EffectTemplate[]=['melee','special','shot','beam','around','room','up','down','status','heal','guard','blow'];
export const EFFECT_TYPES:readonly string[]=Object.keys(EFFECT_PALETTE);
/** Real milliseconds of one effect: `total` is its nominal length, `impact` the moment the target is struck. */
const TIMING:Record<EffectTemplate,{total:number;impact:number}>={
 melee:{total:320,impact:100},special:{total:320,impact:240},shot:{total:320,impact:200},beam:{total:320,impact:200},around:{total:320,impact:200},room:{total:320,impact:100},up:{total:320,impact:0},down:{total:320,impact:0},status:{total:320,impact:50},heal:{total:260,impact:0},guard:{total:240,impact:0},blow:{total:220,impact:120}
};
/**
 * Seconds on the design draft's own clock (docs/05-制作流程/界面设计稿/fx.js): `impact` is when the draft calls hit(), `total`
 * is when its last pixel disappears. The whole draft timeline is squeezed proportionally into the real budget above, so a
 * compressed round plays the same picture faster instead of dropping parts of it.
 */
const DRAFT:Record<EffectTemplate,{impact:number;total:number}>={
 melee:{impact:.1,total:.5},special:{impact:.24,total:.64},shot:{impact:.22,total:.62},beam:{impact:.2,total:.6},around:{impact:.2,total:.6},room:{impact:.28,total:.96},up:{impact:0,total:.75},down:{impact:0,total:.75},status:{impact:0,total:.85},heal:{impact:0,total:.885},guard:{impact:0,total:.5},blow:{impact:.12,total:.52}
};
const ATTACK_TEMPLATES:readonly EffectTemplate[]=['melee','special','shot','beam','around','room','blow'];
export const effectImpactDelay=(effect:EffectStyle,durationMs:number):number=>{
 const timing=TIMING[effect.template];return Math.min(durationMs,durationMs*timing.impact/timing.total);
};
type Point={x:number;y:number};
type Palette=readonly [string,string,string];
type CellRect={left:number;top:number;right:number;bottom:number;ix:number;iy:number};
type Clip=(polygon:Point[])=>{pieces:Point[][];complete:boolean};
const GREEN='#8affa0',ORANGE='#ff8a4a',BLUE='#6aa8ff',WHITE='#ffffff';
const cap=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
/** Deterministic stand-in for the draft's Math.random: the same cast always draws the same picture. */
const noise=(i:number,salt:number)=>{const x=Math.sin(i*127.1+salt*311.7)*43758.5453;return x-Math.floor(x);};
const between=(i:number,salt:number,lo:number,hi:number)=>lo+noise(i,salt)*(hi-lo);
/** Evenly spread, still deterministic, horizontal offsets in [-16,16) so no two arrows or crosses share a column. */
const spread=(i:number,salt:number)=>((i*.6180339887+noise(0,salt))%1)*32-16;
const clips=new WeakMap<object,Clip>();
const traces=new WeakMap<object,Point[][]>();
const polygonArea=(points:Point[])=>Math.abs(points.reduce((area,p,i)=>{const q=points[(i+1)%points.length];return area+p.x*q.y-q.x*p.y;},0))/2;
function clipEdge(points:Point[],inside:(p:Point)=>boolean,cross:(a:Point,b:Point)=>Point):Point[]{
 if(!points.length)return [];
 const result:Point[]=[];let a=points[points.length-1],aIn=inside(a);
 for(const b of points){const bIn=inside(b);
  if(aIn&&bIn)result.push(b);
  else if(aIn&&!bIn)result.push(cross(a,b));
  else if(!aIn&&bIn)result.push(cross(a,b),b);
  a=b;aIn=bIn;
 }
 return result;
}
function clipToCell(points:Point[],cell:CellRect):Point[]{
 let poly=points;
 const vertical=(x:number,a:Point,b:Point):Point=>({x,y:a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x)});
 const horizontal=(y:number,a:Point,b:Point):Point=>({x:a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y),y});
 poly=clipEdge(poly,p=>p.x>=cell.left,(a,b)=>vertical(cell.left,a,b));
 poly=clipEdge(poly,p=>p.x<=cell.right,(a,b)=>vertical(cell.right,a,b));
 poly=clipEdge(poly,p=>p.y>=cell.top,(a,b)=>horizontal(cell.top,a,b));
 poly=clipEdge(poly,p=>p.y<=cell.bottom,(a,b)=>horizontal(cell.bottom,a,b));
 return polygonArea(poly)>1e-6?poly:[];
}
function paintPolygon(g:Phaser.GameObjects.Graphics,polygon:Point[]):void{
 const clip=clips.get(g),trace=traces.get(g),clipped=clip?.(polygon),pieces=clipped?(clipped.complete?[polygon]:clipped.pieces):[polygon];
 for(const piece of pieces){if(piece.length<3)continue;g.fillPoints(piece as unknown as Phaser.Math.Vector2[],true);if(trace)trace.push(piece.map(p=>({x:p.x,y:p.y})));}
}
const sq=(g:Phaser.GameObjects.Graphics,x:number,y:number,w:number,h:number,color:string,alpha=1)=>{
 if(alpha<=0)return;
 const rx=Math.round(x),ry=Math.round(y),rw=Math.max(1,Math.round(w)),rh=Math.max(1,Math.round(h));
 g.fillStyle(Number.parseInt(color.slice(1),16),cap(alpha,0,1));
 if(!clips.has(g)){g.fillRect(rx,ry,rw,rh);return;}
 const polygon=[{x:rx,y:ry},{x:rx+rw,y:ry},{x:rx+rw,y:ry+rh},{x:rx,y:ry+rh}],clip=clips.get(g)!,result=clip(polygon),trace=traces.get(g);
 if(result.complete){g.fillRect(rx,ry,rw,rh);trace?.push(polygon);return;}
 for(const piece of result.pieces){g.fillPoints(piece as unknown as Phaser.Math.Vector2[],true);trace?.push(piece.map(p=>({x:p.x,y:p.y})));}
};
/** A bar of `width` along the unit direction `dir`; slanted bars are exact rotated rectangles. */
function bar(g:Phaser.GameObjects.Graphics,from:Point,dir:Point,len:number,width:number,color:string,alpha=1):void{
 if(len<=0||alpha<=0)return;
 const clip=clips.get(g),col=Number.parseInt(color.slice(1),16);
 if(Math.abs(dir.y)<1e-6||Math.abs(dir.x)<1e-6){
  const horizontal=Math.abs(dir.y)<1e-6;
  const x=Math.round(horizontal?(dir.x<0?from.x-len:from.x):from.x-width/2),y=Math.round(horizontal?from.y-width/2:(dir.y<0?from.y-len:from.y));
  const w=Math.max(1,Math.round(horizontal?len:width)),h=Math.max(1,Math.round(horizontal?width:len));
  g.fillStyle(col,alpha);
  if(!clip){g.fillRect(x,y,w,h);return;}
  paintPolygon(g,[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]);
  return;
 }
 const nx=-dir.y*width/2,ny=dir.x*width/2,ex=from.x+dir.x*len,ey=from.y+dir.y*len;
 const pts=[{x:from.x+nx,y:from.y+ny},{x:ex+nx,y:ey+ny},{x:ex-nx,y:ey-ny},{x:from.x-nx,y:from.y-ny}];
 g.fillStyle(col,alpha);
 if(clip)paintPolygon(g,pts);else g.fillPoints(pts as unknown as Phaser.Math.Vector2[],true);
}
/**
 * The draft's particle shapes, with the draft's own offsets (the origin is the draft's (x,y)). `k` runs 1 to 0 over a
 * particle's life; only `dot` changes size with it. Only the streak has a direction: it is drawn along `angle`.
 */
function particle(g:Phaser.GameObjects.Graphics,kind:string,x:number,y:number,p:Palette,s:number,k=1,angle=0):void{
 const [a,b,c]=p;
 const px=(dx:number,dy:number,w:number,h:number,col:string)=>sq(g,x+dx*s,y+dy*s,w*s,h*s,col);
 switch(kind){
  case 'flame':px(0,-3,2,2,b);px(-1,-1,4,3,a);px(0,2,2,1,c);break;
  case 'drop':px(0,-2,2,1,b);px(-1,-1,4,3,a);px(0,2,2,1,c);break;
  case 'leaf':px(-2,0,2,2,a);px(0,-1,3,2,a);px(2,-2,1,1,b);px(-1,1,1,1,c);break;
  case 'bolt':px(0,-3,2,2,b);px(-1,-1,2,2,a);px(1,0,2,2,b);px(0,2,2,1,a);break;
  case 'shard':px(0,-3,1,6,b);px(-1,-1,3,3,a);break;
  case 'bubble':px(-1,-2,3,1,a);px(-2,-1,1,3,a);px(2,-1,1,3,a);px(-1,2,3,1,a);px(-1,-1,1,1,b);break;
  case 'rock':px(-2,-1,4,3,a);px(-1,-2,2,1,b);px(-2,2,4,1,c);break;
  case 'streak':{
   const dir={x:Math.cos(angle),y:Math.sin(angle)},side={x:-dir.y,y:dir.x};
   // Draft (pointing right): 8 long on the centre row, 5 long one row below and starting 2 behind the centre.
   bar(g,{x:x+(-dir.x*4+side.x*.5)*s,y:y+(-dir.y*4+side.y*.5)*s},dir,8*s,s,b);
   bar(g,{x:x+(-dir.x*2+side.x*1.5)*s,y:y+(-dir.y*2+side.y*1.5)*s},dir,5*s,s,a);
   break;
  }
  case 'ring':px(-2,-3,4,1,a);px(-2,3,4,1,a);px(-3,-2,1,4,a);px(3,-2,1,4,a);break;
  case 'wisp':px(-1,-2,3,3,a);px(0,1,1,2,b);px(-1,-1,1,1,b);break;
  case 'claw':px(-2,-3,1,5,a);px(0,-3,1,6,a);px(2,-2,1,5,a);break;
  case 'spark':px(0,0,2,2,b);px(-2,0,1,1,a);px(3,1,1,1,a);break;
  case 'dot':{const d=k>.5?3:2;px(0,0,d,d,a);break;}
  default:px(0,-2,1,5,b);px(-2,0,5,1,b);px(0,0,1,1,a);
 }
}
const unit=(from:Point,to:Point):Point=>{const dx=to.x-from.x,dy=to.y-from.y,n=Math.hypot(dx,dy);return n<1e-6?{x:1,y:0}:{x:dx/n,y:dy/n};};

type ShakeBase={x:number;y:number;active:number};
const shakes=new WeakMap<object,ShakeBase>();
/** Puts the main camera back where it was before any combat shake; the scene's skip path calls this after it kills the tweens. */
export function resetCombatShake(scene:Phaser.Scene):void{
 const camera=scene.cameras?.main;if(!camera)return;
 const base=shakes.get(camera);
 if(base){camera.setPosition(base.x,base.y);shakes.delete(camera);}
}
/**
 * Shakes the main camera by up to 2 draft units for 0.14s of real time (scaled with the round's speed-up, never under two
 * frames). Its own tween runs on, even after the effect object has finished; the effect never waits for it. All shakes of
 * one camera share the position recorded by the first, so overlapping shakes cannot drift. Returns a function that ends it.
 */
function startShake(stage:Stage,size:number,seed:number):()=>void{
 const camera=stage.scene.cameras?.main as Phaser.Cameras.Scene2D.Camera|undefined;
 if(!camera)return ()=>{};
 let base=shakes.get(camera);
 if(!base){base={x:camera.x,y:camera.y,active:0};shakes.set(camera,base);}
 const mine=base;mine.active++;
 const duration=Math.max(34,Math.round(140*(stage.f||1)));
 let done=false;
 const end=()=>{
  if(done)return;
  done=true;
  if(shakes.get(camera)!==mine)return;
  mine.active--;
  if(mine.active<=0){camera.setPosition(mine.x,mine.y);shakes.delete(camera);}
 };
 let handle:{stop?:()=>unknown}|undefined;
 try{
  handle=stage.scene.tweens.add({targets:{t:0},t:1,duration,ease:'Linear',
   onUpdate:(_:unknown,target:{t:number})=>{
    if(done||shakes.get(camera)!==mine)return;
    const frame=Math.floor(target.t*duration/(1000/60));
    camera.setPosition(mine.x+Math.round(between(frame,seed+18,-2,2)*size),mine.y+Math.round(between(frame,seed+19,-2,2)*size));
   },onComplete:end,onStop:end} as unknown as Phaser.Types.Tweens.TweenBuilderConfig) as unknown as {stop?:()=>unknown};
 }catch(error){end();throw error;}
 return ()=>{end();try{handle?.stop?.();}catch{/* the tween is already gone */}};
}

/** A single tween owns the Graphics object's lifetime, so skip/abort cleanup can stop and destroy it. */
export function playCombatEffect(stage:Stage,effect:EffectStyle,from:Pos,at:Pos,impacts:readonly Pos[]=[at],durationMs=320):Promise<void>{
 return new Promise<void>((resolve,reject)=>{
  const g=stage.scene.add.graphics().setDepth(8);
  const size=Math.max(1,stage.scale||stage.cell/24||1);
  const palette=EFFECT_PALETTE[effect.type]??EFFECT_PALETTE.Normal;
  const kind=EFFECT_SHAPE[effect.type]??'star';
  const start=stage.center(from),end=stage.center(at);
  const points=(impacts.length?impacts:[at]).map(p=>stage.center(p));
  const allPoints=points.length?points:[end];
  const duration=cap(durationMs,1,500);
  const template=effect.template,timing=TIMING[template],draft=DRAFT[template],impactP=timing.impact/timing.total;
  const seed=[...(effect.move??'')].reduce((sum,ch)=>sum+ch.charCodeAt(0),template.length);
  const heavy=effect.superEffective===true;
  // Room effects use the caster's real reach; flying effects use every currently visible floor cell.
  const revealClipped=ATTACK_TEMPLATES.includes(template)&&template!=='room';
  const cells=template==='room'?(stage.effectCells?.(from)??[at]).map(p=>({key:p.x+','+p.y,ix:p.x,iy:p.y,...stage.center(p)})):
   revealClipped&&stage.visibleFloorCells?stage.visibleFloorCells().map(p=>({key:p.x+','+p.y,ix:p.x,iy:p.y,...stage.center(p)})):[];
  const cellKeys=cells.map(c=>c.key),restrict=template==='room'||(revealClipped&&!!stage.visibleFloorCells);
  const cellRects:CellRect[]=cells.map(c=>({left:c.x-stage.cell/2,top:c.y-stage.cell/2,right:c.x+stage.cell/2,bottom:c.y+stage.cell/2,ix:c.ix,iy:c.iy}));
  const minCellX=cells.length?Math.min(...cells.map(c=>c.ix)):0,minCellY=cells.length?Math.min(...cells.map(c=>c.iy)):0;
  const cellByKey=new Map(cellRects.map(cell=>[cell.ix+','+cell.iy,cell]));
  const originCell=cells.length?stage.center({x:minCellX,y:minCellY}):{x:0,y:0};
  if(restrict){
   clips.set(g,(polygon)=>{
    if(!cellRects.length)return {pieces:[],complete:false};
    const xs=polygon.map(p=>p.x),ys=polygon.map(p=>p.y);
    const minX=Math.floor((Math.min(...xs)-(originCell.x-stage.cell/2)+1e-7)/stage.cell),maxX=Math.floor((Math.max(...xs)-(originCell.x-stage.cell/2)-1e-7)/stage.cell);
    const minY=Math.floor((Math.min(...ys)-(originCell.y-stage.cell/2)+1e-7)/stage.cell),maxY=Math.floor((Math.max(...ys)-(originCell.y-stage.cell/2)-1e-7)/stage.cell);
    const candidate:CellRect[]=[];
    for(let iy=minY;iy<=maxY;iy++)for(let ix=minX;ix<=maxX;ix++){const cell=cellByKey.get((ix+minCellX)+','+(iy+minCellY));if(cell)candidate.push(cell);}
    const original=polygonArea(polygon),pieces=candidate.map(cell=>clipToCell(polygon,cell)).filter(piece=>piece.length>=3),covered=pieces.reduce((sum,piece)=>sum+polygonArea(piece),0);
    return {pieces,complete:original>0&&covered>=original-1e-5};
   });
   if(stage.debugCombatGeometry)traces.set(g,[]);
  }
  let grid:{top:number}|null=null;
  if(cells.length){
   grid={top:Math.min(...cells.map(c=>c.y))-stage.cell/2};
  }
  let finished=false,shakeStarted=false;const shake:{stop:(()=>void)|null}={stop:null};
  const cleanup=()=>{
   if(finished)return;
   finished=true;
   stage.temp.delete(g);
   if(g.active)g.destroy();
   resolve();
  };
  // The scene's skip path kills tweens and destroys every temporary object; no tween callback runs then.
  g.once('destroy',()=>{
   if(finished)return;
   finished=true;
   shake.stop?.();
   stage.temp.delete(g);
   resolve();
  });
  const toDraft=(p:number)=>draft.impact>0
   ?(p<impactP?p/impactP*draft.impact:draft.impact+(p-impactP)/Math.max(.001,1-impactP)*(draft.total-draft.impact))
   :p*draft.total;
  const draw=(progress:number)=>{
   if(finished)return;
   traces.get(g)?.splice(0);
   g.clear();
   const p=cap(progress,0,1),tau=toDraft(p),u=size;
   const paint=(x:number,y:number,k=1,angle=0,shape=kind)=>particle(g,shape,x,y,palette,u,k,angle);
   const burst=(c:Point)=>{
    const a=tau-draft.impact,n=heavy?16:10;
    if(a<0)return;
    for(let i=0;i<n;i++){
     const ang=Math.PI*2*i/n+between(i,seed+1,-.2,.2),v=between(i,seed+2,35,70),life=between(i,seed+3,.22,.4);
     if(a>life)continue;
     paint(c.x+Math.cos(ang)*v*a*u,c.y+(Math.sin(ang)*v*a+30*a*a)*u,1-a/life);
    }
   };
   if(template==='melee'){
    const k=(tau-draft.impact)/.12;
    if(k>=0&&k<1)for(const target of allPoints)for(let s=0;s<3;s++)for(let i=0;i<14;i++){
     sq(g,target.x+(-14+s*7+i)*u,target.y+(-14+i*1.6)*u,2*u,2*u,k<.5?WHITE:palette[1]);
    }
   }else if(template==='special'){
    const age=tau-.04;
    if(age>=0&&age<.2)for(const target of allPoints)for(let i=0;i<14;i++){
     const a=i/14*Math.PI*2,r=22-100*age;
     paint(target.x+Math.cos(a)*r*u,target.y+Math.sin(a)*r*u);
    }
   }else if(template==='shot'){
    for(const target of allPoints){
     const dir=unit(start,target),side={x:-dir.y,y:dir.x},angle=Math.atan2(dir.y,dir.x);
     // The draft's 520 u/s covers its 76u gap in 0.146s; keep that timing for any distance and let the particle fly on past the target.
     const speed=Math.max(1,Math.hypot(target.x-start.x,target.y-start.y)/u-12)/.146;
     for(let i=0;i<7;i++){
      const age=tau-i*.025;if(age<0||age>=.2)continue;
      const off=between(i,seed+4,-2,2)*u,travel=(12+speed*age)*u;
      paint(start.x+dir.x*travel+side.x*off,start.y+dir.y*travel+side.y*off,1-age/.2,angle);
     }
    }
   }else if(template==='beam'){
    if(tau>.02&&tau<.26)for(const target of allPoints){
     const dir=unit(start,target),o={x:start.x+dir.x*12*u,y:start.y+dir.y*12*u},len=Math.max(0,Math.hypot(target.x-start.x,target.y-start.y)-12*u);
     bar(g,o,dir,len,(Math.floor(tau*40)%2?5:7)*u,palette[0]);
     bar(g,o,dir,len,2*u,palette[1]);
    }
   }else if(template==='around'){
    const age=tau-.04,c={x:start.x,y:start.y+2*u};
    if(age>=0&&age<.3){
     for(let i=0;i<20;i++){const a=i/20*Math.PI*2;paint(c.x+Math.cos(a)*170*age*u,c.y+Math.sin(a)*170*age*u);}
     const r=age/.3*60;
     for(let i=0;i<28;i++){const a=i/28*Math.PI*2;sq(g,c.x+Math.cos(a)*r*u,c.y+Math.sin(a)*r*.7*u,2*u,2*u,palette[1]);}
    }
   }else if(template==='room'&&grid){
    if(tau<.42){
     const alpha=.28*Math.sin(Math.min(1,tau/.42)*Math.PI);
     // Whole cells, edges rounded once so fractional cell sizes leave neither gaps nor lost cells.
     g.fillStyle(Number.parseInt(palette[0].slice(1),16),cap(alpha,0,1));
     for(const c of cells){
      const left=Math.round(c.x-stage.cell/2),top=Math.round(c.y-stage.cell/2);
      g.fillRect(left,top,Math.max(1,Math.round(c.x+stage.cell/2)-left),Math.max(1,Math.round(c.y+stage.cell/2)-top));
     }
    }
    for(let i=0;i<18;i++){
     const age=tau-i*.015;if(age<0||age>=.7)continue;
     const c=cells[Math.floor(noise(i,seed+5)*cells.length)%cells.length];
     paint(c.x-stage.cell/2+noise(i,seed+6)*stage.cell+between(i,seed+7,-30,30)*age*u,grid.top-4*u+between(i,seed+8,240,340)*age*u,1-age/.7);
    }
   }else if(template==='up'||template==='down'){
    const dir=template==='up'?-1:1,col=template==='up'?ORANGE:BLUE;
    for(const [index,target] of allPoints.entries()){
     const k=tau/.5;
     if(template==='up'&&k<1)for(let i=0;i<16;i++){const a=i/16*Math.PI*2+k*3;sq(g,target.x+Math.cos(a)*18*u,target.y+Math.sin(a)*6*u-k*10*u,2*u,2*u,palette[0]);}
     for(let i=0;i<8;i++){
      const t=(tau-i*.05)/.4;if(t<0||t>=1)continue;
      const x=target.x+spread(i+index*8,seed+9)*u,y=target.y+(template==='up'?12:-18)*u+dir*t*24*u;
      sq(g,x,y-3*u,2*u,7*u,col);
      sq(g,x-2*u,y+(dir<0?-1:2)*u,6*u,2*u,col);
      sq(g,x-u,y+(dir<0?-3:4)*u,4*u,2*u,col);
     }
    }
   }else if(template==='status'){
    const age=tau-.05;
    if(age>=0)for(const [index,target] of allPoints.entries()){
     for(let i=0;i<12;i++){
      const n=i+index*12,life=between(n,seed+10,.4,.7);if(age>=life)continue;
      paint(target.x+between(n,seed+11,-14,14)*u,target.y+(8+between(n,seed+12,-4,4)+between(n,seed+13,-70,-30)*age)*u);
     }
     if(age<.8)paint(target.x+Math.sin(age*10)*4*u,target.y-22*u);
    }
   }else if(template==='heal'){
    for(const [index,target] of allPoints.entries())for(let i=0;i<12;i++){
     const k=(tau-i*.035)/.5;if(k<0||k>=1)continue;
     const n=i+index*12,x=target.x+spread(n,seed+14)*u,y=target.y+(8+between(n,seed+15,-4,8)-k*30)*u;
     sq(g,x,y-2*u,2*u,6*u,GREEN);
     sq(g,x-2*u,y,6*u,2*u,GREEN);
    }
   }else if(template==='guard'){
    const col=p<.3?WHITE:palette[1];
    for(const target of allPoints)for(let i=-7;i<=7;i++){
     const a=i/7*1.2;
     sq(g,target.x+Math.cos(a)*22*u,target.y+Math.sin(a)*24*u,3*u,3*u,col);
    }
   }else if(template==='blow'){
    for(const target of allPoints){
     const dir=unit(start,target),side={x:-dir.y,y:dir.x},angle=Math.atan2(dir.y,dir.x);
     for(let i=0;i<10;i++){
      const age=tau-i*.02;if(age<0||age>=.3)continue;
      const along=14+between(i,seed+16,320,440)*age,off=-8+between(i,seed+17,-12,16);
      paint(start.x+(dir.x*along+side.x*off)*u,start.y+(dir.y*along+side.y*off)*u,1-age/.3,angle,'streak');
     }
    }
   }
   if(ATTACK_TEMPLATES.includes(template))for(const target of allPoints)burst(target);
   // Super-effective hits shake the main camera from the moment of impact, on a real-time clock of their own.
   if(heavy&&ATTACK_TEMPLATES.includes(template)&&!stage.reduceMotion&&!shakeStarted&&tau>=draft.impact){shakeStarted=true;shake.stop=startShake(stage,u,seed);}
   const phase=p<.22?'start':p<impactP?'travel':'impact';
   g.setData('combatEffect',{template,type:effect.type,move:effect.move,phase,elapsed:Math.round(duration*p),superEffective:heavy,...(template==='room'?{cells:cellKeys}:revealClipped&&stage.visibleFloorCells?{visibleCells:cellKeys}:{}),...(traces.has(g)?{actualGeometry:(traces.get(g)??[]).map(poly=>poly.map(q=>[q.x,q.y]))}:{})});
  };
  g.setData('combatEffect',{template,type:effect.type,move:effect.move,phase:'start',elapsed:0,superEffective:heavy,...(template==='room'?{cells:cellKeys}:revealClipped&&stage.visibleFloorCells?{visibleCells:cellKeys}:{}),...(traces.has(g)?{actualGeometry:[]}:{})});
  stage.temp.add(g);
  try{
   stage.scene.tweens.add({targets:{progress:0},progress:1,duration,ease:'Linear',onUpdate:(_:unknown,target:{progress:number})=>draw(target.progress),onComplete:cleanup,onStop:cleanup} as unknown as Phaser.Types.Tweens.TweenBuilderConfig);
  }catch(error){
   finished=true;
   shake.stop?.();
   stage.temp.delete(g);
   if(g.active)g.destroy();
   reject(error);
  }
 });
}
