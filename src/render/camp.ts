import {availableTalentPoints,instanceOf,learnTm,rankLevel,rankThreshold,TALENT_MAX_RANK,TALENTS,MAX_CARRY,MAX_TEAM,type Profile,type SettleSummary,type TalentId} from '../core/base.ts';
import {ALL_TM_MOVES,learnableMove,SPECIES} from '../core/roster.ts';
import {THEME_FLOORS,type Difficulty} from '../core/dungeon.ts';
import {TACTICS,TACTIC_LABELS,type Tactic} from '../core/tactics.ts';
import {moveZh,speciesZh,typeZh} from '../core/names.ts';
import {type Skill,type World} from '../core/engine.ts';
import {moveCategory,moveOf} from '../core/moves.ts';
import {portrait} from '../ui/title.ts';
import {standingSprite,starterStandee} from '../ui/title-shell.ts';
import {sheet} from './sprites.ts';
import {starterMoveFields} from './hud.ts';
import './camp.css';

export const CAMP_BUILDINGS = {
  party: {name:'伙伴小屋', keeper:'chansey', feet:[316,306]},
  vault: {name:'仓库', keeper:'snorlax', feet:[960,318]},
  talents: {name:'天赋石碑'},
  records: {name:'记录板'},
} as const;
export type CampPanel = keyof typeof CAMP_BUILDINGS;
export type VaultState = {
  tab:'tm'|'shards';
  by:'type'|'category';
  filter:string;
  move:string|null;
  learner:string|null;
  shard:string|null;
};
export type CampReport = {world:World;summary:SettleSummary|null}|null;

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!)
);
const CAMP_WIDTH = 1280, CAMP_HEIGHT = 720;
const CAMP_SPOTS = {
  gate: [579, 0, 117, 104],
  party: [196, 75, 225, 217],
  vault: [858, 88, 283, 212],
  talents: [183, 429, 238, 225],
  records: [862, 462, 221, 162],
} as const;
const KEEPER_VISIBLE_HEIGHT = {chansey:26, snorlax:38} as const;
const TYPE_COLORS:Record<string,string>={Normal:'#5f5e50',Water:'#2b5f8a',Fire:'#a8482a',Grass:'#3f7a3a',Electric:'#9a7a24',Ice:'#4f8196',Fighting:'#963f45',Poison:'#765196',Ground:'#86643b',Flying:'#54799b',Psychic:'#a25891',Bug:'#55753a',Rock:'#776749',Ghost:'#5b4e81',Dragon:'#4f4c9b',Dark:'#49413b',Steel:'#627381',Fairy:'#9d6688'};
const DIFFICULTY_LABEL:Record<Difficulty,string>={easy:'简单',normal:'普通',hard:'困难'};

function spotPosition(x:number,y:number):string {
  return 'left:'+(x/CAMP_WIDTH*100)+'%;top:'+(y/CAMP_HEIGHT*100)+'%';
}
function hotspot([x,y,width,height]:readonly [number,number,number,number]):string {
  return spotPosition(x,y)+';width:'+(width/CAMP_WIDTH*100)+'%;height:'+(height/CAMP_HEIGHT*100)+'%';
}
function campStandee(species:string):string {
  const dex=SPECIES[species]?.dex??'';
  const starter=starterStandee(dex);
  if(starter)return starter;
  const frame=sheet(dex,'Idle'),keeperHeight=KEEPER_VISIBLE_HEIGHT[species as keyof typeof KEEPER_VISIBLE_HEIGHT];
  return frame&&keeperHeight?standingSprite(dex,frame.w,frame.h,frame.durations.length,keeperHeight):portrait(species);
}

