/**
 * 6.5 base profile: the part of the player's progress that outlives one run. Pure data and pure functions; no storage, no renderer.
 * Specification: docs/玩法研究/基地与培养.md. All numbers (two carried moves, three-member squads) are working candidates.
 */
import {SPECIES,speciesOf,learnableMove,TM_MOVES,STARTER_IDS,type KitMove} from './roster.ts';
import type {World,SquadMember} from './engine.ts';
import {legacySpeciesMove} from './legacy-moves.ts';
import {speciesZh,moveZh} from './names.ts';
import {ECON} from './economy.ts';
/**
 * One roster member. `learned` is everything it has permanently learned; `carry` names the (at most two) moves it brings into a run.
 * `protected` (7.2) marks a founding member (the initial two, or the three starters of an old profile): it never goes missing in a wipe.
 */
export type Instance={id:string;species:string;learned:KitMove[];carry:string[];protected:boolean};
/** 7.2 a partner waiting in the rescue pool: `left` is L (expeditions until it is lost, unpaid) or X (expeditions until it returns, paid). Its personal moves stay in `inst`. */
export type RescueEntry={inst:Instance;paid:boolean;left:number};
/** 7.2 a partner lost for good, and the expedition count when it happened. */
export type LostRecord={id:string;species:string;expedition:number};
/**
 * `account` (7.2) is the base money; `rescue` and `lost` are the pool and the record of lost partners; `origin` is the founding main character's
 * instance id, used to refill an empty squad.
 */
export type Profile={expeditions:number;next:number;roster:Instance[];vault:Record<string,number>;team:string[];leader:string;account:number;rescue:RescueEntry[];lost:LostRecord[];origin:string};
export type BaseAction={type:'learn';inst:string;move:string}|{type:'carry';inst:string;moves:string[]}|{type:'team';team:string[];leader:string}|{type:'rescue';inst:string};
export type BaseResult={ok:true;profile:Profile}|{ok:false;error:string};
export const MAX_CARRY=2,MAX_TEAM=3;
const kitOf=(species:string):KitMove[]=>SPECIES[species].kit.map(k=>({move:k.move,pp:k.pp}));
const newInstance=(id:string,species:string,isProtected=false):Instance=>({id,species,learned:kitOf(species),carry:SPECIES[species].kit.map(k=>k.move),protected:isProtected});
const clone=<T>(v:T):T=>structuredClone(v);
const fail=(error:string):BaseResult=>({ok:false,error});

/** The first profile: the three starters with their roster kit learned and carried, an empty vault, charmander-squirtle-bulbasaur with bulbasaur leading (as in the 6.4 team). */
export function initialProfile():Profile {
  return {expeditions:0,next:4,roster:[newInstance('P1','charmander',true),newInstance('P2','squirtle',true),newInstance('P3','bulbasaur',true)],vault:{},team:['P1','P2','P3'],leader:'P3',account:0,rescue:[],lost:[],origin:'P3'};
}
/**
 * Stage 7.1 new game (WORKING CANDIDATE, docs/玩法研究/新游戏流程与界面.md): the player picks a main character from the nine starters and one
 * deputy from the other eight. The profile starts with these two only (P1 main and leader, P2 deputy); a third member has to be recruited.
 */
export function newGameProfile(mainSpecies:string,deputySpecies:string):BaseResult {
  if(!STARTER_IDS.includes(mainSpecies))return fail(`${mainSpecies}不是可选的主控`);
  if(!STARTER_IDS.includes(deputySpecies))return fail(`${deputySpecies}不是可选的副手`);
  if(mainSpecies===deputySpecies)return fail('副手须与主控不同');
  return {ok:true,profile:{expeditions:0,next:3,roster:[newInstance('P1',mainSpecies,true),newInstance('P2',deputySpecies,true)],vault:{},team:['P1','P2'],leader:'P1',account:0,rescue:[],lost:[],origin:'P1'}};
}
export const instanceOf=(p:Profile,id:string)=>p.roster.find(i=>i.id===id);

