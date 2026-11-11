/** Stage 7.1 title screen and new-game pages: HTML builders and the portrait animation tick. No game rules and no storage here. */
import {SPECIES,STARTER_IDS} from '../core/roster.ts';
import {speciesZh,moveZh,typeZh} from '../core/names.ts';
import {starterMoveFields,moveFactPairs} from '../render/hud.ts';
import '../render/starter-picker.css';
import {portraitMarkup,tickPortraits} from '../render/portrait.ts';
import '../render/portrait.css';


export type NewGameState={step:1|2;main:string|null;deputy:string|null;overwrite:boolean};
export {renderTitle} from './title-shell.ts';
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));


/** A standing sprite drawn from the species' Idle sheet (row 0 faces down). Frames advance in `portraitTick`. */
export function portrait(speciesId:string):string {
  const dex=SPECIES[speciesId]?.dex??'';
  return portraitMarkup(dex,{boxClass:'portrait-box',spriteClass:'portrait',label:speciesZh(speciesId),animated:true});
}
export function portraitTick(nowMs:number,animated:boolean):void {
  tickPortraits(nowMs,animated);
}
const AXES = [
  ['hp','HP','#2f7a3a'], ['atk','攻击','#b5681c'], ['def','防御','#8a7410'],
  ['spa','特攻','#2b6cb0'], ['spd','特防','#1f7f62'], ['spe','速度','#c23b78'],
] as const;

function statChart(stats: NonNullable<typeof SPECIES[string]['baseStats']>): string {
  const radius = 86;
  const point = (axis: number, scale: number) => {
    const angle = axis * Math.PI / 3 - Math.PI / 2;
    return [155 + radius * scale * Math.cos(angle), 150 + radius * scale * Math.sin(angle)];
  };
  const points = (scale: (index: number) => number) =>
    AXES.map((_, index) => point(index, scale(index)).join(',')).join(' ');
  const rings = [1/3, 2/3, 1].map(r =>
    '<polygon class="starter-stat-ring" points="' + points(() => r) + '"/>'
  ).join('');
  const spokes = AXES.map((_, index) => {
    const [x,y] = point(index, 1);
    return '<line class="starter-stat-ring" x1="155" y1="150" x2="' + x + '" y2="' + y + '"/>';
  }).join('');
  const ratio = (i: number) => stats[AXES[i][0]] / 100;
  const labels = AXES.map(([id,label,color], i) => {
    const [x,y] = point(i, 1.44);
    const [dotX,dotY] = point(i, ratio(i));
    return `<circle cx="${dotX}" cy="${dotY}" r="5" fill="${color}"/>
      <text x="${x}" y="${y-6}" fill="${color}">${label}</text>
      <text class="starter-stat-value" x="${x}" y="${y+11}">${stats[id]}</text>`;
  }).join('');
  const label = AXES.map(([id,name]) => name + ' ' + stats[id]).join('，');
  return `<svg class="starter-stats" viewBox="0 0 310 300" role="img" aria-label="${esc(label)}">
    ${rings}${spokes}<polygon class="starter-stat-area" points="${points(ratio)}"/>${labels}</svg>`;
}

function moveCard(move: string, pp: number): string {
  const info = starterMoveFields(move);
  const fields = moveFactPairs(info, pp).map(([name,value]) => `<div><dt>${name}</dt><dd>${esc(value)}</dd></div>`).join('');
  return `<article class="starter-move" tabindex="0" data-starter-move="${esc(move)}">
    ${info.scope}
    <div><div class="starter-move-heading"><strong>${esc(moveZh(move))}</strong>
    <span data-move-type="${esc(info.type)}">${esc(info.type ? typeZh(info.type) : '—')}</span>
    <span>${esc(info.category)}</span></div><dl>${fields}</dl></div>
    ${info.description ? `<p class="starter-move-description">${esc(info.description)}</p>` : ''}
  </article>`;
}

export function renderNewGame(g: NewGameState, error = ''): string {
  const first = g.step === 1;
  const options = first ? STARTER_IDS : STARTER_IDS.filter(id => id !== g.main);
  const selected = first ? g.main : g.deputy;
  const preview = selected ?? options[0];
  const species = SPECIES[preview];
  const choices = options.map(id => `<button class="starter-option" id="pick-${first ? 'main' : 'deputy'}-${id}"
    aria-pressed="${selected === id}"><span class="starter-icon">${portrait(id)}</span><span>${esc(speciesZh(id))}</span></button>`).join('');
  const types = (species.types ?? []).map(type => `<span data-move-type="${esc(type)}">${esc(typeZh(type))}</span>`).join('');
  return `<div class="screen-inner starter-picker">
    <div class="starter-picker-nav">
      <button id="${first ? 'newgame-cancel' : 'deputy-back'}">${first ? '‹ 返回标题' : '‹ 上一步'}</button>
      <h1>${first ? '选择起始伙伴' : '选择同行伙伴'}</h1>
    </div>
    <div class="starter-detail">
      <div class="starter-featured">${portrait(preview)}<h2>${esc(speciesZh(preview))}</h2>
        <div class="starter-types">${types}</div>
        <button id="${first ? 'main-next' : 'newgame-start'}" class="primary" ${selected ? '' : 'disabled'}
          ${first ? '' : 'data-confirm="true"'}>就选它</button>
      </div>
      ${species.baseStats ? statChart(species.baseStats) : ''}
      <div class="starter-moves">${species.kit.map(({move,pp}) => moveCard(move,pp)).join('')}</div>
    </div>
    <div class="starter-options" style="--starter-count:${options.length}">${choices}</div>
    ${error ? `<p class="error" id="newgame-error" role="alert">${esc(error)}</p>` : ''}
  </div>`;
}
