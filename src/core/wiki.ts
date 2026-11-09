/** In-game wiki model (D-20261109-03): categories and entries built from the game's own data files, with no DOM.
 *  Hand-written explanations live in src/data/wiki-zh.json (each entry names its rule numbers); the move, species, item and blessing lists
 *  are generated from the data the engine reads; numbers come from engine constants through {token} placeholders. */
import wikiText from '../data/wiki-zh.json' with {type:'json'};
import descSource from '../data/move-desc-zh.json' with {type:'json'};
import chartSource from '../data/type-chart.json' with {type:'json'};
import {SPECIES,ALL_TM_MOVES} from './roster.ts';
import {moveOf,moveEffects,MOVE_DEFS,type MoveRange,type StatusId,type StageKey,type StageChange} from './moves.ts';
import {moveType} from './type-chart.ts';
import {moveZh,speciesZh,typeZh,itemZh} from './names.ts';
import {DIFFICULTY,ENEMY_SLEEP_CHANCE} from './dungeon.ts';
import {moveRangeLabel} from './describe.ts';
import {moveCategory} from './moves.ts';
import {ITEM_DESCRIPTIONS} from './item-descriptions.ts';
import {TACTIC_LABELS} from './tactics.ts';
import {
  ATTACK_STAGE_256,DEFENCE_STAGE_256,STAGE_LIMIT,STAT_DAMAGE_RATIO,CRIT_CHANCE,CRIT_MULTIPLIER,STATUS_DURATION,STATUS_INTERVAL,STATUS_DAMAGE_DIVISOR,
  BURN_DAMAGE_RATIO,WAKE_ON_HIT_CHANCE,STATUS_NAMES,STAGE_NAMES,ACCURACY_STAGE_LIMIT,PARTY_LIMIT,STATUS_DEFAULT_LEFT,ITEM_NAMES,ITEM_CURES,BLESSINGS,BLESSING_RARITY,PROG,INITIAL_BLESSING_REFRESHES,accuracyMultiplier,
  type Item,type BlessingId,
} from './engine.ts';

export type WikiBlock=
  |{t:'p';text:string}
  |{t:'facts';rows:{label:string;text:string}[]}
  |{t:'table';head:string[];rows:string[][];kind?:'stage'|'chart'}
  |{t:'ranges';rows:{range:MoveRange;label:string;example:string}[]}
  |{t:'chips';label:string;ids:string[]}
  |{t:'stats';rows:{label:string;value:number}[]}
  |{t:'learnset';rows:{level:number;move:string}[]};
export type WikiMeta=
  |{kind:'move';move:string;types:string[]}
  |{kind:'species';species:string;dex:string;types:string[]}
  |{kind:'item';item:Item}
  |{kind:'blessing';blessing:BlessingId;rarity:string}
  |{kind:'text'};
export type WikiEntry={id:string;cat:string;key:string;title:string;subtitle:string;rules:string[];todo?:string;blocks:WikiBlock[];meta:WikiMeta;search:string};
export type WikiCategory={id:string;name:string;intro:string;rules:string[];entries:WikiEntry[]};
type TextEntry={id:string;category:string;title:string;rules:string[];body:string[];todo?:boolean;todoNote?:string;table?:string;stat?:string};
type TextCategory={id:string;name:string;source:string;rules:string[];intro:string};
const source=wikiText as unknown as {categories:TextCategory[];entries:TextEntry[];itemNotes?:Record<string,string[]>};