export function learnTm(original:Profile,instId:string,move:string):BaseResult {
  if(!(TM_MOVES as readonly string[]).includes(move))return fail(`${moveZh(move)}不是招式机`);
  if((original.vault[move]??0)<1)return fail(`仓库里没有${moveZh(move)}招式机`);
  const inst=instanceOf(original,instId);if(!inst)return fail('没有这只伙伴');
  const m=learnableMove(inst.species,move);
  if(!m)return fail(`${speciesZh(inst.species)}不能学习${moveZh(move)}（不在它的可学清单里）；招式机没有消耗`);
  if(inst.learned.some(l=>l.move===move))return fail(`${instId}已经学会${moveZh(move)}，不能重复学习；招式机没有消耗`);
  const p=clone(original);instanceOf(p,instId)!.learned.push(m);
  p.vault[move]--;if(p.vault[move]===0)delete p.vault[move];
  return {ok:true,profile:p};
}
/** Free and repeatable. `moves` is the new carried list in order. A move taken off the list stays learned. */
export function setCarry(original:Profile,instId:string,moves:string[]):BaseResult {
  const inst=instanceOf(original,instId);if(!inst)return fail('没有这只伙伴');
  if(moves.length>MAX_CARRY)return fail(`最多携带${MAX_CARRY}招`);
  if(new Set(moves).size!==moves.length)return fail('同一招不能携带两次');
  const picked:KitMove[]=[];
  for(const name of moves){const m=inst.learned.find(l=>l.move===name);if(!m)return fail(`${instId}还没有学会${moveZh(name)}，不能携带`);picked.push(m);}
  const p=clone(original);instanceOf(p,instId)!.carry=[...moves];return {ok:true,profile:p};
}
/** 1 to 3 distinct roster members; the order is the queue order; the leader is one of them. */
export function setTeam(original:Profile,team:string[],leader:string):BaseResult {
  if(team.length<1||team.length>MAX_TEAM)return fail(`出发队伍须为1到${MAX_TEAM}只`);
  if(new Set(team).size!==team.length)return fail('队伍里不能重复选同一只');
  if(team.some(id=>!instanceOf(original,id)))return fail('队伍里有不在名册的伙伴');
  if(!team.includes(leader))return fail('主控必须在出发队伍中');
  const p=clone(original);p.team=[...team];p.leader=leader;return {ok:true,profile:p};
}
/** 7.2 rescue payment at the base: C from the account; the partner becomes "paid, waiting X". Refused (nothing changes) when the account falls short. */
export function payRescue(original:Profile,instId:string):BaseResult {
  const entry=original.rescue.find(r=>r.inst.id===instId);
  if(!entry)return fail('救援池里没有这只伙伴');
  if(entry.paid)return fail('这只伙伴已经付过救援费，无需再付');
  if(original.account<ECON.rescueCost)return fail(`账户余额${original.account}，救援费${ECON.rescueCost}，还差${ECON.rescueCost-original.account}；没有付款`);
  const p=clone(original);p.account-=ECON.rescueCost;const e=p.rescue.find(r=>r.inst.id===instId)!;e.paid=true;e.left=ECON.paidWait;
  return {ok:true,profile:p};
}
/** 7.2 purse set before departure: 0 to min(purseMax, account) in steps of purseStep. Returns the reason it is refused, or null. */
export function purseProblem(p:Profile,purse:number):string|null {
  if(!Number.isInteger(purse)||purse<0)return '钱袋金额须是非负整数';
  if(purse%ECON.purseStep!==0)return `钱袋金额须是${ECON.purseStep}的整数倍`;
  if(purse>p.account)return `账户余额只有${p.account}，不能往钱袋里装${purse}`;
  if(purse>ECON.purseMax)return `钱袋最多装${ECON.purseMax}`;
  return null;
}
export function applyBase(p:Profile,a:BaseAction):BaseResult {
  return a.type==='learn'?learnTm(p,a.inst,a.move):a.type==='carry'?setCarry(p,a.inst,a.moves):a.type==='rescue'?payRescue(p,a.inst):setTeam(p,a.team,a.leader);
}
/** The squad for a new run, in queue order. Carried moves come from the instance's learned list (max PP included). */
export function squadOf(p:Profile):{members:SquadMember[];leader:number} {
  const members=p.team.map(id=>{const i=instanceOf(p,id)!;return {inst:i.id,species:i.species,carry:i.carry.map(n=>i.learned.find(l=>l.move===n)!),protected:i.protected};});
  return {members,leader:p.team.indexOf(p.leader)};
}
/**
 * Settlement after a finished run (spec 失败回归与服务点.md "回到基地"). `profile` is null for records that never had one: they start from the initial profile.
 * One write, in this fixed order:
 * 1. the reward (and, after a normal exit, the purse balance) goes into the account;
 * 2. an effective expedition advances the partners that were in the rescue pool before departure (unpaid L-1, paid X-1);
 * 3. paid partners whose X reached 0 return to the roster with their own moves; unpaid ones whose L reached 0 are lost for good;
 * 4. partners that went missing in this run's wipe draw enter the pool with L = window (counting from the next run); the other units of the run
 *    (team, camp, and the one the exchanger took home) join the roster; units made in the run become new instances with their species kit;
 * 5. every technique machine that was brought home or sent home safely enters the vault (once each);
 * 6. the squad is tidied: members no longer on the roster leave it, the leader's successor is the first remaining member, and an empty squad is
 *    refilled with the protected founding members led by `origin`.
 * Nothing of the run's HP, PP or level comes back. Returns null when the world is not a finished expedition with an end record from 7.2.
 */