export function campScene(profile:Profile,ready:boolean,message:string):string {
  const team=profile.team.map(id=>{
    const member=instanceOf(profile,id);
    return member?'<span aria-label="'+escape(speciesZh(member.species))+'">'+portrait(member.species)+'</span>':'';
  }).join('');
  const level=rankLevel(profile.rankExp),floor=rankThreshold(level),next=rankThreshold(level+1);
  const earned=Math.max(0,Math.min(next-floor,profile.rankExp-floor)),needed=next-floor;
  const progress=needed>0?Math.round(earned/needed*100):0;
  const hasSpendableTalent=Object.keys(TALENTS).some(talent=>(profile.talents[talent as TalentId]??0)<TALENT_MAX_RANK);
  const canSpendTalentPoints=availableTalentPoints(profile)>0&&hasSpendableTalent;
  const panels=Object.keys(CAMP_BUILDINGS) as CampPanel[];
  const buildings=panels.map(id=>{
    const building=CAMP_BUILDINGS[id],spot=CAMP_SPOTS[id], [x,y,width,height]=spot;
    const keeper='keeper' in building
      ? '<span class="camp-keeper" aria-hidden="true" style="left:'+((building.feet[0]-x)/width*100)+'%;top:'+((building.feet[1]-y)/height*100)+'%">'+campStandee(building.keeper)+'</span>'
      : '';
    const showAlert=id==='talents'&&canSpendTalentPoints;
    const alert=showAlert
      ? '<span class="camp-alert" aria-hidden="true">!</span>'
      : '';
    const accessibleName=building.name+(showAlert?'，有未使用天赋点':'');
    return '<button type="button" class="camp-hotspot camp-building" id="camp-open-'+id+'" aria-haspopup="dialog" aria-label="'+escape(accessibleName)+'" style="'+hotspot(spot)+'">'+
      '<span class="camp-spot-label"><strong>'+escape(building.name)+'</strong>'+alert+'</span>'+keeper+'</button>';
  }).join('');
  return '<div id="base" class="camp-scene">'+
    '<div class="camp-map" style="background-image:url(assets/camp/base.png)">'+
      '<button type="button" id="depart" class="camp-hotspot camp-gate" aria-label="迷宫入口，出发" data-confirm="true" style="'+hotspot(CAMP_SPOTS.gate)+'" '+(ready?'':'disabled')+'>'+
        '<span class="camp-spot-label"><strong>迷宫入口</strong></span>'+
      '</button>'+
      '<div class="camp-squad" aria-label="出发阵容" style="'+spotPosition(638,462)+'">'+team+'</div>'+buildings+
    '</div>'+
    '<div class="camp-badge"><div class="camp-badge-line"><strong>探险队 Lv'+level+'</strong><span>远征 '+profile.expeditions+' 次</span></div>'+
      '<div class="camp-rank-progress" role="progressbar" aria-label="探险队经验" aria-valuemin="0" aria-valuemax="'+needed+'" aria-valuenow="'+earned+'"><span class="camp-rank-track" aria-hidden="true"><i style="width:'+progress+'%"></i></span><span class="camp-rank-count">'+earned+'/'+needed+'</span></div></div>'+
    '<button type="button" id="camp-menu" class="camp-menu" aria-label="营地菜单">菜单</button>'+message+
  '</div>';
}

export function campPanelMarkup(panel:CampPanel,content:string,message:string):string {
  const building=CAMP_BUILDINGS[panel];
  if(panel!=='talents'){
    return '<dialog id="camp-dialog" class="camp-dialog camp194-paper-dialog camp194-'+panel+'-dialog" data-camp-panel="'+panel+'" aria-labelledby="camp-dialog-heading">'+
      '<div class="camp194-paper-shell">'+
        '<h2 id="camp-dialog-heading" class="camp194-plaque">'+escape(building.name)+'</h2>'+
        '<button type="button" id="camp-close" class="camp194-close" aria-label="关闭'+escape(building.name)+'">×</button>'+
        message+
        '<div class="camp194-paper-content">'+content+'</div>'+
        '<div id="camp-move-tooltip" class="camp194-move-tooltip" role="tooltip" hidden></div>'+
          '</div>'+
    '</dialog>';
  }
  return '<dialog id="camp-dialog" class="camp-dialog" data-camp-panel="'+panel+'" aria-labelledby="camp-dialog-heading">'+
    '<div class="camp-dialog-layout"><div class="camp-dialog-main">'+
      '<div class="camp-dialog-heading"><h2 id="camp-dialog-heading">'+escape(building.name)+'</h2>'+
        '<button type="button" id="camp-close" aria-label="关闭'+escape(building.name)+'">×</button></div>'+
      message+'<div class="camp-dialog-content">'+content+'</div>'+
    '</div></div>'+
  '</dialog>';
}

