import type Phaser from 'phaser';
import {animKey,facingRow,sheet,groundOriginY,UNIT_GROUND_FRACTION} from './sprites.ts';
import {animationBatches,BASE_MS,movementDuration,type AnimEvent} from './animation.ts';
import type {Pos} from '../core/engine.ts';
import {playCombatEffect,effectImpactDelay} from './combat-effects.ts';
import type {EffectStyle} from './effect-spec.ts';
/** Darker shade of a #rrggbb colour (resisted hits read smaller and dimmer). */
const darken=(hex:string,k:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-k)).toString(16).padStart(2,'0')).join('');
/** Everything the scene draws for one unit, so a step can move the sprite, its shadow and its labels together. */
export type UnitView={sprite:Phaser.GameObjects.Sprite;gfx:Phaser.GameObjects.Graphics;labels:{t:Phaser.GameObjects.Text;dx:number;dy:number}[];dex:string;row:number;zs?:Phaser.GameObjects.Text[];zMoving?:boolean};
export type Stage={scene:Phaser.Scene;views:Map<string,UnitView>;center:(p:Pos)=>{x:number;y:number};cell:number;scale:number;temp:Set<Phaser.GameObjects.GameObject>;f:number;effectCells?:(caster:Pos)=>readonly Pos[];reduceMotion?:boolean;cancelled?:()=>boolean;setHitFlash?:(view:UnitView,on:boolean)=>void;onHp?:(id:string,hp:number)=>void;onMovementStart?:(durationMs:number)=>void;onMovementProgress?:(progress:number)=>void};
const wait=(st:Stage,ms:number)=>new Promise<void>(r=>{st.scene.time.delayedCall(Math.max(1,ms),()=>r());});
const tween=(st:Stage,cfg:Record<string,unknown>)=>new Promise<void>(r=>{st.scene.tweens.add({...cfg,onComplete:()=>r()} as unknown as Phaser.Types.Tweens.TweenBuilderConfig);});
const put=(st:Stage,v:UnitView,x:number,y:number)=>{v.sprite.setPosition(x,y+st.cell*UNIT_GROUND_FRACTION);v.gfx.setPosition(x,y);v.labels.forEach(l=>l.t.setPosition(x+l.dx,y+l.dy));};
const slide=(st:Stage,v:UnitView,from:{x:number;y:number},to:{x:number;y:number},ms:number,delay=0)=>tween(st,{targets:{t:0},t:1,duration:Math.max(1,ms),delay,ease:'Linear',onUpdate:(_:unknown,o:{t:number})=>{put(st,v,from.x+(to.x-from.x)*o.t,from.y+(to.y-from.y)*o.t);st.onMovementProgress?.(o.t);}});
/** Plays one named action of the unit's species; returns false when the sheet or direction is missing (the unit just stays as drawn). */
function useAnim(st:Stage,v:UnitView,name:string,row:number,ms?:number):boolean{
  const m=sheet(v.dex,name),k=animKey(v.dex,name,row);if(!m||!st.scene.anims.exists(k))return false;
  v.sprite.setOrigin(.5,groundOriginY(v.dex,name));v.sprite.play(k);
  v.sprite.anims.timeScale=ms?m.durations.reduce((a,b)=>a+b,0)*1000/60/ms:1;return true;
}
const idle=(st:Stage,v:UnitView)=>{useAnim(st,v,'Idle',v.row);};
const face=(v:UnitView,from:Pos,to:Pos)=>{v.row=facingRow(to.x-from.x,to.y-from.y);};
const track=<T extends Phaser.GameObjects.GameObject>(st:Stage,o:T):T=>{st.temp.add(o);return o;};
function flash(st:Stage,keyName:string,at:{x:number;y:number},ms:number,delay:number,opts:{angle?:number;grow?:number;from?:{x:number;y:number}}={}){
  return wait(st,delay).then(()=>{
    const start=opts.from??at,im=track(st,st.scene.add.image(start.x,start.y,keyName).setDepth(7).setScale(st.scale*(opts.grow?1:1.3)*.7).setAlpha(.95).setRotation(opts.angle??0));
    return tween(st,{targets:im,x:at.x,y:at.y,scale:st.scale*(opts.grow??1.3),alpha:0,duration:Math.max(1,ms),ease:'Quad.easeOut'}).then(()=>{im.destroy();st.temp.delete(im);});});
}
function floatText(st:Stage,at:{x:number;y:number},text:string,color:string,ms:number,delay:number,opt:{size?:number;bounce?:boolean}={}){
  return wait(st,delay).then(()=>{
    const t=track(st,st.scene.add.text(at.x,at.y-st.cell*.3,text,{fontFamily:'sans-serif',fontSize:opt.size??15,fontStyle:'bold',color,stroke:'#0b1312',strokeThickness:4}).setOrigin(.5).setDepth(9));
    if(opt.bounce)void tween(st,{targets:t,scale:{from:1.7,to:1},duration:Math.max(1,Math.min(ms,220)),ease:'Back.easeOut'});
    void tween(st,{targets:t,alpha:0,delay:Math.round(Math.max(1,ms)*.55),duration:Math.max(1,Math.round(ms*.45))});   // stays fully opaque for the first half so the colour reads
    return tween(st,{targets:t,y:at.y-st.cell*.85,duration:Math.max(1,ms),ease:'Quad.easeOut'}).then(()=>{t.destroy();st.temp.delete(t);});});
}
const hurt=(st:Stage,v:UnitView,ms:number,delay:number,white=false,recoil=true)=>wait(st,delay).then(()=>{
  const x=v.sprite.x;useAnim(st,v,'Hurt',v.row,ms);
  if(white)st.setHitFlash?.(v,true);
  const motion=recoil?tween(st,{targets:v.sprite,x:x+3,duration:Math.max(1,ms/6),yoyo:true,repeat:2}):wait(st,ms);
  const tint=white?wait(st,Math.min(ms,80*st.f)).then(()=>st.setHitFlash?.(v,false)):Promise.resolve();
  return Promise.all([motion,tint]).then(()=>{v.sprite.x=x;idle(st,v);});});