export function settleRun(profile:Profile|null,w:World):Profile|null {
  if(w.phase!=='ended'||w.scenario!=='expedition'||!w.prog||!w.end||w.end.effective===undefined||!w.end.tms||!w.end.lost)return null;
  const e=w.end,fresh=profile===null,p=profile?clone(profile):initialProfile();
  const legacy:Record<string,string>={A:'P1',B:'P2',C:'P3'};
  const lost=new Set(e.lost);
  const members=[...w.queue,...w.camp,...(w.exchange?.sent?[w.exchange.sent]:[])];
  // A protected member can never be in the missing list; a record that says so is refused untouched.
  if(members.some(id=>lost.has(id)&&(w.units[id].protected===true||(w.units[id].inst===undefined&&fresh&&!!legacy[id])||(w.units[id].inst!==undefined&&!!instanceOf(p,w.units[id].inst!)?.protected))))return null;
  p.expeditions++;
  p.account+=(e.reward??0)+(e.refund??0);
  if(e.effective){
    const stay:RescueEntry[]=[];
    for(const r of p.rescue){
      r.left--;
      if(r.left<=0){if(r.paid)p.roster.push(r.inst);else p.lost.push({id:r.inst.id,species:r.inst.species,expedition:p.expeditions});continue;}
      stay.push(r);
    }
    p.rescue=stay;
  }
  for(const id of members){
    const u=w.units[id];
    if(u.inst!==undefined){
      if(lost.has(id)){const at=p.roster.findIndex(i=>i.id===u.inst);if(at>=0){const [inst]=p.roster.splice(at,1);p.rescue.push({inst,paid:false,left:ECON.window});}}
      continue;
    }
    // A run started before the base existed: its A/B/C are the three initial starters, not new people.
    const old=fresh&&legacy[id]?instanceOf(p,legacy[id]):undefined;
    if(old&&old.species===u.species)continue;
    if(!u.species||!speciesOf(u.species))continue;
    const inst=newInstance(`P${p.next}`,u.species);p.next++;
    if(lost.has(id))p.rescue.push({inst,paid:false,left:ECON.window});else p.roster.push(inst);
  }
  for(const t of e.tms??[])if(t.fate==='brought'||t.fate==='sent')p.vault[t.move]=(p.vault[t.move]??0)+1;
  const ids=new Set(p.roster.map(i=>i.id));
  p.team=p.team.filter(id=>ids.has(id));
  if(!p.team.length){p.team=p.roster.filter(i=>i.protected).map(i=>i.id).slice(0,MAX_TEAM);p.leader=p.origin;}
  else if(!p.team.includes(p.leader))p.leader=p.team[0];
  return p;
}
/** What a settlement would change in the rescue pool, for the result screen (computed by the same function that settles; nothing is written). */
export type SettleSummary={account:{before:number;after:number};returned:{id:string;species:string}[];gone:{id:string;species:string}[];missing:{id:string;species:string}[];advanced:{id:string;species:string;paid:boolean;from:number;to:number}[]};
export function settleSummary(profile:Profile|null,w:World):SettleSummary|null {
  const before=profile??initialProfile(),after=settleRun(profile,w);if(!after)return null;
  const inPool=(p:Profile,id:string)=>p.rescue.find(r=>r.inst.id===id);
  const returned=before.rescue.filter(r=>r.paid&&after.roster.some(i=>i.id===r.inst.id)).map(r=>({id:r.inst.id,species:r.inst.species}));
  const gone=after.lost.filter(l=>!before.lost.some(o=>o.id===l.id)).map(l=>({id:l.id,species:l.species}));
  const missing=after.rescue.filter(r=>!inPool(before,r.inst.id)).map(r=>({id:r.inst.id,species:r.inst.species}));
  const advanced=before.rescue.flatMap(r=>{const now=inPool(after,r.inst.id);return now&&now.left!==r.left?[{id:r.inst.id,species:r.inst.species,paid:r.paid,from:r.left,to:now.left}]:[];});
  return {account:{before:before.account,after:after.account},returned,gone,missing,advanced};
}

