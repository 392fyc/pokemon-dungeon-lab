import {renderTitle,type TitleContext} from './ui/title-shell.ts';
import './style.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
const params=new URLSearchParams(location.search);
let loading=false;

/** Only check for record presence here. TrialStore owns all validation and migration after entry. */
function titleContext():TitleContext{
 try{
  // This is the existing public storage key (G11.4), not a second save reader.
  const hasRecord=window.localStorage.getItem('dungeon-trial.player.v1')!==null;
  return {hasRecord,status:hasRecord?'pending':'empty',error:'',saveLine:'读取存档详情需要加载游戏',asking:false,exported:false};
 }catch{
  return {hasRecord:true,status:'blocked',error:'浏览器拒绝读取本地存储',saveLine:'',asking:false,exported:false};
 }
}

function showTitle(failed=false){
 app.innerHTML=`<div id="title-screen" class="screen">${renderTitle(titleContext())}</div>`;
 app.querySelector('.title-menu')?.insertAdjacentHTML('beforeend','<button id="title-settings">设置与存档</button>');
 app.querySelector('.screen-inner')?.insertAdjacentHTML('beforeend',
  `<p id="entry-status" role="status" aria-live="polite">${failed?'游戏加载失败。请刷新页面后重试；浏览器中的原记录未被清除。':''}</p>${failed?'<button id="entry-reload">刷新重试</button>':''}`);
 for(const [id,action] of [['title-new','new'],['title-continue','continue'],['title-settings','settings']] as const){
  const button=document.getElementById(id) as HTMLButtonElement|null;
  if(button){button.disabled=failed;button.addEventListener('click',()=>void enter(action));}
 }
 document.getElementById('entry-reload')?.addEventListener('click',()=>location.reload());
}

async function enter(action?:'new'|'continue'|'settings'){
 if(loading)return;
 loading=true;
 document.querySelectorAll<HTMLButtonElement>('#title-screen button').forEach(button=>{button.disabled=true;});
 const status=document.getElementById('entry-status');
 if(status)status.textContent='正在加载游戏，请稍候…';
 try{
  const game=await import('./app/game.ts');
  await game.openTitleAction(action);
 }catch{
  // A module that already ran may own timers, listeners and a Phaser scene. Replacing
  // the title does not dispose those resources; only a full reload resets them safely.
  // Keep all entry actions disabled on this error screen instead of retrying in place.
  loading=false;
  showTitle(true);
 }
}

showTitle();
// Explicit developer URLs retain their direct entry; the runtime validates fixture IDs.
if(params.get('dev')==='1'||params.has('fixture'))void enter();
