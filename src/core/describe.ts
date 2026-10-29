/** Stage 7.1 readability helpers: plain-language text built from the world state. Pure functions; no DOM, no rule changes. */
import {SKILL_CN,key,type Action,type Skill,type TraceStep,type Unit,type World} from './engine.ts';
import {SPECIES} from './roster.ts';
import {speciesZh,moveZh,typeZh,tmZh,itemZh} from './names.ts';

/** Chinese species name, or the unit id when the unit has no species (fixed-map fixtures). */
export const unitName=(u:Unit|undefined,fallback=''):string=>u?.species?speciesZh(u.species):fallback;
/** "A 小火龙": the id players see on the board plus the species. */
export const unitLabel=(u:Unit|undefined,id:string):string=>{const n=unitName(u);return n?`${id} ${n}`:id;};
/** The Chinese name of the move behind a behavior (roster units carry named moves; fixtures only have the behavior). */
export function moveName(u:Unit|undefined,skill:Skill):string|null {
  const i=u?.learned.indexOf(skill)??-1;const m=i>=0?u?.moves?.[i]:undefined;return m?moveZh(m):null;
}
/** "撞击（强击）" for a named move, else just the behavior name. */
export const skillLabel=(u:Unit|undefined,skill:Skill):string=>{const m=moveName(u,skill);return m?`${m}（${SKILL_CN[skill]}）`:SKILL_CN[skill];};

/** Short plain text for one action. `s` is the state before the round, so ids can be turned into species names. */
export function actionText(s:World,actor:string,a:Action):string {
  const who=(id:string)=>unitLabel(s.units[id],id);
  switch(a.type){
    case 'move':return `移动到(${a.to.x},${a.to.y})`;
    case 'basic':return `普攻 ${who(a.target)}`;
    case 'skill':return `${skillLabel(s.units[actor],a.skill)} → ${who(a.target)}`;
    case 'swap':return `与${who(a.target)}换位`;
    case 'use':return `使用${itemZh(a.item)} → ${who(a.target)}`;
    case 'interact':return a.exit?'交互并请求撤离／跨层':'取得并继续';
    default:return '等待';
  }
}
/** The turn order of a combination draft, as one line: "A 小火龙 → B 杰尼龟 → 敌方". */
export function orderLine(s:World,steps:TraceStep[]):string {
  return [...steps.map(t=>unitLabel(s.units[t.id],t.id)),'敌方'].join(' → ');
}
/** One row per member: what that member does this round and whether it is the player's choice or the default behaviour. */
export function stepRows(s:World,steps:TraceStep[]):{id:string;text:string}[] {
  return steps.map(t=>({id:t.id,text:`${unitLabel(s.units[t.id],t.id)}：${t.failed?`原定“${actionText(s,t.id,t.action)}”已不成立，改为等待`:actionText(s,t.id,t.action)}${t.explicit?'':'（默认行为）'}`}));
}

export type EnemyInfo={id:string;name:string;types:string;hp:number;maxHp:number;behavior:string;damage:string;note:string};
/** What a revealed enemy shows. Returns null for anything the player cannot see yet (unrevealed cell, fallen, or not an enemy). */
export function enemyInfo(s:World,id:string):EnemyInfo|null {
  const u=s.units[id];
  if(!u||u.side!=='enemy'||u.hp<=0||!u.pos||!s.seen.includes(key(u.pos)))return null;
  const sp=u.species?SPECIES[u.species]:undefined;
  const range=u.range??3;
  const behavior=u.ai==='ranged'?`远程：同一行或列、${range}格以内、中间没有墙和单位时射击；不移动`
    :u.ai==='chase'?'追击：够不着时每轮向最近的同行走一步；相邻后近战攻击':'近战：只攻击上下左右相邻的同行；不移动';
  const damage=u.damage===undefined?'未知':`${u.damage}（“保护”可为被保护者挡掉首次的4点）`;
  return {id,name:unitLabel(u,id),types:sp?(sp.types??[]).map(typeZh).join('／'):'',hp:u.hp,maxHp:u.maxHp,behavior,damage,
    note:u.species?'击败后有概率发出加入邀请。':''};
}

const escapeRe=(t:string)=>t.replace(/[.*+?^$|()[\]{}\\]/g,'\\$&');
/** Turns ids in a log line into readable names: unit ids get their species, species ids and machine moves are translated. */
export function localizeLog(s:World,line:string):string {
  const ids=Object.keys(s.units).sort((a,b)=>b.length-a.length);
  const edge='[A-Za-z0-9-]';
  let out=line;
  const swaps:[string,string][]=[];
  const guard=(from:string,to:string)=>{const token=`@@${swaps.length}@@`;swaps.push([token,to]);out=out.replace(new RegExp(`(?<!${edge})${escapeRe(from)}(?!${edge})`,'g'),token);};
  for(const id of ids){const u=s.units[id];const n=unitName(u);if(n)guard(id,`${id} ${n}`);}
  for(const id of Object.keys(SPECIES))guard(id,speciesZh(id));
  for(const tm of ['protect','whirlwind','roar'])guard(tm,tmZh(tm));
  for(const [token,to] of swaps)out=out.split(token).join(to);
  return out;
}
export const behaviorSummary=(u:Unit):string=>u.learned.length?u.learned.map(k=>skillLabel(u,k)).join('、'):'普攻';
