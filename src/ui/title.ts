/** Stage 7.1 title screen and new-game pages: HTML builders and the portrait animation tick. No game rules and no storage here. */
import {SPECIES,STARTER_IDS} from '../core/roster.ts';
import {speciesZh,moveZh,typeZh} from '../core/names.ts';
import {moveSummary} from '../core/describe.ts';
import {sheet} from '../render/sprites.ts';

export type NewGameState={step:1|2;main:string|null;deputy:string|null;overwrite:boolean};
export {renderTitle} from './title-shell.ts';
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const SCALE=3;

/** A standing sprite drawn from the species' Idle sheet (row 0 faces down). Frames advance in `portraitTick`. */
export function portrait(speciesId:string):string {
  const dex=SPECIES[speciesId]?.dex??'';const m=sheet(dex,'Idle');
  if(!m)return `<span class="portrait-missing">${esc(speciesZh(speciesId))}</span>`;
  const n=m.durations.length;
  return `<span class="portrait-box"><span class="portrait" data-w="${m.w}" data-h="${m.h}" data-d="${m.durations.join(',')}" style="width:${m.w*SCALE}px;height:${m.h*SCALE}px;background-image:url(assets/${m.file});background-size:${m.w*n*SCALE}px ${m.h*8*SCALE}px;background-position:0 0"></span></span>`;
}
/** Moves the frame window of every visible portrait. `animated` false keeps the first frame (animation switch off). */
export function portraitTick(nowMs:number,animated:boolean):void {
  document.querySelectorAll<HTMLElement>('.portrait').forEach(el=>{
    const d=(el.dataset.d??'').split(',').map(Number);const w=Number(el.dataset.w);if(!d.length||!w)return;
    let frame=0;
    if(animated){const total=d.reduce((a,b)=>a+b,0)*1000/60;let t=nowMs%total;for(let i=0;i<d.length;i++){const len=d[i]*1000/60;if(t<len){frame=i;break;}t-=len;}}
    el.style.backgroundPosition=`${-frame*w*SCALE}px 0`;
  });
}
const moves=(id:string)=>SPECIES[id].kit.map(k=>`${esc(moveZh(k.move))}（${esc(moveSummary(k.move))}；PP${k.pp}）`).join('、');
function card(id:string,kind:'main'|'deputy',selected:boolean):string {
  const sp=SPECIES[id];
  return `<button class="starter-card${selected?' selected':''}" id="pick-${kind}-${id}" aria-pressed="${selected}">${portrait(id)}<strong>${esc(speciesZh(id))}</strong><small>${(sp.types??[]).map(typeZh).join('／')}属性 · 生命 ${sp.maxHp}</small><span>初始招式：${moves(id)}</span></button>`;
}
export function renderNewGame(g:NewGameState,error=''):string {
  const err=error?`<p class="error" id="newgame-error">${esc(error)}</p>`:'';
  const head=`<div class="screen-inner wide"><div class="steps"><span class="${g.step===1?'on':''}">1 选择主控</span><span class="${g.step===2?'on':''}">2 选择副手</span></div>`;
  if(g.step===1){
    return `${head}<h1>选择你的主控</h1><p>主控是你直接操作的伙伴。九种御三家任选一只；它的初始招式如下。</p>
    <div class="starter-grid">${STARTER_IDS.map(id=>card(id,'main',g.main===id)).join('')}</div>
    <div class="title-menu"><button id="newgame-cancel">返回标题</button><button id="main-next" class="primary" ${g.main?'':'disabled'}>${g.main?`下一步：选择副手（主控 ${esc(speciesZh(g.main))}）`:'请先选择主控'}</button></div>${err}</div>`;
  }
  const rest=STARTER_IDS.filter(id=>id!==g.main);
  return `${head}<h1>选择初始副手</h1><p>主控：<strong>${esc(speciesZh(g.main!))}</strong>。再从其余 ${rest.length} 种里选一只同行。第三名同伴要在远征中招募。</p>
  <div class="starter-grid">${rest.map(id=>card(id,'deputy',g.deputy===id)).join('')}</div>
  <div class="title-menu"><button id="deputy-back">上一步</button><button id="newgame-start" class="primary" data-confirm="true" ${g.deputy?'':'disabled'}>${g.deputy?'开始：进入基地':'请先选择副手'}</button></div>${err}</div>`;
}