/** Every number the hand-written texts quote, read from the engine constants. */
export function wikiTokens():Record<string,string> {
  const pct=(n:number)=>String(Math.round(n*100));
  const range=(k:StatusId)=>{const r=STATUS_DURATION[k]??[STATUS_DEFAULT_LEFT,STATUS_DEFAULT_LEFT];return r[0]===r[1]?String(r[0]):r[0]+'—'+r[1];};
  const t:Record<string,string>={
    'crit.chance':'1/'+Math.round(1/CRIT_CHANCE),'crit.mult':String(CRIT_MULTIPLIER),'stage.limit':String(STAGE_LIMIT),'acc.limit':String(ACCURACY_STAGE_LIMIT),
    'ratio.min':String(STAT_DAMAGE_RATIO.min),'ratio.max':String(STAT_DAMAGE_RATIO.max),'party.max':String(PARTY_LIMIT),'recruit.pct':pct(PROG.recruitChance),
    'wake.pct':pct(WAKE_ON_HIT_CHANCE),'level.start':String(PROG.initialLevel),'level.max':String(PROG.maxLevel),
    'brn.ratio':String(BURN_DAMAGE_RATIO[0]/BURN_DAMAGE_RATIO[1]),'blessing.refreshes':String(INITIAL_BLESSING_REFRESHES),'enemy.sleep.pct':pct(ENEMY_SLEEP_CHANCE),'lullaby.pct':pct(BLESSINGS.lullaby.sleepChance??0),'diff.easy':String(DIFFICULTY.easy),'diff.normal':String(DIFFICULTY.normal),'diff.hard':String(DIFFICULTY.hard),
  };
  for(const k of ['psn','tox','brn'] as const){t[k+'.interval']=String(STATUS_INTERVAL[k]);t[k+'.div']=String(STATUS_DAMAGE_DIVISOR[k]);}
  for(const k of ['par','frz','slp','nap','confusion','flinch'] as const)t[k+'.dur']=range(k);
  for(const [k,v] of Object.entries(TACTIC_LABELS))t['tactic.'+k]=v;
  for(const k of BLESSING_RARITY.order)t['rarity.'+k]=String(BLESSING_RARITY.weights[k]);
  return t;
}
const fill=(text:string,tokens:Record<string,string>):string=>text.replace(/\{([\w.]+)\}/g,(m,k:string)=>{if(!(k in tokens))throw Error('wiki token without a value: '+k);return tokens[k];});
/** Names of the markup `[[id]]` and `[[id|label]]` a text may carry. */
export const WIKI_LINK=/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const link=(id:string,label:string)=>'[[' + id + '|' + label + ']]';

const MOVE_DESCRIPTIONS=(descSource as unknown as {moves:Record<string,{desc?:string}>}).moves;
const STAGE_LINK:Record<string,string>={atk:'stages:atk',def:'stages:def',spa:'stages:spa',spd:'stages:spd',spe:'stages:spe',acc:'stages:acc',eva:'stages:eva'};
const CATEGORY_ZH={Physical:'物理',Special:'特殊',Status:'变化'} as const;
/** The six reaches of the move card, in a word each; the full wording is in the range table (terms:range). */
export const RANGE_SHORT:Record<MoveRange,string>={front:'前方 1 格',front2:'前方 2 格',line10:'直线',around:'周围一圈',room:'同房间',user:'自身'};
const TARGET_FOE=(t:string|undefined)=>t==='enemy'||t==='all';

/** The moves a game can hand out: every species' kit, level-up and learnable list, plus the machine pool. */
export function wikiMoveIds():string[] {
  const ids=new Set<string>(ALL_TM_MOVES);
  for(const sp of Object.values(SPECIES)){for(const m of [...sp.kit,...sp.learnable,...sp.levelUp])ids.add(m.move);}
  return [...ids].filter(id=>!!moveOf(id)).sort((a,b)=>moveZh(a).localeCompare(moveZh(b),'zh')||a.localeCompare(b));
}
const typeLink=(type:string)=>link('terms:types',typeZh(type));
const stageChanges=(c:StageChange|undefined)=>Object.entries(c??{}) as [StageKey,number][];
const stageText=(key:StageKey,n:number)=>link(STAGE_LINK[key],STAGE_NAMES[key])+' '+(n>0?'+':'−')+Math.abs(n);

