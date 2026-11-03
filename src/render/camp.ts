import {rankLevel, type Profile} from '../core/base.ts';
import {speciesZh} from '../core/names.ts';
import {SPECIES} from '../core/roster.ts';
import {portrait} from '../ui/title.ts';
import {standingSprite,starterStandee} from '../ui/title-shell.ts';
import {sheet} from './sprites.ts';
import './camp.css';

export const CAMP_BUILDINGS = {
  party: {name:'伙伴小屋', keeper:'chansey', feet:[316,306], use:'出发阵容 · 名册', line:'大家都在这里休息。要带谁出发呢？'},
  vault: {name:'仓库', keeper:'snorlax', feet:[960,318], use:'招式机 · 碎片', line:'带回来的东西都在这里。'},
  talents: {name:'天赋石碑', use:'探险队成长'},
  records: {name:'记录板', use:'战绩 · 上一局'},
} as const;
export type CampPanel = keyof typeof CAMP_BUILDINGS;

const escape = (value: string) => value.replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!)
);

// All positions share the coordinate system of the camp painting.
const CAMP_WIDTH = 1280, CAMP_HEIGHT = 720;
const CAMP_SPOTS = {
  gate: [579, 0, 117, 104],
  party: [196, 75, 225, 217],
  vault: [858, 88, 283, 212],
  talents: [183, 429, 238, 225],
  records: [862, 462, 221, 162],
} as const;
const KEEPER_VISIBLE_HEIGHT = {chansey:26, snorlax:38} as const;

function spotPosition(x:number, y:number):string {
  return `left:${x / CAMP_WIDTH * 100}%;top:${y / CAMP_HEIGHT * 100}%`;
}

function hotspot([x,y,width,height]:readonly [number,number,number,number]):string {
  return `${spotPosition(x,y)};width:${width / CAMP_WIDTH * 100}%;height:${height / CAMP_HEIGHT * 100}%`;
}

function campStandee(species:string):string {
  const dex=SPECIES[species]?.dex??'';
  const starter=starterStandee(dex);
  if(starter)return starter;
  const frame=sheet(dex,'Idle'), keeperHeight=KEEPER_VISIBLE_HEIGHT[species as keyof typeof KEEPER_VISIBLE_HEIGHT];
  return frame&&keeperHeight?standingSprite(dex,frame.w,frame.h,frame.durations.length,keeperHeight):portrait(species);
}

export function campScene(profile: Profile, ready: boolean, difficulty: string, message: string): string {
  const team = profile.team.map(id => {
    const member = profile.roster.find(candidate => candidate.id === id)!;
    return '<span aria-label="' + escape(speciesZh(member.species)) + '">' + campStandee(member.species) + '</span>';
  }).join('');
  const panels = Object.keys(CAMP_BUILDINGS) as CampPanel[];
  const buildings = panels.map(id => {
    const building = CAMP_BUILDINGS[id];
    const spot = CAMP_SPOTS[id];
    const [x,y,width,height] = spot;
    const keeper = 'keeper' in building
      ? `<span class="camp-keeper" aria-hidden="true" style="left:${(building.feet[0]-x)/width*100}%;top:${(building.feet[1]-y)/height*100}%">${campStandee(building.keeper)}</span>`
      : '';
    return `
    <button class="camp-hotspot camp-building${keeper ? ' has-keeper' : ''}" id="camp-open-${id}" aria-haspopup="dialog" style="${hotspot(spot)}">
      <span class="camp-spot-label"><strong>${building.name}</strong><small>${building.use}</small></span>
      ${keeper}
    </button>`;
  }).join('');
  return `<div id="base" class="camp-scene">
    <div class="camp-map" style="background-image:url(assets/camp/base.png)">
      <button id="depart" class="camp-hotspot camp-gate" aria-label="迷宫入口，出发" data-confirm="true"
        style="${hotspot(CAMP_SPOTS.gate)}" ${ready ? '' : 'disabled'}>
        <span class="camp-spot-label"><strong>迷宫入口</strong></span>
      </button>
      ${difficulty}
      <div class="camp-squad" aria-label="出发阵容" style="${spotPosition(638,462)}">${team}</div>
      ${buildings}
    </div>
    <div class="camp-badge">探险队 Lv${rankLevel(profile.rankExp)} <span>远征 ${profile.expeditions} 次</span></div>
    <button id="camp-menu" class="camp-menu" aria-label="营地菜单">菜单</button>
    ${message}
  </div>`;
}

export function campPanelMarkup(panel: CampPanel, content: string, message: string): string {
  const building = CAMP_BUILDINGS[panel];
  const keeper = 'keeper' in building
    ? `<div class="camp-dialog-keeper">${portrait(building.keeper)}<span>${escape(speciesZh(building.keeper))}</span></div>`
    : '';
  const greeting = 'line' in building ? `<p class="camp-greeting">“${building.line}”</p>` : '';
  return `<dialog id="camp-dialog" class="camp-dialog" data-camp-panel="${panel}" aria-labelledby="camp-dialog-heading">
    <div class="camp-dialog-layout${keeper ? ' has-keeper' : ''}">
      ${keeper}
      <div class="camp-dialog-main">
        <div class="camp-dialog-heading">
          <h2 id="camp-dialog-heading">${building.name}</h2>
          <button id="camp-close" aria-label="关闭${building.name}">×</button>
        </div>
        ${greeting}
        ${message}
        <div class="camp-dialog-content">${content}</div>
      </div>
    </div>
  </dialog>`;
}
