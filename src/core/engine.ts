/** Approved trial rules, research 5f354788. Pure JSON state; no storage or renderer. */
import {generateFloor,type GeneratedFloor} from './dungeon.ts';
import {SPECIES,speciesOf} from './roster.ts';
export type Pos = {x:number;y:number};
export type Skill = 'strong'|'line'|'guard'|'push';
export type Unit = {id:string; side:'friend'|'enemy'; hp:number; maxHp:number; pos:Pos|null;
  pp:Partial<Record<Skill,number>>; maxPp:Partial<Record<Skill,number>>; learned:Skill[];
  ai?:'melee'|'ranged'|'chase'; damage?:number; range?:number; recruit?:Unit; species?:string};
// Precondition: generated expedition enemies never carry `recruit`; expedition invitations come only from the
// round-end draw. A preset `recruit` would issue a species-less invitation that save.ts rejects.
export type Action = {type:'move';to:Pos}|{type:'basic';target:string}|{type:'skill';skill:Skill;target:string}
  |{type:'wait'}|{type:'swap';target:string}|{type:'interact';exit:boolean}|{type:'use';item:Item;target:string};
export type Command = {type:'switch';actor:string}|{type:'round';action:Action;override?:{actor:string;action:Action}}
  |{type:'invite';choice:'accept'|'reject';outgoing?:string}|{type:'finishExit'}|{type:'finishTransit'};
export type Invitation = {id:string;unit:Unit;status:'pending'|'accepted'|'rejected'|'cancelled'};
/** `to` is set only for a stairs request (the target floor number); a plain exit request has no `to`. */
export type ExitRequest = {actor:string;pos:Pos;locked:boolean;to?:number};
export type PointKind='goal'|'item'|'exit'|'down'|'up'|'berry'|'tonic';
/** 6.4 backpack items (expedition only): berry restores HP, tonic restores PP. Names are display text. */
export type Item='berry'|'tonic';
export const ITEM_NAMES:Record<Item,string>={berry:'橙橙果',tonic:'PP补剂'};
export type Rect={x:number;y:number;w:number;h:number};
/**
 * 6.4 shared run level and counters (expedition only; absent in the fixed map and in expeditions saved before 6.4).
 * `rng` is the recruit-draw state (a 32-bit integer, separate from `dungeon.seed`); `kills` holds defeated enemies of the current round
 * until the round-end settlement and is empty at every checkpoint; `made` counts recruits created so far (ids N1, N2...).
 */
export type Progress={level:number;exp:number;rng:number;made:number;kills:string[];items:Record<Item,number>};
/** 6.4 WORKING CANDIDATES (not final balance); see docs/玩法研究/招募等级与恢复品.md. */
export const PROG={recruitChance:0.3,thresholds:[0,3,7,12,18],maxLevel:5,hpPerLevel:2,damagePerLevel:1,killExp:1,goalExp:2,berryHeal:8,tonicPp:1};
export const levelFor=(exp:number)=>PROG.thresholds.filter(t=>exp>=t).length;
export type Point={pos:Pos;kind:PointKind;used:boolean};
/** A floor that is not the current one: its terrain, revealed cells, real enemies (with their HP and positions) and points. */
export type StoredFloor={floor:Pos[];seen:string[];enemies:string[];units:Record<string,Unit>;points:Point[];rooms?:Rect[]};
/** Expedition-only data. `stored` holds every visited floor except the current one; unvisited floors are generated from `seed` on first entry. */
export type Dungeon={seed:number;width:number;height:number;floors:number;level:number;stored:Record<string,StoredFloor>};
export type End = {id:string;outcome:'normal'|'wipe';team:string[];camp:string[];goal:boolean;acquired:number;brought:number};
export type World = {runId:string;scenario:string;round:number;floor:Pos[];seen:string[];units:Record<string,Unit>;
  queue:string[];enemies:string[];camp:string[];leader:string;points:Point[];
  goal:boolean;bag:number;phase:'playing'|'invitation'|'exit'|'transit'|'ended';invitations:Invitation[];anchor:Pos|null;
  request:ExitRequest|null;end:End|null;log:string[];dungeon?:Dungeon;prog?:Progress;rooms?:Rect[]};