type MoveFacts={statuses:Set<StatusId>;stages:Set<StageKey>};
const moveLinks=new Map<string,MoveFacts>();
function describeMoveEffects(move:string):string[] {
  const spec=moveOf(move),fx=moveEffects(move),lines:string[]=[],facts:MoveFacts={statuses:new Set(),stages:new Set()};
  moveLinks.set(move,facts);
  if(!spec)return lines;
  const foe=TARGET_FOE(spec.target);
  for(const e of spec.effects){
    const st=/^stage:(\w+):([+-]\d+)$/.exec(e);
    if(st){const key=st[1] as StageKey,n=Number(st[2]);facts.stages.add(key);lines.push((foe?'对方':'自身')+' '+stageText(key,n));continue;}
    if(e.startsWith('status:')){const id=e.slice(7) as StatusId;facts.statuses.add(id);lines.push((foe?'使对方陷入':'使自身陷入')+link('status:'+id,STATUS_NAMES[id]));continue;}
    if(e==='protect'||e==='counter'||e==='quickguard'||e==='reflect'||e==='lightscreen')lines.push(link('terms:guard',({protect:'守住',counter:'反击',quickguard:'快速防守',reflect:'反射壁',lightscreen:'光墙'})[e]));
    else if(e==='rest')lines.push('进入'+link('status:nap','打盹'));
    else if(e==='blowaway')lines.push(link('terms:blowaway','吹飞'));
    else if(e==='drain')lines.push(link('terms:drain','吸取'));
    else if(e.startsWith('heal:'))lines.push(link('terms:drain','回复'));
    else if(e==='sleeptalk')lines.push('睡眠中随机使用另一个招式（梦话）');
    else if(e==='snore')lines.push('睡眠中的反应招式（打鼾）');
  }
  for(const f of fx?.fx??[]){
    const chance=f.chance>=100?'必定':f.chance+'%';
    if(f.status){facts.statuses.add(f.status);lines.push(chance+'使对方陷入'+link('status:'+f.status,STATUS_NAMES[f.status]));}
    for(const [k,n] of stageChanges(f.foe)){facts.stages.add(k);lines.push(chance+'对方 '+stageText(k,n));}
    for(const [k,n] of stageChanges(f.self)){facts.stages.add(k);lines.push(chance+'自身 '+stageText(k,n));}
  }
  for(const [k,n] of stageChanges(fx?.cost)){facts.stages.add(k);lines.push('使用后自身 '+stageText(k,n));}
  if(fx?.recoil)lines.push('反作用：造成伤害的 '+Math.round(fx.recoil[0]/fx.recoil[1]*100)+'%（'+link('terms:drain','说明')+'）');
  if(fx?.thaw)lines.push('打中冰冻的目标会使其'+link('status:frz','解冻'));
  if(fx?.powder)lines.push('粉末招式，草系免疫');
  return lines;
}

function accuracyText(move:string):string {
  const spec=moveOf(move),acc=moveEffects(move)?.acc;
  if(!spec||!TARGET_FOE(spec.target))return '不判命中';
  return acc===null||acc===undefined?'必中':String(Number(acc.toFixed(1)))+'%';
}
function learnersOf(move:string):string[] {
  return Object.values(SPECIES).filter(sp=>[...sp.kit,...sp.learnable,...sp.levelUp].some(m=>m.move===move)).map(sp=>'species:'+sp.id);
}
function movePp(move:string):number|null {
  for(const sp of Object.values(SPECIES)){const m=[...sp.kit,...sp.learnable,...sp.levelUp].find(x=>x.move===move);if(m)return m.pp;}
  return null;
}
function buildMove(move:string):WikiEntry {
  const spec=moveOf(move)!,type=moveType(move),category=moveCategory(move),zh=moveZh(move),effects=describeMoveEffects(move);
  const power=spec.power===null||spec.power===undefined?'—':String(spec.power),pp=movePp(move),desc=MOVE_DESCRIPTIONS[move]?.desc??'';
  const rows=[
    {label:'属性',text:type?typeLink(type):'—'},
    {label:'类别',text:category?link('terms:category',CATEGORY_ZH[category]):'—'},
    {label:'威力',text:power},{label:'命中',text:accuracyText(move)},{label:'PP',text:pp===null?'—':String(pp)},
    {label:'射程',text:link('terms:range',RANGE_SHORT[spec.range])},
  ];
  const blocks:WikiBlock[]=[{t:'facts',rows}];
  if(desc)blocks.push({t:'p',text:desc});
  if(effects.length)blocks.push({t:'facts',rows:[{label:'效果',text:effects.join('；')}]});
  blocks.push({t:'chips',label:'可学习的宝可梦',ids:learnersOf(move)});
  return {id:'moves:'+move,cat:'moves',key:move,title:zh,subtitle:[type?typeZh(type):'',category?CATEGORY_ZH[category]:'',power==='—'?'':'威力 '+power].filter(Boolean).join(' · '),
    rules:['G5.1'],blocks,meta:{kind:'move',move,types:type?[type]:[]},search:[zh,move,type?typeZh(type):'',type??'',category?CATEGORY_ZH[category]:'',desc].join(' ').toLowerCase()};
}

