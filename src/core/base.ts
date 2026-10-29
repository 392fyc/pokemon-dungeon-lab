/**
 * 6.5 base profile: the part of the player's progress that outlives one run. Pure data and pure functions; no storage, no renderer.
 * Specification: docs/玩法研究/基地与培养.md. All numbers (two carried moves, three-member squads) are working candidates.
 */
import {SPECIES,speciesOf,learnableMove,TM_MOVES,STARTER_IDS,type KitMove} from './roster.ts';
import type {World,SquadMember} from './engine.ts';
import {speciesZh,moveZh} from './names.ts';
/** One roster member. `learned` is everything it has permanently learned; `carry` names the (at most two) moves it brings into a run. */
export type Instance={id:string;species:string;learned:KitMove[];carry:string[]};
export type Profile={expeditions:number;next:number;roster:Instance[];vault:Record<string,number>;team:string[];leader:string};
export type BaseAction={type:'learn';inst:string;move:string}|{type:'carry';inst:string;moves:string[]}|{type:'team';team:string[];leader:string};
export type BaseResult={ok:true;profile:Profile}|{ok:false;error:string};
export const MAX_CARRY=2,MAX_TEAM=3;
const kitOf=(species:string):KitMove[]=>SPECIES[species].kit.map(k=>({move:k.move,behavior:k.behavior,pp:k.pp}));
const newInstance=(id:string,species:string):Instance=>({id,species,learned:kitOf(species),carry:SPECIES[species].kit.map(k=>k.move)});
const clone=<T>(v:T):T=>structuredClone(v);
const fail=(error:string):BaseResult=>({ok:false,error});

/** The first profile: the three starters with their roster kit learned and carried, an empty vault, charmander-squirtle-bulbasaur with bulbasaur leading (as in the 6.4 team). */
export function initialProfile():Profile {
  return {expeditions:0,next:4,roster:[newInstance('P1','charmander'),newInstance('P2','squirtle'),newInstance('P3','bulbasaur')],vault:{},team:['P1','P2','P3'],leader:'P3'};
}
/**
 * Stage 7.1 new game (WORKING CANDIDATE, docs/玩法研究/新游戏流程与界面.md): the player picks a main character from the nine starters and one
 * deputy from the other eight. The profile starts with these two only (P1 main and leader, P2 deputy); a third member has to be recruited.
 */