/**
 * Reads an older profile (no 7.2 fields at all) as it would have been made today, by content and not by date (stage 7.1 already shipped new-flow
 * profiles that carry no marks either): P1 and P2 are protected with `origin` P1; when P3 exists and is a starter it is an old-flow profile, so P3 is
 * protected too and `origin` is P3; account 0, empty pool, nothing lost. A profile that already has any 7.2 field is returned unchanged.
 */
export function migrateProfile(v:unknown):unknown {
  if(!obj(v)||!Array.isArray(v.roster))return v;
  const marked=v.account!==undefined||v.rescue!==undefined||v.lost!==undefined||v.origin!==undefined||(v.roster as unknown[]).some(i=>obj(i)&&i.protected!==undefined);
  if(marked)return v;
  const p=structuredClone(v) as Record<string,unknown>&{roster:Record<string,unknown>[]};
  for(const i of p.roster)if(obj(i))i.protected=i.id==='P1'||i.id==='P2';
  const third=p.roster.find(i=>obj(i)&&i.id==='P3'&&typeof i.species==='string'&&STARTER_IDS.includes(i.species));
  if(third)third.protected=true;
  p.origin=third?'P3':'P1';p.account=0;p.rescue=[];p.lost=[];
  return p;
}

/** Convert the old profile's frozen (move, behavior, PP) rows after 7.2 fields have been migrated. */
export function migrateProfileMoves(v:unknown):unknown {
  if(!obj(v))return v;
  const profile=v as Record<string,unknown>;
  const oldInstance=(raw:unknown):unknown=>{
    if(!obj(raw))throw Error('旧档案里的伙伴结构无法迁移');
    const inst=raw as Record<string,unknown>;
    if(!Array.isArray(inst.learned))throw Error('旧档案里的伙伴招式清单无法迁移');
    const learned=inst.learned.map((value:unknown)=>{
      if(!obj(value)||Object.keys(value).sort().join()!=='behavior,move,pp'||typeof value.move!=='string'||typeof value.behavior!=='string'||!Number.isInteger(value.pp))
        throw Error(`旧档案里的${String(inst.id??'伙伴')}招式记录无法迁移`);
      const old=typeof inst.species==='string'?legacySpeciesMove(inst.species,value.move):undefined;
      if(!old||old.behavior!==value.behavior||old.pp!==value.pp)
        throw Error(`旧档案里的${String(inst.id??'伙伴')}招式${value.move}与冻结的旧名单不符`);
      return {move:value.move,pp:value.pp};
    });
    return {...inst,learned};
  };
  if(Array.isArray(profile.roster))profile.roster=profile.roster.map(oldInstance);
  if(Array.isArray(profile.rescue))profile.rescue=profile.rescue.map((entry:unknown)=>{
    if(!obj(entry))throw Error('旧档案的救援池条目无法迁移');
    return {...entry,inst:oldInstance(entry.inst)};
  });
  return profile;
}