const tacticRects:Record<Tactic,string>={
  together:'<rect x="2" y="4" width="3" height="3"/><rect x="7" y="4" width="3" height="3"/><rect x="2" y="8" width="3" height="2"/><rect x="7" y="8" width="3" height="2"/>',
  followme:'<rect x="1" y="5" width="7" height="2"/><rect x="6" y="3" width="2" height="6"/><rect x="8" y="4" width="2" height="4"/><rect x="10" y="5" width="1" height="2"/>',
  gofoes:'<rect x="8" y="1" width="3" height="2"/><rect x="6" y="3" width="3" height="2"/><rect x="4" y="5" width="3" height="2"/><rect x="2" y="7" width="3" height="2"/><rect x="1" y="9" width="2" height="2"/>',
  wait:'<rect x="3" y="1" width="2" height="10"/><rect x="5" y="1" width="6" height="5"/>',
  nomoves:'<rect x="5" y="1" width="2" height="10"/><rect x="1" y="5" width="10" height="2"/><rect x="1" y="1" width="2" height="2"/><rect x="9" y="9" width="2" height="2"/>',
  avoid:'<rect x="1" y="5" width="4" height="2"/><rect x="7" y="5" width="4" height="2"/><rect x="1" y="3" width="2" height="6"/><rect x="9" y="3" width="2" height="6"/>',
};
function tacticIcon(tactic:Tactic):string {
  return '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">'+tacticRects[tactic]+'</svg>';
}
function typeColor(type:string):string {return TYPE_COLORS[type]??'#5f5e50';}
function speciesTypes(species:string):string {
  return (SPECIES[species]?.types??[]).map(type=>'<span class="paper-type" style="background:'+typeColor(type)+'">'+escape(typeZh(type))+'</span>').join('');
}
function moveFields(move:string) {
  const fields=starterMoveFields(move as Skill),category=moveCategory(move);
  return {...fields,power:moveOf(move)?.power??fields.power,category:category==='Physical'?'物理':category==='Special'?'特殊':category==='Status'?'变化':fields.category};
}
function moveMaxPp(move:string):number|undefined {
  for(const species of Object.values(SPECIES)){
    const known=learnableMove(species.id,move);
    if(known)return known.pp;
  }
  return undefined;
}
function memberMarkup(species:string,className:string):string {
  return portrait(species).replace('portrait-box',className+' portrait-box');
}
function instanceName(profile:Profile,id:string):string {
  const member=instanceOf(profile,id);
  return member?speciesZh(member.species):id;
}
function moveTile(move:string,pp:number,instanceId:string,carried:boolean,disabled:boolean):string {
  const fields=moveFields(move);
  return '<button type="button" class="camp194-move-tile" id="carry-'+escape(instanceId)+'-'+escape(move)+'" data-camp-move="'+escape(move)+'" aria-pressed="'+(carried?'true':'false')+'" aria-label="'+escape(moveZh(move)+'，'+fields.category+'，PP '+pp)+'" '+(disabled?'disabled':'')+'>'+
    '<span class="camp194-move-type" style="background:'+typeColor(fields.type)+'">'+escape(typeZh(fields.type))+'</span>'+
    '<strong>'+escape(moveZh(move))+'</strong><span class="camp194-move-category">'+escape(fields.category)+'</span><b>'+pp+'</b></button>';
}