export function newGameProfile(mainSpecies:string,deputySpecies:string):BaseResult {
  if(!STARTER_IDS.includes(mainSpecies))return fail(`${mainSpecies}不是可选的主控`);
  if(!STARTER_IDS.includes(deputySpecies))return fail(`${deputySpecies}不是可选的副手`);
  if(mainSpecies===deputySpecies)return fail('副手须与主控不同');
  return {ok:true,profile:{expeditions:0,next:3,roster:[newInstance('P1',mainSpecies),newInstance('P2',deputySpecies)],vault:{},team:['P1','P2'],leader:'P1'}};
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
  if(new Set(picked.map(m=>m.behavior)).size!==picked.length)return fail('携带的两招行为相同（例如两招都是保护），请换一招');
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
export function applyBase(p:Profile,a:BaseAction):BaseResult {
  return a.type==='learn'?learnTm(p,a.inst,a.move):a.type==='carry'?setCarry(p,a.inst,a.moves):setTeam(p,a.team,a.leader);
}
/** The squad for a new run, in queue order. Carried moves come from the instance's learned list (max PP included). */
export function squadOf(p:Profile):{members:SquadMember[];leader:number} {
  const members=p.team.map(id=>{const i=instanceOf(p,id)!;return {inst:i.id,species:i.species,carry:i.carry.map(n=>i.learned.find(l=>l.move===n)!)};});
  return {members,leader:p.team.indexOf(p.leader)};
}
/**
 * Settlement after a finished run (spec "结算：回到基地"). `profile` is null for records that never had one: they start from the initial profile.
 * Every unit still on the team or in camp joins the roster (fallen ones too; a wipe is not a loss); units that came from the roster keep their
 * own instance and its learned moves, and nothing of the run's HP, PP or level comes back. Units made in the run become new instances with their
 * species kit. Only a normal exit with a brought technique machine fills the vault. Returns null when the world is not a finished expedition.
 */
export function settleRun(profile:Profile|null,w:World):Profile|null {
  if(w.phase!=='ended'||w.scenario!=='expedition'||!w.prog||!w.end)return null;
  const fresh=profile===null,p=profile?clone(profile):initialProfile();
  const legacy:Record<string,string>={A:'P1',B:'P2',C:'P3'};
  for(const id of [...w.queue,...w.camp]){
    const u=w.units[id];
    if(u.inst!==undefined)continue;
    // A run started before the base existed: its A/B/C are the three initial starters, not new people.
    const old=fresh&&legacy[id]?instanceOf(p,legacy[id]):undefined;
    if(old&&old.species===u.species)continue;
    if(!u.species||!speciesOf(u.species))continue;
    p.roster.push(newInstance(`P${p.next}`,u.species));p.next++;
  }
  if(w.end.tm?.brought)p.vault[w.end.tm.move]=(p.vault[w.end.tm.move]??0)+1;
  p.expeditions++;return p;
}

/* ---------- validation ---------- */
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const nat=(v:unknown):v is number=>Number.isInteger(v)&&(v as number)>=0;
/** Structure checks listed in the spec "存档与兼容", plus the team and counters. Returns an error text, or null when the profile is sound. */
export function profileProblem(v:unknown):string|null {
  if(!obj(v))return '档案不是对象';
  if(!nat(v.expeditions)||!nat(v.next)||!Array.isArray(v.roster)||!obj(v.vault)||!Array.isArray(v.team)||typeof v.leader!=='string')return '档案字段缺失或类型错误';
  const roster=v.roster as unknown[],ids=new Set<string>();let maxNo=0;
  if(!roster.length)return '名册为空';
  for(const i of roster){
    if(!obj(i)||typeof i.id!=='string'||typeof i.species!=='string'||!Array.isArray(i.learned)||!Array.isArray(i.carry))return '名册实例结构错误';
    if(ids.has(i.id))return `实例编号${i.id}重复`;ids.add(i.id);
    const m=/^P(\d+)$/.exec(i.id);if(!m)return `实例编号${i.id}格式错误`;maxNo=Math.max(maxNo,Number(m[1]));
    if(!speciesOf(i.species))return `实例${i.id}的物种不在名册数据中`;
    const names=new Set<string>();
    for(const l of i.learned as unknown[]){
      if(!obj(l)||typeof l.move!=='string'||typeof l.behavior!=='string'||!Number.isInteger(l.pp))return `实例${i.id}的已学招式结构错误`;
      const ok=learnableMove(i.species,l.move);
      if(!ok||ok.behavior!==l.behavior||ok.pp!==l.pp)return `实例${i.id}的已学招式${l.move}不在该物种的可学清单里`;
      if(names.has(l.move))return `实例${i.id}重复学会${l.move}`;names.add(l.move);
    }
    const carry=i.carry as unknown[];
    if(carry.length>MAX_CARRY||carry.some(c=>typeof c!=='string'||!names.has(c)))return `实例${i.id}携带的招式不是已学招式的子集，或超过${MAX_CARRY}招`;
    if(new Set(carry).size!==carry.length)return `实例${i.id}重复携带同一招`;
    const behaviors=carry.map(c=>(i.learned as {move:string;behavior:string}[]).find(l=>l.move===c)!.behavior);
    if(new Set(behaviors).size!==behaviors.length)return `实例${i.id}携带的两招行为相同`;
  }
  if((v.next as number)<=maxNo)return '实例计数落后于已有编号';
  for(const [k,n] of Object.entries(v.vault as Record<string,unknown>)){if(!(TM_MOVES as readonly string[]).includes(k)||!nat(n))return `仓库里的${k}计数不是合法的非负整数`;}
  const team=v.team as unknown[];
  if(team.length<1||team.length>MAX_TEAM||team.some(t=>typeof t!=='string'||!ids.has(t))||new Set(team).size!==team.length)return '出发队伍不合法';
  if(!team.includes(v.leader))return '主控不在出发队伍中';
  return null;
}
/** A run's units that came from the roster must match their instance: same species, and carried moves taken from its learned moves. */
export function profileFitsWorld(p:Profile|undefined,w:World):boolean {
  const seen=new Set<string>();
  for(const id of [...w.queue,...w.camp]){
    const u=w.units[id];if(u.inst===undefined)continue;
    if(!p||seen.has(u.inst))return false;seen.add(u.inst);
    const inst=instanceOf(p,u.inst);if(!inst||inst.species!==u.species||!u.moves)return false;
    for(let n=0;n<u.moves.length;n++){const l=inst.learned.find(x=>x.move===u.moves![n]);if(!l||l.behavior!==u.learned[n]||u.maxPp[l.behavior]!==l.pp)return false;}
  }
  return true;
}