/* ---------- validation ---------- */
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const nat=(v:unknown):v is number=>Number.isInteger(v)&&(v as number)>=0;
/** One instance (roster or pool): structure, species, learned moves from the species' learnable list, carried moves. Returns the problem text, or null. */
function instProblem(i:unknown,ids:Set<string>,wantProtected:boolean|null):string|null {
  if(!obj(i)||typeof i.id!=='string'||typeof i.species!=='string'||!Array.isArray(i.learned)||!Array.isArray(i.carry)||typeof i.protected!=='boolean')return '名册实例结构错误';
  if(Object.keys(i).some(k=>!['id','species','learned','carry','protected'].includes(k)))return `实例${i.id}含有不认识的字段`;
  if(ids.has(i.id))return `实例编号${i.id}重复`;ids.add(i.id);
  if(!/^P(\d+)$/.test(i.id))return `实例编号${i.id}格式错误`;
  if(wantProtected===false&&i.protected)return `救援池里的${i.id}不能带受保护标记`;
  if(!speciesOf(i.species))return `实例${i.id}的物种不在名册数据中`;
  const names=new Set<string>();
  for(const l of i.learned as unknown[]){
    if(!obj(l)||Object.keys(l).sort().join()!=='move,pp'||typeof l.move!=='string'||!Number.isInteger(l.pp)||(l.pp as number)<1)return `实例${i.id}的已学招式结构错误`;
    const ok=learnableMove(i.species,l.move);
    if(!ok||ok.pp!==l.pp)return `实例${i.id}的已学招式${l.move}不在该物种的可学清单里`;
    if(names.has(l.move))return `实例${i.id}重复学会${l.move}`;names.add(l.move);
  }
  const carry=i.carry as unknown[];
  if(carry.length>MAX_CARRY||carry.some(c=>typeof c!=='string'||!names.has(c)))return `实例${i.id}携带的招式不是已学招式的子集，或超过${MAX_CARRY}招`;
  if(new Set(carry).size!==carry.length)return `实例${i.id}重复携带同一招`;
  return null;
}
/** Structure checks listed in the spec "存档与兼容" and "失败回归与服务点", plus the team and counters. Returns an error text, or null when the profile is sound. */
export function profileProblem(v:unknown):string|null {
  if(!obj(v))return '档案不是对象';
  if(!nat(v.expeditions)||!nat(v.next)||!Array.isArray(v.roster)||!obj(v.vault)||!Array.isArray(v.team)||typeof v.leader!=='string')return '档案字段缺失或类型错误';
  if(!nat(v.account)||!Array.isArray(v.rescue)||!Array.isArray(v.lost)||typeof v.origin!=='string')return '档案缺少账户、救援池、失去记录或初始主控字段';
  const roster=v.roster as unknown[],ids=new Set<string>(),rosterIds=new Set<string>();
  if(!roster.length)return '名册为空';
  for(const i of roster){const bad=instProblem(i,ids,null);if(bad)return bad;rosterIds.add((i as Instance).id);}
  for(const r of v.rescue as unknown[]){
    if(!obj(r)||typeof r.paid!=='boolean'||!Number.isInteger(r.left))return '救援池条目结构错误';
    const bad=instProblem(r.inst,ids,false);if(bad)return bad;
    const left=r.left as number;
    if(left<1||left>(r.paid?ECON.paidWait:ECON.window))return `救援池里${(r.inst as Instance).id}的剩余次数不合法`;
  }
  for(const l of v.lost as unknown[]){
    if(!obj(l)||typeof l.id!=='string'||typeof l.species!=='string'||!nat(l.expedition)||!speciesOf(l.species))return '失去记录结构错误';
    if(!/^P(\d+)$/.test(l.id)||ids.has(l.id))return `失去记录的编号${l.id}不合法或重复`;ids.add(l.id);
  }
  let maxNo=0;for(const id of ids)maxNo=Math.max(maxNo,Number(id.slice(1)));
  if((v.next as number)<=maxNo)return '实例计数落后于已有编号';
  const origin=(roster as Instance[]).find(i=>i.id===v.origin);
  if(!origin||!origin.protected)return '初始主控不在名册里，或没有受保护标记';
  for(const [k,n] of Object.entries(v.vault as Record<string,unknown>)){if(!(TM_MOVES as readonly string[]).includes(k)||!nat(n))return `仓库里的${k}计数不是合法的非负整数`;}
  const team=v.team as unknown[];
  if(team.length<1||team.length>MAX_TEAM||team.some(t=>typeof t!=='string'||!rosterIds.has(t))||new Set(team).size!==team.length)return '出发队伍不合法';
  if(!team.includes(v.leader))return '主控不在出发队伍中';
  return null;
}
/** A run's units that came from the roster must match their instance: same species, and carried moves taken from its learned moves. */
export function profileFitsWorld(p:Profile|undefined,w:World):boolean {
  const seen=new Set<string>();
  for(const id of [...w.queue,...w.camp,...(w.exchange?.sent?[w.exchange.sent]:[])]){
    const u=w.units[id];if(u.inst===undefined)continue;
    if(!p||seen.has(u.inst))return false;seen.add(u.inst);
    const inst=instanceOf(p,u.inst);if(!inst||inst.species!==u.species||!u.moves||(u.protected===true)!==inst.protected)return false;
    if(u.moves.length!==u.learned.length||new Set(u.moves).size!==u.moves.length)return false;
    for(let n=0;n<u.moves.length;n++){const move=u.moves[n],l=inst.learned.find(x=>x.move===move);if(!l||u.learned[n]!==move||u.maxPp[move]!==l.pp)return false;}
  }
  return true;
}
