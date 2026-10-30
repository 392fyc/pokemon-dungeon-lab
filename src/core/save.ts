import {applyCommand,clone,levelFor,PROG,RULE_VERSION,CONTENT_VERSION,closeOut,isProtected,reasonsOf,bossDefeated,type World,type Command,type Result,type StoredFloor,type Dungeon} from './engine.ts';
import {WILD_SPECIES,BOSS,serviceRoll} from './dungeon.ts';
import {ECON} from './economy.ts';
import {speciesOf,tmPool,learnableMove,BOSS_SPECIES} from './roster.ts';
import {profileProblem,profileFitsWorld,settleRun,settleSummary,applyBase,squadOf,migrateProfile,migrateProfileMoves,purseProblem,type Profile,type BaseAction,type SettleSummary} from './base.ts';
import {createExpedition} from './engine.ts';
import {moveOf} from './moves.ts';
import {LEGACY_BEHAVIOR_MOVE,legacyMoveForBehavior,legacySpeciesMove} from './legacy-moves.ts';
export interface StoragePort {getItem(key:string):string|null;setItem(key:string,value:string):void|Promise<void>;}
/** A persisted record contains only the camp profile. The current expedition is memory-only. */
export type Envelope={format:2;rules:string;content:string;build:string;sequence:number;profile:Profile};
/** Format 1 is retained only for decoding and validating old saves. */
export type LegacyEnvelope={format:1;rules:string;content:string;build:string;sequence:number;current:World|null;recent:World|null;profile:Profile};
export type SaveStatus='empty'|'ready'|'saving'|'failed'|'blocked';
export const SAVE_KEY='dungeon-trial.player.v1';
export const BUILD_ID='trial-0.1.0';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown)=>Number.isInteger(v);
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string');
const position=(v:unknown):v is {x:number;y:number}=>object(v)&&integer(v.x)&&integer(v.y);
const legacyBehaviors=['strong','line','guard','push'];
const moveIds=(v:unknown):v is string[]=>strings(v)&&v.every(id=>!!moveOf(id));
const exactKeys=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join()===keys.slice().sort().join();
// Released boss numbers stay valid as a complete tuple when current tuning changes.
// Loading never replaces the numbers held by an existing boss (issue #38).
const BOSS_HISTORY=[{hp:80,damage:6,range:3}] as const;
const validBossNumbers=(v:Record<string,unknown>)=>[BOSS,...BOSS_HISTORY].some(b=>v.maxHp===b.hp&&v.damage===b.damage&&v.range===b.range);
function validUnit(v:unknown,depth=0):boolean {
  // 7.3 H1: a nested unit (a recruit) never carries the boss mark or the boss species.
  if(depth>0&&object(v)&&(v.boss!==undefined||(typeof v.species==='string'&&Object.prototype.hasOwnProperty.call(BOSS_SPECIES,v.species))))return false;
  if(!object(v)||typeof v.id!=='string'||!['friend','enemy'].includes(String(v.side))||!integer(v.hp)||!integer(v.maxHp)||(v.maxHp as number)<=0||(v.hp as number)<0||(v.hp as number)>(v.maxHp as number)||(v.pos!==null&&!position(v.pos))||!object(v.pp)||!object(v.maxPp)||!moveIds(v.learned))return false;
  const allowed=['id','side','hp','maxHp','pos','pp','maxPp','learned','ai','protected','damage','range','recruit','species','inst','moves','boss','stages','protect','counter','lastMove','reflect','lightscreen'];
  if(Object.keys(v).some(k=>!allowed.includes(k))||new Set(v.learned).size!==v.learned.length)return false;
  if(v.side==='enemy'&&(v.reflect!==undefined||v.lightscreen!==undefined))return false;
  for(const k of ['reflect','lightscreen'] as const){const n=v[k];if(n!==undefined&&(v.side!=='friend'||!integer(n)||(n as number)<0||(n as number)>10))return false;}
  const learned=v.learned as string[];
  if(!exactKeys(v.pp,learned)||!exactKeys(v.maxPp,learned))return false;
  for(const k of learned){const n=v.pp[k],max=v.maxPp[k];if(!integer(n)||!integer(max)||(max as number)<1||(n as number)<0||(n as number)>(max as number))return false;}
  if(!object(v.stages)||!exactKeys(v.stages,['atk','def'])||!integer(v.stages.atk)||!integer(v.stages.def)||(v.stages.atk as number)<-3||(v.stages.atk as number)>3||(v.stages.def as number)<-3||(v.stages.def as number)>3)return false;
  if(!integer(v.protect)||(v.protect as number)<0||(v.protect as number)>3||!integer(v.counter)||(v.counter as number)<0||(v.counter as number)>3)return false;
  if(v.lastMove!==null&&(typeof v.lastMove!=='string'||!moveOf(v.lastMove)||!learned.includes(v.lastMove)))return false;
  if((v.inst===undefined)!==(v.moves===undefined)||(v.moves!==undefined&&(!moveIds(v.moves)||v.moves.length!==learned.length||v.moves.some((m,i)=>m!==learned[i]))))return false;
  if(v.ai!==undefined&&!['melee','ranged','chase'].includes(String(v.ai)))return false;
  if(v.protected!==undefined&&(v.protected!==true||v.side!=='friend'||v.inst===undefined))return false;
  if(v.damage!==undefined&&(!integer(v.damage)||(v.damage as number)<0))return false;
  if(v.range!==undefined&&(!integer(v.range)||(v.range as number)<1))return false;
  // 7.3 boss: an Arcanine from the full Pokédex is still valid in a run only with the boss mark (enemy side, fixed numbers, no recruit, no base instance).
  if(v.boss!==undefined&&(v.boss!==true||v.side!=='enemy'||v.species!==BOSS.species||!validBossNumbers(v)||v.ai!=='melee'||v.recruit!==undefined||v.inst!==undefined))return false;
  if(v.species!==undefined&&(typeof v.species!=='string'||!(speciesOf(v.species)||(v.boss===true&&Object.prototype.hasOwnProperty.call(BOSS_SPECIES,v.species)))))return false;
  if(typeof v.species==='string'&&Object.prototype.hasOwnProperty.call(BOSS_SPECIES,v.species)&&v.boss!==true)return false;
  if(v.inst!==undefined&&(v.side!=='friend'||typeof v.inst!=='string'||!v.inst||!moveIds(v.moves)||v.species===undefined))return false;
  // Expedition enemies are always wild species; a starter on the enemy side is a contradictory save.
  if(v.side==='enemy'&&v.species!==undefined&&v.boss!==true&&!(String(v.species) in WILD_SPECIES))return false;
  return v.recruit===undefined||(depth<1&&validUnit(v.recruit,depth+1));
}
const keyOf=(p:{x:number;y:number})=>`${p.x},${p.y}`;
const pointKinds=['goal','item','exit','down','up','berry','tonic','rest','shop','exchange'];
/** Points that exist only in 6.4+ expeditions (pickups, the 6.5 rest point and the 7.2 service cells). */
const isPickup=(k:unknown)=>k==='berry'||k==='tonic'||k==='rest'||k==='shop'||k==='exchange';
const validPoint=(p:unknown,cells:Set<string>)=>object(p)&&position(p.pos)&&pointKinds.includes(String(p.kind))&&typeof p.used==='boolean'&&cells.has(keyOf(p.pos));
/** A stored (non-current) floor: terrain, revealed cells, real enemies and points. Ids are claimed in `taken` so none repeats across floors. */
function validStored(f:unknown,d:Dungeon,taken:Set<string>,run:boolean):f is StoredFloor {
  if(!object(f)||!Array.isArray(f.floor)||!f.floor.length||!f.floor.every(position)||!strings(f.seen)||!strings(f.enemies)||!object(f.units)||!Array.isArray(f.points))return false;
  if(f.floor.some(p=>p.x<0||p.y<0||p.x>=d.width||p.y>=d.height))return false;
  const cells=new Set(f.floor.map(keyOf));if(cells.size!==f.floor.length||f.seen.some(k=>!cells.has(k)))return false;
  const ids=Object.keys(f.units);if(ids.length!==f.enemies.length||new Set(f.enemies).size!==f.enemies.length||f.enemies.some(i=>!ids.includes(i)))return false;
  const occupied=new Set<string>();
  for(const id of ids){const u=f.units[id];if(taken.has(id)||!validUnit(u)||(u as {id:string}).id!==id||(u as {side:string}).side!=='enemy')return false;taken.add(id);
    const e=u as {hp:number;pos:{x:number;y:number}|null};
    if(e.hp===0){if(e.pos!==null)return false;}else{if(!e.pos||!cells.has(keyOf(e.pos))||occupied.has(keyOf(e.pos)))return false;occupied.add(keyOf(e.pos));}}
  if((f.rooms!==undefined)!==run||(run&&!validRooms(f.rooms,cells,d)))return false;
  if(!run&&f.points.some(p=>isPickup((p as {kind:unknown}).kind)))return false;
  return f.points.every(p=>validPoint(p,cells));
}
/** Generated room rectangles: whole-number boxes inside the map whose every cell is floor (rooms are carved in full). */
function validRooms(rooms:unknown,cells:Set<string>,d:Dungeon):boolean {
  if(!Array.isArray(rooms)||!rooms.length||rooms.length>16)return false;
  return rooms.every(r=>{if(!object(r)||![r.x,r.y,r.w,r.h].every(integer)||(r.w as number)<1||(r.h as number)<1||(r.x as number)<0||(r.y as number)<0||(r.x as number)+(r.w as number)>d.width||(r.y as number)+(r.h as number)>d.height)return false;
    for(let y=r.y as number;y<(r.y as number)+(r.h as number);y++)for(let x=r.x as number;x<(r.x as number)+(r.w as number);x++)if(!cells.has(`${x},${y}`))return false;return true;});
}
/** Which point kinds a floor may hold: no stairs outside an expedition, no 'up' on the first floor, no 'down' on the last, exits only on floor 1. */
function pointsFitLevel(points:{kind:string}[],level:number|null,floors:number,boss=false):boolean {
  if(level===null)return points.every(p=>p.kind!=='down'&&p.kind!=='up');
  return points.every(p=>!(p.kind==='up'&&level===1)&&!(p.kind==='down'&&level===floors)&&!(p.kind==='exit'&&level!==1&&!(boss&&level===floors))&&!(p.kind==='rest'&&level!==2));
}
/** 6.4 run level, counters, pickups and rooms of an expedition. All of it is absent together for expeditions saved before 6.4. */
function validProgress(s:World,d:Dungeon):boolean {
  const p=s.prog,here=new Set(s.floor.map(keyOf));
  if((s.rooms!==undefined)!==(p!==undefined)||(s.rooms!==undefined&&!validRooms(s.rooms,here,d)))return false;
  const points=[...s.points,...Object.values(d.stored).flatMap(f=>f.points)];
  if(p===undefined)return !points.some(q=>isPickup(q.kind))&&s.tms===undefined&&s.purse===undefined&&s.shop===undefined&&s.exchange===undefined;
  if(!object(p)||!integer(p.level)||!integer(p.exp)||!integer(p.rng)||!integer(p.made)||!Array.isArray(p.kills)||!object(p.items))return false;
  if(p.exp<0||p.level<1||p.level>PROG.maxLevel||p.level!==levelFor(p.exp)||p.rng<0||p.rng>4294967295||p.made<0||p.made>999||p.kills.length>0)return false;
  if(Object.keys(p.items).sort().join()!=='berry,tonic')return false;
  for(const k of ['berry','tonic'] as const){const n=p.items[k];if(!integer(n)||n<0||n>points.filter(q=>q.kind===k&&q.used).length+(s.shop?.trades.filter(t=>t.item===k).length??0))return false;}
  if(s.goal&&p.exp<PROG.goalExp)return false;
  if(points.filter(q=>q.kind==='rest').length>(d.base?1:0))return false;
  return validTms(s)&&validServices(s,d);
}
const fates=['held','brought','sent','lost'];
/** The run's technique machines: known moves, source and fate in range; fates agree with the phase (held only while playing, brought only after a normal exit, lost only after a wipe). */
function validTms(s:World):boolean {
  const t=s.tms;if(!Array.isArray(t)||t.length>12)return false;
  for(const m of t){if(!object(m)||!tmPool(s.dungeon).includes(String(m.move))||!['target','shop','boss'].includes(String(m.source))||!fates.includes(String(m.fate))||Object.keys(m).length!==3)return false;}
  if(t.filter(m=>m.source==='target').length>s.bag)return false;
  // 7.3: a boss machine exists only in a boss-marked run, at most once, and only after the boss was defeated.
  const fromBoss=t.filter(m=>m.source==='boss').length;if(fromBoss>1||(fromBoss>0&&!(s.dungeon?.boss&&bossDefeated(s))))return false;
  if(s.phase==='ended'){const wipe=s.end?.outcome==='wipe';if(t.some(m=>m.fate==='held'||(wipe?m.fate==='brought':m.fate==='lost')))return false;}
  else if(t.some(m=>m.fate!=='held'&&m.fate!=='sent'))return false;
  return true;
}
/** Purse, shop and exchanger against the run's seed: their level, stock, sales, cells and the units they touched must all agree with what the seed decides. */
function validServices(s:World,d:Dungeon):boolean {
  const purse=s.purse;if(!integer(purse)||(purse as number)<0)return false;
  const floors:[number,{kind:string;used:boolean}[]][]=[[d.level,s.points],...Object.entries(d.stored).map(([n,f])=>[Number(n),f.points] as [number,{kind:string;used:boolean}[]])];
  const cellsOf=(kind:string)=>floors.flatMap(([lv,ps])=>ps.filter(q=>q.kind===kind).map(q=>({lv,used:q.used})));
  const spent=s.shop?.trades.reduce((a,t)=>a+(typeof t.price==='number'?t.price:0),0)??0;
  const start=(purse as number)+spent;
  if(start>ECON.purseMax||start%ECON.purseStep!==0)return false;
  const sentFates=(s.tms??[]).filter(m=>m.fate==='sent').length;
  if(!d.services)return s.shop===undefined&&s.exchange===undefined&&cellsOf('shop').length===0&&cellsOf('exchange').length===0&&sentFates===0;
  const roll=serviceRoll(d.seed,d.floors),shop=s.shop,ex=s.exchange;
  if(!!roll.shop!==!!shop||!!roll.exchange!==!!ex)return false;
  const generated=(lv:number)=>lv===d.level||String(lv) in d.stored;
  if(roll.shop&&shop){
    const pool=tmPool(d),want=pool[Math.floor(roll.shop.tmDraw*pool.length)];
    if(!object(shop)||shop.level!==roll.shop.level||!object(shop.stock)||!Array.isArray(shop.trades))return false;
    const n=(item:string)=>shop.trades.filter(t=>t.item===item).length;
    if(shop.trades.some(t=>!object(t)||!(t.item in ECON.price)||t.price!==ECON.price[t.item]))return false;
    if(shop.stock.berry!==ECON.stock.berry-n('berry')||shop.stock.tonic!==ECON.stock.tonic-n('tonic')||n('tm')>1||shop.stock.tm!==(n('tm')?null:want)||shop.stock.berry<0||shop.stock.tonic<0)return false;
    const bought=(s.tms??[]).filter(m=>m.source==='shop');
    if(bought.length!==n('tm')||bought.some(m=>m.move!==want))return false;
    const cells=cellsOf('shop');if(cells.length!==(generated(shop.level)?1:0)||cells.some(c=>c.lv!==shop.level||c.used))return false;
  }
  if(roll.exchange&&ex){
    if(!object(ex)||ex.level!==roll.exchange.level||typeof ex.used!=='boolean'||(ex.sent!==null&&typeof ex.sent!=='string')||ex.used!==(ex.sent!==null))return false;
    const cells=cellsOf('exchange');if(cells.length!==(generated(ex.level)?1:0)||cells.some(c=>c.lv!==ex.level||c.used!==ex.used))return false;
    if(ex.sent!==null){const u=s.units[ex.sent];
      if(!u||u.side!=='friend'||u.pos!==null||u.hp<=0||s.queue.includes(ex.sent)||s.camp.includes(ex.sent)||s.enemies.includes(ex.sent)||ex.sent===s.leader)return false;}
    if(sentFates>ECON.exchangeCargo||(!ex.used&&sentFates>0))return false;
  }else if(sentFates>0)return false;
  return true;
}
/** A roster unit of a 6.4 run must keep its species' kit exactly; max HP follows the run level (queue: exactly; camp: from the base up to it). */
function validSpeciesUnit(u:{species?:string;maxHp:number;learned:string[];pp:Partial<Record<string,number>>;maxPp:Partial<Record<string,number>>;moves?:string[]},level:number,tier:'queue'|'camp'|'any'):boolean {
  const sp=u.species?speciesOf(u.species):undefined;if(!sp)return false;
  if(u.moves){ // 6.5 roster instance: its carried moves are learnable by its species, at the roster's max PP
    const m=u.moves.map(n=>learnableMove(sp.id,n));
    if(m.length>2||m.some(x=>!x)||new Set(u.moves).size!==m.length||u.learned.join()!==u.moves.join()||Object.keys(u.maxPp).sort().join()!==[...u.moves].sort().join()||Object.keys(u.pp).sort().join()!==[...u.moves].sort().join())return false;
    for(let i=0;i<m.length;i++)if(u.maxPp[u.moves[i]]!==m[i]!.pp||!integer(u.pp[u.moves[i]]))return false;
    const top=sp.maxHp+PROG.hpPerLevel*(level-1);return tier==='queue'?u.maxHp===top:u.maxHp>=sp.maxHp&&u.maxHp<=top;
  }
  const kit=Object.fromEntries(sp.kit.map(k=>[k.move,k.pp]));
  if([...u.learned].sort().join()!==Object.keys(kit).sort().join()||Object.keys(u.maxPp).sort().join()!==Object.keys(kit).sort().join())return false;
  for(const [k,n] of Object.entries(kit))if(u.maxPp[k]!==n||!integer(u.pp[k]))return false;
  const top=sp.maxHp+PROG.hpPerLevel*(level-1);
  return tier==='queue'?u.maxHp===top:tier==='camp'?u.maxHp>=sp.maxHp&&u.maxHp<=top:u.maxHp>=sp.maxHp&&u.maxHp<=top;
}
/** Every roster member and invitation of a 6.4 run; a pending invitation is exactly the R07 half snapshot at the current run level. */
function validRun(s:World):boolean {
  const p=s.prog;if(!p)return true;
  for(const id of s.queue)if(!validSpeciesUnit(s.units[id],p.level,'queue'))return false;
  for(const id of s.camp)if(!validSpeciesUnit(s.units[id],p.level,'camp'))return false;
  if(s.exchange?.sent&&(!s.units[s.exchange.sent]||!validSpeciesUnit(s.units[s.exchange.sent],p.level,'any')))return false;
  if(new Set(s.invitations.map(i=>i.unit.id)).size!==s.invitations.length)return false;
  for(const i of s.invitations){
    if(!validSpeciesUnit(i.unit,p.level,'any'))return false;
    if(i.status==='pending'){
      const u=i.unit,top=speciesOf(u.species!)!.maxHp+PROG.hpPerLevel*(p.level-1);
      if(u.maxHp!==top||u.hp!==Math.max(1,Math.floor(top/2)))return false;
      for(const [k,m] of Object.entries(u.maxPp))if(!integer(m)||(u.pp as Record<string,number>)[k]!==Math.min(m as number,Math.max(1,Math.floor((m as number)/2))))return false;
    }
  }
  return true;
}
/** Expedition data, the stairs request and the phase-specific rules that depend on them. */
function validDungeon(s:World):boolean {
  const d=s.dungeon,r=s.request,point=r?s.points.find(p=>p.pos.x===r.pos.x&&p.pos.y===r.pos.y):undefined;
  // A request is a stairs request exactly when it was made on a stairs point, and then it names the adjacent floor.
  const stairs=point?.kind==='down'||point?.kind==='up';
  if(r&&stairs!==(r.to!==undefined))return false;
  if(d===undefined)return s.scenario!=='expedition'&&s.phase!=='transit'&&!stairs&&pointsFitLevel(s.points,null,0)&&s.prog===undefined&&s.rooms===undefined&&!s.points.some(p=>isPickup(p.kind))&&!Object.values(s.units).some(u=>u.boss!==undefined);
  if(!object(d)||s.scenario!=='expedition'||(d.base!==undefined&&(d.base!==true||s.prog===undefined))||(d.services!==undefined&&(d.services!==true||d.base!==true))||(d.boss!==undefined&&(d.boss!==true||d.base!==true||d.services!==true||d.floors!==3))||(d.tmPool!==undefined&&(d.tmPool!==3||d.boss!==true)))return false;
  if(![d.seed,d.width,d.height,d.floors,d.level].every(integer)||d.seed<0||d.seed>4294967295||d.width<8||d.height<8||d.width>64||d.height>64||d.floors<2||d.floors>9||d.level<1||d.level>d.floors||!object(d.stored))return false;
  if(s.floor.some(p=>p.x<0||p.y<0||p.x>=d.width||p.y>=d.height))return false;
  const taken=new Set(Object.keys(s.units));
  for(const [name,f] of Object.entries(d.stored)){const level=Number(name);
    if(!integer(level)||String(level)!==name||level<1||level>d.floors||level===d.level||!validStored(f,d,taken,s.prog!==undefined)||!pointsFitLevel(f.points,level,d.floors,d.boss===true))return false;}
  // 7.3: the boss mark and the boss unit agree: no unit carries the mark without it, at most one does, it stands on the last floor and is that floor's last enemy.
  const here=Object.values(s.units).filter(u=>u.boss),away=Object.entries(d.stored).flatMap(([n,f])=>Object.values(f.units).filter(u=>u.boss).map(u=>({n,u,f})));
  if(!d.boss?(here.length>0||away.length>0):here.length+away.length>1)return false;
  if(here.length&&(d.level!==d.floors||s.enemies[s.enemies.length-1]!==here[0].id))return false;
  if(away.length&&(away[0].n!==String(d.floors)||away[0].f.enemies[away[0].f.enemies.length-1]!==away[0].u.id))return false;
  if(!validProgress(s,d))return false;
  if(!pointsFitLevel(s.points,d.level,d.floors,d.boss===true))return false;
  if(r&&stairs){
    if(!integer(r.to)||(r.to as number)<1||(r.to as number)>d.floors||r.to!==d.level+(point!.kind==='down'?1:-1))return false;
  }
  return true;
}
/** The 7.2 fields of an end record against the world it closes: only runs with `prog` have them, and every judgement can be recomputed from the final state except the draw itself. */
function validEnd(s:World,e:NonNullable<World['end']>):boolean {
  const extra=[e.boss,e.tms,e.lost,e.effective,e.reasons,e.reward,e.purse,e.refund];
  if(!s.prog)return extra.every(x=>x===undefined);
  if(!Array.isArray(e.tms)||!Array.isArray(e.lost)||!Array.isArray(e.reasons)||typeof e.effective!=='boolean')return false;
  if(JSON.stringify(e.tms)!==JSON.stringify(s.tms))return false;
  // 7.3: a boss-marked run records whether the boss fell, recomputed from the final state; any other run has no such field.
  if(e.boss!==(s.dungeon?.boss?bossDefeated(s):undefined))return false;
  const wipe=e.outcome==='wipe';
  if(!strings(e.lost)||new Set(e.lost).size!==e.lost.length||(!wipe&&e.lost.length>0)||e.lost.some(id=>!s.queue.includes(id)||isProtected(s,id)))return false;
  if(JSON.stringify(e.reasons)!==JSON.stringify(reasonsOf(s))||e.effective!==(e.reasons.length>0))return false;
  const purse=s.purse??0;
  return e.reward===(s.goal?ECON.reward:0)&&e.purse===purse&&e.refund===(wipe?0:purse);
}
function validWorld(v:unknown):v is World {
  if(!object(v))return false;const s=v as unknown as World;
  if(typeof s.runId!=='string'||!s.runId||typeof s.scenario!=='string'||!integer(s.round)||s.round<0||!Array.isArray(s.floor)||!s.floor.length||!s.floor.every(position)||!strings(s.seen)||!object(s.units)||!strings(s.queue)||!s.queue.length||s.queue.length>3||!strings(s.enemies)||!strings(s.camp)||!Array.isArray(s.points)||!Array.isArray(s.invitations)||!strings(s.log)||!['playing','invitation','exit','transit','ended'].includes(s.phase))return false;
  const cells=new Set(s.floor.map(p=>`${p.x},${p.y}`));if(cells.size!==s.floor.length||s.seen.some(k=>!cells.has(k)))return false;
  const ids=[...s.queue,...s.enemies,...s.camp];if(new Set(ids).size!==ids.length||ids.some(id=>!s.units[id]))return false;
  for(const [id,u] of Object.entries(s.units))if(!validUnit(u)||u.id!==id)return false;
  if(s.queue.some(id=>s.units[id].side!=='friend')||s.camp.some(id=>s.units[id].side!=='friend'||s.units[id].pos!==null)||s.enemies.some(id=>s.units[id].side!=='enemy'))return false;
  const occupied=new Set<string>();for(const id of [...s.queue,...s.enemies]){const u=s.units[id];if(u.hp===0&&u.pos!==null)return false;if(u.hp>0){if(!u.pos||!cells.has(`${u.pos.x},${u.pos.y}`))return false;const k=`${u.pos.x},${u.pos.y}`;if(occupied.has(k))return false;occupied.add(k);}}
  if(!s.queue.includes(s.leader)||typeof s.goal!=='boolean'||!integer(s.bag)||s.bag<0)return false;
  if(s.points.some(p=>!object(p)||!position(p.pos)||!pointKinds.includes(p.kind)||typeof p.used!=='boolean'||!cells.has(`${p.pos.x},${p.pos.y}`)))return false;
  if(s.anchor!==null&&!position(s.anchor))return false;
  if(s.request!==null&&(!object(s.request)||typeof s.request.actor!=='string'||!s.units[s.request.actor]||!position(s.request.pos)||typeof s.request.locked!=='boolean'))return false;
  if(s.invitations.some(i=>!object(i)||typeof i.id!=='string'||!validUnit(i.unit)||(i.unit as unknown as Record<string,unknown>).boss!==undefined||(typeof i.unit.species==='string'&&Object.prototype.hasOwnProperty.call(BOSS_SPECIES,i.unit.species))||!['pending','accepted','rejected','cancelled'].includes(i.status)))return false;
  if(s.phase==='ended'){const e=s.end;if(!object(e)||e.id!==`${s.runId}:end`||!['normal','wipe'].includes(e.outcome)||!strings(e.team)||!strings(e.camp)||e.team.join()!==s.queue.join()||e.camp.join()!==s.camp.join()||e.goal!==s.goal||e.acquired!==s.bag||e.brought!==(e.outcome==='normal'?s.bag:0))return false;
    if(!validEnd(s,e))return false;}else if(s.end!==null)return false;
  // Only complete processing checkpoints may be loaded. A phase tag cannot
  // bypass a pending invitation or revive an unfinished/contradictory result.
  const pending=s.invitations.some(i=>i.status==='pending');
  const cancelled=s.invitations.some(i=>i.status==='cancelled');
  const living=s.queue.some(id=>s.units[id].hp>0);
  if(s.phase!=='ended'&&(!living||s.units[s.leader].hp===0))return false;
  if(s.request!==null&&!s.request.locked)return false; // unlocked requests exist only inside a round
  if(s.phase==='playing'&&(pending||cancelled||s.anchor!==null||s.request!==null))return false;
  if(s.phase==='invitation'&&(!pending||cancelled||!s.anchor||!cells.has(`${s.anchor.x},${s.anchor.y}`)||!s.seen.includes(`${s.anchor.x},${s.anchor.y}`)))return false;
  if(s.phase==='exit'&&(pending||cancelled||s.anchor!==null||!s.request?.locked||s.request.to!==undefined))return false;
  if(s.phase==='transit'&&(pending||cancelled||s.anchor!==null||!s.request?.locked||s.request.to===undefined))return false;
  if(!validDungeon(s)||!validRun(s))return false;
  if(s.phase==='ended'&&(pending||s.anchor!==null||s.request!==null||
    (s.end!.outcome==='wipe'?living:!living||cancelled)))return false;
  // Sequential invitation handling allows a processed prefix, never a
  // processed item after the first still-pending item in the same queue.
  if(pending){let waiting=false;for(const invite of s.invitations){if(invite.status==='pending')waiting=true;else if(waiting)return false;}}
  return true;
}
/**
 * Stage 7.2 reads older records without raising the rules version (spec "旧档案的迁移"): the profile by content (see `migrateProfile`); a run in progress or finished:
 * the single `tm` becomes a one-item list, `purse` 0, no shop or exchanger, and founding members get their mark from the profile. A finished run that has no
 * end-of-run processing yet gets it now, once, from its saved state (the draw uses the saved random state, so the same bytes always give the same result).
 */
