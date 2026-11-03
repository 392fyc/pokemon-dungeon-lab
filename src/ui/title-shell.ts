/** Lightweight title markup. Only the first frames of the shipped starter sprites are needed here. */
import "../render/title-screen.css";
export type TitleContext={hasRecord:boolean;status:string;error:string;saveLine:string;asking:boolean;exported:boolean};
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// The title loads before the full animation index or game data.
type StandingFrame = readonly [width:number, height:number, columns:number, visibleHeight:number];
const STARTER_FRAMES:Readonly<Record<string,StandingFrame|undefined>> = {
  '0001': [32, 40, 3, 27], '0004': [32, 40, 4, 26], '0007': [32, 32, 8, 21],
  '0152': [24, 48, 6, 30], '0155': [24, 32, 2, 20], '0158': [32, 48, 7, 30],
  '0252': [32, 40, 3, 26], '0255': [24, 40, 5, 26], '0258': [24, 40, 7, 26],
} as const;

// Trim the transparent rows below the first down-facing Idle frame.
export function standingSprite(dex:string, width:number, height:number, columns:number, visibleHeight:number):string {
  return '<span class="standing-sprite" data-frame-width="' + width + '" data-frame-height="' + height +
    '" style="--frame-width:' + width + ';--frame-height:' + height + ';--sheet-columns:' + columns +
    ';--visible-height:' + visibleHeight + ';background-image:url(assets/characters/' + dex + '/Idle-Anim.png)"></span>';
}

export function starterStandee(dex:string):string {
  const frame = STARTER_FRAMES[dex];
  return frame ? standingSprite(dex, ...frame) : '';
}

function titleStarters(): string {
  return Object.keys(STARTER_FRAMES).map(starterStandee).join('');
}
export function renderTitle(c:TitleContext):string {
  const blocked=c.status==='blocked';
  const ask=c.asking?`<div class="confirm-box" id="overwrite-box" role="alertdialog"><h2>开始新游戏会覆盖现有存档</h2><p>此浏览器里已有一份存档（${esc(c.saveLine||'无法读取')}）。覆盖后无法恢复；先导出原记录可以保留一份备份。取消则一切保持原样。</p>
  <button id="overwrite-export">导出原记录</button><button id="overwrite-yes" data-confirm="true" ${blocked&&!c.exported?'disabled':''}>确认覆盖，继续选择角色</button><button id="overwrite-cancel">取消</button>${blocked&&!c.exported?'<p class="muted">原记录无法读取，须先导出才能覆盖。</p>':''}</div>`:'';
  const menu = [
    c.hasRecord && !blocked
      ? `<button id="title-continue" class="primary" aria-describedby="title-save-line">${c.status === 'pending' ? '读取存档' : '继续冒险'}</button>`
      : '',
    `<button id="title-new" ${c.asking ? 'disabled' : ''} class="${c.hasRecord ? '' : 'primary'}">新的冒险</button>`,
  ].join('');
  const floorTile = '<span style="background-image:url(assets/tiles/floor-stone.png)"></span>';
  return `<div class="screen-inner title-landing">
    <div class="title-landscape" aria-hidden="true">${floorTile.repeat(3)}</div>
    <div class="title-core">
      <h1 class="brand big">宝可梦地牢探索</h1>
      <div class="title-menu">${menu}</div>
      ${c.hasRecord && !blocked ? `<p class="title-save-summary" id="title-save-line">${c.status === 'pending' ? '' : '现有存档：'}${esc(c.saveLine)}</p>` : ''}
      ${blocked ? `<p class="error">存档无法载入：${esc(c.error)}。原记录没有被改动。</p>` : ''}
      ${c.status === 'failed' ? '<p class="error">最新结果未保存，请先继续游戏并重试保存。</p>' : ''}
      ${ask}
    </div>
    <div class="title-starters" aria-hidden="true">${titleStarters()}</div>
  </div>`;
}
