/** Playtest 1107: learn-a-move and recruit-invitation windows in the #194 paper style. Every number is visible without hovering. */
import {SPECIES} from '../core/roster.ts';
import {moveZh,typeZh} from '../core/names.ts';
import {moveEffectLabel,moveSummary,unitLabel,unitMoveLevel} from '../core/describe.ts';
import type {Unit,World} from '../core/engine.ts';
import {starterMoveFields,moveFactPairs} from './hud.ts';
import {TYPES,typeChips,unitPortrait} from './panels194.ts';

const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type CardOptions={tag?:string;key?:number;selected?:boolean;level?:number;button?:{id:string;disabled:boolean}};
/** One move card: type colour, category, power, accuracy, PP, range and the one-line effect text. */
export function moveCard(move:string,pp:number,maxPp:number,side:Unit['side'],o:CardOptions={}):string {
  const f=starterMoveFields(move),chip='<span class="paper-move-type" style="background:'+(TYPES[f.type]??'#5f5e50')+'">'+esc(typeZh(f.type))+'</span>';
  const inner=(o.tag?'<em class="c195-tag">'+esc(o.tag)+'</em>':'')+'<span class="c195-move-top">'+(o.key?'<kbd>'+o.key+'</kbd>':'')+chip+'<strong>'+esc(moveZh(move))+'</strong><span class="c195-cat">'+esc(f.category)+'</span></span>'+
   '<span class="c195-move-stats">'+moveFactPairs(f,pp+'/'+maxPp).map(([k,v])=>'<span>'+k+' <b>'+esc(v)+'</b></span>').join('')+'</span>';
  const cls='c195-move'+(o.selected?' is-selected':'')+(o.tag?' is-new':'');
  return o.button?'<button type="button" id="'+o.button.id+'"'+' class="'+cls+'" aria-pressed="'+!!o.selected+'"'+(o.button.disabled?' disabled':'')+'>'+inner+'</button>':'<div class="'+cls+'">'+inner+'</div>';
}
export function learningPanel(s:World,pending:NonNullable<World['pendingLearnMoves']>[number],unit:Unit,selected:string|null,ready:boolean):string {
  const name=unitLabel(unit,pending.actor),old=selected&&unit.learned.includes(selected)?selected:null;
  const cards=unit.learned.map((m,i)=>moveCard(m,unit.pp[m]??0,unit.maxPp[m]??0,unit.side,{level:unitMoveLevel(s,unit),key:i+1,selected:m===old,button:{id:'learn-replace-'+m,disabled:!ready}})).join('');
  return '<section class="paper-window c195 c195-learn" id="learning-choice" role="dialog" aria-labelledby="learning-heading"><h2 class="paper-plaque">新的招式</h2>'+
   '<div class="c195-scroll"><header class="c195-head">'+unitPortrait(unit,'c195-portrait')+'<div><div class="c195-learner-types" aria-label="学习者的属性">'+(unit.species&&SPECIES[unit.species]?typeChips(SPECIES[unit.species].types??[]):'')+'</div><h3 id="learning-heading" class="c195-title">'+esc(name)+'想学会'+esc(moveZh(pending.move))+'，要忘掉哪个招式？</h3></div></header>'+
   '<div class="c195-learn-grid"><div class="c195-col"><h4>新招式</h4>'+moveCard(pending.move,pending.pp,pending.pp,unit.side,{tag:'新',level:unitMoveLevel(s,unit)})+'</div><div class="c195-col"><h4>现有招式</h4><div class="c195-old">'+cards+'</div></div></div></div>'+
   '<footer class="c195-foot"><button type="button" id="learn-confirm" class="paper-button is-primary" data-confirm'+(!ready||!old?' disabled':'')+'>'+(old?'忘掉'+esc(moveZh(old))+'，学会'+esc(moveZh(pending.move)):'忘掉并学会')+'</button><button type="button" id="learn-skip" class="paper-button"'+(ready?'':' disabled')+'>不学</button></footer></section>';
}
/** A unit card for the invitation window: portrait, name, types, level, HP and each move with a one-line effect. */
function unitCard(u:Unit,id:string,o:{big?:boolean;button?:{id:string;disabled:boolean};selected?:boolean;tag?:string;level:number}):string {
  const sp=u.species?SPECIES[u.species]:undefined;
  const moves=u.learned.map(m=>{const f=starterMoveFields(m);return '<li><span class="paper-move-type" style="background:'+(TYPES[f.type]??'#5f5e50')+'">'+esc(typeZh(f.type))+'</span><strong>'+esc(moveZh(m))+'</strong>'+(o.big?'<span class="c195-move-text">'+esc(moveEffectLabel(m,undefined,u.side,o.level))+'</span>':'')+'</li>';}).join('')||'<li>普通攻击</li>';
  const inner=(o.tag?'<em class="c195-tag">'+esc(o.tag)+'</em>':'')+unitPortrait(u,'c195-portrait')+'<span class="c195-unit-main"><strong class="c195-unit-name">'+esc(unitLabel(u,id))+'</strong><span class="c195-unit-meta">'+(sp?typeChips(sp.types??[]):'')+'<span>Lv'+(u.level??'?')+'</span><span>HP '+u.hp+'/'+u.maxHp+'</span></span><ul class="c195-unit-moves">'+moves+'</ul></span>';
  const cls='c195-unit'+(o.big?' is-big':'')+(o.selected?' is-selected':'');
  return o.button?'<button type="button" id="'+o.button.id+'" class="'+cls+'" aria-pressed="'+!!o.selected+'"'+(o.button.disabled?' disabled':'')+'>'+inner+'</button>':'<div class="'+cls+'">'+inner+'</div>';
}
export function invitationPanel(s:World,pending:NonNullable<World['invitations']>[number],choice:string|undefined,preview:{ok:boolean;error?:string},ready:boolean):string {
  const full=s.queue.length>=3,incoming=unitLabel(pending.unit,pending.unit.id),out=choice?s.units[choice]:undefined;
  const team=full?'<div class="c195-team">'+s.queue.map((id,i)=>unitCard(s.units[id],id,{level:unitMoveLevel(s,s.units[id]),button:{id:'out-'+i,disabled:!ready},selected:choice===id})).join('')+'</div>':'';
  const acceptLabel=full?(out?'让'+esc(unitLabel(out,choice!))+'回营，'+esc(incoming)+'上场':'先选一名队员回营'):'加入队伍';
  const acceptOk=ready&&preview.ok&&(!full||!!out);
  return '<section class="paper-window c195 c195-invite" id="invitation-choice" role="dialog" aria-labelledby="invite-heading"><h2 class="paper-plaque">新伙伴</h2>'+
   '<h3 id="invite-heading" class="c195-title">'+esc(incoming)+'想加入队伍</h3>'+unitCard(pending.unit,pending.unit.id,{big:true,tag:'新人',level:unitMoveLevel(s,pending.unit)})+team+
   (!preview.ok&&(!full||out)?'<p class="error c195-error">'+esc(preview.error??'')+'</p>':'')+
   '<footer class="c195-foot"><button type="button" id="accept" class="paper-button is-primary" data-confirm'+(acceptOk?'':' disabled')+'>'+acceptLabel+'</button>'+
   (full?'<button type="button" id="invite-to-camp" class="paper-button"'+(ready?'':' disabled')+'>'+esc(incoming)+'直接回营</button>':'')+
   '<button type="button" id="reject" class="paper-button"'+(ready?'':' disabled')+'>拒绝</button></footer></section>';
}