function migrateWorld(w:unknown,profile:unknown,history=false):void {
  if(!object(w)||!object(w.prog))return;
  const world=w as Record<string,unknown>&{units:Record<string,Record<string,unknown>>;queue:string[];camp:string[]};
  if(world.purse===undefined)world.purse=0;
  if(world.tms===undefined){world.tms=world.tm!==undefined?[{move:world.tm,source:'target',fate:'held'}]:[];}
  delete world.tm;
  const roster=object(profile)&&Array.isArray(profile.roster)?profile.roster as unknown[]:[];
  if(Array.isArray(world.queue)&&Array.isArray(world.camp)&&object(world.units))
    for(const id of [...world.queue,...world.camp]){const u=world.units[id];if(!object(u)||u.inst===undefined||u.protected!==undefined)continue;
      const inst=roster.find(i=>object(i)&&i.id===u.inst);if(object(inst)&&inst.protected===true)u.protected=true;}
  const e=world.end;
  if(world.phase==='ended'&&object(e)&&e.effective===undefined&&(e.outcome==='normal'||e.outcome==='wipe')&&Array.isArray(world.tms)){
    const old=object(e.tm)?e.tm:null;
    const tms=world.tms as {fate:unknown}[];for(const t of tms)t.fate='held';
    if(old&&!tms.length)tms.push({move:old.move,source:'target',fate:'held'} as never);
    try{world.end=closeOut(world as unknown as World,e.outcome as 'normal'|'wipe',!history);}catch{throw Error('旧远征结算记录无法迁移；原记录已保留');}
  }
}