export function campParty194(profile:Profile,ready:boolean,selectedId:string):string {
  const selected=instanceOf(profile,selectedId)??profile.roster[0]??null;
  const teamMembers=profile.team.map(id=>instanceOf(profile,id)).filter((m):m is NonNullable<typeof m>=>!!m).slice(0,MAX_TEAM);
  const slots=teamMembers.map((member,index)=>{
    const id=escape(member.id),name=escape(speciesZh(member.species)),leader=profile.leader===member.id;
    return '<button type="button" id="camp-party-slot-'+id+'" class="camp194-team-slot'+(leader?' is-leader':'')+'" data-camp-member="'+id+'" aria-pressed="'+(selected?.id===member.id?'true':'false')+'">'+
      '<span class="camp194-order">'+(index+1)+'</span>'+(leader?'<span class="camp194-lead-tag">操控</span>':'')+
      memberMarkup(member.species,'camp194-team-portrait')+'<strong>'+name+'</strong></button>';
  }).join('');
  const emptySlots=Array(Math.max(0,MAX_TEAM-teamMembers.length)).fill('<div class="camp194-team-slot is-empty" aria-hidden="true"><span>＋</span></div>').join('');
  const roster=profile.roster.map(member=>{
    const inTeam=profile.team.includes(member.id),order=inTeam?profile.team.indexOf(member.id)+1:0;
    const name=speciesZh(member.species);
    return '<div class="camp194-roster-card">'+
      '<button type="button" id="camp-party-member-'+escape(member.id)+'" class="camp194-roster-select" data-camp-member="'+escape(member.id)+'" aria-label="'+escape(name)+'" aria-pressed="'+(selected?.id===member.id?'true':'false')+'">'+
        (order?'<span class="camp194-roster-order">'+order+'</span>':'')+memberMarkup(member.species,'camp194-roster-portrait')+'<strong>'+escape(name)+'</strong></button>'+
      '</div>';
  }).join('');
  const rosterGrid=roster+Array(Math.max(0,21-profile.roster.length)).fill('<div class="camp194-roster-placeholder" aria-hidden="true"></div>').join('');
  if(!selected){
    return '<div class="camp194-party"><div class="camp194-greeting">'+memberMarkup('chansey','camp194-greeting-portrait')+
      '<p>大家都在这里休息。要带谁出发呢？</p></div><p class="camp194-empty">档案中没有伙伴。</p></div>';
  }
  const inTeam=profile.team.includes(selected.id),leader=profile.leader===selected.id;
  const carry=selected.carry.map(move=>{
    const learned=selected.learned.find(item=>item.move===move);
    return learned?moveTile(move,learned.pp,selected.id,true,!ready):'';
  }).join('');
  const pool=selected.learned.filter(item=>!selected.carry.includes(item.move)).map(item=>
    moveTile(item.move,item.pp,selected.id,false,!ready)
  ).join('');
  const tacticButtons=TACTICS.map(tactic=>'<button type="button" id="camp-tactic-'+escape(selected.id)+'-'+tactic+'" class="camp194-tactic" data-camp-tactic="'+tactic+'" aria-pressed="'+(selected.tactic===tactic?'true':'false')+'" '+(ready?'':'disabled')+'>'+
    tacticIcon(tactic)+'<span>'+escape(TACTIC_LABELS[tactic])+'</span></button>').join('');
  return '<div class="camp194-party">'+
    '<div class="camp194-party-left">'+
      '<div class="camp194-greeting">'+memberMarkup('chansey','camp194-greeting-portrait')+'<p>大家都在这里休息。要带谁出发呢？</p></div>'+
      '<section class="camp194-team-block" aria-label="出发阵容">'+
        '<div class="camp194-section-heading"><h3>出发阵容</h3><span>'+teamMembers.length+'/'+MAX_TEAM+'</span></div>'+
        '<div class="camp194-team-slots">'+slots+emptySlots+'</div>'+
      '</section>'+
      '<section class="camp194-roster-block" aria-label="全部伙伴">'+
        '<div class="camp194-section-heading"><h3>全部伙伴</h3><span>'+profile.roster.length+' 只</span></div>'+
        '<div class="camp194-roster" id="camp-party-roster" data-camp-scroll>'+rosterGrid+'</div>'+
      '</section>'+
    '</div>'+
    '<section class="camp194-party-detail" aria-label="'+escape(instanceName(profile,selected.id))+'的伙伴资料">'+
      '<header class="camp194-member-heading">'+memberMarkup(selected.species,'camp194-member-portrait')+
        '<div class="camp194-member-name"><h3>'+escape(speciesZh(selected.species))+'</h3><div class="camp194-types">'+speciesTypes(selected.species)+'</div></div>'+
        '<div class="camp194-member-actions"><button type="button" id="team-'+escape(selected.id)+'" '+(ready&&!(inTeam?profile.team.length<=1:profile.team.length>=MAX_TEAM)?'':'disabled')+'>'+
          (inTeam?'留在营地':'加入队伍')+'</button><button type="button" id="lead-'+escape(selected.id)+'" '+(ready&&inTeam&&!leader?'':'disabled')+'>设为操控</button></div>'+
      '</header>'+
      '<section class="camp194-tactics-block" aria-label="作战方针"><h3>作战方针</h3><div class="camp194-tactics">'+tacticButtons+'</div></section>'+
      '<div class="camp194-move-groups">'+
        '<section class="camp194-move-group"><div class="camp194-section-heading"><h3>携带招式</h3><span>'+selected.carry.length+'/'+MAX_CARRY+'</span></div>'+
          '<div class="camp194-carry-grid" id="camp-party-carry" data-camp-scroll>'+carry+Array(Math.max(0,MAX_CARRY-selected.carry.length)).fill('<div class="camp194-move-empty" aria-hidden="true"></div>').join('')+'</div></section>'+
        '<section class="camp194-move-group"><div class="camp194-section-heading"><h3>已学会</h3><span>'+selected.learned.length+' 招</span></div>'+
          '<div class="camp194-move-pool" id="camp-party-learned" data-camp-scroll>'+ (pool||'<p class="camp194-no-moves">已全部携带</p>')+'</div></section>'+
      '</div>'+
    '</section>'+
  '</div>';
}