const STAT_ZH=[['hp','HP'],['atk','攻击'],['def','防御'],['spa','特攻'],['spd','特防'],['spe','速度']] as const;
function buildSpecies(id:string):WikiEntry {
  const sp=SPECIES[id],zh=speciesZh(id),types=sp.types??[];
  const blocks:WikiBlock[]=[];
  const facts:{label:string;text:string}[]=[{label:'属性',text:types.map(typeLink).join('　')||'—'},{label:'图鉴编号',text:sp.dex}];
  const prevo=sp.prevo&&SPECIES[sp.prevo]?sp.prevo:null,evos=(sp.evos??[]).filter(e=>!!SPECIES[e]);
  if(prevo)facts.push({label:'进化自',text:link('species:'+prevo,speciesZh(prevo))});
  if(evos.length)facts.push({label:'进化为',text:evos.map(e=>link('species:'+e,speciesZh(e))).join('　')});
  if(prevo||evos.length)facts.push({label:'进化等级',text:'Lv'+sp.evoLevel});
  if(sp.starter)facts.push({label:'初始伙伴',text:'可作新游戏的主控或副手'});
  if(sp.legendary)facts.push({label:'传说／幻',text:'在名单里，但不作野生出现'});
  if(sp.availability)facts.push({label:'出场',text:sp.availability});
  blocks.push({t:'facts',rows:facts});
  if(sp.baseStats)blocks.push({t:'stats',rows:STAT_ZH.map(([k,label])=>({label,value:sp.baseStats![k]}))});
  blocks.push({t:'chips',label:'初始招式',ids:sp.kit.map(m=>'moves:'+m.move)});
  if(sp.levelUp.length)blocks.push({t:'learnset',rows:sp.levelUp.map(m=>({level:m.level,move:m.move}))});
  const taught=sp.learnable.map(m=>m.move).filter(m=>!sp.kit.some(k=>k.move===m)&&!sp.levelUp.some(l=>l.move===m));
  blocks.push({t:'chips',label:'可学招式（招式机等）',ids:taught.map(m=>'moves:'+m)});
  return {id:'species:'+id,cat:'species',key:id,title:zh,subtitle:types.map(typeZh).join('／'),rules:['G12.1'],blocks,meta:{kind:'species',species:id,dex:sp.dex,types:[...types]},
    search:[zh,sp.name,id,sp.dex,types.map(typeZh).join(' '),types.join(' ')].join(' ').toLowerCase()};
}