/** Remap one v1 unit as a whole. Every old key must be explained before any key is replaced. */
function migrateLegacyUnit(v:unknown):void {
  if(!object(v))throw Error('旧远征单位不是对象，无法迁移；原记录已保留');
  const u=v;
  if(!Array.isArray(u.learned)||!strings(u.learned)||!object(u.pp)||!object(u.maxPp))throw Error(`旧单位${String(u.id??'')}的招式字段损坏，无法迁移；原记录已保留`);
  const oldLearned=u.learned as string[];
  if(new Set(oldLearned).size!==oldLearned.length||oldLearned.some(b=>!legacyBehaviors.includes(b)))throw Error(`旧单位${String(u.id??'')}的行为清单损坏，无法迁移；原记录已保留`);
  const species=u.species===undefined?undefined:typeof u.species==='string'?u.species:null;
  const validLegacyBoss=species===BOSS.species&&u.boss===true&&u.side==='enemy'&&validBossNumbers(u)&&u.ai==='melee'&&u.recruit===undefined&&u.inst===undefined;
  if(species===null|| (species!==undefined&&!speciesOf(species)&&!validLegacyBoss))throw Error(`旧单位${String(u.id??'')}的物种无法识别，无法迁移；原记录已保留`);
  const mapping:Record<string,string>={};
  if(u.moves!==undefined){
    if(!strings(u.moves)||u.moves.length!==oldLearned.length||new Set(u.moves).size!==u.moves.length)throw Error(`旧单位${String(u.id??'')}的招式顺序无法迁移；原记录已保留`);
    for(let i=0;i<oldLearned.length;i++){
      const behavior=oldLearned[i],move=u.moves[i];
      if(!moveOf(move))throw Error(`旧单位${String(u.id??'')}含未知招式${move}，无法迁移；原记录已保留`);
      if(species!==undefined){const old=legacySpeciesMove(species,move);if(!old||old.behavior!==behavior)throw Error(`旧单位${String(u.id??'')}的${behavior}与${move}不符合冻结旧名单，无法迁移；原记录已保留`);}
      else if(LEGACY_BEHAVIOR_MOVE.fallback[behavior as keyof typeof LEGACY_BEHAVIOR_MOVE.fallback]!==move)throw Error(`无物种旧单位${String(u.id??'')}的${behavior}与${move}不符合固定对照，无法迁移；原记录已保留`);
      mapping[behavior]=move;
    }
  }else{
    for(const behavior of oldLearned){
      const move=legacyMoveForBehavior(species??undefined,behavior);
      if(!move||!moveOf(move))throw Error(`旧单位${String(u.id??'')}没有${behavior}的冻结招式对照，无法迁移；原记录已保留`);
      mapping[behavior]=move;
    }
  }
  if(!exactKeys(u.pp,oldLearned)||!exactKeys(u.maxPp,oldLearned))throw Error(`旧单位${String(u.id??'')}的PP键与已学行为不一致，无法迁移；原记录已保留`);
  const pp:Record<string,number>={},maxPp:Record<string,number>={};
  for(const behavior of oldLearned){
    const move=mapping[behavior],cur=u.pp[behavior],max=u.maxPp[behavior];
    if(!integer(cur)||!integer(max)||(cur as number)<0||(max as number)<1||(cur as number)>(max as number))throw Error(`旧单位${String(u.id??'')}的${behavior} PP 不合法，无法迁移；原记录已保留`);
    if(species!==undefined){const old=legacySpeciesMove(species,move);if(!old||old.pp!==max)throw Error(`旧单位${String(u.id??'')}的${move}最大PP与冻结旧名单不符，无法迁移；原记录已保留`);}
    pp[move]=cur as number;maxPp[move]=max as number;
  }
  u.learned=oldLearned.map(behavior=>mapping[behavior]);u.pp=pp;u.maxPp=maxPp;
  if(u.stages===undefined)u.stages={atk:0,def:0};
  if(u.protect===undefined)u.protect=0;
  if(u.counter===undefined)u.counter=0;
  if(u.lastMove===undefined)u.lastMove=null;
  if(u.recruit!==undefined)migrateLegacyUnit(u.recruit);
}

