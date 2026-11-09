import {THEME_FLOORS} from '../core/dungeon.ts';
import {SPECIES} from '../core/roster.ts';
import {TACTICS,TACTIC_LABELS,type Tactic} from '../core/tactics.ts';
import {BLESSINGS,BLESSING_RARITY,type Unit,type World} from '../core/engine.ts';
import {rankLevel,rankThreshold,type Profile,type SettleSummary} from '../core/base.ts';
import {moveZh,speciesZh,typeZh} from '../core/names.ts';
import {unitLabel,statSheet,moveBaseDamage,moveShortEffect,moveRangeTag} from '../core/describe.ts';
import {hpAtLevel,statAtLevel} from '../core/stats.ts';
import {starterMoveFields,hudStatusMarkup,blessingEffectLabel} from './hud.ts';
import {portraitMarkup} from './portrait.ts';
import {skinFor} from './sprites.ts';

const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const TYPES:Record<string,string>={Normal:'#5f5e50',Water:'#2b5f8a',Fire:'#a8482a',Grass:'#3f7a3a',Electric:'#9a7a24',Ice:'#4f8196',Fighting:'#963f45',Poison:'#765196',Ground:'#86643b',Flying:'#54799b',Psychic:'#a25891',Bug:'#55753a',Rock:'#776749',Ghost:'#5b4e81',Dragon:'#4f4c9b',Dark:'#49413b',Steel:'#627381',Fairy:'#9d6688'};
export const SETTLEMENT_TITLES=['击败首领','全队倒下'] as const;
const DIFFICULTY={easy:'简单',normal:'普通',hard:'困难'};
const TACTIC_TEXT:Record<Tactic,string>={
  together:'攻击领队 6 格内、自己或领队看得见的敌人，并走过去；看不到就靠近领队',
  followme:'只攻击相邻的敌人，并紧跟领队',
  gofoes:'追击视野内最近的敌人，看不到时靠近领队',
  wait:'不移动，只攻击射程内的敌人',
  nomoves:'只使用普通攻击，其余与“一起行动”相同',
  avoid:'不攻击，只使用自身和己方招式；敌人相邻时后退',
};
const rect=(x:number,y:number,w:number,h:number)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'"/>';
const ICONS:Record<Tactic,string>={
  together:rect(2,4,3,3)+rect(7,4,3,3)+rect(2,8,3,2)+rect(7,8,3,2),
  followme:rect(1,5,7,2)+rect(6,3,2,6)+rect(8,4,2,4)+rect(10,5,1,2),
  gofoes:rect(8,1,3,2)+rect(6,3,3,2)+rect(4,5,3,2)+rect(2,7,3,2)+rect(1,9,2,2),
  wait:rect(3,1,2,10)+rect(5,1,6,5),
  nomoves:rect(5,1,2,10)+rect(1,5,10,2)+rect(1,1,2,2)+rect(9,9,2,2),
  avoid:rect(1,5,4,2)+rect(7,5,4,2)+rect(1,3,2,6)+rect(9,3,2,6),
};
export function unitPortrait(u:Unit,box='panel-portrait'):string {
  return portraitMarkup(skinFor(u.id,u.side,u.species),{boxClass:box,spriteClass:'panel-portrait-sprite',label:unitLabel(u,u.id)});
}
function speciesPortrait(species:string,box='panel-portrait'):string {
  return portraitMarkup(SPECIES[species]?.dex??'',{boxClass:box,spriteClass:'panel-portrait-sprite',label:speciesZh(species)});
}
export function typeChips(types:readonly string[]):string {
  return types.map(t=>'<span class="paper-type" style="background:'+(TYPES[t]??'#5f5e50')+'">'+esc(typeZh(t))+'</span>').join('');
}
const AXES=[['hp','HP','#3f8f3a'],['atk','攻击','#c2491f'],['def','防御','#a07a10'],['spa','特攻','#2b6fb0'],['spd','特防','#2f8f7f'],['spe','速度','#b0417f']] as const;
const arrow=(n:number)=>n?' '+(n>0?'+':'-')+Math.abs(n):'';   // the stage label, +N or -N, next to the value
/** One line per ability for the hover text of the table rows (the screen itself carries numbers only). */
const STAT_HINT:Record<string,string>={hp:'体力。降到 0 就倒下。',atk:'攻击：影响物理招式和普通攻击造成的伤害。',def:'防御：减少受到的物理伤害。',spa:'特攻：影响特殊招式造成的伤害。',spd:'特防：减少受到的特殊伤害。',spe:'速度：这个游戏里不影响行动。'};
/** The radar of the current ability values (HP on top, then clockwise): the numbers the damage rule reads, stage arrows included.
 *  The scale is fixed (square-root radius up to RADAR_CAP), so the shape grows with every level and stays readable from Lv5 to Lv100. */