const ITEM_IDS=Object.keys(ITEM_DESCRIPTIONS) as Item[];
function buildItem(item:Item):WikiEntry {
  const zh=ITEM_NAMES[item]??itemZh(item),blocks:WikiBlock[]=[{t:'p',text:ITEM_DESCRIPTIONS[item]}];
  const cures=ITEM_CURES[item];
  if(cures?.length)blocks.push({t:'facts',rows:[{label:'解除',text:cures.map(k=>link('status:'+k,STATUS_NAMES[k])).join('　')}]});
  for(const line of source.itemNotes?.[item]??[])blocks.push({t:'p',text:line});
  return {id:'items:'+item,cat:'items',key:item,title:zh,subtitle:'',rules:['G9.1'],blocks,meta:{kind:'item',item},search:[zh,item,ITEM_DESCRIPTIONS[item]].join(' ').toLowerCase()};
}

function buildBlessing(id:BlessingId):WikiEntry {
  const b=BLESSINGS[id],rarity=BLESSING_RARITY.names[b.rarity];
  const blocks:WikiBlock[]=[{t:'p',text:b.description},{t:'facts',rows:[{label:'稀有度',text:rarity},{label:'可抽到的层',text:b.floors.map(f=>'第 '+f+' 层').join('、')}]}];
  return {id:'blessings:'+id,cat:'blessings',key:id,title:b.name,subtitle:rarity,rules:['G3.12'],blocks,meta:{kind:'blessing',blessing:id,rarity:b.rarity},search:[b.name,id,rarity,b.description].join(' ').toLowerCase()};
}

const FIXED_RANGES:MoveRange[]=['front','front2','line10','around','room','user'];
function tableBlock(kind:string,statKey?:string):WikiBlock|null {
  const signed=(n:number)=>n>0?'+'+n:n<0?'−'+Math.abs(n):'0';
  if(kind==='attack'||kind==='defence'){
    const table=kind==='attack'?ATTACK_STAGE_256:DEFENCE_STAGE_256;
    return {t:'table',kind:'stage',head:['阶段','倍率（1/256）','约'],rows:table.map((n,i)=>[signed(i-STAGE_LIMIT),String(n),'×'+(n/256).toFixed(2)])};
  }
  if(kind==='accuracy'){
    const rows:string[][]=[],L=ACCURACY_STAGE_LIMIT;
    if(statKey==='eva'){   // G5.1: n = attacker accuracy stage - defender evasion stage, so a defender at evasion e gives the attacker multiplier(-e)
      for(let e=-L;e<=L;e++)rows.push([signed(e),'×'+accuracyMultiplier(-e).toFixed(2),e===0?'基础':e>0?'更难被打中':'更容易被打中']);
      return {t:'table',kind:'stage',head:['守方闪避阶段','对方命中倍率','说明'],rows};
    }
    for(let n=-L;n<=L;n++)rows.push([signed(n),'×'+accuracyMultiplier(n).toFixed(2),n===0?'基础':n>0?'更易命中':'更难命中']);
    return {t:'table',kind:'stage',head:['命中阶段差','命中倍率','说明'],rows};
  }
  if(kind==='typechart'){
    const types=(chartSource as unknown as {types:string[]}).types,eff=(chartSource as unknown as {effectiveness:Record<string,Record<string,number>>}).effectiveness;
    const cell=(a:string,d:string)=>{const v=eff[a]?.[d]??1;return v===1?'·':v===0?'×0':v===2?'×2':'×0.5';};
    return {t:'table',kind:'chart',head:['招式/对方',...types.map(typeZh)],rows:types.map(a=>[typeZh(a),...types.map(d=>cell(a,d))])};
  }
  if(kind==='ranges'){
    return {t:'ranges',rows:FIXED_RANGES.map(range=>{const example=Object.keys(MOVE_DEFS).find(id=>MOVE_DEFS[id].range===range&&!!MOVE_DEFS[id].power)??Object.keys(MOVE_DEFS).find(id=>MOVE_DEFS[id].range===range)??'';return {range,label:example?moveRangeLabel(example):range,example};})};
  }
  return null;
}