/** Apply the v1-to-v2 move migration to every place where saved units or profile moves can live. */
function migrateLegacyMoveState(profile:unknown,...worlds:unknown[]):void {
  if(object(profile))migrateProfileMoves(profile);
  for(const value of worlds){
    if(!object(value))continue;
    const world=value;
    if(object(world.units))for(const unit of Object.values(world.units))migrateLegacyUnit(unit);
    if(Array.isArray(world.invitations))for(const invitation of world.invitations){if(!object(invitation))continue;migrateLegacyUnit(invitation.unit);}
    const dungeon=world.dungeon;
    if(object(dungeon)&&object(dungeon.stored))for(const floor of Object.values(dungeon.stored)){
      if(!object(floor)||!object(floor.units))continue;
      for(const unit of Object.values(floor.units))migrateLegacyUnit(unit);
    }
  }
}

/** New friend guard counters default to zero when reading saves written before 7.7b; enemies may never carry them. */
function defaultTeamGuardState(v:unknown):void {
  if(!object(v))return;
  if(v.side==='friend'){
    if(v.reflect===undefined)v.reflect=0;
    if(v.lightscreen===undefined)v.lightscreen=0;
  }
  if(v.recruit!==undefined)defaultTeamGuardState(v.recruit);
}
function defaultWorldTeamGuardState(v:unknown):void {
  if(!object(v))return;
  if(object(v.units))for(const unit of Object.values(v.units))defaultTeamGuardState(unit);
  if(Array.isArray(v.invitations))for(const invitation of v.invitations)if(object(invitation))defaultTeamGuardState(invitation.unit);
  if(object(v.dungeon)&&object(v.dungeon.stored))for(const floor of Object.values(v.dungeon.stored))
    if(object(floor)&&object(floor.units))for(const unit of Object.values(floor.units))defaultTeamGuardState(unit);
}

