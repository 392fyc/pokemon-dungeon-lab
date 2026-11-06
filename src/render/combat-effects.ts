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
const TIMING:Record<EffectTemplate,{total:number;impact:number}>={
 melee:{total:320,impact:100},special:{total:320,impact:240},shot:{total:320,impact:200},beam:{total:320,impact:200},around:{total:320,impact:200},room:{total:320,impact:280},up:{total:320,impact:0},down:{total:320,impact:0},status:{total:320,impact:50},heal:{total:260,impact:0},guard:{total:240,impact:0},blow:{total:220,impact:120}
};
export const effectImpactDelay=(effect:EffectStyle,durationMs:number):number=>{
 const timing=TIMING[effect.template];return Math.min(durationMs,durationMs*timing.impact/timing.total);
};
type Point={x:number;y:number};
type Palette=readonly [string,string,string];
const cap=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const sq=(g:Phaser.GameObjects.Graphics,x:number,y:number,w:number,h:number,color:string,alpha=1)=>{
 if(alpha<=0)return;
 g.fillStyle(Number.parseInt(color.slice(1),16),cap(alpha,0,1));
 g.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));
};
function particle(g:Phaser.GameObjects.Graphics,kind:string,x:number,y:number,p:Palette,s:number,alpha:number,angle=0):void{
 const [a,b,c]=p;
 const px=(dx:number,dy:number,w:number,h:number,col:string)=>sq(g,x+(dx*Math.cos(angle)-dy*Math.sin(angle))*s,y+(dx*Math.sin(angle)+dy*Math.cos(angle))*s,w*s,h*s,col,alpha);
 switch(kind){
  case 'flame':px(-1,-3,2,2,b);px(-2,-1,4,3,a);px(-1,2,2,1,c);break;
  case 'drop':px(-1,-3,2,1,b);px(-2,-2,4,3,a);px(-1,1,2,1,c);break;
  case 'leaf':px(-3,0,2,2,a);px(-1,-1,3,2,a);px(2,-2,1,1,b);px(-2,1,1,1,c);break;
  case 'bolt':px(-1,-3,2,2,b);px(-2,-1,2,2,a);px(0,0,2,2,b);px(-1,2,2,1,a);break;
  case 'shard':px(-.5,-3,1,6,b);px(-2,-1,4,3,a);break;
  case 'bubble':px(-1,-3,3,1,a);px(-2,-2,1,4,a);px(2,-2,1,4,a);px(-1,2,3,1,a);px(0,-1,1,1,b);break;
  case 'rock':px(-2,-1,4,3,a);px(-1,-2,2,1,b);px(-2,2,4,1,c);break;
  case 'streak':px(-4,-1,8,1,b);px(-2,0,5,1,a);break;
  case 'ring':px(-2,-3,4,1,a);px(-2,3,4,1,a);px(-3,-2,1,4,a);px(3,-2,1,4,a);break;
  case 'wisp':px(-1,-2,3,3,a);px(0,1,1,2,b);px(-1,-1,1,1,b);break;
  case 'claw':px(-2,-3,1,5,a);px(0,-3,1,6,a);px(2,-2,1,5,a);break;
  case 'spark':px(-1,-1,2,2,b);px(-3,-1,1,1,a);px(2,0,1,1,a);break;
  case 'dot':px(-.5,-.5,2,2,a);break;
  default:px(-.5,-2.5,1,5,b);px(-2.5,-.5,5,1,b);px(-.5,-.5,1,1,a);
 }
}
function line(g:Phaser.GameObjects.Graphics,a:Point,b:Point,spacing:number,draw:(x:number,y:number,i:number,n:number)=>void):void{
 const dx=b.x-a.x,dy=b.y-a.y,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/Math.max(1,spacing)));
 for(let i=0;i<=n;i++){const t=i/n;draw(a.x+dx*t,a.y+dy*t,i,n);}
}
function orbit(center:Point,r:number,i:number,count:number):Point{
 const angle=i*Math.PI*2/count;
 return{x:center.x+Math.cos(angle)*r,y:center.y+Math.sin(angle)*r*.72};
}
function cross(g:Phaser.GameObjects.Graphics,center:Point,s:number,color:string,alpha:number):void{
 sq(g,center.x-2*s,center.y-s,4*s,2*s,color,alpha);
 sq(g,center.x-s,center.y-2*s,2*s,4*s,color,alpha);
}
function roomCells(stage:Stage,at:Pos):Point[]{
 return (stage.visibleCells??[at]).map(p=>stage.center(p));
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
  const cells=effect.template==='room'?roomCells(stage,at):[];
  const allPoints=points.length?points:[end];
  const duration=cap(durationMs,1,500);
  const timing=TIMING[effect.template],impactP=timing.impact/timing.total;
  const driver={progress:0};
  let finished=false;
  const cleanup=()=>{
   if(finished)return;
   finished=true;
   stage.temp.delete(g);
   if(g.active)g.destroy();
   resolve();
  };
  const draw=(progress:number)=>{
   g.clear();
   const p=cap(progress,0,1);
   const attack=['melee','special','shot','beam','around','room','blow'].includes(effect.template);
   const heavy=effect.superEffective===true;
   const pulse=Math.sin(Math.PI*cap(p/.76,0,1));
   const paint=(x:number,y:number,alpha=1,angle=0)=>particle(g,kind,x,y,palette,size,alpha,angle);
   const paintOrbit=(center:Point,r:number,count:number,alpha=1)=>{
    for(let i=0;i<count;i++){const q=orbit(center,r,i,count);paint(q.x,q.y,alpha,i*Math.PI/2);}
   };
   if(effect.template==='melee'){
    const t=cap(p/Math.max(.001,impactP),0,1);
    for(const target of allPoints){
     const center={x:mix(start.x,target.x,t),y:mix(start.y,target.y,t)-stage.cell*.22};
     for(let slash=0;slash<3;slash++){
      const spread=(slash-1)*size*5;
      line(g,{x:center.x-8*size,y:center.y+spread+5*size},{x:center.x+8*size,y:center.y+spread-5*size},size*2,(x,y)=>sq(g,x,y,size*2,size,p<.28?palette[1]:palette[0],.9*(1-p*.35)));
     }
    }
   }else if(effect.template==='special'){
    for(const target of allPoints)paintOrbit(target,(1-pulse)*stage.cell*.28+size*2,14,.9);
   }else if(effect.template==='shot'){
    const t=cap(p/Math.max(.001,impactP),0,1);
    for(const target of allPoints)line(g,start,target,size*5,(x,y,i,n)=>{
     if(i/n<=t)paint(x,y-size*2+(i%3-1)*size,1-t*.25,Math.atan2(target.y-start.y,target.x-start.x));
    });
   }else if(effect.template==='beam'){
    const width=(p<impactP?7:3)*size;
    if(p<=impactP)for(const target of allPoints)line(g,start,target,size*2,(x,y,i)=>{
     sq(g,x-width/2,y-width/2,width,width,p<impactP?palette[0]:palette[1],.72);
     if(i%3===0)sq(g,x-size,y-size,size*2,size*2,palette[1],1);
    });
   }else if(effect.template==='around'){
    paintOrbit(start,size*4+cap(p/Math.max(.001,impactP),0,1)*stage.cell*.55,20,.9);
   }else if(effect.template==='room'){
    const wash=Math.sin(Math.PI*cap(p/.82,0,1))*.2;
    for(const cell of cells){
     sq(g,cell.x-stage.cell/2,cell.y-stage.cell/2,stage.cell,stage.cell,palette[0],wash);
     const seed=((Math.floor(cell.x/size)*17+Math.floor(cell.y/size)*31)%9+9)%9;
     if(seed<4&&p<.92){
      const x=cell.x-stage.cell*.38+((seed*7+Math.floor(p*7)*3)%7)*stage.cell*.1;
      const y=cell.y-stage.cell*.35+((seed*3+Math.floor(p*11)*5)%7)*stage.cell*.1;
      paint(x,y,.8);
     }
    }
   }else if(effect.template==='up'){
    for(let i=0;i<3;i++){
     const age=p*.32-i*.04;if(age<0||age>.4)continue;
     const t=age/.4,x=start.x+(i-1)*stage.cell*.32-size,y=start.y-stage.cell*.28-t*stage.cell*.25;
     sq(g,x,y-size*3,size*2,size*7,'#ff8a4a',.95);sq(g,x-size*2,y-size,size*6,size*2,'#ff8a4a',.95);sq(g,x-size,y-size*3,size*4,size*2,'#ff8a4a',.95);
    }
    for(let i=0;i<16;i++){const q=orbit(start,stage.cell*.22,i,16);sq(g,q.x,q.y-stage.cell*.1*p,size*2,size*2,palette[0],.7);}
   }else if(effect.template==='down'){
    for(const target of allPoints)for(let i=0;i<8;i++){
     const age=p*.32-i*.05;if(age<0||age>.4)continue;
     const t=age/.4,x=target.x+Math.sin(i*2.4)*stage.cell*.26,y=target.y-stage.cell*.42+t*stage.cell*.4;
     sq(g,x,y-size*3,size*2,size*7,'#6aa8ff',.9);sq(g,x-size*2,y+size*2,size*6,size*2,'#6aa8ff',.9);sq(g,x-size,y+size*4,size*4,size*2,'#6aa8ff',.9);
    }
   }else if(effect.template==='status'){
    for(const target of allPoints)paintOrbit(target,stage.cell*.16+pulse*stage.cell*.08,12,.9);
   }else if(effect.template==='heal'){
    for(const target of allPoints)for(let i=0;i<5;i++){
     const t=(p*1.1+i/5)%1,x=target.x+Math.sin(i*3)*stage.cell*.3,y=target.y+stage.cell*.18-t*stage.cell*.5;
     cross(g,{x,y},size,palette[1],.95);
    }
   }else if(effect.template==='guard'){
    const shield=p<.7?palette[1]:palette[0];
    for(const target of allPoints)for(let i=0;i<18;i++){
     const a=-1.2+i*2.4/17,x=target.x+Math.cos(a)*stage.cell*.42,y=target.y-stage.cell*.08+Math.sin(a)*stage.cell*.42;
     sq(g,x-size,y-size,size*2,size*2,shield,.95);
    }
   }else if(effect.template==='blow'){
    const t=cap(p/Math.max(.001,impactP),0,1);
    for(const target of allPoints)line(g,start,target,size*3,(x,y,i,n)=>{
     if(i/n>=t*.5)paint(x,y-stage.cell*.16,1-t*.35,Math.atan2(target.y-start.y,target.x-start.x));
    });
   }
   if(attack&&p>=impactP){
    const tail=Math.max(.001,Math.min(80,timing.total-timing.impact)/timing.total);
    const t=cap((p-impactP)/tail,0,1),count=heavy?18:11;
    for(const target of allPoints){
     for(let i=0;i<count;i++){
      const angle=i*Math.PI*2/count,r=(size*2+stage.cell*.18*t)*(heavy?1.12:1);
      paint(target.x+Math.cos(angle)*r,target.y+Math.sin(angle)*r*.65,(1-t)*.95,angle);
     }
     cross(g,target,size*1.5,'#ffffff',cap(1-t*2,0,1));
    }
   }
   const phase=p<.22?'start':p<impactP?'travel':'impact';
   g.setData('combatEffect',{template:effect.template,type:effect.type,move:effect.move,phase,elapsed:Math.round(duration*p)});
  };
  g.setData('combatEffect',{template:effect.template,type:effect.type,move:effect.move,phase:'start',elapsed:0});
  stage.temp.add(g);
  try{
   stage.scene.tweens.add({targets:driver,progress:1,duration,ease:'Linear',onUpdate:(_:unknown,target:{progress:number})=>draw(target.progress),onComplete:cleanup,onStop:cleanup} as unknown as Phaser.Types.Tweens.TweenBuilderConfig);
  }catch(error){
   stage.temp.delete(g);
   if(g.active)g.destroy();
   reject(error);
  }
 });
}
