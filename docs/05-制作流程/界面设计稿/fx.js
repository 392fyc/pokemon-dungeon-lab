/* 招式特效演示：12 种形状模板 × 18 种属性外观。画布按游戏同样的 2 倍像素绘制，粒子全部用方块，不用贴图。 */
window.FX=(function(){
 const PAL={Normal:['#e8e4d8','#ffffff','#9a9486'],Fire:['#f0702a','#ffd24a','#a82c14'],Water:['#3f8fe0','#a8e0ff','#1f4f9a'],Grass:['#4fb83f','#c8f07a','#1f6a2a'],Electric:['#f5d02a','#fff8b0','#b08a10'],Ice:['#7fdcec','#eaffff','#3f8fb0'],Fighting:['#d8483a','#ffc0a0','#8a2020'],Poison:['#a050c8','#e0a8f0','#5a2478'],Ground:['#c49a4a','#f0d890','#7a5a24'],Flying:['#a8c8f0','#ffffff','#5f86b8'],Psychic:['#f05a9a','#ffc0e0','#a02a68'],Bug:['#a0c030','#e0f080','#5a7a18'],Rock:['#a8946a','#d8c8a0','#5f5238'],Ghost:['#7a60c0','#c8b0ff','#3f2f78'],Dragon:['#6a58e8','#b8b0ff','#2f2a98'],Dark:['#5a4a42','#a08a7a','#241c18'],Steel:['#a8b8c8','#ffffff','#5a6a7a'],Fairy:['#f08ac0','#ffe0f0','#b04a88']};
 /* 每种属性一种粒子外形：同样的“爆开”，火是火苗，水是水滴，草是叶片。 */
 const SHAPE={Normal:'star',Fire:'flame',Water:'drop',Grass:'leaf',Electric:'bolt',Ice:'shard',Fighting:'star',Poison:'bubble',Ground:'rock',Flying:'streak',Psychic:'ring',Bug:'dot',Rock:'rock',Ghost:'wisp',Dragon:'shard',Dark:'claw',Steel:'spark',Fairy:'star'};
 let c,g,img={},parts=[],t0=0,raf=0,tpl='melee',type='Fire',super_=false,state=null,looping=true,floor=null;
 const ATT={x:72,y:86},TGT={x:160,y:86},T2={x:160,y:48},T3={x:200,y:112};
 const rnd=(a,b)=>a+Math.random()*(b-a);
 function px(x,y,w,h,col){g.fillStyle=col;g.fillRect(Math.round(x),Math.round(y),w,h);}
 function shape(s,x,y,p,k){const[a,b,d]=p;const r=k>0.5?2:1;
  switch(s){
   case 'flame':px(x,y-3,2,2,b);px(x-1,y-1,4,3,a);px(x,y+2,2,1,d);break;
   case 'drop':px(x,y-2,2,1,b);px(x-1,y-1,4,3,a);px(x,y+2,2,1,d);break;
   case 'leaf':px(x-2,y,2,2,a);px(x,y-1,3,2,a);px(x+2,y-2,1,1,b);px(x-1,y+1,1,1,d);break;
   case 'bolt':px(x,y-3,2,2,b);px(x-1,y-1,2,2,a);px(x+1,y,2,2,b);px(x,y+2,2,1,a);break;
   case 'shard':px(x,y-3,1,6,b);px(x-1,y-1,3,3,a);break;
   case 'bubble':px(x-1,y-2,3,1,a);px(x-2,y-1,1,3,a);px(x+2,y-1,1,3,a);px(x-1,y+2,3,1,a);px(x-1,y-1,1,1,b);break;
   case 'rock':px(x-2,y-1,4,3,a);px(x-1,y-2,2,1,b);px(x-2,y+2,4,1,d);break;
   case 'streak':px(x-4,y,8,1,b);px(x-2,y+1,5,1,a);break;
   case 'ring':px(x-2,y-3,4,1,a);px(x-2,y+3,4,1,a);px(x-3,y-2,1,4,a);px(x+3,y-2,1,4,a);break;
   case 'wisp':px(x-1,y-2,3,3,a);px(x,y+1,1,2,b);px(x-1,y-1,1,1,b);break;
   case 'claw':px(x-2,y-3,1,5,a);px(x,y-3,1,6,a);px(x+2,y-2,1,5,a);break;
   case 'spark':px(x,y,2,2,b);px(x-2,y,1,1,a);px(x+3,y+1,1,1,a);break;
   case 'dot':px(x,y,1+r,1+r,a);break;
   default:px(x,y-2,1,5,b);px(x-2,y,5,1,b);px(x,y,1,1,a);
  }}
 function emit(o){parts.push(Object.assign({x:0,y:0,vx:0,vy:0,g:0,life:.5,age:0,s:SHAPE[type]},o));}
 function burst(x,y,n,sp){for(let i=0;i<n;i++){const a=Math.PI*2*i/n+rnd(-.2,.2),v=rnd(sp*.5,sp);emit({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,g:60,life:rnd(.22,.4)});}}
 function hit(T){if(!state)return;state.hits.push({T,t:now()});burst(T.x,T.y-8,super_?16:10,70);state.flash=now();if(super_)state.shake=now();}
 const now=()=>performance.now()/1000-t0;
 /* 时间表：每个模板在固定时刻触发事件；总长都控制在 0.5 秒内（回复与异常略长，不挡输入）。 */
 const PLAN={
  melee(){state.lunge=[0,.16];at(.1,()=>{for(let i=0;i<3;i++)state.slash.push({x:TGT.x-8+i*7,t:now()});hit(TGT);});},
  special(){at(.04,()=>{for(let i=0;i<14;i++){const a=i/14*6.28;emit({x:TGT.x+Math.cos(a)*22,y:TGT.y-8+Math.sin(a)*22,vx:-Math.cos(a)*100,vy:-Math.sin(a)*100,life:.2});}});at(.24,()=>hit(TGT));},
  shot(){for(let i=0;i<7;i++)at(i*.025,()=>emit({x:ATT.x+12,y:ATT.y-8+rnd(-2,2),vx:520,vy:rnd(-8,8),life:.2}));at(.22,()=>hit(TGT));},
  beam(){state.beam=[.02,.26];at(.2,()=>hit(TGT));},
  around(){at(.04,()=>{state.ring={x:ATT.x,y:ATT.y-6,t:now()};for(let i=0;i<20;i++){const a=i/20*6.28;emit({x:ATT.x,y:ATT.y-6,vx:Math.cos(a)*170,vy:Math.sin(a)*170,life:.3});}});at(.2,()=>hit(TGT));},
  room(){state.wash=[0,.42];for(let i=0;i<18;i++)at(i*.015,()=>emit({x:rnd(6,234),y:-4,vx:rnd(-30,30),vy:rnd(240,340),life:.7}));at(.28,()=>{hit(TGT);hit(T2);hit(T3);});},
  up(){state.aura={T:ATT,t:now()};for(let i=0;i<8;i++)at(i*.05,()=>state.arrows.push({x:ATT.x+rnd(-16,16),y:ATT.y+4,dir:-1,t:now(),col:'#ff8a4a'}));},
  down(){for(let i=0;i<8;i++)at(i*.05,()=>state.arrows.push({x:TGT.x+rnd(-16,16),y:TGT.y-26,dir:1,t:now(),col:'#6aa8ff'}));},
  status(){at(.05,()=>{for(let i=0;i<12;i++)emit({x:TGT.x+rnd(-14,14),y:TGT.y+rnd(-4,4),vy:rnd(-70,-30),life:rnd(.4,.7)});state.mark={t:now()};});},
  heal(){for(let i=0;i<12;i++)at(i*.035,()=>state.plus.push({x:ATT.x+rnd(-16,16),y:ATT.y+rnd(-4,8),t:now()}));},
  guard(){state.shield=[0,.5];},
  blow(){state.lunge=[0,.12];for(let i=0;i<10;i++)at(i*.02,()=>emit({x:ATT.x+14,y:ATT.y-16+rnd(-12,16),vx:rnd(320,440),s:'streak',life:.3}));at(.12,()=>{state.push=now();hit(TGT);});}
 };
 function at(t,fn){state.q.push({t,fn});}
 function play(){if(!c)return;t0=performance.now()/1000;parts=[];state={q:[],hits:[],slash:[],arrows:[],plus:[],flash:-1,shake:-1};PLAN[tpl]();}
 const white={};function whiteOf(k){if(white[k])return white[k];const im=img[k],o=document.createElement('canvas');o.width=im.width;o.height=im.height;const x=o.getContext('2d');x.drawImage(im,0,0);x.globalCompositeOperation='source-in';x.fillStyle='#fff';x.fillRect(0,0,o.width,o.height);return white[k]=o;}
 function sprite(k,T,dx,hitT){const im=img[k];if(!im||!im.complete||!im.width)return;const fl=hitT!=null&&now()-hitT<.1;
  g.fillStyle='rgba(0,0,0,.28)';g.fillRect(T.x-10+Math.round(dx),T.y+1,20,3);
  const X=Math.round(T.x-im.width/2+dx),Y=Math.round(T.y-im.height+2);
  g.drawImage(fl?whiteOf(k):im,X,Y);}
 function draw(){raf=requestAnimationFrame(draw);if(!c||!c.isConnected)return;
  const T=now(),P=PAL[type];
  if(state)state.q=state.q.filter(e=>{if(T>=e.t){e.fn();return false;}return true;});
  let sx=0,sy=0;if(state&&state.shake>=0&&T-state.shake<.14){sx=Math.round(rnd(-2,2));sy=Math.round(rnd(-2,2));}
  g.setTransform(1,0,0,1,sx,sy);
  if(floor)g.drawImage(floor,0,0);
  const S=state||{};
  let lunge=0;if(S.lunge&&T<S.lunge[1]){const k=(T-S.lunge[0])/(S.lunge[1]-S.lunge[0]);lunge=Math.sin(Math.min(1,Math.max(0,k))*Math.PI)*14;}
  const hx=T2=>{const h=(S.hits||[]).filter(e=>e.T===T2).pop();return h?h.t:null;};
  const kb=t=>t!=null&&T-t<.16?Math.round(Math.sin((T-t)/.16*Math.PI)*5):0;
  let push=0;if(S.push!=null){const k=(T-S.push);push=k<.2?k/.2*40:k<.7?40:Math.max(0,40-(k-.7)/.2*40);}
  if(tpl==='room'||tpl==='around'){sprite('rattata-l',T2,kb(hx(T2)),hx(T2));sprite('rattata-l',T3,kb(hx(T3)),hx(T3));}
  sprite('treecko-r',ATT,lunge,null);sprite('pidgey-l',TGT,kb(hx(TGT))+push,hx(TGT));
  if(S.wash&&T<S.wash[1]){g.globalAlpha=.28*Math.sin(Math.min(1,T/S.wash[1])*Math.PI);px(0,0,240,135,P[0]);g.globalAlpha=1;}
  if(S.beam&&T>S.beam[0]&&T<S.beam[1]){const w=(Math.floor(T*40)%2)?5:7,y=ATT.y-9;px(ATT.x+12,y-w/2,TGT.x-ATT.x-12,w,P[0]);px(ATT.x+12,y-1,TGT.x-ATT.x-12,2,P[1]);}
  if(S.ring){const k=(T-S.ring.t)/.3;if(k<1){const r=k*60;for(let i=0;i<28;i++){const a=i/28*6.28;px(S.ring.x+Math.cos(a)*r,S.ring.y+Math.sin(a)*r*.7,2,2,P[1]);}}}
  (S.slash||[]).forEach(s=>{const k=(T-s.t)/.12;if(k<1)for(let i=0;i<14;i++)px(s.x+i-6,TGT.y-22+i*1.6,2,2,k<.5?'#fff':P[1]);});
  if(S.aura&&T-S.aura.t<.5){const k=(T-S.aura.t)/.5;for(let i=0;i<16;i++){const a=i/16*6.28+k*3;px(ATT.x+Math.cos(a)*18,ATT.y-8+Math.sin(a)*6-k*10,2,2,P[0]);}}
  (S.arrows||[]).forEach(a=>{const k=(T-a.t)/.4;if(k<1){const y=a.y+a.dir*k*24;px(a.x,y-3,2,7,a.col);px(a.x-2,y+(a.dir<0?-1:2),6,2,a.col);px(a.x-1,y+(a.dir<0?-3:4),4,2,a.col);}});
  (S.plus||[]).forEach(a=>{const k=(T-a.t)/.5;if(k<1){const y=a.y-k*30;px(a.x,y-2,2,6,'#8affa0');px(a.x-2,y,6,2,'#8affa0');}});
  if(S.shield&&T<S.shield[1]){const k=T/S.shield[1],col=k<.3?'#fff':P[1];for(let i=-7;i<=7;i++){const a=i/7*1.2;px(ATT.x+Math.cos(a)*22,ATT.y-8+Math.sin(a)*24,3,3,col);}}
  if(S.mark&&T-S.mark.t<.8){const k=T-S.mark.t;shape(SHAPE[type],TGT.x+Math.sin(k*10)*4,TGT.y-30,P,1);}
  parts=parts.filter(p=>{const dt=1/60;p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.g*dt;if(p.age>p.life)return false;shape(p.s,p.x,p.y,P,1-p.age/p.life);return true;});
  (S.hits||[]).forEach(h=>{const k=(T-h.t)/.55;if(k<1){const y=h.T.y-30-k*12,txt=super_?'24':'12';g.font='bold 12px monospace';g.textAlign='center';g.fillStyle='#000';g.fillText(txt,h.T.x+1,y+1);g.fillStyle=super_?'#ffd24a':'#fff';g.fillText(txt,h.T.x,y);}});
  if(super_&&S.hits&&S.hits.length){const k=T-S.hits[0].t;if(k<.7){g.font='bold 11px sans-serif';g.textAlign='center';g.fillStyle='#000';g.fillText('效果绝佳',TGT.x+1,TGT.y-45);g.fillStyle='#ffd24a';g.fillText('效果绝佳',TGT.x,TGT.y-46);}}
  g.setTransform(1,0,0,1,0,0);
  if(looping&&T>1.5)play();
 }
 function makeFloor(){const f=document.createElement('canvas');f.width=240;f.height=135;const x=f.getContext('2d');x.fillStyle='#d6b35a';x.fillRect(0,0,240,135);
  let s=7;const r=()=>(s=s*16807%2147483647)/2147483647;
  for(let i=0;i<2600;i++){x.fillStyle=r()<.5?'#c9a44c':'#e2c26e';x.fillRect(r()*240|0,r()*135|0,1,1);}
  for(let i=0;i<24;i++){x.fillStyle='#a8894a';const a=r()*240|0,b=r()*135|0;x.fillRect(a,b,3,2);x.fillStyle='#efd690';x.fillRect(a,b,2,1);}
  x.fillStyle='#b46a2a';x.fillRect(0,0,240,16);x.fillStyle='#7f4a1e';for(let i=0;i<240;i+=12)x.fillRect(i,5,2,11);x.fillStyle='#5f9a2c';x.fillRect(0,0,240,6);
  return f;}
 return {PAL,mount(el){c=el;g=c.getContext('2d');g.imageSmoothingEnabled=false;floor=floor||makeFloor();
   ['treecko-r','pidgey-l','rattata-l'].forEach(k=>{if(!img[k]){img[k]=new Image();img[k].src='img/'+k+'.png';}});
   cancelAnimationFrame(raf);play();draw();},
  set(o){if(o.tpl)tpl=o.tpl;if(o.type)type=o.type;if('super' in o)super_=o.super;if('loop' in o)looping=o.loop;play();},play};
})();
