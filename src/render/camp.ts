import {rankLevel, type Profile} from '../core/base.ts';
import {speciesZh} from '../core/names.ts';
import {portrait} from '../ui/title.ts';
import './camp.css';

export const CAMP_BUILDINGS = {
  party: {name:'伙伴小屋', keeper:'chansey', use:'出发阵容 · 名册', line:'大家都在这里休息。要带谁出发呢？'},
  vault: {name:'仓库', keeper:'snorlax', use:'招式机 · 碎片', line:'带回来的东西都在这里。'},
  talents: {name:'天赋石碑', keeper:'abra', use:'探险队成长', line:'想把探险队培养成什么样？'},
  records: {name:'记录板', keeper:'pidgey', use:'战绩 · 上一局', line:'来看看探险队的战报吧。'},
} as const;
export type CampPanel = keyof typeof CAMP_BUILDINGS;

const escape = (value: string) => value.replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!)
);

export function campScene(profile: Profile, ready: boolean, difficulty: string, message: string): string {
  const team = profile.team.map(id => {
    const member = profile.roster.find(candidate => candidate.id === id)!;
    return '<span aria-label="' + escape(speciesZh(member.species)) + '">' + portrait(member.species) + '</span>';
  }).join('');
  const buildings = Object.entries(CAMP_BUILDINGS).map(([id, building]) => `
    <button class="camp-building camp-building-${id}" id="camp-open-${id}" aria-haspopup="dialog">
      <span class="camp-building-art" aria-hidden="true"></span>
      <span class="camp-keeper" aria-hidden="true">${portrait(building.keeper)}</span>
      <span class="camp-building-name">${building.name}</span>
      <span class="camp-building-use">${building.use}</span>
    </button>`).join('');
  return `<div id="base" class="camp-scene">
    <div class="camp-path camp-path-north" aria-hidden="true"></div>
    <div class="camp-path camp-path-across" aria-hidden="true"></div>
    <div class="camp-plaza" aria-hidden="true"></div>
    <div class="camp-badge">探险队 Lv${rankLevel(profile.rankExp)} <span>远征 ${profile.expeditions} 次</span></div>
    <button id="camp-menu" class="camp-menu" aria-label="营地菜单">菜单</button>
    <button id="depart" class="camp-gate" aria-label="迷宫入口，出发" data-confirm="true" ${ready ? '' : 'disabled'}>
      <span aria-hidden="true"></span><strong>迷宫入口</strong>
    </button>
    ${difficulty}
    <div class="camp-fire" aria-hidden="true"></div>
    <div class="camp-squad" aria-label="出发阵容">${team}</div>
    ${buildings}
    ${message}
  </div>`;
}

export function campPanelMarkup(panel: CampPanel, content: string, message: string): string {
  const building = CAMP_BUILDINGS[panel];
  return `<dialog id="camp-dialog" class="camp-dialog" data-camp-panel="${panel}" aria-labelledby="camp-dialog-heading">
    <div class="camp-dialog-layout">
      <div class="camp-dialog-keeper">${portrait(building.keeper)}<span>${escape(speciesZh(building.keeper))}</span></div>
      <div class="camp-dialog-main">
        <div class="camp-dialog-heading">
          <h2 id="camp-dialog-heading">${building.name}</h2>
          <button id="camp-close" aria-label="关闭${building.name}">×</button>
        </div>
        <p class="camp-greeting">“${building.line}”</p>
        ${message}
        <div class="camp-dialog-content">${content}</div>
      </div>
    </div>
  </dialog>`;
}