function tmFilters(by:'type'|'category'):string[] {
  const values=ALL_TM_MOVES.map(move=>moveFields(move));
  const filters=Array.from(new Set(values.map(f=>by==='type'?f.type:f.category)));
  return filters;
}
function filteredMoves(by:'type'|'category',filter:string):string[] {
  return ALL_TM_MOVES.filter(move=>{
    const fields=moveFields(move);
    return filter==='all'||(by==='type'?fields.type:fields.category)===filter;
  });
}
function shardsOf(profile:Profile):[string,number][] {
  return Object.entries(profile.shards).filter(([species,count])=>!!SPECIES[species]&&Number.isInteger(count)&&count>0) as [string,number][];
}
function canLearn(profile:Profile,instanceId:string,move:string):boolean {
  return (profile.vault[move]??0)>0&&learnTm(profile,instanceId,move).ok;
}
export function normalizeVault194(profile:Profile,state:Partial<VaultState>|null|undefined):VaultState {
  const tab=state?.tab==='shards'?'shards':'tm';
  const by=state?.by==='category'?'category':'type';
  const filters=tmFilters(by);
  let filter=typeof state?.filter==='string'?state.filter:'all';
  if(filter!=='all'&&!filters.includes(filter))filter='all';
  let moves=filteredMoves(by,filter);
  if(!moves.length&&filter!=='all'){filter='all';moves=filteredMoves(by,filter);}
  const move=state?.move&&moves.includes(state.move)?state.move:moves[0]??null;
  const shards=shardsOf(profile);
  const shard=state?.shard&&shards.some(([id])=>id===state.shard)?state.shard:shards[0]?.[0]??null;
  const learners=move?profile.roster.filter(member=>canLearn(profile,member.id,move)):[];
  const learner=state?.learner&&learners.some(member=>member.id===state.learner)?state.learner:learners[0]?.id??null;
  return {tab,by,filter,move,learner,shard};
}