const LEGACY_RULES_1='trial-rules-1',LEGACY_CONTENT_1='trial-content-1';
const LEGACY_RULES_2='trial-rules-2',LEGACY_CONTENT_2='trial-content-2';
const PROFILE_KEYS=['expeditions','next','roster','vault','team','leader','account','rescue','lost','origin'];
function strictProfileShape(v:unknown):v is Profile {
  return object(v)&&exactKeys(v,PROFILE_KEYS)&&Array.isArray(v.rescue)&&v.rescue.every(r=>object(r)&&exactKeys(r,['inst','paid','left']))&&
    Array.isArray(v.lost)&&v.lost.every(l=>object(l)&&exactKeys(l,['id','species','expedition']))&&profileProblem(v)===null;
}
function parseJson(raw:string):unknown {
  try{return JSON.parse(raw) as unknown;}
  catch{throw Error('存档不是有效的JSON文本；原记录已保留');}
}
function parseLegacy(raw:string):Record<string,unknown> {
  const parsed=parseJson(raw);
  if(!object(parsed))throw Error('存档结构损坏；原记录已保留');
  const e=parsed;
  if(e.format!==1)throw Error('存档版本不兼容；原记录已保留');
  const oldV1=e.rules===LEGACY_RULES_1&&e.content===LEGACY_CONTENT_1;
  const oldV2=e.rules===LEGACY_RULES_2&&e.content===LEGACY_CONTENT_2;
  if(!oldV1&&!oldV2)throw Error('存档版本不兼容；原记录已保留');
  if(typeof e.build!=='string'||!Number.isInteger(e.sequence)||Number(e.sequence)<1||!Object.hasOwn(e,'current')||!Object.hasOwn(e,'recent'))throw Error('存档结构损坏；原记录已保留');
  if(Object.keys(e).some(k=>!['format','rules','content','build','sequence','current','recent','profile'].includes(k)))throw Error('存档结构损坏；原记录已保留');
  return structuredClone(e) as Record<string,unknown>;
}
/** Decode old format 1 records. Full World validation is used for ended runs and the exported helper; active runs are discarded by the store. */
function decodeLegacyRecord(e:Record<string,unknown>,validateWorld:boolean):LegacyEnvelope {
  const oldV1=e.rules===LEGACY_RULES_1&&e.content===LEGACY_CONTENT_1;
  if(e.profile===undefined)throw Error('旧存档没有营地档案；原记录已保留');
  if(oldV1){
    e.profile=migrateProfile(e.profile);
    try{
      if(validateWorld){migrateWorld(e.current,e.profile);migrateWorld(e.recent,undefined,true);migrateLegacyMoveState(e.profile,e.current,e.recent);}
      else migrateLegacyMoveState(e.profile);
    }catch(error){
      const reason=error instanceof Error?error.message:'旧招式字段损坏';
      const detail=reason.replace(/[；，]?\s*原记录已保留$/,'');
      throw Error(`${detail}；整条存档未迁移，原记录已保留`);
    }
    e.rules=LEGACY_RULES_2;e.content=LEGACY_CONTENT_2;
  }
  if(!strictProfileShape(e.profile))throw Error('旧存档的营地档案损坏；原记录已保留');
  if(validateWorld){
    defaultWorldTeamGuardState(e.current);defaultWorldTeamGuardState(e.recent);
    if((e.current!==null&&!validWorld(e.current))||(e.recent!==null&&(!validWorld(e.recent)||e.recent.phase!=='ended')))throw Error('旧存档结构损坏；原记录已保留');
    if(e.current!==null&&((e.current as World).scenario!=='expedition'||!profileFitsWorld(e.profile as Profile,e.current as World)))throw Error('旧存档结构损坏；原记录已保留');
  }
  return e as unknown as LegacyEnvelope;
}
/** Test and compatibility entry point: returns the fully migrated and validated legacy record, including its old World fields. */
export function decodeLegacy(raw:string):LegacyEnvelope {
  return decodeLegacyRecord(parseLegacy(raw),true);
}
/** Strict decoder for the current camp-only envelope. Any old World field or unknown property is rejected. */
export function decode(raw:string):Envelope {
  const parsed=parseJson(raw);
  if(!object(parsed))throw Error('存档结构损坏；原记录已保留');
  const e=parsed;
  if(e.format!==2||e.rules!==RULE_VERSION||e.content!==CONTENT_VERSION)throw Error('存档版本不兼容；原记录已保留');
  if(!exactKeys(e,['format','rules','content','build','sequence','profile'])||typeof e.build!=='string'||!Number.isSafeInteger(e.sequence)||Number(e.sequence)<1||!strictProfileShape(e.profile))throw Error('存档结构损坏；原记录已保留');
  return structuredClone(e) as unknown as Envelope;
}
function campFromLegacy(raw:string):Envelope {
  const e=parseLegacy(raw);
  const ended=object(e.current)&&e.current.phase==='ended';
  const old=decodeLegacyRecord(e,ended);
  let profile=old.profile;
  if(ended){
    const settled=settleRun(profile,old.current as World);
    if(!settled)throw Error('旧远征结算记录无法迁移；原记录已保留');
    profile=settled;
  }
  if(!strictProfileShape(profile))throw Error('旧存档的营地档案损坏；原记录已保留');
  const sequence=Math.min(old.sequence+1,Number.MAX_SAFE_INTEGER);
  return {format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:old.build,sequence,profile};
}
/** One complete camp record per atomic setItem; failed writes leave the candidate available for retry. */
export class TrialStore {
  private record:Envelope|null=null;
  private raw:string|null=null;
  private exported=false;
  private world:World|null=null;
  private activeProfile:Profile|null=null;
  private activeKind:'developer'|'expedition'|null=null;
  private savedSettlement:SettleSummary|null=null;
  status:SaveStatus='empty';error='';lastSaved:string|null=null;
  /** Constructor migration may settle and persist a legacy ended run asynchronously. Wait before showing the loaded state. */
  readonly whenReady:Promise<boolean>;
  /** Import feedback is separate from the loaded record's storage/decoding diagnosis. */
  importError='';
  private port:StoragePort;readonly key:string;
  constructor(privatePort:StoragePort,key=SAVE_KEY){
    this.port=privatePort;this.key=key;
    try{
      this.raw=this.port.getItem(key);
      if(this.raw===null){this.status='empty';this.whenReady=Promise.resolve(true);return;}
      this.whenReady=this.loadStored(this.raw);
    }catch(e){this.status='blocked';this.error=String(e);this.whenReady=Promise.resolve(false);}
  }
  private loadStored(raw:string):Promise<boolean> {
    try{
      const parsed=parseJson(raw);
      if(object(parsed)&&parsed.format===2){this.record=decode(raw);this.status='ready';this.lastSaved=this.label();return Promise.resolve(true);}
      const migrated=campFromLegacy(raw);
      this.record=migrated;
      return this.persist();
    }catch(e){this.status='blocked';this.error=String(e);return Promise.resolve(false);}
  }
  private camp(profile:Profile,sequence:number):Envelope {
    // This display counter must remain readable even after importing its maximum valid value.
    return {format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:Math.min(sequence,Number.MAX_SAFE_INTEGER),profile:clone(profile)};
  }
  get envelope():Envelope|null{return this.record?clone(this.record):null;}
  get state():World|null{return this.world?clone(this.world):null;}
  get current():World|null{return this.state;}
  /** During a run this is the in-memory run profile; wallet money is deducted here only. */
  get profile():Profile|null{return this.world?this.activeProfile?clone(this.activeProfile):null:this.record?clone(this.record.profile):null;}
  get runProfile():Profile|null{return this.activeKind==='expedition'&&this.activeProfile?clone(this.activeProfile):null;}
  get atBase():boolean{return this.record!==null&&this.world===null;}
  get settlementSummary():SettleSummary|null{return this.savedSettlement?clone(this.savedSettlement):null;}
  /** During a run this exports the untouched camp record, never the memory-only World. */
  exportRecord():string|null {return this.status==='ready'&&this.record?JSON.stringify(this.record):null;}
  private label():string|null {return this.record?`基地 · 待出发 · 保存${this.record.sequence}`:null;}
  private async persist():Promise<boolean> {
    if(!this.record){this.status='failed';this.error='没有可保存的营地档案';return false;}
    this.status='saving';
    try{const text=JSON.stringify(this.record);await this.port.setItem(this.key,text);this.raw=text;this.status='ready';this.error='';this.lastSaved=this.label();return true;}
    catch(e){this.status='failed';this.error=String(e);return false;}
  }
  /** Developer scenarios are memory-only; `profile` supplies their optional sample camp state. */
  async start(s:World,profile?:Profile):Promise<boolean> {
    if(this.status!=='empty')return false;
    this.world=clone(s);this.activeProfile=profile?clone(profile):null;this.activeKind='developer';this.savedSettlement=null;this.status='ready';this.error='';return true;
  }
  async dispatch(cmd:Command):Promise<Result> {
    const s=this.world;if(!s)throw Error('没有已加载试验');
    if(this.status!=='ready')return {ok:false,state:clone(s),error:'保存未完成；仅可查看或重试'};
    const result=applyCommand(s,cmd);if(!result.ok)return result;
    this.world=result.state;
    if((this.activeKind==='expedition'||(this.activeKind==='developer'&&this.activeProfile!==null&&s.scenario==='expedition'))&&result.state.phase==='ended'&&s.phase!=='ended'){
      const before=this.activeProfile;
      const summary=settleSummary(before,result.state);
      const settled=settleRun(before,result.state);
      if(!before||!summary||!settled){this.status='failed';this.error='远征结果无法结算；当前结果已保留在画面中';return {ok:false,state:clone(result.state),error:this.error};}
      this.savedSettlement=summary;
      if(this.activeKind==='expedition'){
        this.record=this.camp(settled,(this.record?.sequence??0)+1);
        await this.persist();
      }else this.activeProfile=settled;
    }
    return {ok:true,state:clone(this.world)};
  }
  async retry():Promise<boolean> {return this.status==='failed'&&this.record!==null?this.persist():false;}
  /** Developer-only restart; no storage is read or written. */
  async newTrial(s:World):Promise<boolean> {
    const cur=this.world;
    if(this.status!=='ready'||this.activeKind!=='developer'||!cur||cur.phase!=='ended'||s.runId===cur.runId||s.phase!=='playing'||s.round!==0)return false;
    this.world=clone(s);this.savedSettlement=null;return true;
  }
  /** The result was saved when the expedition ended; returning only leaves the result screen. */
  async returnToBase():Promise<boolean> {
    if(this.status!=='ready'||this.activeKind!=='expedition'||this.world?.phase!=='ended')return false;
    this.world=null;
    this.activeProfile=null;this.activeKind=null;this.savedSettlement=null;
    return true;
  }
  /** Camp edits each produce one v2 envelope write. */
  async baseAction(a:BaseAction):Promise<{ok:true;saved:boolean}|{ok:false;error:string}> {
    if(!this.atBase||!this.record)return {ok:false,error:'现在不在基地'};
    if(this.status!=='ready')return {ok:false,error:'保存未完成；仅可查看或重试'};
    const r=applyBase(this.record.profile,a);if(!r.ok)return r;
    this.record=this.camp(r.profile,this.record.sequence+1);
    return {ok:true,saved:await this.persist()};
  }
  /** Departure only creates memory state. The stored profile and wallet remain at their pre-departure values. */
  async depart(runId:string,seed:number,purse=0):Promise<boolean> {
    if(this.status!=='ready'||!this.atBase||!this.record)return false;
    if(purseProblem(this.record.profile,purse)!==null)return false;
    const profile=clone(this.record.profile);profile.account-=purse;
    try{this.world=createExpedition(runId,seed,3,squadOf(profile),purse,undefined,3);}
    catch{this.world=null;return false;}
    this.activeProfile=profile;this.activeKind='expedition';this.savedSettlement=null;return true;
  }
  /** Create and save a new camp profile; failed writes restore the whole prior controller state. */
  async beginNewGame(profile:Profile,confirmed:boolean):Promise<boolean> {
    if(!strictProfileShape(profile))return false;
    const overwrite=this.record!==null||this.status==='blocked';
    if(this.status!=='empty'&&this.status!=='ready'&&this.status!=='blocked')return false;
    if(overwrite&&!confirmed)return false;
    if(this.status==='blocked'&&(this.raw===null||!this.exported))return false;
    const previous=this.snapshot();
    this.record=this.camp(profile,1);this.world=null;this.activeProfile=null;this.activeKind=null;this.savedSettlement=null;
    if(await this.persist())return true;
    const failure=this.error;this.restore(previous);this.error=failure||previous.error;return false;
  }
  exportRaw():string|null {this.exported=true;return this.raw;}
  /** Import only camp data. Legacy imports migrate old ended runs before the single import write. */
  async importRecord(raw:string,confirmed:boolean):Promise<boolean> {
    this.importError='';
    if(this.status==='saving'||this.status==='failed'){this.importError='保存尚未完成；请先完成或重试保存';return false;}
    const overwrite=this.status==='ready'&&(this.record!==null||this.world!==null)||this.status==='blocked';
    if(overwrite&&!confirmed){this.importError='导入未确认；原记录已保留';return false;}
    if(this.status==='blocked'&&(this.raw===null||!this.exported)){this.importError='请先导出原始记录，再确认导入覆盖';return false;}
    let incoming:Envelope;
    try{
      const parsed=parseJson(raw);
      incoming=object(parsed)&&parsed.format===2?decode(raw):campFromLegacy(raw);
    }catch(e){
      const message=e instanceof Error?e.message:String(e);
      this.importError=/[\u3400-\u9fff]/.test(message)?message:'导入文件不是有效的存档记录；原记录已保留';return false;
    }
    const previous=this.snapshot();
    this.record=incoming;this.world=null;this.activeProfile=null;this.activeKind=null;this.savedSettlement=null;
    if(await this.persist()){this.exported=false;this.importError='';return true;}
    const failure=this.error;this.restore(previous);this.error=previous.error;this.importError='导入保存失败；原记录已保留';if(!failure)this.importError='导入保存失败；原记录已保留';return false;
  }
  /** Developer-only recovery scenario after exporting blocked bytes; it leaves storage untouched. */
  async resetAfterExport(s:World,confirmed:boolean):Promise<boolean> {
    if(this.status!=='blocked'||this.raw===null||!this.exported||!confirmed)return false;
    this.record=null;this.world=clone(s);this.activeProfile=null;this.activeKind='developer';this.savedSettlement=null;
    this.status='ready';this.error='';this.lastSaved=null;return true;
  }
  private snapshot(){return {record:this.record?clone(this.record):null,raw:this.raw,status:this.status,error:this.error,lastSaved:this.lastSaved,exported:this.exported,world:this.world?clone(this.world):null,activeProfile:this.activeProfile?clone(this.activeProfile):null,activeKind:this.activeKind,savedSettlement:this.savedSettlement?clone(this.savedSettlement):null};}
  private restore(s:ReturnType<TrialStore['snapshot']>):void {this.record=s.record;this.raw=s.raw;this.status=s.status;this.error=s.error;this.lastSaved=s.lastSaved;this.exported=s.exported;this.world=s.world;this.activeProfile=s.activeProfile;this.activeKind=s.activeKind;this.savedSettlement=s.savedSettlement;}
}
