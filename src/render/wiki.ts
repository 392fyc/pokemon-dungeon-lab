/** In-game wiki window (D-20261109-03): left category tabs, a searchable list, and a detail page whose links jump between entries (with a back button).
 *  The model is src/core/wiki.ts; this file only draws it and wires the window. The caller supplies what must happen when it opens or closes. */
import {wikiCategories,wikiCategory,wikiEntry,searchWiki,isCategoryLink,WIKI_LINK,type WikiEntry,type WikiBlock} from '../core/wiki.ts';
import {typeZh} from '../core/names.ts';
import {portraitMarkup} from './portrait.ts';
import {starterMoveFields} from './hud.ts';
import {itemIconImg} from './item-icons.ts';
import {TYPES} from './panels194.ts';
import './wiki.css';

const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const BATCH=60;

/** Text with `[[id|label]]` markup to HTML: every link becomes a button the window handles. */
export function wikiText(text:string):string {
  return esc(text).replace(WIKI_LINK,(_m,id:string,label?:string)=>{
    const target=isCategoryLink(id)?wikiCategory(id.split(':')[0]):wikiEntry(id);
    const shown=label??(target?('title' in target?target.title:target.name):id);
    return '<button type="button" class="wiki-link'+(target?'':' is-broken')+'" data-wiki-link="'+id+'">'+shown+'</button>';
  });
}
const chipLink=(id:string)=>{const e=wikiEntry(id);return '<button type="button" class="wiki-link wiki-chip" data-wiki-link="'+id+'">'+esc(e?.title??id)+'</button>';};
const typeChip=(t:string)=>'<button type="button" class="wiki-type" data-wiki-link="terms:types" style="background:'+(TYPES[t]??'#5f5e50')+'">'+esc(typeZh(t))+'</button>';

function blockHtml(b:WikiBlock):string {
  switch(b.t){
    case 'p':return '<p>'+wikiText(b.text)+'</p>';
    case 'facts':return '<dl class="wiki-facts">'+b.rows.map(r=>'<div><dt>'+esc(r.label)+'</dt><dd>'+wikiText(r.text)+'</dd></div>').join('')+'</dl>';
    case 'table':{
      const cls=b.kind==='chart'?'wiki-table is-chart':'wiki-table';
      const cell=(v:string,head:boolean)=>{
        if(head)return '<th scope="col">'+esc(v)+'</th>';
        const tone=b.kind==='chart'?(v==='×2'?' class="is-up"':v==='×0.5'?' class="is-down"':v==='×0'?' class="is-zero"':''):'';
        return '<td'+tone+'>'+esc(v)+'</td>';
      };
      return '<div class="wiki-table-wrap"><table class="'+cls+'"><thead><tr>'+b.head.map(h=>cell(h,true)).join('')+'</tr></thead><tbody>'+b.rows.map(r=>'<tr>'+r.map((v,i)=>i===0&&b.kind==='chart'?'<th scope="row">'+esc(v)+'</th>':cell(v,false)).join('')+'</tr>').join('')+'</tbody></table></div>';
    }
    case 'ranges':return '<ul class="wiki-ranges">'+b.rows.map(r=>'<li data-range="'+r.range+'"><span class="wiki-scope">'+(r.example?starterMoveFields(r.example).scope:'')+'</span><span>'+esc(r.label)+'</span></li>').join('')+'</ul>';
    case 'chips':return b.ids.length?'<section class="wiki-chips"><h4>'+esc(b.label)+' <small>'+b.ids.length+'</small></h4><div class="wiki-chip-row">'+b.ids.map(chipLink).join('')+'</div></section>':'';
    case 'stats':{const max=Math.max(...b.rows.map(r=>r.value),100);return '<ul class="wiki-stats" aria-label="种族值">'+b.rows.map(r=>'<li><span>'+esc(r.label)+'</span><b>'+r.value+'</b><i style="width:'+Math.round(r.value/Math.max(max,150)*100)+'%"></i></li>').join('')+'</ul>';}
    case 'learnset':return '<section class="wiki-chips"><h4>升级学习</h4><table class="wiki-table"><thead><tr><th scope="col">等级</th><th scope="col">招式</th></tr></thead><tbody>'+b.rows.map(r=>'<tr><td>Lv'+r.level+'</td><td>'+chipLink('moves:'+r.move)+'</td></tr>').join('')+'</tbody></table></section>';
  }
}
/** The identity strip above an entry's blocks: portrait, item icon, move reach picture, type chips. */
function headerHtml(e:WikiEntry):string {
  let art='';
  const m=e.meta;
  if(m.kind==='species'){
    art='<span class="wiki-art">'+portraitMarkup(m.dex,{boxClass:'wiki-portrait',spriteClass:'wiki-portrait-sprite',label:e.title})+'</span>';
  }
  if(m.kind==='item')art='<span class="wiki-art wiki-item-art">'+itemIconImg(m.item,'wiki-item-icon')+'</span>';
  if(m.kind==='move')art='<span class="wiki-art wiki-scope">'+starterMoveFields(m.move).scope+'</span>';
  return art;
}
/** `showRules`: the rule-number tag is for the developer (?dev=1); the data keeps the numbers either way. */
export function entryHtml(e:WikiEntry,showRules=false):string {
  const types=e.meta.kind==='species'||e.meta.kind==='move'?e.meta.types:[];
  const rule=showRules&&e.rules.length?'<span class="wiki-rule" title="游戏规则文档中的对应编号">规则 '+e.rules.map(esc).join('、')+'</span>':'';
  const rarity=e.meta.kind==='blessing'?'<span class="wiki-rarity" data-rarity="'+e.meta.rarity+'">'+esc(e.subtitle)+'</span>':'';
  return '<header class="wiki-entry-head" data-wiki-entry="'+esc(e.id)+'"'+(e.todo?' data-wiki-todo="1"':'')+'>'+headerHtml(e)+'<div class="wiki-entry-title"><h3>'+esc(e.title)+'</h3><div class="wiki-entry-tags">'+types.map(typeChip).join('')+rarity+rule+'</div></div></header>'+
    '<div class="wiki-entry-body">'+e.blocks.map(blockHtml).join('')+'</div>';
}