function vaultMoveTile(profile:Profile,move:string,selected:boolean):string {
  const fields=moveFields(move),count=Math.max(0,profile.vault[move]??0);
  return '<button type="button" class="camp194-tm-tile'+(count?'':' is-empty')+'" id="tm-'+escape(move)+'" data-camp-move="'+escape(move)+'" aria-pressed="'+(selected?'true':'false')+'" aria-label="'+escape(moveZh(move)+'，库存 '+count)+'">'+
    '<span class="camp194-tm-disc" aria-hidden="true" style="--tm-color:'+typeColor(fields.type)+'"></span>'+
    '<strong>'+escape(moveZh(move))+'</strong><span class="camp194-tm-count">×'+count+'</span></button>';
}
function shardTile(species:string,count:number,selected:boolean):string {
  return '<button type="button" id="camp-vault-shard-'+escape(species)+'" class="camp194-shard-tile" data-vault-shard="'+escape(species)+'" aria-pressed="'+(selected?'true':'false')+'">'+
    memberMarkup(species,'camp194-shard-portrait')+'<strong>'+escape(speciesZh(species))+'碎片</strong><span>×'+count+'</span></button>';
}
function vaultLearningChoices(profile:Profile,move:string,selectedId:string|null):string {
  const stock=profile.vault[move]??0;
  return profile.roster.map(member=>{
    const learned=member.learned.some(item=>item.move===move),valid=canLearn(profile,member.id,move);
    const status=stock<1?'库存为 0':learned?'已学会':valid?'可学习':'无法学习';
    return '<button type="button" id="camp-vault-learner-'+escape(member.id)+'" class="camp194-learner'+(valid?'':' is-disabled')+'" data-vault-learner="'+escape(member.id)+'" aria-pressed="'+(selectedId===member.id?'true':'false')+'" '+(valid?'':'disabled')+'>'+
      memberMarkup(member.species,'camp194-learner-portrait')+'<strong>'+escape(speciesZh(member.species))+'</strong><span>'+status+'</span></button>';
  }).join('');
}
function moveDetail(profile:Profile,move:string,state:VaultState,ready:boolean):string {
  const fields=moveFields(move),member=state.learner?instanceOf(profile,state.learner):undefined;
  const maximum=(member?learnableMove(member.species,move)?.pp:undefined)??moveMaxPp(move);
  const stock=profile.vault[move]??0,learner=member?speciesZh(member.species):'';
  const canStudy=ready&&stock>0&&!!state.learner&&canLearn(profile,state.learner,move);
  return '<section class="camp194-vault-detail" aria-label="'+escape(moveZh(move))+'招式机详情">'+
    '<header class="camp194-vault-title"><h3>'+escape(moveZh(move))+'</h3><span class="paper-type" style="background:'+typeColor(fields.type)+'">'+escape(typeZh(fields.type))+'</span><span class="camp194-category">'+escape(fields.category)+'</span></header>'+
    '<div class="camp194-move-facts"><div class="camp194-scope">'+fields.scope+'</div><dl>'+
      '<div><dt>属性</dt><dd>'+escape(typeZh(fields.type))+'</dd></div><div><dt>分类</dt><dd>'+escape(fields.category)+'</dd></div>'+
      '<div><dt>威力</dt><dd>'+escape(fields.power)+'</dd></div><div><dt>命中</dt><dd>'+escape(fields.accuracy)+'</dd></div>'+
      '<div><dt>PP上限</dt><dd>'+(maximum??'—')+'</dd></div><div><dt>射程</dt><dd>'+escape(fields.range)+'</dd></div>'+
      '<div><dt>范围</dt><dd>'+escape(fields.target)+'</dd></div></dl></div>'+
    '<p class="camp194-move-description">'+escape(fields.description||'没有招式说明。')+'</p>'+
    '<section class="camp194-learners" aria-label="学习对象"><div class="camp194-section-heading"><h3>学习对象</h3><span>库存 ×'+stock+'</span></div>'+
      '<div class="camp194-learner-list" id="camp-vault-learners" data-camp-scroll>'+vaultLearningChoices(profile,move,state.learner)+'</div></section>'+
    '<button type="button" class="camp194-learn-button" id="learn-'+escape(state.learner??'none')+'" '+(canStudy?'':'disabled')+'>'+
      (learner?'由'+escape(learner)+'学习':'学习')+'</button>'+
  '</section>';
}
function shardDetail(profile:Profile,shard:string|null):string {
  if(!shard)return '<section class="camp194-vault-detail"><p class="camp194-empty">目前没有伙伴碎片。</p></section>';
  const count=profile.shards[shard]??0;
  return '<section class="camp194-vault-detail" aria-label="'+escape(speciesZh(shard))+'碎片详情">'+
    '<header class="camp194-vault-title">'+memberMarkup(shard,'camp194-shard-detail-portrait')+'<h3>'+escape(speciesZh(shard))+'碎片</h3></header>'+
    '<dl class="camp194-shard-facts"><div><dt>持有</dt><dd>×'+count+'</dd></div><div><dt>来源</dt><dd>重复招募已有伙伴</dd></div></dl>'+
    '<p class="camp194-move-description">伙伴碎片目前只记录数量。</p>'+
  '</section>';
}
export function campVault194(profile:Profile,ready:boolean,state:VaultState):string {
  const view=normalizeVault194(profile,state),shards=shardsOf(profile);
  const filters=tmFilters(view.by).map(value=>{
    const name=view.by==='type'?typeZh(value):value;
    const color=view.by==='type'?' style="--filter-color:'+typeColor(value)+'"':'';
    return '<button type="button" id="camp-vault-filter-'+escape(value)+'" class="camp194-filter-chip" data-vault-filter="'+escape(value)+'" aria-pressed="'+(view.filter===value?'true':'false')+'"'+color+'>'+escape(name)+'</button>';
  }).join('');
  const types=filteredMoves(view.by,view.filter);
  const tmList=types.length?types.map(move=>vaultMoveTile(profile,move,view.move===move)).join(''):'<p class="camp194-empty">没有符合条件的招式机。</p>';
  const shardList=shards.length?shards.map(([species,count])=>shardTile(species,count,view.shard===species)).join(''):'<p class="camp194-empty">目前没有伙伴碎片。</p>';
  const detail=view.tab==='tm'&&view.move?moveDetail(profile,view.move,view,ready):view.tab==='shards'?shardDetail(profile,view.shard):'<section class="camp194-vault-detail"><p class="camp194-empty">没有可显示的招式机。</p></section>';
  return '<div class="camp194-vault">'+
    '<div class="camp194-vault-left">'+
      '<div class="camp194-greeting">'+memberMarkup('snorlax','camp194-greeting-portrait')+'<p>……呼噜……带回来的东西都放好了……</p></div>'+
      '<div class="camp194-vault-tabs" role="tablist" aria-label="仓库分类">'+
        '<button type="button" id="camp-vault-tab-tm" role="tab" data-vault-tab="tm" aria-selected="'+(view.tab==='tm'?'true':'false')+'">招式机 <span>共 '+Object.values(profile.vault).reduce((sum,n)=>sum+Math.max(0,n),0)+'</span></button>'+
        '<button type="button" id="camp-vault-tab-shards" role="tab" data-vault-tab="shards" aria-selected="'+(view.tab==='shards'?'true':'false')+'">伙伴碎片 <span>共 '+shards.reduce((sum,row)=>sum+row[1],0)+'</span></button>'+
      '</div>'+
      (view.tab==='tm'?
        '<section class="camp194-tm-browser" aria-label="招式机">'+
          '<div class="camp194-filter-bar"><div class="camp194-filter-mode">'+
            '<button type="button" id="camp-vault-by-type" data-vault-by="type" aria-pressed="'+(view.by==='type'?'true':'false')+'">属性</button>'+
            '<button type="button" id="camp-vault-by-category" data-vault-by="category" aria-pressed="'+(view.by==='category'?'true':'false')+'">分类</button>'+
          '</div><div class="camp194-filters"><button type="button" id="camp-vault-filter-all" class="camp194-filter-chip" data-vault-filter="all" aria-pressed="'+(view.filter==='all'?'true':'false')+'">全部</button>'+filters+'</div></div>'+
          '<div class="camp194-tm-list" id="camp-vault-moves" data-camp-scroll>'+tmList+'</div>'+
        '</section>':
        '<section class="camp194-shard-browser" aria-label="伙伴碎片">'+
          '<div class="camp194-section-heading"><h3>伙伴碎片</h3><span>'+shards.reduce((sum,row)=>sum+row[1],0)+' 个</span></div>'+
          '<div class="camp194-shard-list" id="camp-vault-shards" data-camp-scroll>'+shardList+'</div>'+
        '</section>')+
    '</div>'+
    detail+
  '</div>';
}

