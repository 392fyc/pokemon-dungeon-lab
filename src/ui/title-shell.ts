/** Title HTML only: no engine, save validation, art metadata or species data. */
export type TitleContext={hasRecord:boolean;status:string;error:string;saveLine:string;asking:boolean;exported:boolean};
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function renderTitle(c:TitleContext):string {
  const blocked=c.status==='blocked';
  const ask=c.asking?`<div class="confirm-box" id="overwrite-box" role="alertdialog"><h2>开始新游戏会覆盖现有存档</h2><p>此浏览器里已有一份存档（${esc(c.saveLine||'无法读取')}）。覆盖后无法恢复；先导出原记录可以保留一份备份。取消则一切保持原样。</p>
  <button id="overwrite-export">导出原记录</button><button id="overwrite-yes" data-confirm="true" ${blocked&&!c.exported?'disabled':''}>确认覆盖，继续选择角色</button><button id="overwrite-cancel">取消</button>${blocked&&!c.exported?'<p class="muted">原记录无法读取，须先导出才能覆盖。</p>':''}</div>`:'';
  return `<div class="screen-inner"><h1 class="brand big">宝可梦地牢探索</h1><p class="muted">私有试玩构建 · 进度只保存在此浏览器</p>
  <div class="title-menu">${c.hasRecord&&!blocked?`<button id="title-continue" class="primary">${c.status==='pending'?'读取存档':'继续'}</button>`:''}<button id="title-new" ${c.asking?'disabled':''} class="${c.hasRecord?'':'primary'}">新游戏</button></div>
  ${c.hasRecord&&!blocked?`<p class="muted" id="title-save-line">${c.status==='pending'?'':'现有存档：'}${esc(c.saveLine)}</p>`:''}${blocked?`<p class="error">存档无法载入：${esc(c.error)}。原记录没有被改动。</p>`:''}${c.status==='failed'?'<p class="error">最新结果未保存，请先继续游戏并重试保存。</p>':''}${ask}</div>`;
}