const RADAR_CAP=120;
const radarK=(v:number)=>Math.max(.05,Math.min(1,Math.sqrt(v/RADAR_CAP)));
function detailStats(s:World,u:Unit):string {
  const rows=statSheet(s,u);
  if(!rows)return '<p class="paper-muted">暂无能力值记录</p>';
  const W=250,H=272,CX=125,CY=136,R=78;   // labels sit outside the ring; the canvas is not stretched
  const point=(i:number,k:number)=>{const a=-Math.PI/2+i*Math.PI/3;return [CX+Math.cos(a)*R*k,CY+Math.sin(a)*R*k];};
  const r1=(n:number)=>Math.round(n*10)/10,fmt=(p:number[])=>p.map(r1).join(',');
  const ring=(k:number)=>AXES.map((_,i)=>fmt(point(i,k))).join(' ');
  const spokes=AXES.map((_,i)=>{const [x,y]=point(i,1);return '<line x1="'+CX+'" y1="'+CY+'" x2="'+r1(x)+'" y2="'+r1(y)+'" stroke="#cdb985"/>';}).join('');
  const shape=rows.map((r,i)=>fmt(point(i,radarK(r.value)))).join(' ');
  const labels=AXES.map(([k,n,c],i)=>{
    const r=rows[i],[x,y]=point(i,1.36),[dx,dy]=point(i,radarK(r.value));
    const stage=r.stage?'<tspan class="axis-stage" dx="3">'+arrow(r.stage).trim()+'</tspan>':'';
    return '<circle cx="'+r1(dx)+'" cy="'+r1(dy)+'" r="4" fill="'+c+'"/><g class="axis-label" data-stat="'+k+'" data-stat-tip="'+esc(STAT_HINT[k]??'')+'" tabindex="0" role="img" aria-label="'+esc(n+' '+r.value+(r.stage?arrow(r.stage):''))+'"><rect x="'+r1(x-30)+'" y="'+r1(y-13)+'" width="60" height="44" fill="transparent"/><text class="axis-name" x="'+r1(x)+'" y="'+r1(y)+'" fill="'+c+'">'+n+'</text><text class="axis-value" x="'+r1(x)+'" y="'+r1(y+20)+'">'+r.value+stage+'</text></g>';
  }).join('');
  return '<svg class="detail-stat-chart" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" aria-label="当前能力值"><polygon points="'+ring(1)+'" fill="#e0cfa4" stroke="#b89a56" stroke-width="2"/><polygon points="'+ring(.66)+'" fill="none" stroke="#cdb985"/><polygon points="'+ring(.33)+'" fill="none" stroke="#cdb985"/>'+spokes+'<polygon points="'+shape+'" fill="#d9622b73" stroke="#a64217" stroke-width="2"/>'+labels+'</svg>';
}
/** The run's blessings as a column attached to the right of the window (always there, empty state "无", scrolls inside when it is long): a small sigil, the name and a one-line effect. */
function blessingColumn(s:World):string {
  const rows=(s.blessings??[]).map(id=>'<li data-blessing="'+esc(id)+'" data-rarity="'+(BLESSINGS[id]?.rarity??'common')+'"><i class="bless-sigil" aria-hidden="true"></i><span class="bless-text"><strong>'+esc(BLESSINGS[id]?.name??id)+'<em class="rarity-tag">'+esc(BLESSING_RARITY.names[BLESSINGS[id]?.rarity??'common'])+'</em></strong><small>'+esc(blessingEffectLabel(id))+'</small></span></li>').join('');
  return '<aside class="paper-window detail-blessings" aria-label="本局祝福"><h3>祝福</h3>'+(rows?'<ul id="detail-blessing-list">'+rows+'</ul>':'<p id="detail-blessing-empty">无</p>')+'</aside>';
}
/** Read-only member view (the party only: enemies have their own info card); only the six existing tactic commands are actionable. */
export function unitDetails(s:World,id:string,choices:readonly string[],disabled:boolean):string {
  const tactic=s.units[id]?.tactic??'together';
  const tabs=choices.map(k=>'<button type="button" id="detail-unit-'+esc(k)+'" data-detail-unit="'+esc(k)+'" aria-label="'+esc(unitLabel(s.units[k],k))+'" aria-pressed="'+(k===id)+'">'+unitPortrait(s.units[k],'detail-tab-portrait')+'</button>').join('');
  const u=s.units[id],sp=u.species?SPECIES[u.species]:undefined;
  const moves=u.learned.slice(0,4).map(move=>{
    const f=starterMoveFields(move);
    return '<button type="button" class="paper-move" id="detail-skill-'+esc(move)+'" data-detail-skill="'+esc(move)+'"><span class="paper-move-type" style="background:'+(TYPES[f.type]??'#5f5e50')+'">'+esc(typeZh(f.type))+'</span><strong>'+esc(moveZh(move))+'</strong><span>'+esc(f.category)+'</span><b>'+ (u.pp[move]??0)+'/'+(u.maxPp[move]??0)+'</b><small class="paper-move-numbers">'+esc([moveBaseDamage(s,u,move)!==null?'基础伤害 '+moveBaseDamage(s,u,move):moveShortEffect(move),f.accuracy?'命中 '+f.accuracy.replace('基础 ',''):'',moveRangeTag(move)].filter(Boolean).join(' · '))+'</small></button>';
  });
  while(moves.length<4)moves.push('<div class="paper-move is-empty" aria-hidden="true"></div>');
  const tactics='<section class="detail-tactics"><h3>作战方针</h3><div class="paper-tactics">'+TACTICS.map(t=>'<button type="button" id="detail-tactic-'+t+'" data-detail-tactic="'+t+'" title="'+esc(TACTIC_TEXT[t])+'" aria-pressed="'+(tactic===t)+'"'+(disabled?' disabled':'')+'><svg viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">'+ICONS[t]+'</svg><span>'+TACTIC_LABELS[t]+'</span></button>').join('')+'</div></section>';
  return '<dialog id="unit-details-dialog" class="paper-window detail194" role="dialog" aria-labelledby="detail-heading"><h2 class="paper-plaque" id="detail-heading">详情</h2><div class="detail-tabs" aria-label="成员">'+tabs+'</div><button type="button" class="paper-close" id="unit-detail-close" aria-label="关闭详情">×</button><div class="detail-body"><section class="detail-identity"><div class="detail-portrait-pad">'+unitPortrait(u)+'</div><h3>'+esc(unitLabel(u,id))+'</h3><div>'+typeChips(sp?.types??[])+' <b>Lv'+(u.level??s.prog?.level??'—')+'</b></div><div class="detail-hp"><span>HP</span><b>'+u.hp+'/'+u.maxHp+'</b></div><div class="paper-bar"><i style="width:'+Math.max(0,Math.min(100,u.hp/Math.max(1,u.maxHp)*100))+'%"></i></div><div class="detail-status">'+hudStatusMarkup(u)+'</div></section>'+'<div class="detail-chart"><h3 class="detail-chart-title">能力值</h3>'+detailStats(s,u)+'</div>'+'<div class="detail-moves">'+moves.join('')+'</div></div>'+tactics+'<div id="detail-tooltip" role="tooltip" hidden></div><div id="stat-tip" role="tooltip" hidden></div>'+blessingColumn(s)+'</dialog>';
}
const keycap=(k:string)=>'<kbd>'+k+'</kbd>';
/** All controls retain their existing storage handlers and identifiers. */
export function settingsMarkup():string {
  const keys=[['W A S D','移动'],['W D','同时按下 · 斜向移动'],['1 2 3 4','招式'],['5 6 7 8 9 0','快捷物品'],['F','向前普通攻击'],['Tab','切换操控'],['B','背包'],['.','等待'],['H','百科']];
  return '<dialog id="settings" class="paper-window settings194" aria-labelledby="settings-heading"><h2 id="settings-heading" class="paper-plaque">设置</h2><button id="settings-close" class="paper-close" aria-label="关闭设置">×</button><nav class="settings-side" aria-label="设置分类">'+[['display','画面'],['keys','键位'],['save','存档']].map(([id,label])=>'<button type="button" data-settings-tab="'+id+'" id="settings-tab-'+id+'" aria-pressed="'+(id==='display')+'">'+label+'</button>').join('')+'<button type="button" id="settings-wiki">百科</button><span></span><button id="camp-title" hidden>返回标题</button></nav><div class="settings-pane" id="settings-pane-display"><div class="paper-option"><span>动作动画</span><input type="checkbox" id="anim-toggle" hidden><div class="paper-switch"><button type="button" id="anim-on" aria-pressed="true">开</button><button type="button" id="anim-off" aria-pressed="false">关</button></div></div><div class="paper-option"><span>按住跳过动画</span>'+keycap('Shift')+'</div><div class="settings-run" id="settings-run" hidden><button id="abandon-run" class="paper-button">放弃探险</button></div></div><div class="settings-pane" id="settings-pane-keys" hidden><div class="paper-key-grid">'+keys.map(([keys,label])=>'<div class="paper-key-group"><div class="key-caps'+(label==='移动'?' is-wasd':'')+'">'+keys.split(' ').map(keycap).join('')+'</div><b>'+label+'</b></div>').join('')+'</div></div><div class="settings-pane" id="settings-pane-save" hidden><div id="settings-profile" class="settings-profile"></div><div class="settings-transfer"><button id="save-export" class="paper-button">导出存档</button><button id="save-import" class="paper-button">导入存档</button></div><input id="save-file" type="file" accept=".json,application/json" hidden><p id="transfer-message" role="status" aria-live="polite"></p></div></dialog>';
}
export function settingsProfile(p:Profile|null):string {
  if(!p)return '<p class="paper-muted">尚无营地档案</p>';
  const team=p.team.map(id=>p.roster.find(u=>u.id===id)).filter(u=>!!u);
  return '<div class="settings-team">'+team.map(u=>speciesPortrait(u.species,'settings-portrait')).join('')+'</div><dl>'+[['探险队','Lv'+rankLevel(p.rankExp)],['远征',p.expeditions+' 次'],['伙伴',p.roster.length+' 只']].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>';
}
function resultLoot(s:World,summary:SettleSummary|null):{partners:{species:string;id:string}[];shards:{species:string;count:number}[]} {
  const original=new Set(Object.values(s.units).flatMap(u=>u.inst?[u.inst]:u.protected&&u.id==='A'?['P1']:u.protected&&u.id==='B'?['P2']:[]));
  return {partners:(summary?.brought??[]).filter(u=>!original.has(u.id)),shards:summary?.shards??[]};
}
/** Uses only actual settlement fields. The mock's future/example bonuses never enter the game. */
export function settlement(s:World,summary:SettleSummary|null,ready:boolean,persistent:boolean):string {
  const end=s.end!,won=end.outcome==='won',rank=summary?.rank,{partners,shards}=resultLoot(s,summary);
  const tms=end.tms??[],newPartnerTiles=partners.map(p=>'<li class="loot-tile"><span class="loot-tag">新伙伴</span>'+speciesPortrait(p.species)+'<span>'+esc(speciesZh(p.species))+'</span></li>'),
    shardTiles=shards.map(p=>'<li class="loot-tile">'+speciesPortrait(p.species)+'<span>'+esc(speciesZh(p.species))+'碎片</span><b class="loot-count">×'+p.count+'</b></li>');
  const tmTiles=tms.map(t=>{const f=starterMoveFields(t.move),lost=t.fate==='lost';return '<li class="loot-tile'+(lost?' is-lost':'')+'">'+(lost?'<span class="loot-tag">丢失</span>':'')+'<span class="tm-disc" aria-hidden="true" style="background:'+(TYPES[f.type]??'#5f5e50')+'"></span><span>'+esc(moveZh(t.move))+'</span><small>'+({target:'成果 T',shop:'商店',boss:'区域首领',challenge:'挑战奖励',blessing:'祝福奖励'}[t.source])+'</small></li>';}).join('');
  const rows=rank?[['到达第 '+s.dungeon!.level+' 层',rank.depth],['击败首领',rank.boss],['完成委托 '+(s.completedCommissions??0)+' 个',rank.commissions],['新伙伴经验',rank.recruits],['招式机经验',rank.tms]].filter(([,v])=>Number(v)>0):[];
  const level=rank?.levelAfter??1,after=rank?.after??0,base=rankThreshold(level),next=rankThreshold(level+1),required=next-base,progress=after-base,up=rank?rank.levelAfter-rank.levelBefore:0;
  const xp=rank?'<div class="settlement-xp-top"><h3>探险队经验</h3><strong id="rank-gain" aria-label="探险队经验 +'+rank.total+'，累计 '+rank.before+' → '+rank.after+'">+'+rank.total+'</strong></div><div class="settlement-tally-wrap"><ul class="settlement-tally" id="rank-breakdown" tabindex="0" aria-label="经验明细">'+rows.map(([label,value])=>'<li data-xp-row><span title="'+esc(label)+'">'+esc(label)+'</span><b>+'+value+'</b></li>').join('')+'</ul><div id="rank-more" class="settlement-more" hidden></div></div><div class="settlement-level"><b>探险队 Lv'+level+'</b><b>'+progress+'/'+required+'</b></div><div class="paper-bar"><i style="width:'+Math.min(100,progress/required*100)+'%"></i></div>'+(up?'<div class="settlement-levelup" id="rank-level-change" aria-label="探险队升级：Lv'+rank.levelBefore+' → Lv'+level+'，获得 '+up+' 个天赋点"><span>升至 Lv'+level+'</span><span>天赋点 +'+up+'</span></div>':'<span id="rank-level-change" hidden>探险队 Lv'+level+'</span>'):'<h3>探险队经验</h3><p>本局无此项奖励</p>';
  return '<div class="result settlement194 '+(won?'is-won':'is-wipe')+'" data-run-id="'+esc(s.runId)+'"><header class="settlement-heading"><button type="button" id="result-settings" aria-label="设置与存档">⚙</button><h2>'+SETTLEMENT_TITLES[won?0:1]+'</h2><p>'+esc(THEME_FLOORS[Math.max(0,Math.min(2,(s.dungeon?.level??1)-1))].name)+' · '+DIFFICULTY[s.difficulty??'normal']+'</p><div class="settlement-floors">'+['苔石洞','潮湿水窟','灰烬裂谷'].map((n,i)=>'<div class="'+(i<(s.dungeon?.level??1)?'is-reached':'')+'"><i></i><span>'+n+'</span></div>').join('')+'</div></header><div class="settlement-body"><section class="settlement-team" aria-label="本局队伍">'+end.team.map(id=>'<div class="'+(s.units[id].hp===0?'is-down':'')+'">'+unitPortrait(s.units[id])+'</div>').join('')+'</section><section id="depth-rewards" class="settlement-xp" aria-label="深度和难度奖励">'+xp+'</section><section id="harvest-rewards" class="settlement-loot" aria-label="收获型奖励"><h3>本次收获 '+(partners.length+shards.length)+'</h3><div id="partner-loot-scroll" class="settlement-loot-row" tabindex="0" aria-label="伙伴与碎片收获"><ul id="brought-partners">'+newPartnerTiles.join('')+'</ul><ul id="brought-shards">'+shardTiles.join('')+'</ul>'+(!partners.length&&!shards.length?'<p class="paper-muted">本局无此项奖励</p>':'')+'</div><h3>招式机 '+tms.length+'</h3><ul id="tm-list" class="settlement-loot-row" tabindex="0" aria-label="招式机收获">'+(tmTiles||'<li class="paper-muted">本局无此项奖励</li>')+'</ul></section><footer class="settlement-foot"><div id="settlement-save"></div><section id="camp-task-rewards" aria-label="营地任务奖励">营地任务 · 本局无此项奖励</section><button id="'+(persistent?'to-base':'new')+'" class="paper-button is-primary"'+(!ready?' disabled':'')+'>'+(persistent?'返回营地':'开始独立试验')+'</button></footer></div></div>';
}