function buildText(e:TextEntry,tokens:Record<string,string>):WikiEntry {
  const [cat,key]=e.id.split(':');
  const blocks:WikiBlock[]=e.body.map(text=>({t:'p' as const,text:fill(text,tokens)}));
  if(e.table){const t=tableBlock(e.table,e.stat);if(t)blocks.push(t);}
  return {id:e.id,cat,key,title:e.title,subtitle:'',rules:e.rules,todo:e.todo?e.todoNote??'待核对':undefined,blocks,meta:{kind:'text'},
    search:[e.title,...blocks.map(b=>b.t==='p'?b.text.replace(WIKI_LINK,(_m,_i,l)=>l??''):'')].join(' ').toLowerCase()};
}

let cache:{categories:WikiCategory[];byId:Map<string,WikiEntry>}|null=null;
function build() {
  if(cache)return cache;
  const tokens=wikiTokens();
  const entries:WikiEntry[]=[];
  for(const e of source.entries)entries.push(buildText(e,tokens));
  const moves=wikiMoveIds().map(buildMove);
  const species=Object.values(SPECIES).sort((a,b)=>a.dex.localeCompare(b.dex)).map(s=>buildSpecies(s.id));
  const items=ITEM_IDS.map(buildItem);
  const rarityRank=(id:BlessingId)=>BLESSING_RARITY.order.indexOf(BLESSINGS[id].rarity);
  const blessings=(Object.keys(BLESSINGS) as BlessingId[]).sort((a,b)=>rarityRank(a)-rarityRank(b)||BLESSINGS[a].name.localeCompare(BLESSINGS[b].name,'zh')).map(buildBlessing);
  const generated:Record<string,WikiEntry[]>={moves,species,items,blessings};
  // Status and stage entries also list the moves and items that touch them.
  const byStatus=(id:StatusId)=>moves.filter(m=>moveLinks.get((m.meta as {move:string}).move)?.statuses.has(id)).map(m=>m.id);
  const byStage=(k:StageKey)=>moves.filter(m=>moveLinks.get((m.meta as {move:string}).move)?.stages.has(k)).map(m=>m.id);
  for(const e of entries){
    if(e.cat==='status'){
      const id=e.key as StatusId;
      const items=ITEM_IDS.filter(i=>ITEM_CURES[i]?.includes(id)).map(i=>'items:'+i);
      if(items.length)e.blocks.push({t:'chips',label:'可解除的道具',ids:items});
      const ms=byStatus(id);if(ms.length)e.blocks.push({t:'chips',label:'会造成这种状态的招式',ids:ms});
    }
    if(e.cat==='stages'&&e.key in STAGE_LINK){const ms=byStage(e.key as StageKey);if(ms.length)e.blocks.push({t:'chips',label:'会改变它的招式',ids:ms});}
  }
  const categories:WikiCategory[]=source.categories.map(c=>({id:c.id,name:c.name,intro:c.intro,rules:c.rules,
    entries:c.source==='text'?entries.filter(e=>e.cat===c.id):generated[c.source]??[]}));
  const byId=new Map<string,WikiEntry>();
  for(const c of categories)for(const e of c.entries)byId.set(e.id,e);
  cache={categories,byId};return cache;
}
export const wikiCategories=():WikiCategory[]=>build().categories;
export const wikiEntry=(id:string):WikiEntry|undefined=>build().byId.get(id);
/** `moves:__list` style ids name a whole category. */
export const wikiCategory=(id:string):WikiCategory|undefined=>build().categories.find(c=>c.id===id);
export const isCategoryLink=(id:string)=>id.endsWith(':__list');
export const wikiEntryIds=():string[]=>[...build().byId.keys()];
/** Entries of one category that match every space-separated word of the query (Chinese name, English id, type and the like). */
export function searchWiki(cat:string,query:string):WikiEntry[] {
  const c=wikiCategory(cat);if(!c)return [];
  const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.length?c.entries.filter(e=>words.every(w=>e.search.includes(w))):c.entries;
}
export const wikiRuleIds=():string[]=>[...new Set([...source.categories.flatMap(c=>c.rules),...source.entries.flatMap(e=>e.rules)])];