type EffectPlaybackOptions={skipEffect?:boolean;sharedCast?:boolean;impactPositions?:readonly Pos[];effect?:EffectStyle};
const eventEffect=(ev:AnimEvent):EffectStyle|undefined=>ev.k==='effect'?ev.effect:'effect' in ev?ev.effect:undefined;
function effectFrom(ev:AnimEvent):Pos{
 if(ev.k==='hit')return ev.from??ev.at;
 if(ev.k==='protect')return ev.from;
 if(ev.k==='blowaway')return ev.actorAt;
 if(ev.k==='heal')return ev.actorAt;
 if(ev.k==='effect')return ev.from;
 throw new Error('no effect source for event '+ev.k);
}
function effectAt(ev:AnimEvent):Pos{
 if(ev.k==='hit'||ev.k==='protect'||ev.k==='heal'||ev.k==='effect')return ev.at;
 if(ev.k==='blowaway')return ev.from;
 throw new Error('no effect target for event '+ev.k);
}
function drawEffect(st:Stage,ev:AnimEvent,opts:EffectPlaybackOptions={}):Promise<void>{
 const style=opts.effect??eventEffect(ev);if(!style||opts.skipEffect)return Promise.resolve();
 const at=effectAt(ev),from=effectFrom(ev),base=style.template==='blow'?BASE_MS.blowaway:BASE_MS[ev.k];
 return playCombatEffect(st,style,from,at,opts.impactPositions??[at],base*st.f);
}
function groupedEffects(batch:AnimEvent[]):Map<AnimEvent,EffectPlaybackOptions>{
 const groups=new Map<string,{events:AnimEvent[];styles:EffectStyle[];points:Pos[]}>();
 for(const ev of batch){
  const style=eventEffect(ev);if(!style)continue;
  const eligible=ev.k==='effect'||(style.template==='blow')||(ev.k==='hit'&&(style.template==='around'||style.template==='room'));if(!eligible)continue;
  const key=[ev.by,style.move??'',style.template,style.type].join('|');let group=groups.get(key);
  if(!group){group={events:[],styles:[],points:[]};groups.set(key,group);}
  group.events.push(ev);group.styles.push(style);group.points.push(effectAt(ev));
 }
 const out=new Map<AnimEvent,EffectPlaybackOptions>();
 for(const group of groups.values()){
  if(group.events.length<2)continue;
  const style={...group.styles[0],superEffective:group.styles.some(item=>item.superEffective===true),resisted:group.styles.every(item=>item.resisted===true)};
  group.events.forEach((ev,index)=>out.set(ev,index===0?{effect:style,impactPositions:group.points}:{skipEffect:true,sharedCast:true}));
 }
 return out;
}
async function play(st:Stage,ev:AnimEvent,opts:EffectPlaybackOptions={}):Promise<void>{
  const f=st.f,d=(ms:number)=>ms*f,at=(p:Pos)=>st.center(p),V=(id:string)=>st.views.get(id);
  if(ev.k==='move'){const v=V(ev.id);if(!v)return;face(v,ev.from,ev.to);useAnim(st,v,'Walk',v.row);await slide(st,v,at(ev.from),at(ev.to),d(BASE_MS.move));idle(st,v);}
  else if(ev.k==='recall'){const v=V(ev.id);if(!v)return;face(v,ev.from,ev.to);useAnim(st,v,'Walk',v.row);await slide(st,v,at(ev.from),at(ev.to),d(BASE_MS.recall));idle(st,v);}
  else if(ev.k==='airAttack'){const v=V(ev.actor);if(v){face(v,ev.from,ev.to);useAnim(st,v,'Attack',v.row,d(BASE_MS.airAttack));await wait(st,d(BASE_MS.airAttack));idle(st,v);}}
  else if(ev.k==='swap'){const a=V(ev.a),b=V(ev.b),ps:Promise<void>[]=[];
    if(a){face(a,ev.pa,ev.pb);useAnim(st,a,'Walk',a.row);ps.push(slide(st,a,at(ev.pa),at(ev.pb),d(BASE_MS.swap)));}
    if(b){face(b,ev.pb,ev.pa);useAnim(st,b,'Walk',b.row);ps.push(slide(st,b,at(ev.pb),at(ev.pa),d(BASE_MS.swap)));}
    await Promise.all(ps);if(a)idle(st,a);if(b)idle(st,b);}
  else if(ev.k==='hit'){
    const A=ev.attacker?V(ev.attacker):undefined,T=V(ev.target),to=at(ev.at),ps:Promise<void>[]=[];
    if(A&&ev.from&&!opts.sharedCast){face(A,ev.from,ev.at);useAnim(st,A,'Attack',A.row,d(260));ps.push(wait(st,d(260)).then(()=>idle(st,A)));}
    if(ev.effect)ps.push(drawEffect(st,ev,opts));
    else if(ev.fx==='strong')ps.push(flash(st,'fx-strong',to,d(200),d(80)));
    else if(ev.fx==='line'&&ev.from)ps.push(flash(st,'fx-line',to,d(200),d(60),{angle:Math.atan2(to.y-at(ev.from).y,to.x-at(ev.from).x),from:at(ev.from),grow:1}));
    const impact=ev.collision?d(280):ev.effect?d(effectImpactDelay(ev.effect,ev.effect.template==='blow'?BASE_MS.blowaway:BASE_MS.hit)):d(110);
    const duration=ev.cast||ev.effect?500:BASE_MS.hit;
    if(T){if(ev.from)face(T,ev.at,ev.from);if(!ev.immune)ps.push(hurt(st,T,d(170),impact,!!ev.effect&&ev.amount>0,ev.effect?.template!=='blow'));}
    // The number takes the move's type colour (a plain attack stays white); a critical hit adds "!" and a bigger size, a super effective hit is bigger and bounces, a resisted one is smaller and darker.
    {const sup=!!ev.effect?.superEffective,res=!!ev.effect?.resisted&&ev.amount>0,base=ev.tint??'#ffffff';
     const color=ev.amount<=0?'#c8d0d0':res?darken(base,.35):base,size=ev.amount<=0?15:ev.crit?22:sup?20:res?12:15;
     const text=ev.amount>0?String(ev.amount)+(ev.crit?'!':''):ev.immune?'没有效果':'没有伤害';
     ps.push(floatText(st,to,text,color,ev.effect||ev.cast?Math.max(1,d(duration)-impact):d(220),impact,{size,bounce:sup||!!ev.crit}));
     if(ev.hpAfter!==undefined&&st.onHp)ps.push(wait(st,impact).then(()=>st.onHp!(ev.target,ev.hpAfter!)));}
    if(ev.effect?.superEffective)ps.push(floatText(st,{x:to.x,y:to.y-st.cell*.3},'效果绝佳','#ffd24a',Math.max(1,d(duration)-impact),impact));
    else if(ev.effect?.resisted&&ev.amount>0)ps.push(floatText(st,{x:to.x,y:to.y-st.cell*.3},'效果不好','#9fb4c8',Math.max(1,d(duration)-impact),impact));
    if(ev.dead&&T)ps.push(wait(st,d(ev.effect||ev.cast?duration-140:220)).then(()=>tween(st,{targets:[T.sprite,T.gfx,...T.labels.map(l=>l.t)],alpha:0,duration:Math.max(1,d(140))})));
    await Promise.all(ps);}
  else if(ev.k==='protect'){const A=V(ev.by);if(A)face(A,ev.from,ev.at);if(A)idle(st,A);
    if(ev.effect)await drawEffect(st,ev,opts);else await flash(st,'fx-guard',at(ev.at),d(BASE_MS.protect),0,{grow:1.5});}
  else if(ev.k==='blowaway'){const A=V(ev.by),T=V(ev.target),ps:Promise<void>[]=[];
    const dir=Math.atan2(ev.to.y-ev.from.y,ev.to.x-ev.from.x);
    if(A&&!opts.sharedCast){face(A,ev.actorAt,ev.from);useAnim(st,A,'Attack',A.row,d(200));ps.push(wait(st,d(200)).then(()=>idle(st,A)));}
    if(ev.effect)ps.push(drawEffect(st,ev,opts));else ps.push(flash(st,'fx-push',at(ev.from),d(160),d(30),{angle:dir,grow:1.4}));
    if(T)ps.push(wait(st,d(ev.effect?effectImpactDelay(ev.effect,BASE_MS.blowaway):60)).then(()=>{st.onMovementStart?.(d(160));return slide(st,T,at(ev.from),at(ev.to),d(160));}));
    await Promise.all(ps);}
  else if(ev.k==='heal'){const A=V(ev.by);if(A)face(A,ev.actorAt,ev.at);if(A&&ev.target!==ev.by)idle(st,A);
    const delay=ev.effect?d(effectImpactDelay(ev.effect,BASE_MS.heal)):d(40);
    await Promise.all([ev.effect?drawEffect(st,ev,opts):flash(st,'fx-heal',at(ev.at),d(BASE_MS.heal),0,{grow:1.3}),floatText(st,at(ev.at),ev.item==='berry'?'+'+ev.amount:'PP+'+ev.amount,'#62e06f',ev.effect?Math.max(1,d(BASE_MS.heal)-delay):d(220),delay),...(ev.hpAfter!==undefined&&st.onHp?[wait(st,delay).then(()=>st.onHp!(ev.target,ev.hpAfter!))]:[])]);}
  else if(ev.k==='hpchange'){const to=at(ev.at),loss=ev.delta<0;   // status damage, recoil or a drain: the HP moves when it happens
    await Promise.all([floatText(st,to,loss?String(-ev.delta):'+'+ev.delta,loss?'#ff9c88':'#62e06f',d(BASE_MS.hpchange),d(30)),wait(st,d(30)).then(()=>st.onHp?.(ev.target,ev.hpAfter)),wait(st,d(BASE_MS.hpchange))]);}
  else if(ev.k==='tags'){   // stage and status words: above the damage numbers, a unit's words one after another so they never overlap
    const count=new Map<string,number>();
    await Promise.all(ev.items.map(item=>{const n=count.get(item.target)??0;count.set(item.target,n+1);
      const to=at(item.at);return floatText(st,{x:to.x,y:to.y-st.cell*.34-n*st.cell*.2},item.text,item.color,d(BASE_MS.tags),d(30+n*110),{size:14});}));}
  else if(ev.k==='effect'){const A=V(ev.by);if(A)face(A,ev.from,ev.at);if(A)idle(st,A);
    const ps:Promise<void>[]=[drawEffect(st,ev,opts)],duration=(BASE_MS as Record<string,number>).effect??320;
    if(ev.effect.template==='heal'&&ev.amount!==undefined&&ev.amount>0)ps.push(floatText(st,at(ev.at),'+'+ev.amount,'#62e06f',d(duration),d(effectImpactDelay(ev.effect,duration))));
    if(ev.hpAfter!==undefined&&st.onHp)ps.push(wait(st,d(effectImpactDelay(ev.effect,duration))).then(()=>st.onHp!(ev.target,ev.hpAfter!)));
    await Promise.all(ps);}
}
export async function playEvents(st:Stage,events:AnimEvent[]):Promise<void>{
 for(const batch of animationBatches(events)){
  if(st.cancelled?.())return;
  const first=batch[0];
  if(first&&(first.k==='move'||first.k==='swap')){
   st.onMovementStart?.(movementDuration(batch,st.f));
   const progress=batch.map(()=>0);
   await Promise.all(batch.map((ev,index)=>play({...st,onMovementProgress:value=>{
    progress[index]=value;st.onMovementProgress?.(Math.min(...progress));
   }},ev)));
   st.onMovementProgress?.(1);
  }else{const options=groupedEffects(batch);await Promise.all(batch.map(ev=>play(st,ev,options.get(ev))));}
 }
}
