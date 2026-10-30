import type Phaser from 'phaser';
import {animKey,facingRow,sheet} from './sprites.ts';
import {BASE_MS,type AnimEvent} from './animation.ts';
import type {Pos} from '../core/engine.ts';
/** Everything the scene draws for one unit, so a step can move the sprite, its shadow and its labels together. */
export type UnitView={sprite:Phaser.GameObjects.Sprite;gfx:Phaser.GameObjects.Graphics;labels:{t:Phaser.GameObjects.Text;dx:number;dy:number}[];dex:string;row:number};
export type Stage={scene:Phaser.Scene;views:Map<string,UnitView>;center:(p:Pos)=>{x:number;y:number};cell:number;scale:number;temp:Set<Phaser.GameObjects.GameObject>;f:number};
const wait=(st:Stage,ms:number)=>new Promise<void>(r=>{st.scene.time.delayedCall(Math.max(1,ms),()=>r());});
const tween=(st:Stage,cfg:Record<string,unknown>)=>new Promise<void>(r=>{st.scene.tweens.add({...cfg,onComplete:()=>r()} as unknown as Phaser.Types.Tweens.TweenBuilderConfig);});
const put=(st:Stage,v:UnitView,x:number,y:number)=>{v.sprite.setPosition(x,y+st.cell*.08);v.gfx.setPosition(x,y);v.labels.forEach(l=>l.t.setPosition(x+l.dx,y+l.dy));};
const slide=(st:Stage,v:UnitView,from:{x:number;y:number},to:{x:number;y:number},ms:number,delay=0)=>tween(st,{targets:{t:0},t:1,duration:Math.max(1,ms),delay,ease:'Sine.easeInOut',onUpdate:(_:unknown,o:{t:number})=>put(st,v,from.x+(to.x-from.x)*o.t,from.y+(to.y-from.y)*o.t)});
/** Plays one named action of the unit's species; returns false when the sheet or direction is missing (the unit just stays as drawn). */
function useAnim(st:Stage,v:UnitView,name:string,row:number,ms?:number):boolean{
  const m=sheet(v.dex,name),k=animKey(v.dex,name,row);if(!m||!st.scene.anims.exists(k))return false;
  v.sprite.setOrigin(.5,name==='Idle'?.6:.5+4/m.h);v.sprite.play(k);
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
function floatText(st:Stage,at:{x:number;y:number},text:string,color:string,ms:number,delay:number){
  return wait(st,delay).then(()=>{
    const t=track(st,st.scene.add.text(at.x,at.y-st.cell*.3,text,{fontFamily:'sans-serif',fontSize:15,fontStyle:'bold',color,stroke:'#0b1312',strokeThickness:3}).setOrigin(.5).setDepth(9));
    return tween(st,{targets:t,y:at.y-st.cell*.85,alpha:0,duration:Math.max(1,ms),ease:'Quad.easeOut'}).then(()=>{t.destroy();st.temp.delete(t);});});
}
const hurt=(st:Stage,v:UnitView,ms:number,delay:number)=>wait(st,delay).then(()=>{
  const x=v.sprite.x;useAnim(st,v,'Hurt',v.row,ms);
  return tween(st,{targets:v.sprite,x:x+3,duration:Math.max(1,ms/6),yoyo:true,repeat:2}).then(()=>{v.sprite.x=x;idle(st,v);});});
async function play(st:Stage,ev:AnimEvent):Promise<void>{
  const f=st.f,d=(ms:number)=>ms*f,at=(p:Pos)=>st.center(p),V=(id:string)=>st.views.get(id);
  if(ev.k==='move'){const v=V(ev.id);if(!v)return;face(v,ev.from,ev.to);useAnim(st,v,'Walk',v.row);await slide(st,v,at(ev.from),at(ev.to),d(BASE_MS.move));idle(st,v);}
  else if(ev.k==='swap'){const a=V(ev.a),b=V(ev.b);const ps:Promise<void>[]=[];
    if(a){face(a,ev.pa,ev.pb);useAnim(st,a,'Walk',a.row);ps.push(slide(st,a,at(ev.pa),at(ev.pb),d(BASE_MS.swap)));}
    if(b){face(b,ev.pb,ev.pa);useAnim(st,b,'Walk',b.row);ps.push(slide(st,b,at(ev.pb),at(ev.pa),d(BASE_MS.swap)));}
    await Promise.all(ps);if(a)idle(st,a);if(b)idle(st,b);}
  else if(ev.k==='hit'){
    const A=ev.attacker?V(ev.attacker):undefined,T=V(ev.target),to=at(ev.at),ps:Promise<void>[]=[];
    if(A&&ev.from){face(A,ev.from,ev.at);useAnim(st,A,'Attack',A.row,d(260));ps.push(wait(st,d(260)).then(()=>idle(st,A)));}
    if(ev.fx==='strong')ps.push(flash(st,'fx-strong',to,d(200),d(80)));
    else if(ev.fx==='line'&&ev.from)ps.push(flash(st,'fx-line',to,d(200),d(60),{angle:Math.atan2(to.y-at(ev.from).y,to.x-at(ev.from).x),from:at(ev.from),grow:1}));
    if(T){if(ev.from)face(T,ev.at,ev.from);ps.push(hurt(st,T,d(170),d(110)));}
    ps.push(floatText(st,to,`-${ev.amount}`,'#ff9c88',d(220),d(110)));
    if(ev.dead&&T)ps.push(wait(st,d(220)).then(()=>tween(st,{targets:[T.sprite,...T.labels.map(l=>l.t)],alpha:0,duration:Math.max(1,d(140))})));
    await Promise.all(ps);}
  else if(ev.k==='protect'){const A=V(ev.by);if(A)face(A,ev.from,ev.at);if(A)idle(st,A);
    await flash(st,'fx-guard',at(ev.at),d(BASE_MS.protect),0,{grow:1.5});}
  else if(ev.k==='blowaway'){const A=V(ev.by),T=V(ev.target),ps:Promise<void>[]=[];
    const dir=Math.atan2(ev.to.y-ev.from.y,ev.to.x-ev.from.x);
    if(A){face(A,ev.actorAt,ev.from);useAnim(st,A,'Attack',A.row,d(200));ps.push(wait(st,d(200)).then(()=>idle(st,A)));}
    ps.push(flash(st,'fx-push',at(ev.from),d(160),d(30),{angle:dir,grow:1.4}));
    if(T)ps.push(slide(st,T,at(ev.from),at(ev.to),d(160),d(60)));
    await Promise.all(ps);}
  else if(ev.k==='heal'){const A=V(ev.by);if(A)face(A,ev.actorAt,ev.at);if(A&&ev.target!==ev.by)idle(st,A);
    await Promise.all([flash(st,'fx-heal',at(ev.at),d(BASE_MS.heal),0,{grow:1.3}),floatText(st,at(ev.at),ev.item==='berry'?`+${ev.amount}`:`PP+${ev.amount}`,'#9be3a0',d(220),d(40))]);}
}
export async function playEvents(st:Stage,events:AnimEvent[]):Promise<void>{for(const ev of events)await play(st,ev);}