function runLoot(report:CampReport):{partners:{id:string;species:string}[];shards:{species:string;count:number}[];tms:NonNullable<NonNullable<World['end']>['tms']>} {
  if(!report?.world.end)return {partners:[],shards:[],tms:[]};
  const original=new Set(Object.values(report.world.units).flatMap(unit=>unit.inst?[unit.inst]:unit.protected&&unit.id==='A'?['P1']:unit.protected&&unit.id==='B'?['P2']:[]));
  return {
    partners:(report.summary?.brought??[]).filter(member=>!original.has(member.id)),
    shards:report.summary?.shards??[],
    tms:(report.world.end.tms??[]),
  };
}
function recordLoot(report:CampReport):string {
  if(!report?.world.end)return '';
  const {partners,shards,tms}=runLoot(report);
  const rows=[
    ...partners.map(member=>'<li class="camp194-loot-tile">'+memberMarkup(member.species,'camp194-loot-portrait')+'<strong>新伙伴 · '+escape(speciesZh(member.species))+'</strong></li>'),
    ...shards.map(item=>'<li class="camp194-loot-tile">'+memberMarkup(item.species,'camp194-loot-portrait')+'<strong>'+escape(speciesZh(item.species))+'碎片 ×'+item.count+'</strong></li>'),
    ...tms.map(item=>'<li class="camp194-loot-tile'+(item.fate==='lost'?' is-lost':'')+'"><span class="camp194-tm-disc" aria-hidden="true" style="--tm-color:'+typeColor(moveFields(item.move).type)+'"></span><strong>'+escape(moveZh(item.move))+'招式机</strong><span>'+(item.fate==='lost'?'本局丢失':'带回营地')+'</span></li>'),
  ];
  return rows.length?rows.join(''):'<li class="camp194-record-empty">本局没有带回新伙伴、碎片或招式机。</li>';
}
export function campRecords194(profile:Profile,report:CampReport):string {
  const shardCount=shardsOf(profile).reduce((sum,row)=>sum+row[1],0);
  const last=report?.world.end?report:null;
  const lastWorld=last?.world,lastOutcome=lastWorld?.end?.outcome;
  const outcome=lastOutcome==='won'?'击败首领':lastOutcome==='wipe'?'全队倒下':'远征结束';
  const level=lastWorld?.dungeon?.level;
  const floor=Number.isInteger(level)?THEME_FLOORS[Math.max(0,Math.min(THEME_FLOORS.length-1,(level as number)-1))]?.name:null;
  const difficulty=lastWorld?.difficulty?DIFFICULTY_LABEL[lastWorld.difficulty]:null;
  const rank=last?.summary?.rank;
  const details=[floor,difficulty,rank?'探险队经验 +'+rank.total:null].filter(Boolean).map(value=>escape(value)).join(' · ');
  return '<div class="camp194-records">'+
    '<section class="camp194-cork-board" aria-label="记录板告示">'+
      '<div class="camp194-record-grid'+(last?' has-last':'')+'">'+
        '<div class="camp194-record-summary">'+
          '<article class="camp194-note camp194-note-expeditions"><h3>累计远征</h3><strong class="camp194-big">'+profile.expeditions+' 次</strong></article>'+
          '<article class="camp194-note camp194-note-profile"><h3>探险队</h3><strong class="camp194-big">Lv'+rankLevel(profile.rankExp)+'</strong>'+
            '<dl><div><dt>累计经验</dt><dd>'+profile.rankExp+'</dd></div><div><dt>名册伙伴</dt><dd>'+profile.roster.length+' 只</dd></div><div><dt>碎片</dt><dd>'+shardCount+' 个</dd></div></dl></article>'+
        '</div>'+
        (last?
          '<article class="camp194-note camp194-note-last"><h3>上一次远征</h3><strong class="camp194-result">'+outcome+'</strong>'+
            (details?'<p class="camp194-record-meta">'+details+'</p>':'')+
            '<ul class="camp194-record-loot" id="camp-record-loot" data-camp-scroll aria-label="本次实际收获">'+recordLoot(last)+'</ul></article>':'')+
      '</div>'+
    '</section>'+
  '</div>';
}

