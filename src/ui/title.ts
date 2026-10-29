/** Stage 7.1 title screen and new-game pages: HTML builders and the portrait animation tick. No game rules and no storage here. */
import {SPECIES,STARTER_IDS} from '../core/roster.ts';
import {speciesZh,moveZh,typeZh} from '../core/names.ts';
import {SKILL_CN} from '../core/engine.ts';
import {sheet} from '../render/sprites.ts';

export type NewGameState={step:1|2;main:string|null;deputy:string|null;overwrite:boolean};
export type TitleContext={hasRecord:boolean;status:string;error:string;saveLine:string;asking:boolean;exported:boolean};
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
const moves=(id:string)=>SPECIES[id].kit.map(k=>`${esc(moveZh(k.move))}（${SKILL_CN[k.behavior]} PP${k.pp}）`).join('、');
function card(id:string,kind:'main'|'deputy',selected:boolean):string {
  const sp=SPECIES[id];
  return `<button class="starter-card${selected?' selected':''}" id="pick-${kind}-${id}" aria-pressed="${selected}">${portrait(id)}<strong>${esc(speciesZh(id))}</strong><small>${(sp.types??[]).map(typeZh).join('／')}属性 · 生命 ${sp.maxHp}</small><span>初始招式：${moves(id)}</span></button>`;
}
export function renderTitle(c:TitleContext):string {
  const blocked=c.status==='blocked';
  const ask=c.asking?`<div class="confirm-box" id="overwrite-box" role="alertdialog"><h2>开始新游戏会覆盖现有存档</h2><p>此浏览器里已有一份存档（${esc(c.saveLine||'无法读取')}）。覆盖后无法恢复；先导出原记录可以保留一份备份。取消则一切保持原样。</p>
  <button id="overwrite-export">导出原记录</button><button id="overwrite-yes" data-confirm="true" ${blocked&&!c.exported?'disabled':''}>确认覆盖，继续选择角色</button><button id="overwrite-cancel">取消</button>${blocked&&!c.exported?'<p class="muted">原记录无法读取，须先导出才能覆盖。</p>':''}</div>`:'';
  return `<div class="screen-inner"><div class="brand big">同行<span>FIELD TRIAL</span></div><h1>宝可梦地牢探索</h1><p class="muted">私有试玩构建 · 进度只保存在此浏览器</p>
  <div class="title-menu">${c.hasRecord&&!blocked?'<button id="title-continue" class="primary">继续</button>':''}<button id="title-new" ${c.asking?'disabled':''} class="${c.hasRecord?'':'primary'}">新游戏</button></div>
  ${c.hasRecord&&!blocked?`<p class="muted" id="title-save-line">现有存档：${esc(c.saveLine)}</p>`:''}${blocked?`<p class="error">存档无法载入：${esc(c.error)}。原记录没有被改动。</p>`:''}${c.status==='failed'?'<p class="error">最新结果未保存，请先继续游戏并重试保存。</p>':''}${ask}</div>`;
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