/** A notice-board panel (commission, challenge, item and blessing rooms): a title, a few labelled rows made of short values and tags, and buttons. No sentences. */
export type NoticeRow={label:string;html:string;id?:string};
export function noticePanel(o:{id:string;kind:string;title?:string;attrs?:string;rows:NoticeRow[];buttons?:string;asDialog?:boolean}):string {
  const rows=o.rows.map(r=>'<div class="notice-row'+(r.label?'':' is-bare')+'">'+(r.label?'<span class="notice-k">'+esc(r.label)+'</span>':'')+'<span class="notice-v"'+(r.id?' id="'+r.id+'"':'')+'>'+r.html+'</span></div>').join('');
  const head='<h2 class="paper-plaque">'+esc(o.kind)+'</h2>'+(o.title?'<h3 class="c195-title">'+esc(o.title)+'</h3>':'');
  const foot=o.buttons?'<footer class="c195-foot notice-actions">'+o.buttons+'</footer>':'';
  const cls=o.asDialog?'paper-window c195 c195-notice':'service panel195 notice195';
  return '<section class="'+cls+'" id="'+o.id+'" '+(o.attrs??'')+' role="dialog" aria-label="'+esc(o.kind)+'">'+head+'<div class="notice-body">'+rows+'</div>'+foot+'</section>';
}
export const noticeTag=(text:string,tone:'plain'|'bad'|'good'='plain',hover='')=>'<span class="notice-tag is-'+tone+'"'+(hover?' title="'+esc(hover)+'"':'')+'>'+esc(text)+'</span>';
