/** Approved trial rules, research 5f354788. Pure JSON state; no storage or renderer. */
import {generateFloor,serviceRoll,BOSS,type GeneratedFloor} from './dungeon.ts';
import {ECON} from './economy.ts';
import {SPECIES,speciesOf,tmPool,learnableMove,type KitMove} from './roster.ts';
import {moveOf,type MoveSpec} from './moves.ts';
import names from '../data/names-zh.json' with {type:'json'};
export type Pos = {x:number;y:number};
/** Skills are move ids; PP and learned use the same keys. */
export type Skill = string;
export type Unit = {id:string; side:'friend'|'enemy'; hp:number; maxHp:number; pos:Pos|null;
  pp:Partial<Record<Skill,number>>; maxPp:Partial<Record<Skill,number>>; learned:Skill[];
  stages:{atk:number;def:number}; protect:number; counter:number; lastMove:string|null;
  ai?:'melee'|'ranged'|'chase'; damage?:number; range?:number; recruit?:Unit; species?:string;
  /** 6.5: base-roster instance this unit was made from, and the names of its carried moves (aligned with `learned`). Absent for recruits made in the run and for fixtures. */
  inst?:string; moves?:string[];
  /** 7.2: true for a founding member of the base profile (the initial two, or the three starters of an old profile); never goes missing in a wipe. */
  protected?:true;
  /** 7.3: the regional boss. Only the generator sets it (an enemy of species arcanine with the numbers in `BOSS` in dungeon.ts; it never moves, resists blowaway and cannot be recruited). */
  boss?:true};
// Precondition: generated expedition enemies never carry `recruit`; expedition invitations come only from the
// round-end draw. A preset `recruit` would issue a species-less invitation that save.ts rejects.
export type Action = {type:'move';to:Pos}|{type:'basic';target:string}|{type:'skill';skill:Skill;target:string}
  |{type:'wait'}|{type:'swap';target:string}|{type:'interact';exit:boolean}|{type:'use';item:Item;target:string}
  /** 7.2 exchanger: send one living non-leader companion home, with up to two held technique machines (indexes into `World.tms`). Occupies the leader's action. */
  |{type:'exchange';target:string;cargo:number[]};
export type Command = {type:'switch';actor:string}|{type:'round';action:Action;override?:{actor:string;action:Action}}
  |{type:'invite';choice:'accept'|'reject';outgoing?:string}|{type:'finishExit'}|{type:'finishTransit'}
  /** 7.2 shop purchase: needs the leader on the shop cell; takes no round. */
  |{type:'buy';item:ShopItem};
export type Invitation = {id:string;unit:Unit;status:'pending'|'accepted'|'rejected'|'cancelled'};
/** `to` is set only for a stairs request (the target floor number); a plain exit request has no `to`. */
export type ExitRequest = {actor:string;pos:Pos;locked:boolean;to?:number};
export type PointKind='goal'|'item'|'exit'|'down'|'up'|'berry'|'tonic'|'rest'|'shop'|'exchange';
export type ShopItem='berry'|'tonic'|'tm';
/** 6.4 backpack items (expedition only): berry restores HP, tonic restores PP. Names are display text. */
export type Item='berry'|'tonic';
export const SKILL_CN:Record<Skill,string>=(names as unknown as {moves:Record<string,string>}).moves;
export const ITEM_NAMES:Record<Item,string>={berry:'橙橙果',tonic:'PP补剂'};
export type Rect={x:number;y:number;w:number;h:number};
/**
 * 6.4 shared run level and counters (expedition only; absent in the fixed map and in expeditions saved before 6.4).
 * `rng` is the recruit-draw state (a 32-bit integer, separate from `dungeon.seed`); `kills` holds defeated enemies of the current round
 * until the round-end settlement and is empty at every checkpoint; `made` counts recruits created so far (ids N1, N2...).
 */
export type Progress={level:number;exp:number;rng:number;made:number;kills:string[];items:Record<Item,number>};
/** 6.4 WORKING CANDIDATES (not final balance); see docs/玩法研究/招募等级与恢复品.md. */
export const PROG={recruitChance:0.3,thresholds:[0,3,7,12,18],maxLevel:5,hpPerLevel:2,damagePerLevel:1,killExp:1,goalExp:2,bossExp:2,berryHeal:8,tonicPp:1,restPp:2};
export const levelFor=(exp:number)=>PROG.thresholds.filter(t=>exp>=t).length;
export type Point={pos:Pos;kind:PointKind;used:boolean};
/** A floor that is not the current one: its terrain, revealed cells, real enemies (with their HP and positions) and points. */
export type StoredFloor={floor:Pos[];seen:string[];enemies:string[];units:Record<string,Unit>;points:Point[];rooms?:Rect[]};
/** Expedition-only data. `stored` holds every visited floor except the current one; unvisited floors are generated from `seed` on first entry. */
/** `base` (6.5): true for a run started from the base; only those runs get the floor-2 rest point (older generated runs keep their exact floors). */
/** `services` (7.2): true for a run that may hold a shop and an exchanger (decided by `serviceRoll` from the seed). Older runs never get them. */
/** `boss` (7.3): the run is 3 floors with themes, a lobby exit and the regional boss on floor 3 (needs `base` and `services`). Runs without it generate exactly as before. */
export type Dungeon={seed:number;width:number;height:number;floors:number;level:number;stored:Record<string,StoredFloor>;base?:true;services?:true;boss?:true};
/** 7.2 a technique machine obtained in this run (from T or the shop) and where it ended up: held while the run goes on, then brought home (normal exit), sent home safely (exchanger) or lost (wipe, not sent). */
export type TmItem={move:string;source:'target'|'shop'|'boss';fate:'held'|'brought'|'sent'|'lost'};
/** 7.2 the shop of this run: fixed stock decided at the start, and every sale so far. `tm` is null once sold. */
export type Shop={level:number;stock:{berry:number;tonic:number;tm:string|null};trades:{item:ShopItem;price:number}[]};
/** 7.2 the exchanger of this run: used at most once; `sent` is the companion it took home. */
export type Exchange={level:number;used:boolean;sent:string|null};
/**
 * The finished run. Fields after `brought` exist only for expedition runs with `prog` (7.2) and are fixed at the end, saved together with it:
 * `tms` final fate of every technique machine, `lost` who went missing in the wipe draw, `effective`/`reasons` the effective-expedition judgement
 * (reasons: 'goal' | 'recruit' | 'tm'), `reward` the base reward owed, `purse` the purse balance at the end and `refund` how much of it returns to the account.
 */