function departureMember(profile:Profile,id:string,index:number):string {
  const member=instanceOf(profile,id);
  if(!member)return '';
  return '<div class="camp194-depart-member">'+memberMarkup(member.species,'camp194-depart-portrait')+
    '<span class="camp194-order">'+(index+1)+'</span><strong>'+escape(speciesZh(member.species))+'</strong>'+
    (profile.leader===id?'<span class="camp194-depart-lead">操控</span>':'')+'</div>';
}
export function campDeparture194(profile:Profile,ready:boolean,difficultyMarkup:string,feedback:string):string {
  const team=profile.team.map((id,index)=>departureMember(profile,id,index)).join('');
  return '<dialog id="camp-departure" class="camp194-paper-dialog camp194-departure" data-camp-panel="departure" aria-labelledby="camp-departure-heading">'+
    '<div class="camp194-departure-shell">'+
      '<h2 id="camp-departure-heading" class="camp194-plaque">出发</h2>'+
      '<button type="button" id="depart-cancel" class="camp194-close" aria-label="取消出发">×</button>'+
            '<section class="camp194-depart-team" aria-label="出发阵容">'+(team||'<p class="camp194-empty">当前没有可出发的伙伴。</p>')+'</section>'+
      '<section class="camp194-depart-difficulty" aria-label="远征难度"><h3>远征难度</h3>'+difficultyMarkup+'</section>'+
      '<button type="button" id="depart-confirm" class="camp194-depart-confirm" '+(ready?'':'disabled')+'>进入迷宫</button>'+feedback+
    '</div>'+
  '</dialog>';
}

function genericMovePp(move:string,preferred?:number):string {
  return String(preferred??moveMaxPp(move)??'—');
}
export function campMoveTooltip194(move:string,pp?:number):string {
  const fields=moveFields(move);
  const description=fields.description||'没有招式说明。';
  const maximum=genericMovePp(move,pp);
  return '<section class="camp194-move-tip" aria-label="'+escape(moveZh(move))+'招式信息" style="--camp-move-color:'+typeColor(fields.type)+'">'+
    '<div class="camp194-tip-top">'+fields.scope+
      '<div class="camp194-tip-info"><header><strong>'+escape(moveZh(move))+'</strong><span class="paper-type" style="background:'+typeColor(fields.type)+'">'+escape(typeZh(fields.type))+'</span><span class="camp194-category">'+escape(fields.category)+'</span></header>'+
        '<dl><div><dt>威力</dt><dd>'+escape(fields.power)+'</dd></div><div><dt>命中</dt><dd>'+escape(fields.accuracy)+'</dd></div><div><dt>PP上限</dt><dd>'+maximum+'</dd></div><div><dt>射程</dt><dd>'+escape(fields.range)+'</dd></div><div><dt>范围</dt><dd>'+escape(fields.target)+'</dd></div></dl>'+
        '<p>'+escape(description)+'</p></div>'+
    '</div>'+
  '</section>';
}