type WikiState={cat:string;entry:string|null;query:string};
export type WikiController={dialog:HTMLDialogElement;open:(target?:Partial<WikiState>)=>void;close:()=>void;isOpen:()=>boolean;state:()=>WikiState};

export function createWiki(host:{onOpen?:()=>void;onClose?:()=>void;showRules?:boolean}={}):WikiController {
  const cats=wikiCategories();
  const dialog=document.createElement('dialog');
  dialog.id='wiki-dialog';dialog.className='paper-window wiki194';dialog.setAttribute('aria-labelledby','wiki-heading');
  dialog.innerHTML='<h2 id="wiki-heading" class="paper-plaque">百科</h2><button type="button" id="wiki-close" class="paper-close" aria-label="关闭百科">×</button>'+
    '<nav class="wiki-tabs" aria-label="百科分类">'+cats.map(c=>'<button type="button" data-wiki-cat="'+c.id+'" aria-pressed="false">'+esc(c.name)+'</button>').join('')+'</nav>'+
    '<section class="wiki-main"><div class="wiki-bar"><button type="button" id="wiki-back" class="paper-button" disabled>返回</button><input type="text" role="searchbox" id="wiki-search" autocomplete="off" aria-label="搜索当前分类" placeholder="搜索当前分类"><span id="wiki-count" class="paper-muted"></span></div>'+
    '<div class="wiki-body"><ul id="wiki-list" role="list" aria-label="条目"></ul><article id="wiki-detail" tabindex="-1" aria-live="polite"></article></div></section>';
  document.body.append(dialog);
  const $=<T extends HTMLElement>(sel:string)=>dialog.querySelector(sel) as T;
  const list=$<HTMLUListElement>('#wiki-list'),detail=$<HTMLElement>('#wiki-detail'),search=$<HTMLInputElement>('#wiki-search'),back=$<HTMLButtonElement>('#wiki-back'),count=$<HTMLElement>('#wiki-count');
  let state:WikiState={cat:cats[0].id,entry:null,query:''};
  const history:WikiState[]=[];
  let shown:WikiEntry[]=[],rendered=0;

  const row=(e:WikiEntry)=>{
    const art=e.meta.kind==='species'?portraitMarkup(e.meta.dex,{boxClass:'wiki-row-portrait',spriteClass:'wiki-portrait-sprite',label:e.title}):e.meta.kind==='item'?itemIconImg(e.meta.item,'wiki-row-icon'):'';
    return '<li><button type="button" class="wiki-row" data-wiki-entry="'+esc(e.id)+'" aria-pressed="'+(e.id===state.entry)+'">'+art+'<span class="wiki-row-text"><strong>'+esc(e.title)+'</strong>'+(e.subtitle?'<small>'+esc(e.subtitle)+'</small>':'')+'</span></button></li>';
  };
  function renderMore(upTo=rendered+BATCH){
    const end=Math.min(shown.length,upTo);
    if(end>rendered){list.insertAdjacentHTML('beforeend',shown.slice(rendered,end).map(row).join(''));rendered=end;}
  }
  function drawList(){
    shown=searchWiki(state.cat,state.query);rendered=0;list.innerHTML='';list.scrollTop=0;
    renderMore(Math.max(BATCH,state.entry?shown.findIndex(e=>e.id===state.entry)+1:0));
    count.textContent=state.query.trim()?'找到 '+shown.length+' 项':'共 '+(wikiCategory(state.cat)?.entries.length??0)+' 项';
    if(!shown.length)list.innerHTML='<li class="wiki-empty">没有符合的条目</li>';
  }
  function drawDetail(){
    const e=state.entry?wikiEntry(state.entry):undefined,c=wikiCategory(state.cat)!;
    detail.innerHTML=e?entryHtml(e,host.showRules):'<header class="wiki-entry-head"><div class="wiki-entry-title"><h3>'+esc(c.name)+'</h3>'+(host.showRules?'<div class="wiki-entry-tags"><span class="wiki-rule">规则 '+c.rules.map(esc).join('、')+'</span></div>':'')+'</div></header><div class="wiki-entry-body"><p>'+esc(c.intro)+'</p><p class="paper-muted">在左边的列表里选一项查看；条目里的蓝色文字可以点开。</p></div>';
    detail.scrollTop=0;
    for(const b of list.querySelectorAll<HTMLElement>('.wiki-row'))b.setAttribute('aria-pressed',String(b.dataset.wikiEntry===state.entry));
  }
  function draw(redrawList=true){
    for(const b of dialog.querySelectorAll<HTMLElement>('[data-wiki-cat]'))b.setAttribute('aria-pressed',String(b.dataset.wikiCat===state.cat));
    if(search.value!==state.query)search.value=state.query;
    search.placeholder='搜索'+(wikiCategory(state.cat)?.name??'');
    if(redrawList)drawList();
    drawDetail();
    back.disabled=history.length===0;
    const sel=list.querySelector('.wiki-row[aria-pressed=true]') as HTMLElement|null;sel?.scrollIntoView({block:'nearest'});
  }
  function go(next:WikiState,remember:boolean){
    if(remember)history.push({...state});
    state=next;draw();
  }
  function followLink(id:string){
    if(isCategoryLink(id)){go({cat:id.split(':')[0],entry:null,query:''},true);return;}
    const e=wikiEntry(id);if(!e)return;
    go({cat:e.cat,entry:e.id,query:''},true);
  }
  dialog.addEventListener('click',ev=>{
    const el=(ev.target as HTMLElement).closest<HTMLElement>('[data-wiki-link],[data-wiki-cat],[data-wiki-entry].wiki-row,#wiki-back,#wiki-close');
    if(!el||!dialog.contains(el))return;
    if(el.id==='wiki-close'){close();return;}
    if(el.id==='wiki-back'){const prev=history.pop();if(prev){state=prev;draw();}return;}
    if(el.dataset.wikiCat){history.length=0;state={cat:el.dataset.wikiCat,entry:null,query:''};draw();return;}
    if(el.dataset.wikiLink){followLink(el.dataset.wikiLink);return;}
    if(el.dataset.wikiEntry){state={...state,entry:el.dataset.wikiEntry};drawDetail();}
  });
  search.addEventListener('input',()=>{state={...state,query:search.value};drawList();});
  list.addEventListener('scroll',()=>{if(list.scrollTop+list.clientHeight>=list.scrollHeight-80)renderMore();});
  // The window closes with Esc through the dialog's own cancel; the host is told on every close.
  dialog.addEventListener('close',()=>host.onClose?.());
  function close(){if(dialog.open)dialog.close();}
  function open(target:Partial<WikiState>={}){
    if(!dialog.open){host.onOpen?.();dialog.showModal();}
    history.length=0;
    state=Object.keys(target).length?{cat:target.cat??state.cat,entry:target.entry??null,query:target.query??''}:state;
    draw();
  }
  return {dialog,open,close,isOpen:()=>dialog.open,state:()=>({...state})};
}