export type End = {id:string;outcome:'normal'|'wipe';team:string[];camp:string[];goal:boolean;acquired:number;brought:number;
  /** 7.3 (boss-marked runs only): whether the boss was defeated (its HP is 0 in the final state). */
  boss?:boolean;tms?:TmItem[];lost?:string[];effective?:boolean;reasons?:string[];reward?:number;purse?:number;refund?:number};
export type World = {runId:string;scenario:string;round:number;floor:Pos[];seen:string[];units:Record<string,Unit>;
  queue:string[];enemies:string[];camp:string[];leader:string;points:Point[];
  goal:boolean;bag:number;phase:'playing'|'invitation'|'exit'|'transit'|'ended';invitations:Invitation[];anchor:Pos|null;
  request:ExitRequest|null;end:End|null;log:string[];dungeon?:Dungeon;prog?:Progress;rooms?:Rect[];
  /** 7.2 (expedition runs with `prog` only): purse money, technique machines of this run, the shop and the exchanger (only runs with `dungeon.services`). */
  purse?:number;tms?:TmItem[];shop?:Shop;exchange?:Exchange};
export type Result = {ok:true;state:World}|{ok:false;state:World;error:string};
export const RULE_VERSION='trial-rules-2';
export const CONTENT_VERSION='trial-content-2';
export const SPEC_SOURCE='5f3547889b30e59f6cdfebc5af8c91e46cba4ee4';
export const key=(p:Pos)=>`${p.x},${p.y}`;
export const same=(a:Pos|null,b:Pos|null)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
export const distance=(a:Pos,b:Pos)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export const DIRS:Pos[]=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
export const plus=(a:Pos,b:Pos):Pos=>({x:a.x+b.x,y:a.y+b.y});
export const clone=<T>(v:T):T=>structuredClone(v);
const freshCombatState=()=>({stages:{atk:0,def:0},protect:0,counter:0,lastMove:null as string|null});
export function friend(id:string,x:number,y:number,hp=20,pp:Unit['pp']={}):Unit {
  return {id,side:'friend',hp,maxHp:20,pos:hp>0?{x,y}:null,pp:{...pp},maxPp:Object.fromEntries(Object.keys(pp).map(k=>[k,2])),learned:Object.keys(pp),...freshCombatState()};
}
export function enemy(id:string,x:number,y:number,hp:number,ai:Unit['ai'],damage:number,range=1):Unit {
  return {id,side:'enemy',hp,maxHp:hp,pos:{x,y},pp:{},maxPp:{},learned:[],ai,damage,range,...freshCombatState()};
}
export function newcomer(id='N'):Unit {return friend(id,0,0,10,{tackle:1,roar:1});}
/** 6.4: a real roster unit at the given run level: roster maxHp plus 2 per level above 1, full HP, kit moves at full kit PP. */
export function speciesUnit(id:string,speciesId:string,level=1,pos:Pos|null=null):Unit {
  const sp=SPECIES[speciesId],maxHp=sp.maxHp+PROG.hpPerLevel*(level-1);
  return {id,side:'friend',hp:maxHp,maxHp,pos,pp:Object.fromEntries(sp.kit.map(k=>[k.move,k.pp])),maxPp:Object.fromEntries(sp.kit.map(k=>[k.move,k.pp])),learned:sp.kit.map(k=>k.move),species:speciesId,...freshCombatState()};
}
/** R07 half snapshot of a new recruit: HP floor(max/2) (at least 1); each kit move PP floor(max/2) (at least 1, at most max). */
export function recruitUnit(id:string,speciesId:string,level:number):Unit {
  const u=speciesUnit(id,speciesId,level);u.hp=Math.max(1,Math.floor(u.maxHp/2));
  for(const k of Object.keys(u.maxPp))u.pp[k]=Math.min(u.maxPp[k]!,Math.max(1,Math.floor(u.maxPp[k]!/2)));
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
    units:{A:friend('A',0,1,20,{tackle:2}),B:friend('B',1,1,20,{protect:2}),C:friend('C',2,1,20,{tackle:2,quickattack:2}),E:e,R:enemy('R',9,1,6,'ranged',6,3)},
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
/** Names the first reason a straight-line move cannot reach its target. */
function rayProblem(s:World,a:Pos,b:Pos,range:number):string|null {
  if(a.x!==b.x&&a.y!==b.y)return '招式只能指定同排或同列的目标';
  if(distance(a,b)<1)return '招式不能指定自己所在的格';
  if(distance(a,b)>range)return `目标相距${distance(a,b)}格，超出招式射程${range}格`;
  const d={x:Math.sign(b.x-a.x),y:Math.sign(b.y-a.y)};let p=plus(a,d);
  while(!same(p,b)){if(!walk(s,p))return `射线在(${p.x},${p.y})被墙挡住`;const blocker=active(s).find(v=>same(v.pos,p));if(blocker)return `射线被${blocker.id}挡住`;p=plus(p,d);}
  return null;
}
const chebyshev=(a:Pos,b:Pos)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const inRect=(p:Pos,r:Rect)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;
function inRoomReach(s:World,actor:Pos,target:Pos):boolean {
  const room=(s.rooms??[]).find(r=>inRect(actor,r));
  return room?inRect(target,room):chebyshev(actor,target)<=2;
}
function targetKindMatches(s:World,actorId:string,target:Unit,spec:MoveSpec):boolean {
  switch(spec.target){
    case 'enemy':return target.side==='enemy'&&s.enemies.includes(target.id);
    case 'user':return target.id===actorId;
    case 'teammates':return target.id!==actorId&&target.side==='friend'&&s.queue.includes(target.id);
    case 'party':return target.side==='friend'&&s.queue.includes(target.id);
    case 'all':return s.queue.includes(target.id)||s.enemies.includes(target.id);
  }
}
/** Units affected by a move's geometry and target category, before special use restrictions. */
function moveTargetsInReach(s:World,actorId:string,spec:MoveSpec):Unit[] {
  const actor=s.units[actorId];if(!alive(actor))return [];
  if(spec.range==='user')return targetKindMatches(s,actorId,actor,spec)?[actor]:[];
  const candidates=active(s).filter(t=>targetKindMatches(s,actorId,t,spec));
  if(spec.range==='room')return candidates.filter(t=>inRoomReach(s,actor.pos,t.pos!));
  if(spec.range==='around')return candidates.filter(t=>t.id!==actorId&&chebyshev(actor.pos,t.pos!)===1);
  return candidates.filter(t=>{
    switch(spec.range){
      case 'front':return distance(actor.pos,t.pos!)===1;
      case 'front2':return clearRay(s,actor.pos,t.pos!,2);
      case 'line10':return clearRay(s,actor.pos,t.pos!,10);
      default:return false;
    }
  });
}
function rejectedForBoss(spec:MoveSpec,target:Unit):boolean {
  return !!target.boss&&spec.effects.includes('blowaway')&&spec.effects.includes('damage')===false;
}
/** Legal command targets for UI highlighting. User/room moves use the actor id in Action.target by contract. */
export function skillTargets(s:World,actorId:string,skill:Skill):string[] {
  const actor=s.units[actorId],spec=moveOf(skill);
  if(!alive(actor)||!spec||!actor.learned.includes(skill)||(actor.pp[skill]??0)<1)return [];
  if(spec.effects.includes('protect')&&actor.lastMove==='protect')return [];
  const affected=moveTargetsInReach(s,actorId,spec);
  if(spec.range==='user')return affected.length?[actorId]:[];
  if(spec.range==='room')return affected.length?[actorId]:[];
  return affected.filter(t=>!!t.pos&&s.seen.includes(key(t.pos))&&!rejectedForBoss(spec,t)).map(t=>t.id);
}
function moveRangeProblem(s:World,actor:Unit,target:Unit,spec:MoveSpec):string {
  switch(spec.range){
    case 'front':return '目标不在上下左右相邻格';
    case 'front2':return rayProblem(s,actor.pos!,target.pos!,2)??'目标不在两格直线射程内';
    case 'line10':return rayProblem(s,actor.pos!,target.pos!,10)??'目标不在直线射程内';
    case 'around':return '目标不在使用者周围八格内';
    case 'room':return '目标不在同一房间或走廊范围内';
    case 'user':return '招式只能指定使用者自己';
  }
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
  if(a.type==='exchange'){
    const point=s.points.find(p=>same(p.pos,u.pos)),ex=s.exchange;
    if(id!==s.leader)return '只有主控能操作交换机';
    if(!ex||!point||point.kind!=='exchange')return '主控必须站在交换机格上';
    if(ex.used)return '交换机本局已经用过，只能用一次';
    const t=s.units[a.target];
    if(!t||!s.queue.includes(t.id)||t.id===s.leader)return '只能送走主控以外的同行伙伴（主控要留下操作）';
    if(!alive(t))return `${t.id}已倒下，交换机只能送走仍存活的伙伴`;
    if(!Array.isArray(a.cargo)||a.cargo.length>ECON.exchangeCargo||new Set(a.cargo).size!==a.cargo.length)return `最多运送${ECON.exchangeCargo}份不同的招式机`;
    if(a.cargo.some(i=>!Number.isInteger(i)||s.tms?.[i]?.fate!=='held'))return '只能运送本局仍持有的招式机';
    return null;
  }
  if(a.type==='interact'){
    const point=s.points.find(p=>same(p.pos,u.pos));
    if(id!==s.leader||!point)return '主控必须站在交互点';
    if(point.kind==='down'||point.kind==='up')return a.exit?null:'楼梯只能请求跨层，不能取得';
    if(point.kind==='berry'||point.kind==='tonic'){if(a.exit)return '这里不是出口，不能请求撤离';return point.used?`${ITEM_NAMES[point.kind]}已拾取`:null;}
    if(point.kind==='rest'){if(a.exit)return '这里不是出口，不能请求撤离';if(point.used)return '休整点已使用，每局只能用一次';
      return restTargets(s).length?null:'在场成员的所有招式PP都已满，没有可整理的补给；休整机会没有消耗';}
    if(point.kind==='shop')return a.exit?'这里不是出口，不能请求撤离':'商店格上直接购买，不用“取得”';
    if(point.kind==='exchange')return a.exit?'这里不是出口，不能请求撤离':'交换机用“交换”操作，不用“取得”';
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
  const spec=moveOf(a.skill);if(!spec)return '招式数据不存在';
  if(spec.effects.includes('protect')&&u.lastMove==='protect')return '守住不能连续使用';
  if((spec.range==='user'||spec.range==='room')&&a.target!==id)return '这个招式需要选择自己作为目标';
  if(spec.range==='user'||spec.range==='room'){
    if(!moveTargetsInReach(s,id,spec).length)return spec.range==='room'?'范围内没有能受此招式影响的单位':'招式无法作用于使用者';
    return null;
  }
  if(!targetKindMatches(s,id,t,spec))return spec.target==='enemy'?'该招式只能指定敌人':spec.target==='teammates'?'该招式只能指定同行队友':spec.target==='user'?'招式只能指定使用者自己':'目标阵营不符合招式要求';
  if(!moveTargetsInReach(s,id,spec).some(v=>v.id===t.id))return moveRangeProblem(s,u,t,spec);
  if(t.boss&&spec.effects.includes('blowaway')&&!spec.effects.includes('damage'))return '首领不会被吹飞';
  return null;
}
/** 6.5 rest point: for each living member on the map, the move with the lowest remaining PP ratio (first in learned order on ties) if it is below its maximum. */
function restTargets(s:World):{id:string;skill:Skill}[] {
  const out:{id:string;skill:Skill}[]=[];
  for(const id of s.queue){const u=s.units[id];if(!alive(u))continue;
    let best:Skill|null=null,ratio=2;
    for(const k of u.learned){const max=u.maxPp[k]??0,cur=u.pp[k]??0;if(max<=0||cur>=max)continue;if(cur/max<ratio){ratio=cur/max;best=k;}}
    if(best)out.push({id,skill:best});}
  return out;
}
function hit(s:World,id:string,n:number):void {
  const u=s.units[id];u.hp=Math.max(0,u.hp-n);note(s,`${id}受到${n}伤害，HP ${u.hp}`);
  if(u.hp===0){u.pos=null;note(s,`${id}倒下退图`);if(u.side==='enemy'&&s.prog)s.prog.kills.push(u.recruit||u.boss?'':(u.species??''));
    if(u.side==='enemy'&&u.recruit){
    const unit=clone(u.recruit);unit.id=`${u.recruit.id}`; // fixture IDs are stable; each event initializes once
    if(s.units[unit.id]||s.invitations.some(i=>i.unit.id===unit.id))unit.id=`${unit.id}-${s.invitations.length+1}`;
    s.invitations.push({id:`${s.runId}:invite:${s.invitations.length+1}`,unit,status:'pending'});}}
}
/** Apply damage after the defender's defence stage; protect only stops enemy attacks against friends. */
function resolveDamage(s:World,sourceId:string,targetId:string,base:number,allowCounter=true):number {
  const source=s.units[sourceId],target=s.units[targetId];
  const blocked=source.side==='enemy'&&target.side==='friend'&&target.protect>0;
  const scaledBase=base+(source.stages?.atk??0);
  const amount=blocked?0:base<=0?0:Math.max(1,scaledBase-(target.stages?.def??0));
  const counter=allowCounter&&amount>0&&target.side==='friend'&&source.side==='enemy'&&target.counter>0&&
    !!source.pos&&!!target.pos&&distance(source.pos,target.pos)===1;
  hit(s,targetId,amount);
  if(counter)hit(s,sourceId,amount);
  return amount;
}
function collide(s:World,targetId:string):void {
  // The specification fixes blowaway impact at five damage; defence stages do not change collision damage.
  hit(s,targetId,5);
}
function blowAway(s:World,actor:Unit,target:Unit):void {
  if(!alive(actor)||!alive(target))return;
  const start=target.pos;
  const delta={x:Math.sign(target.pos.x-actor.pos.x),y:Math.sign(target.pos.y-actor.pos.y)};
  let at=target.pos,wall=false,blocker:Unit|undefined;
  for(let i=0;i<10;i++){
    const next=plus(at,delta);
    if(!walk(s,next)){wall=true;break;}
    blocker=active(s).find(u=>u.id!==target.id&&same(u.pos,next));
    if(blocker)break;
    at=next;
  }
  target.pos=at;
  if(!same(start,at))reveal(s);
  note(s,`${actor.id}吹飞${target.id}到${key(at)}`);
  if(wall)collide(s,target.id);
  else if(blocker){collide(s,target.id);collide(s,blocker.id);}
}
function changeStage(s:World,targetId:string,stat:'atk'|'def',change:number):void {
  const target=s.units[targetId],before=target.stages[stat];
  target.stages[stat]=Math.max(-3,Math.min(3,before+change));
  note(s,`${targetId}${stat==='atk'?'攻击':'防御'}阶段变为${target.stages[stat]}`);
}
function executeSkill(s:World,id:string,a:Extract<Action,{type:'skill'}>,bonus:number):void {
  const actor=s.units[id],spec=moveOf(a.skill)!;actor.pp[a.skill]=(actor.pp[a.skill]??0)-1;actor.lastMove=a.skill;
  note(s,`${id}使用${SKILL_CN[a.skill]??a.skill}`);
  let targets=spec.range==='room'||spec.range==='around'?moveTargetsInReach(s,id,spec):[s.units[a.target]];
  if(spec.range==='user')targets=[actor];
  let dealt=0;
  for(const effect of spec.effects){
    const stage=effect.match(/^stage:(atk|def):([+-]\d+)$/);
    if(stage){for(const target of targets)if(alive(target))changeStage(s,target.id,stage[1] as 'atk'|'def',Number(stage[2]));continue;}
    if(effect==='protect'){actor.protect=3;note(s,`${id}进入守住状态`);continue;}
    if(effect==='counter'){actor.counter=3;note(s,`${id}进入反击状态`);continue;}
    if(effect==='damage'&&spec.power!==null){
      const base=6+Math.ceil(spec.power/2)+bonus;
      for(const target of targets)if(alive(target)){
        const hpBefore=target.hp;resolveDamage(s,id,target.id,base);dealt+=hpBefore-target.hp;
      }
      continue;
    }
    if(effect==='blowaway'){
      // The regional boss resists blowaway effects. Dragontail still deals its listed damage.
      for(const target of targets)if(alive(target)&&!(target.boss&&spec.effects.includes('damage')))blowAway(s,actor,target);
    }
  }
  if(spec.effects.includes('drain')&&dealt>0&&actor.hp>0){
    const before=actor.hp,heal=Math.max(1,Math.floor(dealt/2));actor.hp=Math.min(actor.maxHp,actor.hp+heal);
    note(s,`${id}吸取生命，HP ${before}→${actor.hp}`);
  }
}
/** 7.2: the exchanger's effect. The companion leaves the queue (its slot stays empty), the chosen machines become 'sent', the exchanger is used up. */
function sendHome(s:World,a:Extract<Action,{type:'exchange'}>):void {
  const t=s.units[a.target];s.queue=s.queue.filter(i=>i!==a.target);t.pos=null;s.units[s.leader].lastMove=null;
  for(const i of a.cargo)s.tms![i].fate='sent';
  s.exchange!.used=true;s.exchange!.sent=a.target;
  const point=s.points.find(p=>p.kind==='exchange');if(point)point.used=true;
  note(s,`${s.leader}启动交换机：${a.target}安全回到基地，运走${a.cargo.length}份招式机；本局不再参战`);
}
function execute(s:World,id:string,a:Action):void {
  const u=s.units[id],bonus=s.prog?(s.prog.level-1)*PROG.damagePerLevel:0;
  if(a.type!=='skill')u.lastMove=null;
  if(a.type==='move'){u.pos=clone(a.to);reveal(s);note(s,`${id}移动到${key(a.to)}`);}
  else if(a.type==='basic')resolveDamage(s,id,a.target,6+bonus);
  else if(a.type==='use'){
    const t=s.units[a.target];s.prog!.items[a.item]--;
    if(a.item==='berry'){const before=t.hp;t.hp=Math.min(t.maxHp,t.hp+PROG.berryHeal);note(s,`${id}对${t.id}使用${ITEM_NAMES.berry}，HP ${before}→${t.hp}`);}
    else{for(const k of t.learned)t.pp[k]=Math.min(t.maxPp[k]??0,(t.pp[k]??0)+PROG.tonicPp);note(s,`${id}对${t.id}使用${ITEM_NAMES.tonic}，每招PP+${PROG.tonicPp}（不超上限）`);}
  }
  else if(a.type==='skill')executeSkill(s,id,a,bonus);
  else if(a.type==='interact'){
    const p=s.points.find(p=>same(p.pos,u.pos))!;const stairs=p.kind==='down'||p.kind==='up';
    if(p.kind==='rest'){
      const parts:string[]=[];
      for(const t of restTargets(s)){const m=s.units[t.id],before=m.pp[t.skill]??0;m.pp[t.skill]=Math.min(m.maxPp[t.skill]??0,before+PROG.restPp);parts.push(`${t.id}的${SKILL_CN[t.skill]}PP ${before}→${m.pp[t.skill]}`);}
      p.used=true;note(s,`休整点：整理招式补给，${parts.join('，')}`);return;
    }
    if(!stairs&&!p.used){if(p.kind==='goal'){s.goal=true;if(s.prog)s.prog.exp+=PROG.goalExp;}
      if(p.kind==='item'){s.bag++;if(s.prog){const r=rngStep(s.prog.rng);s.prog.rng=r.state;const pool=tmPool(s.dungeon),move=pool[Math.floor(r.value*pool.length)];(s.tms??=[]).push({move,source:'target',fate:'held'});note(s,`${id}取得招式机：${move}`);}}
      if((p.kind==='berry'||p.kind==='tonic')&&s.prog){s.prog.items[p.kind]++;note(s,`${id}拾取${ITEM_NAMES[p.kind]}，背包共${s.prog.items[p.kind]}`);}p.used=true;}
    if(p.kind==='berry'||p.kind==='tonic'){/* a pickup is never an exit */}
    else if(a.exit)s.request={actor:id,pos:clone(u.pos!),locked:false,...(stairs?{to:s.dungeon!.level+(p.kind==='down'?1:-1)}:{})};
    if(p.kind!=='berry'&&p.kind!=='tonic')note(s,stairs?`${id}请求${p.kind==='down'?'下':'上'}楼梯跨层`:`${id}交互${a.exit?'并请求撤离':''}`);
  }else note(s,`${id}等待`);
}
/** One member's turn in a round, as the rules would run it (stage 7.1 preview). `explicit` is false for the default behaviour; `failed` means the action no longer applied and the member waited. */
export type TraceStep={id:string;action:Action;explicit:boolean;failed:boolean;swapWith?:string};
function ownPhase(s:World,cmd:Extract<Command,{type:'round'}>,preflight:boolean,trace?:TraceStep[]):string|null {
  const lead=s.leader;const moved=new Set<string>();
  if(cmd.override&&(cmd.override.actor===lead||!s.queue.includes(cmd.override.actor)||!alive(s.units[cmd.override.actor])))return '只能安排另一名存活伙伴';
  if(cmd.override?.action.type==='swap')return '换位须从主控发起';
  if(cmd.override?.action.type==='interact'||cmd.override?.action.type==='exchange')return '伙伴不能代替主控交互';
  const swap=cmd.action.type==='swap'?cmd.action.target:null;
  if(swap){if(cmd.override)return '换位已占唯一伙伴干预';const err=invalid(s,lead,cmd.action);if(err)return err;}
  const later=swap?Math.max(s.queue.indexOf(lead),s.queue.indexOf(swap)):-1;
  // 7.2 exchanger: the leader's whole action. The companion leaves at once (it takes no further part this round), then everyone else acts as usual.
  const ex=cmd.action.type==='exchange'?cmd.action:null;
  if(ex){const err=invalid(s,lead,ex);if(err)return err;if(cmd.override?.actor===ex.target)return '被送走的伙伴不能同时被安排动作';
    sendHome(s,ex);trace?.push({id:lead,action:ex,explicit:true,failed:false});}
  const order=[...s.queue];
  for(let i=0;i<order.length;i++){const id=order[i];if(!s.queue.includes(id)||!alive(s.units[id])||(ex&&id===lead))continue;
    if(swap&&(id===lead||id===swap)){
      if(i===later){const err=invalid(s,lead,cmd.action);if(err){if(preflight)return err;continue;}
        const p=s.units[lead].pos;s.units[lead].pos=s.units[swap].pos;s.units[swap].pos=p;s.units[lead].lastMove=null;s.units[swap].lastMove=null;moved.add(lead);moved.add(swap);reveal(s);note(s,`${lead}与${swap}换位`);trace?.push({id:lead,action:cmd.action,explicit:true,failed:false,swapWith:swap});}continue;}
    const explicit=id===lead?cmd.action:cmd.override?.actor===id?cmd.override.action:null;
    const a=explicit??defaultAction(s,id);const err=invalid(s,id,a,moved);
    if(err){if(explicit&&preflight)return err;s.units[id].lastMove=null;note(s,`${id}动作失效，等待，未扣PP`);trace?.push({id,action:a,explicit:!!explicit,failed:true});continue;}
    execute(s,id,a);if(a.type==='move')moved.add(id);trace?.push({id,action:a,explicit:!!explicit,failed:false});
  }
  if(preflight)return null;
  for(const id of s.enemies){const e=s.units[id];if(!alive(e))continue;
    if(e.boss){
      // 7.3 boss: never moves; BOSS.attacks attacks, each choosing its target afresh: the first living adjacent member in queue order, else the nearest member in a clear ray within its range (ties: queue order).
      for(let n=0;n<BOSS.attacks&&alive(e);n++){
        const cands=s.queue.map(i=>s.units[i]).filter(alive);
        const t=cands.find(c=>distance(e.pos!,c.pos)===1)??cands.filter(c=>clearRay(s,e.pos!,c.pos,e.range??BOSS.range)).sort((a,b)=>distance(e.pos!,a.pos)-distance(e.pos!,b.pos))[0];
        if(!t)break;
        resolveDamage(s,id,t.id,e.damage??0);
      }
      continue;
    }
    const candidates=s.queue.map(i=>s.units[i]).filter(alive);
    const targets=candidates.filter(t=>e.ai==='ranged'?clearRay(s,e.pos!,t.pos,e.range??3):distance(e.pos!,t.pos)===1);
    if(e.ai==='ranged')targets.sort((a,b)=>distance(e.pos!,a.pos)-distance(e.pos!,b.pos));
    const t=targets[0];
    if(t)resolveDamage(s,id,t.id,e.damage??0);
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
  for(const u of Object.values(s.units)){
    if(u.protect>0)u.protect--;
    if(u.counter>0)u.counter--;
  }
  return null;
}
/** 7.3: the boss unit of a boss-marked run, wherever its floor is kept (current floor or stored), or undefined (not marked, or its floor was never generated). */
export function bossUnit(s:World):Unit|undefined {
  if(!s.dungeon?.boss)return undefined;
  return Object.values(s.units).find(u=>u.boss)??Object.values(s.dungeon.stored).flatMap(f=>Object.values(f.units)).find(u=>u.boss);
}
/** 7.3 "defeated": the boss exists and its HP is 0. */
export const bossDefeated=(s:World):boolean=>bossUnit(s)?.hp===0;
/** 7.2: a run started before the base existed has no profile; its A, B and C are the three founding starters and count as protected. */
const legacyStarter=(s:World,id:string)=>!s.dungeon?.base&&s.units[id].inst===undefined&&(id==='A'||id==='B'||id==='C');
export const isProtected=(s:World,id:string)=>s.units[id].protected===true||legacyStarter(s,id);
/** A unit made in this run (not from the roster and not a founding starter): the kind that counts as a new result when it is kept. */
export const isRecruit=(s:World,id:string)=>s.units[id].inst===undefined&&!legacyStarter(s,id)&&!!s.units[id].species;
/**
 * 7.2 end-of-run processing point, one fixed order, saved together with the end record (a reload never redraws or recomputes it):
 * 1. technique machines still held get their final fate; 2. in a wipe, each unprotected team member draws once from the saved stream (`prog.rng`)
 * and goes missing when the value is below `ECON.loseChance`; 3. the effective-expedition judgement and the reward; 4. the purse refund (normal exit only).
 */
export function reasonsOf(s:World):string[] {
  const reasons:string[]=[];
  if(s.goal)reasons.push('goal');
  if([...s.queue,...s.camp,...(s.exchange?.sent?[s.exchange.sent]:[])].some(id=>isRecruit(s,id)))reasons.push('recruit');
  if((s.tms??[]).some(t=>t.fate==='brought'||t.fate==='sent'))reasons.push('tm');
  return reasons;
}
/** Builds the end record and applies its side effects on the world (machine fates, the wipe draw's random state), without changing the phase. `draw` false skips the wipe draw (an old, already settled history record: nobody is marked as missing). */
export function closeOut(s:World,outcome:End['outcome'],draw=true):End {
  const wipe=outcome==='wipe';
  const e:End={id:`${s.runId}:end`,outcome,team:[...s.queue],camp:[...s.camp],goal:s.goal,acquired:s.bag,brought:wipe?0:s.bag};
  if(s.prog){
    const tms=s.tms??(s.tms=[]);for(const t of tms)if(t.fate==='held')t.fate=wipe?'lost':'brought';
    const lost:string[]=[];
    if(wipe&&draw)for(const id of s.queue){if(isProtected(s,id))continue;const r=rngStep(s.prog.rng);s.prog.rng=r.state;if(r.value<ECON.loseChance)lost.push(id);}
    const reasons=reasonsOf(s);
    const purse=s.purse??0;
    Object.assign(e,{...(s.dungeon?.boss?{boss:bossDefeated(s)}:{}),tms:clone(tms),lost,effective:reasons.length>0,reasons,reward:s.goal?ECON.reward:0,purse,refund:wipe?0:purse});
  }
  return e;
}
function end(s:World,outcome:End['outcome']):void {
  clearCombatState(s);
  s.end=closeOut(s,outcome);
  s.phase='ended';s.request=null;s.anchor=null;note(s,outcome==='normal'?'正常撤离':'全队倒下，本试验结束');
}
function clearUnitCombatState(u:Unit):void {
  u.stages={atk:0,def:0};u.protect=0;u.counter=0;u.lastMove=null;
}
function clearCombatState(s:World):void {
  for(const u of Object.values(s.units))clearUnitCombatState(u);
  for(const floor of Object.values(s.dungeon?.stored??{}))for(const u of Object.values(floor.units))clearUnitCombatState(u);
}
/** After invitations are done: a locked plain request waits as `exit`, a locked stairs request as `transit`. */
const settled=(s:World):World['phase']=>s.request?.locked?(s.request.to!==undefined?'transit':'exit'):'playing';
/**
 * 6.4 round-end settlement, in one fixed order: experience from this round's defeats, level-ups, then the recruit draws in defeat order.
 * A level-up raises every current member's max HP (current HP unchanged, R07); recruit snapshots are taken after it, at the settled level.
 */
function settle(s:World):void {
  const p=s.prog;if(!p)return;
  const kills=p.kills;p.kills=[];
  // 7.3 boss reward is settled once, in the round the boss falls: 2 extra experience here, then (after level-ups) one machine drawn from the pool.
  const bossNew=!!s.dungeon?.boss&&bossDefeated(s)&&!(s.tms??[]).some(t=>t.source==='boss');
  p.exp+=kills.length*PROG.killExp+(bossNew?PROG.bossExp:0);
  while(p.level<PROG.maxLevel&&p.exp>=PROG.thresholds[p.level]){
    p.level++;for(const id of s.queue)s.units[id].maxHp+=PROG.hpPerLevel;
    note(s,`本局等级升到Lv${p.level}：同行最大HP+${PROG.hpPerLevel}（当前HP不变），攻击伤害+${PROG.damagePerLevel}`);
  }
  if(bossNew){
    const r=rngStep(p.rng);p.rng=r.state;const pool=tmPool(s.dungeon),move=pool[Math.floor(r.value*pool.length)];
    (s.tms??=[]).push({move,source:'boss',fate:'held'});note(s,`区域首领被讨伐，掉落招式机：${move}（持有中）`);
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
/**
 * Stage 7.1: what each member would do this round, in execution order, by running the same round code on a copy. Nothing is executed on `original`.
 * Returns null when the command would be refused. The enemy phase always follows the last step.
 */
export function traceRound(original:World,cmd:Command):TraceStep[]|null {
  if(cmd.type!=='round'||original.phase!=='playing')return null;
  if(ownPhase(clone(original),cmd,true)!==null)return null;
  const steps:TraceStep[]=[];ownPhase(clone(original),cmd,false,steps);return steps;
}
/** Names the first reason a purchase cannot happen now, or null. */
export function buyProblem(s:World,item:ShopItem):string|null {
  const sh=s.shop,lead=s.units[s.leader];
  if(s.phase!=='playing')return '先处理邀请、撤离或终局';
  if(!sh||!s.prog||s.dungeon?.level!==sh.level)return '这里没有商店';
  const point=lead?.pos?s.points.find(p=>same(p.pos,lead.pos)):undefined;
  if(!point||point.kind!=='shop')return '主控必须站在商店格上才能购买';
  if(!(item in ECON.price))return '没有这种商品';
  if(item==='tm'?sh.stock.tm===null:sh.stock[item]<1)return '这件商品已售罄，库存不会刷新';
  const price=ECON.price[item],purse=s.purse??0;
  if(purse<price)return `钱袋不足：需要${price}，还差${price-purse}`;
  return null;
}
function buy(original:World,item:ShopItem):World {
  const s=clone(original),sh=s.shop!,price=ECON.price[item];
  s.purse=(s.purse??0)-price;sh.trades.push({item,price});
  if(item==='tm'){(s.tms??=[]).push({move:sh.stock.tm!,source:'shop',fate:'held'});note(s,`${s.leader}在商店买下招式机：${sh.stock.tm}，花费${price}`);sh.stock.tm=null;}
  else{sh.stock[item]--;s.prog!.items[item]++;note(s,`${s.leader}在商店买下${ITEM_NAMES[item]}，花费${price}，背包共${s.prog!.items[item]}`);}
  return s;
}
export function applyCommand(original:World,cmd:Command):Result {
  const fail=(error:string):Result=>({ok:false,state:original,error:`${error}；本轮未执行`});
  if(cmd.type==='buy'){const err=buyProblem(original,cmd.item);return err?{ok:false,state:original,error:`${err}；没有购买`}:{ok:true,state:buy(original,cmd.item)};}
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
  for(const e of g.enemies){const u=enemy(e.id,e.pos.x,e.pos.y,e.hp,e.ai,e.damage,e.range);u.species=e.species;if(e.boss)u.boss=true;units[e.id]=u;}
  return {units,enemies:g.enemies.map(e=>e.id)};
}
/** `run` is true for 6.4 expeditions (with `prog`): they also get pickups and room rectangles; older expeditions generate the 6.3 floor. */
function freshFloor(d:Dungeon,level:number,run:boolean):StoredFloor {
  const g=generateFloor(d.seed,level,{width:d.width,height:d.height,floors:d.floors,...(d.boss?{boss:true}:{})});
  return {floor:g.floor,seen:[],points:[...g.points,...(run?g.pickups:[]),...(run&&d.base&&g.rest?[g.rest]:[]),...(run&&d.services?g.services:[])].map(p=>({...p})),...floorUnits(g),...(run?{rooms:g.rooms.map(r=>({...r}))}:{})};
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
  delete d.stored[to];d.stored[String(from)]=cur;clearCombatState(s);d.level=to;s.request=null;s.phase='playing';
  note(s,`同行抵达第${to}层`);return s;
}
/**
 * Developer and test helper: the same crossing as a stairs request, but to any floor of the run and without walking there (the team lands on that floor's arrival stairs).
 * Returns the world unchanged when the crossing would be cancelled.
 */
export function jumpToFloor(original:World,to:number):World {
  const s=clone(original);s.request={actor:s.leader,pos:clone(s.units[s.leader].pos!),locked:true,to};
  const r=transit(s);r.request=null;r.phase='playing';return r;
}
/**
 * The expedition: `floors` (2) seeded floors. 6.4 team (WORKING CANDIDATE): A charmander, B squirtle, C bulbasaur, three roster starters at run level 1;
 * C leads, as before (so entry placement and the drawn skins are unchanged). The start cell is the ordinary exit of floor 1.
 */
export type SquadMember={inst:string;species:string;carry:KitMove[];protected?:boolean};
/** 6.5: a roster instance entering a run: species base HP at run level 1, full HP, and exactly its carried moves at full PP. */
export function carriedUnit(id:string,m:SquadMember):Unit {
  const sp=SPECIES[m.species];
  return {id,side:'friend',hp:sp.maxHp,maxHp:sp.maxHp,pos:null,pp:Object.fromEntries(m.carry.map(k=>[k.move,k.pp])),maxPp:Object.fromEntries(m.carry.map(k=>[k.move,k.pp])),
    learned:m.carry.map(k=>k.move),species:m.species,inst:m.inst,moves:m.carry.map(k=>k.move),...freshCombatState(),...(m.protected?{protected:true as const}:{})};
}
/** `boss` (7.3) defaults to true for a base run of 3 floors (what departures use); a run with another floor count or no base never has it. */
export function createExpedition(runId:string,seed:number,floors=2,squad?:{members:SquadMember[];leader:number},purse=0,boss=!!squad&&floors===3):World {
  const d:Dungeon={seed:seed>>>0,width:20,height:14,floors,level:1,stored:{},...(squad?{base:true as const,services:true as const}:{}),...(squad&&boss?{boss:true as const}:{})};
  const f=freshFloor(d,1,true);
  const s:World={runId,scenario:'expedition',round:0,floor:f.floor,seen:[],
    units:{...(squad?Object.fromEntries(squad.members.map((m,i)=>['ABC'[i],carriedUnit('ABC'[i],m)])):{A:speciesUnit('A','charmander'),B:speciesUnit('B','squirtle'),C:speciesUnit('C','bulbasaur')}),...f.units},
    queue:squad?squad.members.map((_,i)=>'ABC'[i]):['A','B','C'],enemies:f.enemies,camp:[],leader:squad?'ABC'[squad.leader]:'C',points:f.points,goal:false,bag:0,phase:'playing',invitations:[],anchor:null,request:null,end:null,log:[],dungeon:d,
    rooms:f.rooms,prog:{level:1,exp:0,rng:(seed^0xA5A5F00D)>>>0,made:0,kills:[],items:{berry:0,tonic:0}},purse:squad?purse:0,tms:[]};
  if(squad){
    const roll=serviceRoll(d.seed,floors);
    if(roll.shop)s.shop={level:roll.shop.level,stock:{berry:ECON.stock.berry,tonic:ECON.stock.tonic,tm:tmPool(d)[Math.floor(roll.shop.tmDraw*tmPool(d).length)]},trades:[]};
    if(roll.exchange)s.exchange={level:roll.exchange.level,used:false,sent:null};
  }
  for(const id of s.queue)s.units[id].pos=null;
  if(!placeTeam(s,f.points.find(p=>p.kind==='exit')!.pos))throw Error('expedition start has no legal cells');
  return s;
}
