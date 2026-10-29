import {applyCommand,clone,RULE_VERSION,CONTENT_VERSION,type World,type Command,type Result,type StoredFloor,type Dungeon} from './engine.ts';
export interface StoragePort {getItem(key:string):string|null;setItem(key:string,value:string):void|Promise<void>;}
export type Envelope={format:1;rules:string;content:string;build:string;sequence:number;current:World;recent:World|null};
export type SaveStatus='empty'|'ready'|'saving'|'failed'|'blocked';
export const SAVE_KEY='dungeon-trial.player.v1';
export const BUILD_ID='trial-0.1.0';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown)=>Number.isInteger(v);
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string');
const position=(v:unknown):v is {x:number;y:number}=>object(v)&&integer(v.x)&&integer(v.y);
const skillNames=['strong','line','guard','push'];
function validUnit(v:unknown,depth=0):boolean {
  if(!object(v)||typeof v.id!=='string'||!['friend','enemy'].includes(String(v.side))||!integer(v.hp)||!integer(v.maxHp)||(v.maxHp as number)<=0||(v.hp as number)<0||(v.hp as number)>(v.maxHp as number)||(v.pos!==null&&!position(v.pos))||!object(v.pp)||!object(v.maxPp)||!strings(v.learned))return false;
  if(v.learned.some(k=>!skillNames.includes(k)))return false;
  for(const [k,n] of Object.entries(v.pp)){if(!skillNames.includes(k)||!integer(n)||(n as number)<0||!integer(v.maxPp[k])||(n as number)>(v.maxPp[k] as number))return false;}
  for(const [k,n] of Object.entries(v.maxPp))if(!skillNames.includes(k)||!integer(n)||(n as number)<0)return false;
  if(v.ai!==undefined&&!['melee','ranged','chase'].includes(String(v.ai)))return false;
  if(v.damage!==undefined&&(!integer(v.damage)||(v.damage as number)<0))return false;
  if(v.range!==undefined&&(!integer(v.range)||(v.range as number)<1))return false;
  if(v.species!==undefined&&typeof v.species!=='string')return false;
  return v.recruit===undefined||(depth<1&&validUnit(v.recruit,depth+1));
}
const keyOf=(p:{x:number;y:number})=>`${p.x},${p.y}`;
const pointKinds=['goal','item','exit','down','up'];
const validPoint=(p:unknown,cells:Set<string>)=>object(p)&&position(p.pos)&&pointKinds.includes(String(p.kind))&&typeof p.used==='boolean'&&cells.has(keyOf(p.pos));
/** A stored (non-current) floor: terrain, revealed cells, real enemies and points. Ids are claimed in `taken` so none repeats across floors. */
function validStored(f:unknown,d:Dungeon,taken:Set<string>):f is StoredFloor {
  if(!object(f)||!Array.isArray(f.floor)||!f.floor.length||!f.floor.every(position)||!strings(f.seen)||!strings(f.enemies)||!object(f.units)||!Array.isArray(f.points))return false;
  if(f.floor.some(p=>p.x<0||p.y<0||p.x>=d.width||p.y>=d.height))return false;
  const cells=new Set(f.floor.map(keyOf));if(cells.size!==f.floor.length||f.seen.some(k=>!cells.has(k)))return false;
  const ids=Object.keys(f.units);if(ids.length!==f.enemies.length||new Set(f.enemies).size!==f.enemies.length||f.enemies.some(i=>!ids.includes(i)))return false;
  const occupied=new Set<string>();
  for(const id of ids){const u=f.units[id];if(taken.has(id)||!validUnit(u)||(u as {id:string}).id!==id||(u as {side:string}).side!=='enemy')return false;taken.add(id);
    const e=u as {hp:number;pos:{x:number;y:number}|null};
    if(e.hp===0){if(e.pos!==null)return false;}else{if(!e.pos||!cells.has(keyOf(e.pos))||occupied.has(keyOf(e.pos)))return false;occupied.add(keyOf(e.pos));}}
  return f.points.every(p=>validPoint(p,cells));
}
/** Which point kinds a floor may hold: no stairs outside an expedition, no 'up' on the first floor, no 'down' on the last, exits only on floor 1. */
function pointsFitLevel(points:{kind:string}[],level:number|null,floors:number):boolean {
  if(level===null)return points.every(p=>p.kind!=='down'&&p.kind!=='up');
  return points.every(p=>!(p.kind==='up'&&level===1)&&!(p.kind==='down'&&level===floors)&&!(p.kind==='exit'&&level!==1));
}
/** Expedition data, the stairs request and the phase-specific rules that depend on them. */
function validDungeon(s:World):boolean {
  const d=s.dungeon,r=s.request,point=r?s.points.find(p=>p.pos.x===r.pos.x&&p.pos.y===r.pos.y):undefined;
  // A request is a stairs request exactly when it was made on a stairs point, and then it names the adjacent floor.
  const stairs=point?.kind==='down'||point?.kind==='up';
  if(r&&stairs!==(r.to!==undefined))return false;
  if(d===undefined)return s.scenario!=='expedition'&&s.phase!=='transit'&&!stairs&&pointsFitLevel(s.points,null,0);
  if(!object(d)||s.scenario!=='expedition')return false;
  if(![d.seed,d.width,d.height,d.floors,d.level].every(integer)||d.seed<0||d.seed>4294967295||d.width<8||d.height<8||d.width>64||d.height>64||d.floors<2||d.floors>9||d.level<1||d.level>d.floors||!object(d.stored))return false;
  if(s.floor.some(p=>p.x<0||p.y<0||p.x>=d.width||p.y>=d.height))return false;
  const taken=new Set(Object.keys(s.units));
  for(const [name,f] of Object.entries(d.stored)){const level=Number(name);
    if(!integer(level)||String(level)!==name||level<1||level>d.floors||level===d.level||!validStored(f,d,taken)||!pointsFitLevel(f.points,level,d.floors))return false;}
  if(!pointsFitLevel(s.points,d.level,d.floors))return false;
  if(r&&stairs){
    if(!integer(r.to)||(r.to as number)<1||(r.to as number)>d.floors||r.to!==d.level+(point!.kind==='down'?1:-1))return false;
  }
  return true;
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
  if(s.invitations.some(i=>!object(i)||typeof i.id!=='string'||!validUnit(i.unit)||!['pending','accepted','rejected','cancelled'].includes(i.status)))return false;
  if(s.phase==='ended'){const e=s.end;if(!object(e)||e.id!==`${s.runId}:end`||!['normal','wipe'].includes(e.outcome)||!strings(e.team)||!strings(e.camp)||e.team.join()!==s.queue.join()||e.camp.join()!==s.camp.join()||e.goal!==s.goal||e.acquired!==s.bag||e.brought!==(e.outcome==='normal'?s.bag:0))return false;}else if(s.end!==null)return false;
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
  if(!validDungeon(s))return false;
  if(s.phase==='ended'&&(pending||s.anchor!==null||s.request!==null||
    (s.end!.outcome==='wipe'?living:!living||cancelled)))return false;
  // Sequential invitation handling allows a processed prefix, never a
  // processed item after the first still-pending item in the same queue.
  if(pending){let waiting=false;for(const invite of s.invitations){if(invite.status==='pending')waiting=true;else if(waiting)return false;}}
  return true;
}
export function decode(raw:string):Envelope {
  const e=JSON.parse(raw) as Envelope;
  if(e.format!==1||e.rules!==RULE_VERSION||e.content!==CONTENT_VERSION)throw Error('存档版本不兼容；原记录已保留');
  if(typeof e.build!=='string'||!Number.isInteger(e.sequence)||e.sequence<1||!validWorld(e.current)||(e.recent!==null&&(!validWorld(e.recent)||e.recent.phase!=='ended')))throw Error('存档结构损坏；原记录已保留');
  return e;
}
/** One complete JSON record per atomic setItem; failures freeze this controller. */
export class TrialStore {
  private record:Envelope|null=null;
  private raw:string|null=null;
  private exported=false;
  status:SaveStatus='empty';error='';lastSaved:string|null=null;
  constructor(privatePort:StoragePort,key=SAVE_KEY){
    this.port=privatePort;this.key=key;
    try{this.raw=this.port.getItem(key);if(this.raw!==null){this.record=decode(this.raw);this.status='ready';this.lastSaved=this.label();}}
    catch(e){this.status='blocked';this.error=String(e);}
  }
  private port:StoragePort;readonly key:string;
  get envelope():Envelope|null{return this.record?clone(this.record):null;}
  get state():World|null{return this.record?clone(this.record.current):null;}
  private label():string|null {return this.record?`${this.record.current.runId} · 第${this.record.current.round}轮 · ${this.record.current.phase} · 保存${this.record.sequence}`:null;}
  private async persist():Promise<boolean> {
    this.status='saving';try{const text=JSON.stringify(this.record);await this.port.setItem(this.key,text);this.raw=text;this.status='ready';this.error='';this.lastSaved=this.label();return true;}
    catch(e){this.status='failed';this.error=String(e);return false;}
  }
  async start(s:World):Promise<boolean> {
    if(this.status!=='empty')return false;
    this.record={format:1,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:1,current:clone(s),recent:null};return this.persist();
  }
  async dispatch(cmd:Command):Promise<Result> {
    const s=this.record?.current;if(!s)throw Error('没有已加载试验');
    if(this.status!=='ready')return {ok:false,state:clone(s),error:'保存未完成；仅可查看或重试'};
    const result=applyCommand(s,cmd);if(!result.ok)return result;
    this.record!.current=result.state;this.record!.sequence++;await this.persist();return {ok:true,state:this.state!};
  }
  async retry():Promise<boolean> {return this.status==='failed'?this.persist():false;}
  async newTrial(s:World):Promise<boolean> {
    if(this.status!=='ready'||this.record?.current.phase!=='ended'||s.runId===this.record.current.runId||s.phase!=='playing'||s.round!==0)return false;
    this.record={...this.record,sequence:this.record.sequence+1,recent:clone(this.record.current),current:clone(s)};return this.persist();
  }
  exportRaw():string|null {this.exported=true;return this.raw;}
  async resetAfterExport(s:World,confirmed:boolean):Promise<boolean> {
    if(this.status!=='blocked'||this.raw===null||!this.exported||!confirmed)return false;
    this.record={format:1,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:1,current:clone(s),recent:null};return this.persist();
  }
}