export type Result = {ok:true;state:World}|{ok:false;state:World;error:string};
export const RULE_VERSION='trial-rules-1';
export const CONTENT_VERSION='trial-content-1';
export const SPEC_SOURCE='5f3547889b30e59f6cdfebc5af8c91e46cba4ee4';
export const key=(p:Pos)=>`${p.x},${p.y}`;
export const same=(a:Pos|null,b:Pos|null)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
export const distance=(a:Pos,b:Pos)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export const DIRS:Pos[]=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
export const plus=(a:Pos,b:Pos):Pos=>({x:a.x+b.x,y:a.y+b.y});
export const clone=<T>(v:T):T=>structuredClone(v);
export function friend(id:string,x:number,y:number,hp=20,pp:Unit['pp']={}):Unit {
  return {id,side:'friend',hp,maxHp:20,pos:hp>0?{x,y}:null,pp:{...pp},maxPp:Object.fromEntries(Object.keys(pp).map(k=>[k,2])),learned:Object.keys(pp) as Skill[]};
}
export function enemy(id:string,x:number,y:number,hp:number,ai:Unit['ai'],damage:number,range=1):Unit {
  return {id,side:'enemy',hp,maxHp:hp,pos:{x,y},pp:{},maxPp:{},learned:[],ai,damage,range};
}
export function newcomer(id='N'):Unit {return friend(id,0,0,10,{strong:1,push:1});}
/** 6.4: a real roster unit at the given run level: roster maxHp plus 2 per level above 1, full HP, kit moves at full kit PP. */
export function speciesUnit(id:string,speciesId:string,level=1,pos:Pos|null=null):Unit {
  const sp=SPECIES[speciesId],maxHp=sp.maxHp+PROG.hpPerLevel*(level-1);
  return {id,side:'friend',hp:maxHp,maxHp,pos,pp:Object.fromEntries(sp.kit.map(k=>[k.behavior,k.pp])),maxPp:Object.fromEntries(sp.kit.map(k=>[k.behavior,k.pp])),learned:sp.kit.map(k=>k.behavior),species:speciesId};
}
/** R07 half snapshot of a new recruit: HP floor(max/2) (at least 1); each kit move PP floor(max/2) (at least 1, at most max). */
export function recruitUnit(id:string,speciesId:string,level:number):Unit {
  const u=speciesUnit(id,speciesId,level);u.hp=Math.max(1,Math.floor(u.maxHp/2));
  for(const k of Object.keys(u.maxPp) as Skill[])u.pp[k]=Math.min(u.maxPp[k]!,Math.max(1,Math.floor(u.maxPp[k]!/2)));
  return u;
}
/** Recoverable recruit-draw stream: mulberry32 stepped from an explicit state, so the state can be saved and resumed without redrawing. */
export function rngStep(state:number):{value:number;state:number} {
  const a=(state+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;
  return {value:((t^(t>>>14))>>>0)/4294967296,state:a>>>0};
}
export function createMain(runId:string,invitation=true):World {
  const e=enemy('E',4,1,16,'melee',4);if(invitation)e.recruit=newcomer();
  const s:World={runId,scenario:invitation?'main-invite':'main-none',round:0,
    floor:Array.from({length:10},(_,x)=>({x,y:1})),seen:[],
    units:{A:friend('A',0,1,20,{strong:2}),B:friend('B',1,1,20,{guard:2}),C:friend('C',2,1,20,{strong:2,line:2}),E:e,R:enemy('R',9,1,6,'ranged',6,3)},
    queue:['A','B','C'],enemies:['E','R'],camp:[],leader:'C',points:[{pos:{x:4,y:1},kind:'goal',used:false},{pos:{x:7,y:1},kind:'item',used:false}],
    goal:false,bag:0,phase:'playing',invitations:[],anchor:null,request:null,end:null,log:[]};
  reveal(s);return s;
}
const walk=(s:World,p:Pos)=>s.floor.some(q=>same(p,q));
const active=(s:World)=>[...s.queue,...s.enemies].map(id=>s.units[id]).filter(u=>u.hp>0&&u.pos);
const occupied=(s:World,p:Pos)=>active(s).some(u=>same(u.pos,p));
const alive=(u:Unit|undefined):u is Unit&{pos:Pos}=>!!u&&u.hp>0&&u.pos!==null;
const note=(s:World,t:string)=>{s.log.push(t);s.log=s.log.slice(-80);};
export function reveal(s:World):void {
  const seen=new Set(s.seen);
  for(const id of s.queue){const u=s.units[id];if(!alive(u))continue;seen.add(key(u.pos));
    for(const d of DIRS){let p=u.pos;for(let n=0;n<4;n++){p=plus(p,d);if(!walk(s,p))break;seen.add(key(p));}}
    // 6.4 working candidate: standing inside a generated room shows the whole room (corridors keep the 4-cell straight rule).
    for(const r of s.rooms??[])if(u.pos.x>=r.x&&u.pos.x<r.x+r.w&&u.pos.y>=r.y&&u.pos.y<r.y+r.h)
      for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(walk(s,{x,y}))seen.add(`${x},${y}`);}
  s.seen=[...seen].sort();
}
/** BFS insertion order is also the right/down/left/up final tie break. */
function paths(s:World,start:Pos,blocked:boolean):Map<string,{p:Pos;len:number;first:Pos}> {
  const result=new Map<string,{p:Pos;len:number;first:Pos}>();const seen=new Set(s.seen);
  result.set(key(start),{p:start,len:0,first:start});const q=[start];
  for(let i=0;i<q.length;i++){const cur=result.get(key(q[i]))!;
    for(const d of DIRS){const p=plus(cur.p,d);if(!walk(s,p)||!seen.has(key(p))||result.has(key(p))||(blocked&&occupied(s,p)))continue;
      result.set(key(p),{p,len:cur.len+1,first:cur.len===0?p:cur.first});q.push(p);}}
  return result;
}
function defaultAction(s:World,id:string):Action {
  const u=s.units[id], lead=s.units[s.leader];if(!alive(u)||!alive(lead))return {type:'wait'};
  for(const d of DIRS){const p=plus(u.pos,d);const e=s.enemies.map(i=>s.units[i]).find(v=>alive(v)&&same(v.pos,p));if(e)return {type:'basic',target:e.id};}
  if(distance(u.pos,lead.pos)===1)return {type:'wait'};
  const terrain=paths(s,lead.pos,false), reachable=paths(s,u.pos,true);const current=terrain.get(key(u.pos))?.len;
  if(current===undefined)return {type:'wait'};
  let best:{terrain:number;len:number;first:Pos}|undefined;
  for(const p of reachable.values()){if(p.len===0)continue;const td=terrain.get(key(p.p))?.len;
    if(td===undefined||td>=current)continue;
    if(!best||td<best.terrain||(td===best.terrain&&p.len<best.len))best={terrain:td,len:p.len,first:p.first};}
  return best?{type:'move',to:best.first}:{type:'wait'};
}
function clearRay(s:World,a:Pos,b:Pos,range:number):boolean {
  if((a.x!==b.x&&a.y!==b.y)||distance(a,b)<1||distance(a,b)>range)return false;
  const d={x:Math.sign(b.x-a.x),y:Math.sign(b.y-a.y)};let p=plus(a,d);
  while(!same(p,b)){if(!walk(s,p)||occupied(s,p))return false;p=plus(p,d);}return true;
}
/** Names the first reason a straight-line skill cannot reach its target. */
function rayProblem(s:World,a:Pos,b:Pos,range:number):string|null {
  if(a.x!==b.x&&a.y!==b.y)return '直线只能指定同排或同列的目标';
  if(distance(a,b)<1)return '直线不能指定自己所在的格';
  if(distance(a,b)>range)return `目标相距${distance(a,b)}格，超出直线射程${range}格`;
  const d={x:Math.sign(b.x-a.x),y:Math.sign(b.y-a.y)};let p=plus(a,d);
  while(!same(p,b)){if(!walk(s,p))return `射线在(${p.x},${p.y})被墙挡住`;const blocker=active(s).find(v=>same(v.pos,p));if(blocker)return `射线被${blocker.id}挡住`;p=plus(p,d);}
  return null;
}
function invalid(s:World,id:string,a:Action,moved:ReadonlySet<string>=new Set()):string|null {
  const u=s.units[id];if(!alive(u))return `${id}已倒下，不能行动`;
  if(a.type==='wait')return null;
  if(a.type==='move'){
    const cell=`(${a.to.x},${a.to.y})`;
    if(distance(u.pos,a.to)!==1)return `${id}只能移动到相邻格`;
    if(!walk(s,a.to))return `目标格${cell}是墙，不能进入`;
    if(!s.seen.includes(key(a.to)))return `目标格${cell}尚未揭示，不能进入`;
    const blocker=active(s).find(v=>same(v.pos,a.to));
    if(blocker)return moved.has(blocker.id)?`${blocker.id}会先进入${cell}，挡住${id}；请选择另一动作或切换主控`:`目标格${cell}被${blocker.id}占据，不能进入`;
    return null;
  }
  if(a.type==='interact'){
    const point=s.points.find(p=>same(p.pos,u.pos));
    if(id!==s.leader||!point)return '主控必须站在交互点';
    if(point.kind==='down'||point.kind==='up')return a.exit?null:'楼梯只能请求跨层，不能取得';
    if(point.kind==='berry'||point.kind==='tonic'){if(a.exit)return '这里不是出口，不能请求撤离';return point.used?`${ITEM_NAMES[point.kind]}已拾取`:null;}
    if(!a.exit&&(point.used||point.kind==='exit'))return point.kind==='goal'?'G已记录，仅可请求撤离':point.kind==='item'?'T已取得，仅可请求撤离':'此处是纯出口，仅可请求撤离';
    return null;
  }
  if(a.type==='use'){
    if(!s.prog)return '这里没有可用的背包物品';
    if(s.prog.items[a.item]<1)return `背包里没有${ITEM_NAMES[a.item]}`;
    const w=s.units[a.target];
    if(!w||w.side!=='friend'||!s.queue.includes(w.id))return '物品只能对同行伙伴使用';
    if(!alive(w))return `${w.id}已倒下，物品不能救起倒下的伙伴`;
    if(w.id!==id&&distance(u.pos,w.pos)!==1)return `${w.id}不在相邻格，物品只能对自己或相邻同行使用`;
    if(a.item==='berry'&&w.hp>=w.maxHp)return `${w.id}的HP已满，${ITEM_NAMES.berry}不会有效果`;
    if(a.item==='tonic'&&!w.learned.some(k=>(w.pp[k]??0)<(w.maxPp[k]??0)))return `${w.id}的所有招式PP已满，${ITEM_NAMES.tonic}不会有效果`;
    return null;
  }
  const t=s.units[a.target];if(!alive(t)||(!s.queue.includes(t.id)&&!s.enemies.includes(t.id)))return '目标不存在或已倒下';
  if(!s.seen.includes(key(t.pos)))return '目标尚未发现';
  if(a.type==='swap')return !s.queue.includes(t.id)||id===t.id||distance(u.pos,t.pos)!==1?'只能与相邻存活伙伴换位':null;
  if(a.type==='basic')return t.side!=='enemy'||distance(u.pos,t.pos)!==1?'普攻需要相邻敌人':null;
  if(!u.learned.includes(a.skill)||(u.pp[a.skill]??0)<1)return '未装备该招式或PP不足';
  if(a.skill==='guard')return !s.queue.includes(t.id)||id===t.id||distance(u.pos,t.pos)!==1?'保护需要相邻另一名存活伙伴':null;
  if(t.side!=='enemy')return '该招式只能指定敌人';
  if(a.skill==='line')return rayProblem(s,u.pos,t.pos,3);
  if(distance(u.pos,t.pos)!==1)return '目标不相邻';
  if(a.skill==='push'){const p=plus(t.pos,{x:t.pos.x-u.pos.x,y:t.pos.y-u.pos.y});if(!walk(s,p)||!s.seen.includes(key(p))||occupied(s,p))return '推退后格不可用';}
  return null;
}
function hit(s:World,id:string,n:number):void {
  const u=s.units[id];u.hp=Math.max(0,u.hp-n);note(s,`${id}受到${n}伤害，HP ${u.hp}`);
  if(u.hp===0){u.pos=null;note(s,`${id}倒下退图`);if(u.side==='enemy'&&s.prog)s.prog.kills.push(u.recruit?'':(u.species??''));
    if(u.side==='enemy'&&u.recruit){
    const unit=clone(u.recruit);unit.id=`${u.recruit.id}`; // fixture IDs are stable; each event initializes once
    if(s.units[unit.id]||s.invitations.some(i=>i.unit.id===unit.id))unit.id=`${unit.id}-${s.invitations.length+1}`;
    s.invitations.push({id:`${s.runId}:invite:${s.invitations.length+1}`,unit,status:'pending'});}}
}
function execute(s:World,id:string,a:Action,guards:Record<string,number>):void {
  const u=s.units[id],bonus=s.prog?(s.prog.level-1)*PROG.damagePerLevel:0;
  if(a.type==='move'){u.pos=clone(a.to);reveal(s);note(s,`${id}移动到${key(a.to)}`);}
  else if(a.type==='basic')hit(s,a.target,6+bonus);
  else if(a.type==='use'){
    const t=s.units[a.target];s.prog!.items[a.item]--;
    if(a.item==='berry'){const before=t.hp;t.hp=Math.min(t.maxHp,t.hp+PROG.berryHeal);note(s,`${id}对${t.id}使用${ITEM_NAMES.berry}，HP ${before}→${t.hp}`);}
    else{for(const k of t.learned)t.pp[k]=Math.min(t.maxPp[k]??0,(t.pp[k]??0)+PROG.tonicPp);note(s,`${id}对${t.id}使用${ITEM_NAMES.tonic}，每招PP+${PROG.tonicPp}（不超上限）`);}
  }
  else if(a.type==='skill'){u.pp[a.skill]=(u.pp[a.skill]??0)-1;
    if(a.skill==='guard')guards[a.target]=4;
    else if(a.skill==='push'){const t=s.units[a.target];t.pos=plus(t.pos!,{x:t.pos!.x-u.pos!.x,y:t.pos!.y-u.pos!.y});reveal(s);note(s,`${id}推退${t.id}`);}
    else hit(s,a.target,10+bonus);
  } else if(a.type==='interact'){
    const p=s.points.find(p=>same(p.pos,u.pos))!;const stairs=p.kind==='down'||p.kind==='up';
    if(!stairs&&!p.used){if(p.kind==='goal'){s.goal=true;if(s.prog)s.prog.exp+=PROG.goalExp;}if(p.kind==='item')s.bag++;
      if((p.kind==='berry'||p.kind==='tonic')&&s.prog){s.prog.items[p.kind]++;note(s,`${id}拾取${ITEM_NAMES[p.kind]}，背包共${s.prog.items[p.kind]}`);}p.used=true;}
    if(p.kind==='berry'||p.kind==='tonic'){/* a pickup is never an exit */}
    else if(a.exit)s.request={actor:id,pos:clone(u.pos!),locked:false,...(stairs?{to:s.dungeon!.level+(p.kind==='down'?1:-1)}:{})};
    if(p.kind!=='berry'&&p.kind!=='tonic')note(s,stairs?`${id}请求${p.kind==='down'?'下':'上'}楼梯跨层`:`${id}交互${a.exit?'并请求撤离':''}`);
  }else note(s,`${id}等待`);
}
function ownPhase(s:World,cmd:Extract<Command,{type:'round'}>,preflight:boolean):string|null {
  const guards:Record<string,number>={};const lead=s.leader;const moved=new Set<string>();
  if(cmd.override&&(cmd.override.actor===lead||!s.queue.includes(cmd.override.actor)||!alive(s.units[cmd.override.actor])))return '只能安排另一名存活伙伴';
  if(cmd.override?.action.type==='swap')return '换位须从主控发起';
  if(cmd.override?.action.type==='interact')return '伙伴不能代替主控交互';
  const swap=cmd.action.type==='swap'?cmd.action.target:null;
  if(swap){if(cmd.override)return '换位已占唯一伙伴干预';const err=invalid(s,lead,cmd.action);if(err)return err;}
  const later=swap?Math.max(s.queue.indexOf(lead),s.queue.indexOf(swap)):-1;
  for(let i=0;i<s.queue.length;i++){const id=s.queue[i];if(!alive(s.units[id]))continue;
    if(swap&&(id===lead||id===swap)){
      if(i===later){const err=invalid(s,lead,cmd.action);if(err){if(preflight)return err;continue;}
        const p=s.units[lead].pos;s.units[lead].pos=s.units[swap].pos;s.units[swap].pos=p;moved.add(lead);moved.add(swap);reveal(s);note(s,`${lead}与${swap}换位`);}continue;}
    const explicit=id===lead?cmd.action:cmd.override?.actor===id?cmd.override.action:null;
    const a=explicit??defaultAction(s,id);const err=invalid(s,id,a,moved);
    if(err){if(explicit&&preflight)return err;note(s,`${id}动作失效，等待，未扣PP`);continue;}
    execute(s,id,a,guards);if(a.type==='move')moved.add(id);
  }
  if(preflight)return null;
  for(const id of s.enemies){const e=s.units[id];if(!alive(e))continue;
    const candidates=s.queue.map(i=>s.units[i]).filter(alive);
    const targets=candidates.filter(t=>e.ai==='ranged'?clearRay(s,e.pos!,t.pos,e.range??3):distance(e.pos!,t.pos)===1);
    if(e.ai==='ranged')targets.sort((a,b)=>distance(e.pos!,a.pos)-distance(e.pos!,b.pos));
    const t=targets[0];
    if(t){const amount=Math.max(0,(e.damage??0)-(guards[t.id]??0));delete guards[t.id];hit(s,t.id,amount);}
    else if(e.ai==='chase'&&candidates.length){
      candidates.sort((a,b)=>distance(e.pos!,a.pos)-distance(e.pos!,b.pos));const target=candidates[0];
      // BFS to the chosen target; its occupied cell is a permitted endpoint only.
      const q=[{p:e.pos,first:e.pos}],seen=new Set([key(e.pos)]);let step:Pos|null=null;
      for(let k=0;k<q.length&&!step;k++)for(const d of DIRS){const p=plus(q[k].p,d);if(!walk(s,p)||seen.has(key(p)))continue;
        if(same(p,target.pos)){step=same(q[k].first,e.pos)?null:q[k].first;break;}
        if(occupied(s,p))continue;seen.add(key(p));q.push({p,first:same(q[k].p,e.pos)?p:q[k].first});}
      if(step){e.pos=step;note(s,`${id}趋近一步`);}
    }
  }
  return null;
}
function end(s:World,outcome:End['outcome']):void {
  s.end={id:`${s.runId}:end`,outcome,team:[...s.queue],camp:[...s.camp],goal:s.goal,acquired:s.bag,brought:outcome==='normal'?s.bag:0};
  s.phase='ended';s.request=null;s.anchor=null;note(s,outcome==='normal'?'正常撤离':'全队倒下，本试验结束');
}
/** After invitations are done: a locked plain request waits as `exit`, a locked stairs request as `transit`. */
const settled=(s:World):World['phase']=>s.request?.locked?(s.request.to!==undefined?'transit':'exit'):'playing';
/**
 * 6.4 round-end settlement, in one fixed order: experience from this round's defeats, level-ups, then the recruit draws in defeat order.
 * A level-up raises every current member's max HP (current HP unchanged, R07); recruit snapshots are taken after it, at the settled level.
 */
function settle(s:World):void {
  const p=s.prog;if(!p)return;
  const kills=p.kills;p.kills=[];p.exp+=kills.length*PROG.killExp;
  while(p.level<PROG.maxLevel&&p.exp>=PROG.thresholds[p.level]){
    p.level++;for(const id of s.queue)s.units[id].maxHp+=PROG.hpPerLevel;
    note(s,`本局等级升到Lv${p.level}：同行最大HP+${PROG.hpPerLevel}（当前HP不变），普攻／强击／直线伤害+${PROG.damagePerLevel}`);
  }
  for(const sp of kills){
    if(!speciesOf(sp))continue;
    const r=rngStep(p.rng);p.rng=r.state;
    if(r.value>=PROG.recruitChance){note(s,`${sp}被击败，没有发出邀请`);continue;}
    do p.made++;while(s.units[`N${p.made}`]||s.invitations.some(i=>i.unit.id===`N${p.made}`));
    const unit=recruitUnit(`N${p.made}`,sp,p.level);
    s.invitations.push({id:`${s.runId}:invite:${s.invitations.length+1}`,unit,status:'pending'});
    note(s,`${sp}被击败并发出邀请：${unit.id} Lv${p.level} ${unit.hp}/${unit.maxHp}HP`);
  }
}
function afterRound(s:World):void {
  if(!s.queue.some(i=>alive(s.units[i]))){s.invitations.forEach(i=>{if(i.status==='pending')i.status='cancelled';});if(s.prog)s.prog.kills=[];end(s,'wipe');return;}
  settle(s);
  if(!alive(s.units[s.leader]))s.leader=s.queue.find(i=>alive(s.units[i]))!;
  if(s.request){const u=s.units[s.request.actor];if(alive(u)&&same(u.pos,s.request.pos))s.request.locked=true;else s.request=null;}
  if(s.invitations.some(i=>i.status==='pending')){s.anchor=clone(s.units[s.leader].pos);s.phase='invitation';}
  else s.phase=settled(s);
}
export type InvitationPreview={ok:true;pos:Pos;queue:string[];leader:string}|{ok:false;error:string};
export function previewInvitation(s:World,outgoing?:string):InvitationPreview {
  if(s.phase!=='invitation'||!s.anchor)return {ok:false,error:'当前没有待处理邀请'};
  const invite=s.invitations.find(i=>i.status==='pending');if(!invite)return {ok:false,error:'邀请已处理'};
  if(outgoing&&!s.queue.includes(outgoing))return {ok:false,error:'回营对象不在同行名单'};
  if(s.queue.length>=3&&!outgoing)return {ok:false,error:'满员须选择回营对象'};
  const q=s.queue.filter(i=>i!==outgoing);const aliveUnits=[...q,...s.enemies].map(i=>s.units[i]).filter(alive);
  const pos=[s.anchor,...DIRS.map(d=>plus(s.anchor!,d))].find(p=>walk(s,p)&&s.seen.includes(key(p))&&!aliveUnits.some(u=>same(u.pos,p)));
  if(!pos)return {ok:false,error:'集结格附近没有合法位置；可改选或拒绝'};
  const queue=[...q,invite.unit.id];const leader=outgoing===s.leader?q.find(i=>alive(s.units[i]))??invite.unit.id:s.leader;
  return {ok:true,pos:clone(pos),queue,leader};
}
export function applyCommand(original:World,cmd:Command):Result {
  const fail=(error:string):Result=>({ok:false,state:original,error:`${error}；本轮未执行`});
  if(cmd.type==='switch'){
    if(original.phase!=='playing'||!original.queue.includes(cmd.actor)||!alive(original.units[cmd.actor]))return fail('此时不能切换主控');
    const s=clone(original);s.leader=cmd.actor;return {ok:true,state:s};
  }
  if(cmd.type==='round'){
    if(original.phase!=='playing')return fail('先处理邀请、撤离或终局');
    const err=ownPhase(clone(original),cmd,true);if(err)return fail(err);
    const s=clone(original);s.round++;ownPhase(s,cmd,false);afterRound(s);return {ok:true,state:s};
  }
  if(cmd.type==='finishTransit'){
    if(original.phase!=='transit'||!original.request?.locked||original.request.to===undefined||!original.dungeon)return fail('没有已成立且完成邀请处理的跨层请求');
    return {ok:true,state:transit(original)};
  }
  if(cmd.type==='finishExit'){
    if(original.phase!=='exit'||!original.request?.locked)return fail('没有已成立且完成邀请处理的撤离请求');
    const s=clone(original);end(s,'normal');return {ok:true,state:s};
  }
  if(original.phase!=='invitation')return fail('当前没有待处理邀请');
  const preview=cmd.choice==='accept'?previewInvitation(original,cmd.outgoing):null;
  if(preview&&!preview.ok)return fail(preview.error);
  const s=clone(original),invite=s.invitations.find(i=>i.status==='pending')!;
  if(cmd.choice==='accept'&&preview?.ok){
    if(cmd.outgoing){s.camp.push(cmd.outgoing);s.units[cmd.outgoing].pos=null;}
    const unit=clone(invite.unit);unit.pos=preview.pos;s.units[unit.id]=unit;s.queue=preview.queue;s.leader=preview.leader;invite.status='accepted';reveal(s);
    note(s,`${unit.id}加入，${cmd.outgoing??'空名额'}回营；下轮才行动`);
  }else{invite.status='rejected';note(s,`拒绝${invite.unit.id}`);}
  if(!s.invitations.some(i=>i.status==='pending')){s.anchor=null;s.phase=settled(s);}
  return {ok:true,state:s};
}

/* ---------- 6.3 expedition: seeded floors, stairs, crossing and return (R09 step 5, R10) ---------- */
function floorUnits(g:GeneratedFloor):{units:Record<string,Unit>;enemies:string[]} {
  const units:Record<string,Unit>={};
  for(const e of g.enemies){const u=enemy(e.id,e.pos.x,e.pos.y,e.hp,e.ai,e.damage,e.range);u.species=e.species;units[e.id]=u;}
  return {units,enemies:g.enemies.map(e=>e.id)};
}
/** `run` is true for 6.4 expeditions (with `prog`): they also get pickups and room rectangles; older expeditions generate the 6.3 floor. */
function freshFloor(d:Dungeon,level:number,run:boolean):StoredFloor {
  const g=generateFloor(d.seed,level,{width:d.width,height:d.height,floors:d.floors});
  return {floor:g.floor,seen:[],points:[...g.points,...(run?g.pickups:[])].map(p=>({...p})),...floorUnits(g),...(run?{rooms:g.rooms.map(r=>({...r}))}:{})};
}
function stashFloor(s:World):StoredFloor {
  const units:Record<string,Unit>={};for(const id of s.enemies)units[id]=s.units[id];
  return clone({floor:s.floor,seen:s.seen,enemies:s.enemies,units,points:s.points,...(s.rooms?{rooms:s.rooms}:{})});
}
function loadFloor(s:World,f:StoredFloor):void {
  for(const id of s.enemies)delete s.units[id];
  s.floor=f.floor;s.seen=f.seen;s.enemies=f.enemies;s.points=f.points;Object.assign(s.units,f.units);
  if(f.rooms)s.rooms=f.rooms;else delete s.rooms;
}
/**
 * WORKING CANDIDATE (R10 leaves the exact order open): the leader takes the entry cell; each other living member, in queue order,
 * takes the first cell of a breadth-first walk outward from the entry (entry, then right, down, left, up, then further out)
 * that is already revealed (as seen from the leader at the entry) and holds no living unit. Fallen members get no cell.
 * Returns false when the entry is held by an enemy or any member finds no cell; the caller then discards the whole attempt.
 */
function placeTeam(s:World,entry:Pos):boolean {
  const team=s.queue.filter(i=>s.units[i].hp>0);
  if(!team.includes(s.leader)||!walk(s,entry))return false;
  for(const id of team)s.units[id].pos=null;
  if(s.enemies.some(i=>alive(s.units[i])&&same(s.units[i].pos,entry)))return false;
  s.units[s.leader].pos=clone(entry);reveal(s);
  const seen=new Set(s.seen),order=[entry],visited=new Set([key(entry)]);
  for(let i=0;i<order.length;i++)for(const d of DIRS){const p=plus(order[i],d);if(walk(s,p)&&!visited.has(key(p))){visited.add(key(p));order.push(p);}}
  for(const id of team){if(id===s.leader)continue;
    const spot=order.find(c=>seen.has(key(c))&&!active(s).some(u=>same(u.pos,c)));
    if(!spot)return false;s.units[id].pos=clone(spot);}
  reveal(s);return true;
}
/** One crossing: no enemy phase, no round, no resource change. On failure the source floor is kept and only the request is cancelled. */
function transit(original:World):World {
  const s=clone(original),d=s.dungeon!,to=s.request!.to!,from=d.level;
  const cancelled=(why:string)=>{const c=clone(original);c.request=null;c.phase='playing';note(c,`跨层取消：${why}；动作已用，留在原层`);return c;};
  const cur=stashFloor(s);
  loadFloor(s,clone(d.stored[to]??freshFloor(d,to,!!s.prog)));
  const stair=s.points.find(p=>p.kind===(to>from?'up':'down'));
  if(!stair)return cancelled('目标层没有对应楼梯');
  if(!placeTeam(s,stair.pos))return cancelled('目标层入口附近没有合法位置');
  delete d.stored[to];d.stored[String(from)]=cur;d.level=to;s.request=null;s.phase='playing';
  note(s,`同行抵达第${to}层`);return s;
}
/**
 * The expedition: `floors` (2) seeded floors. 6.4 team (WORKING CANDIDATE): A charmander, B squirtle, C bulbasaur, three roster starters at run level 1;
 * C leads, as before (so entry placement and the drawn skins are unchanged). The start cell is the ordinary exit of floor 1.
 */
export function createExpedition(runId:string,seed:number,floors=2):World {
  const d:Dungeon={seed:seed>>>0,width:20,height:14,floors,level:1,stored:{}};
  const f=freshFloor(d,1,true);
  const s:World={runId,scenario:'expedition',round:0,floor:f.floor,seen:[],
    units:{A:speciesUnit('A','charmander'),B:speciesUnit('B','squirtle'),C:speciesUnit('C','bulbasaur'),...f.units},
    queue:['A','B','C'],enemies:f.enemies,camp:[],leader:'C',points:f.points,goal:false,bag:0,phase:'playing',invitations:[],anchor:null,request:null,end:null,log:[],dungeon:d,
    rooms:f.rooms,prog:{level:1,exp:0,rng:(seed^0xA5A5F00D)>>>0,made:0,kills:[],items:{berry:0,tonic:0}}};
  for(const id of s.queue)s.units[id].pos=null;
  if(!placeTeam(s,f.points.find(p=>p.kind==='exit')!.pos))throw Error('expedition start has no legal cells');
  return s;
}
