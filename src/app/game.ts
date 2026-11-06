import type Phaser from 'phaser';
import {hudParty,hudBottom,hudMinimap,hudTracking,hudBag,hudMoveTip,hudMoveAccuracy,hudDamageEstimate} from '../render/hud.ts';
import '../render/hud.css';
import {unitDetails,settingsMarkup,settingsProfile,settlement} from '../render/panels194.ts';
import '../render/panels194.css';
import {CAMP_BUILDINGS,campScene,campPanelMarkup,campParty194,campVault194,normalizeVault194,campRecords194,campDeparture194,campMoveTooltip194,type CampPanel,type VaultState,type CampReport} from '../render/camp.ts';
import {applyCommand,traceRound,playerVisibleCells,previewInvitation,createMain,createExpedition,key,same,plus,clone,facingOf,skillTargets,sleeping,ITEM_NAMES,PROG,COMMISSIONS,BLESSINGS,type World,type Action,type Skill,type Pos,type Item,type Unit,type ShopItem,type TmItem,type Point,type CommissionId} from '../core/engine.ts';
import {ECON} from '../core/economy.ts';
import {SPECIES,ALL_TM_MOVES,STARTER_IDS,learnableMove} from '../core/roster.ts';
import {speciesZh,moveZh,tmZh,typeZh,itemZh,adventureRoomTypeZh,adventureRoomStateZh,challengeRewardZh} from '../core/names.ts';
import {moveOf} from '../core/moves.ts';
import {unitLabel,skillLabel,actionText,orderLine,stepRows,enemyInfo,localizeLog,playerText,moveSummary,adventureRoomMarkers} from '../core/describe.ts';
import {renderTitle,renderNewGame,portrait,portraitTick,type NewGameState} from '../ui/title.ts';
import {newGameProfile,initialProfile,squadOf,TALENTS,TALENT_MAX_RANK,rankLevel,rankThreshold,availableTalentPoints,type BaseAction,type Profile,type TalentId} from '../core/base.ts';
import {TACTICS,TACTIC_LABELS,isTactic,type Tactic} from '../core/tactics.ts';
import {TrialStore,SAVE_KEY,BUILD_ID,type StoragePort} from '../core/save.ts';
import {createScenario,scenarioProfile,SCENARIOS,SCENARIO_LABEL,type ScenarioId} from '../core/scenarios.ts';
import {THEME_FLOORS,themeOfLevel,ARENA_TILE,isDifficulty,type Difficulty} from '../core/dungeon.ts';
import {preloadArt,createAnims,createTerrainArt,exportTerrainArt,skinFor,facingRow,animKey,groundOriginY,UNIT_GROUND_FRACTION,TILE} from '../render/sprites.ts';
import {terrainSource} from '../render/dtef.ts';
import {DtefTerrainLayer} from '../render/dtef-scene.ts';
import {PainterTerrainLayer} from '../render/painter-scene.ts';
import {BOARD_BACKGROUND,darknessBackground,DungeonDarkness} from '../render/darkness.ts';
import {prepareTerrainMap,type TerrainThemeKey,type TerrainLayer} from '../render/terrain.ts';
import {inferEvents,plan,newLines,type AnimEvent} from '../render/animation.ts';
import {selfOrAdjacentReachable,adjacentReachable,floorIndex} from '../render/reach.ts';
import {POINT_VISUALS,dungeonCellSize} from '../render/point-visuals.ts';
import {itemDescription} from '../core/item-descriptions.ts';
import {playEvents,type Stage,type UnitView} from '../render/playback.ts';
import {placeHp} from '../render/unit-labels.ts';
/** Integer multiples of the 24 px source keep terrain and actors aligned at every viewport size. */
// The cell size is chosen from the actual canvas height in BoardScene.geometry.
const DIFFICULTY_LABEL:Record<Difficulty,string>={easy:'简单',normal:'普通',hard:'困难'};
const specName=(u:Unit)=>u.species?speciesZh(u.species):'';
const tmName=(m:string)=>tmZh(m);
const spName=(id:string)=>speciesZh(id);
const tacticOf=(value:unknown,fallback:Tactic='together'):Tactic=>isTactic(value)?value:fallback;
const tacticSelect=(id:string,value:unknown,disabled:boolean)=>`<label for="${esc(id)}">作战方针 <select id="${esc(id)}" ${disabled?'disabled':''}>${TACTICS.map(t=>`<option value="${t}" ${tacticOf(value)===t?'selected':''}>${TACTIC_LABELS[t]}</option>`).join('')}</select></label>`;
const experienceProgress=(s:World)=>{
 const p=s.prog;if(!p)return '';
 const level=Math.min(p.level,PROG.maxLevel),currentThreshold=PROG.thresholds[level]??0,nextThreshold=PROG.thresholds[level+1];
 if(nextThreshold===undefined)return `Lv${level} · 升级经验已满（累计 ${p.exp}）`;
 const required=nextThreshold-currentThreshold,progress=Math.max(0,Math.min(required,p.exp-currentThreshold));
 return `Lv${level} · 升级经验 ${progress}/${required}（升到下一级需当前等级经验；击倒敌人获得其等级×${PROG.expMultiplier}的经验）`;
};
const FATE:Record<TmItem['fate'],string>={held:'持有中',brought:'已带回',sent:'已由伙伴运送',lost:'已取得、未带出'};
const SRC:Record<TmItem['source'],string>={target:'成果 T',shop:'商店',boss:'区域首领',challenge:'挑战奖励'};
const REASON:Record<string,string>={goal:'完成了基础目标 G',recruit:'保留了本局新招募的伙伴',tm:'带回或安全送回了招式机'};
const tmLine=(t:TmItem)=>`${tmName(t.move)}（${SRC[t.source]}）：${FATE[t.fate]}`;
const params=new URLSearchParams(location.search);
/** Developer mode (stage 7.1): `?dev=1` or `?fixture=`. Only here do the fixed map, the no-invitation control, fixtures, `?seed=` and coordinates exist; the title screen is skipped. */
const dev=params.get('dev')==='1'||(params.get('fixture')!==null&&(SCENARIOS as readonly string[]).includes(params.get('fixture')!));
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<header><div class="brand">宝可梦地牢探索</div><div class="build">版本 ${BUILD_ID.replace(/^trial-/,'')} <button id="open-settings">设置与存档</button> · ${dev?'私有单层试验 · 开发者模式':'私有试玩构建'}${dev?'':'<button id="to-title">返回标题</button>'}</div></header><main><section class="left"><div class="intro"><small>探索 · 伙伴 · 选择</small><h1>下一步，由你决定。</h1><p>${dev?'使用开发者菜单检查固定场景或三层首领战，结果只在本页内存中。':'逐层探索迷宫、招募伙伴，击败第三层的首领。伙伴始终归营，招式机胜利后带回。'}</p></div><section id="guide"></section><div class="board-head"><span id="world-label">尚未出发</span><span id="goal-label"></span></div><div id="board"></div><div class="legend"><span><i class="friend"></i>同行</span><span><i class="enemy"></i>敌人</span><span>G 基础目标</span><span>T 成果</span><span>下 楼梯</span><span id="legend-items" hidden>果／剂 橙橙果／PP多项小补剂 · 休 休整点（每局一次） · 商 商店（稀有，用钱袋） · 换 伙伴交换机（稀有，每局一次）</span><span>暗格尚未揭示</span>${dev?'<label><input type="checkbox" id="coords-toggle"> 显示坐标（开发者）</label>':''}</div><div id="message" role="status" aria-live="polite"></div><section id="inspect" aria-live="polite"></section><section id="recent-events"></section><section id="flow"></section><details><summary>本轮发生了什么</summary><ol id="history"></ol></details></section><aside><section id="save" aria-live="polite"></section><section><h2>同行队列 <small>一人一次行动 → 敌方</small></h2><p class="muted">在队友卡片上更改作战方针，不占回合；点击详情可查看招式与当前方针。</p><div id="party"></div></section><section id="controls"></section>${dev?`<details id="developer-tools"><summary>开发者菜单：检查入口（隔离存储）</summary><p>检查初态不是玩家关卡，也不替换当前试验。</p><select id="fixture">${SCENARIOS.map(id=>`<option value="${id}">${SCENARIO_LABEL[id]??id}</option>`).join('')}</select><button id="open-fixture">新窗口检查</button><p>运行时地形图集（每层含 47 种形状及 4 个变体）</p><label>主题 <select id="terrain-theme"><option value="moss">苔石洞</option><option value="wet">潮湿水窟</option><option value="ash">灰烬裂谷</option></select></label><label>图层 <select id="terrain-layer"><option value="floor">连续地面</option><option value="edge">地面边缘</option><option value="liquid">水面／岩浆</option><option value="wall">墙体</option></select></label><button id="export-terrain">导出地形图集 PNG</button></details>`:''}<footer>无需账号，进度保存在此浏览器</footer></aside></main><div id="title-screen" class="screen" hidden></div>${settingsMarkup()}`;
const fixture=params.get('fixture') as ScenarioId|null;
const checkMode=fixture!==null&&SCENARIOS.includes(fixture);
const legend=document.querySelector<HTMLElement>('.legend')!;
legend.innerHTML='<span><i class="friend"></i>同行</span><span><i class="enemy"></i>敌人</span><span id="legend-goal">G 基础目标</span><span>T 成果</span><span>下 楼梯</span><span id="legend-items" hidden>果／剂 橙橙果／PP多项小补剂 · 休 休整点（每局一次） · 商 商店（稀有，用钱袋） · 换 伙伴交换机（稀有，每局一次）</span><span id="legend-items-roguelike" hidden>果／剂 橙橙果／PP多项小补剂 · 休 休整点（每局一次） · 商 商店（稀有，用钱袋）</span><span id="legend-adventures" hidden>房间：挑挑战 · 委委托 · 祝祝福 · 道道具（暗色已完成，封闭为挑战中）</span><span>暗格尚未揭示</span>'+(dev?'<label><input type="checkbox" id="coords-toggle"> 显示坐标（开发者）</label>':'');
const activityStatusRoot=document.createElement('section');activityStatusRoot.id='activity-status';activityStatusRoot.setAttribute('aria-live','polite');document.getElementById('save')!.after(activityStatusRoot);
// Stateful panels return to their original positions at camp.
const dungeonLayout=document.createElement('div');dungeonLayout.id='dungeon-layout';dungeonLayout.hidden=true;
dungeonLayout.innerHTML=`<div id="dungeon-hud"><div id="hud-map"></div><div id="shortcut-card"><span>WASD</span><span>移动</span><span>W+D 等</span><span>斜向移动</span><span>1—4</span><span>招式</span><span>5—0</span><span>快捷物品</span><span>Tab</span><span>切换操控</span><span>B</span><span>背包</span><span>F</span><span>向前普通攻击</span><span>.</span><span>等待</span></div><div id="hud-tools"><button id="actions-open" aria-label="行动菜单">⋯</button><button id="hud-settings" aria-label="设置与存档">⚙</button></div><div id="context-actions"></div><div id="hud-actions" hidden></div><div id="hud-item-targets" hidden></div><div id="hud-bottom"></div><div id="hud-tooltip" role="tooltip" hidden></div><div id="hud-bag" hidden></div><div id="unit-details-layer"></div></div>`;
app.append(dungeonLayout);
const panelHomes=new Map<HTMLElement,Comment>();
for(const id of ['board','party','activity-status','recent-events','message','inspect','controls','flow','save',...(dev?['developer-tools']:[])]){const el=document.getElementById(id)!;const home=document.createComment(id);el.before(home);panelHomes.set(el,home);}
let actionsOpen=false,bagOpen=false,bagCategory='all',bagSlot=0;
let bagSelectedItem:Item|null=null;
let quickItems:(Item|null)[]=Array.from({length:6},()=>null);
function dungeonMode(){return screen==='play'&&!!live();}
function syncDungeonLayout(){
 const active=dungeonMode();document.body.classList.toggle('dungeon-mode',active);dungeonLayout.hidden=!active;
 for(const [el,home] of panelHomes){if(active){const parent=el.id==='board'?dungeonLayout:el.id==='controls'||el.id==='save'||el.id==='developer-tools'?document.getElementById('hud-actions')!:document.getElementById('dungeon-hud')!;if(el.parentNode!==parent)parent.append(el);}else if(el.previousSibling!==home)home.after(el);}
 if(!active){bagOpen=false;actionsOpen=false;document.getElementById('flow')!.hidden=false;}
}

/** `?seed=<integer>` fixes the expedition seed (browser checks); otherwise every expedition draws a fresh one. */
const seedParam=params.get('seed');
const newSeed=()=>dev&&seedParam!==null&&/^\d+$/.test(seedParam)?Number(seedParam)>>>0:Math.floor(Math.random()*4294967296);
const begin=(config:string):World=>config==='expedition'?createExpedition(newId(),newSeed(),3,squadOf(initialProfile()),0,true,5):createMain(newId(),config==='main-invite');
const newId=()=>crypto.randomUUID();
let port:StoragePort;
try{port=window.localStorage;}catch{port={getItem(){throw Error('浏览器拒绝读取本地存储');},setItem(){throw Error('浏览器拒绝本地存储');}};}
// Browser diagnostics use the public controller; production storage is never replaced by fixtures.
const store=new TrialStore(port,checkMode?`dungeon-trial.check.${fixture}`:SAVE_KEY);
let selectedConfig='main-invite';
let draft:{partner:string;action:Action|null;main:Action|null;editor:string;swap:boolean}|null=null;
let choosingItem:Item|null=null;
let selectedSkill:Skill|null=null, choosingPartner=false,choosingSwap=false,confirmExit=false;
let inviteChoice:string|undefined,inviteReject=false,notice='',detailsId:string|null=null,detailsOpenerId:string|null=null;
let campSelected:string|null=null,departureOpen=false;
let vaultState:VaultState={tab:'tm',by:'type',filter:'all',move:null,learner:null,shard:null};
let campPanel:CampPanel|null=null;
let campWindowCycle=0;
let lastCampReport:CampReport|null=null;
/** 7.2: the purse chosen at the base, and the exchanger choices (companion to send, indexes of the machines to carry) before they are confirmed. */
let exTarget:string|null=null,exCargo:number[]=[];
type BoardScene=InstanceType<ReturnType<typeof makeBoardScene>>;
let scene:BoardScene|null=null;
let boardLoading:Promise<void>|null=null;
/** Stage 7.1 screens: the title and the new-game pages sit on top of the game view; developer mode starts in the game view as before. */
let screen:'title'|'newgame'|'play'=dev?'play':'title';
let ng:NewGameState={step:1,main:null,deputy:null,overwrite:false};
let askOverwrite=false,exportedOriginal=false,ngError='',showCoords=false;
let hoverId:string|null=null,pinnedId:string|null=null;
/** Who hit whom this round (inferred by the same code that drives the animation) and how many log lines the last command added. */
let attrib=new Map<string,string>(),freshCount=0;
/** Stage 6.4: `active` is true while a round's animation plays; every world-changing input is dropped (not queued) meanwhile. */
const anim={active:false,shift:false};
let sleepTimer:ReturnType<typeof setTimeout>|null=null,sleepTurn='';
const sleepAutoEnabled=()=>!(window as unknown as {__trialNoAutoSleep?:boolean}).__trialNoAutoSleep;
function cancelSleepAdvance(){if(sleepTimer!==null)clearTimeout(sleepTimer);sleepTimer=null;sleepTurn='';}
function syncSleepAdvance(){
 const s=live(),eligible=screen==='play'&&s?.phase==='playing'&&store.status==='ready'&&!anim.active&&!settings.open&&!detailsId&&sleepAutoEnabled()&&sleeping(s.units[s.leader]);
 if(!eligible||!s){cancelSleepAdvance();return;}
 const turn=s.runId+'|'+s.round+'|'+s.leader;if(sleepTimer!==null&&sleepTurn===turn)return;
 cancelSleepAdvance();sleepTurn=turn;sleepTimer=setTimeout(()=>{
  sleepTimer=null;sleepTurn='';const current=live();
  if(current&&current.runId+'|'+current.round+'|'+current.leader===turn&&screen==='play'&&current.phase==='playing'&&store.status==='ready'&&!anim.active&&!settings.open&&!detailsId&&sleepAutoEnabled()&&sleeping(current.units[current.leader]))void send({type:'round',action:{type:'wait'}});
 },600);
}

const PREF_KEY='trial-anim-pref'; // deliberately outside the `dungeon-trial.` namespace used by the save store
/** Animation switch: `?anim=off|on` wins, then `window.__trialNoAnim` (browser checks), then the saved checkbox, then reduced-motion. */
const animationEnabled=():boolean=>{const q=params.get('anim');if(q==='off')return false;if(q==='on')return true;if((window as unknown as {__trialNoAnim?:boolean}).__trialNoAnim)return false;
 try{const v=window.localStorage.getItem(PREF_KEY);if(v==='off')return false;if(v==='on')return true;}catch{/* storage may be blocked */}
 return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;};
const $=(id:string)=>document.getElementById(id)!;
const esc=(s:unknown)=>String(s).replaceAll('主控','操控者').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const button=(id:string,label:string,disabled=false,extra='')=>`<button id="${id}" ${disabled?'disabled':''} ${extra}>${label}</button>`;
const live=()=>store.state;
const combatStatus=(u:Unit):string=>[
 u.protect>0?`守住：剩余${u.protect}个敌方阶段`:'',
 u.counter>0?`反击：剩余${u.counter}个敌方阶段`:'',
 (u.reflect??0)>0?`反射壁：剩余${u.reflect}个敌方阶段`:'',
 (u.lightscreen??0)>0?`光墙：剩余${u.lightscreen}个敌方阶段`:'',
 u.stages.atk?`攻击${u.stages.atk>0?'+':''}${u.stages.atk}`:'',
 u.stages.def?`防御${u.stages.def>0?'+':''}${u.stages.def}`:'',
].filter(Boolean).join(' · ');
const resources=(s:World,id:string)=>{const u=s.units[id];return `${unitLabel(u,id)} ${u.hp}/${u.maxHp}HP · ${u.learned.map(k=>`${skillLabel(u,k)}（${moveSummary(k)}） ${u.pp[k]??0}/${u.maxPp[k]??0}`).join(' · ')||'普通攻击'}`;};
function bind(id:string,fn:()=>void){const el=document.getElementById(id);if(el)el.addEventListener('click',fn);}
function clear(keepMovement=false){if(!keepMovement)cancelMoveInput();actionsOpen=false;exTarget=null;exCargo=[];draft=null;selectedSkill=null;choosingItem=null;choosingPartner=false;choosingSwap=false;confirmExit=false;}
/** A saved pending exit or pending crossing is completed once, automatically, after the save succeeded. */
const finishing=():Parameters<typeof applyCommand>[1]|null=>{const p=store.state?.phase;return store.status!=='ready'?null:p==='exit'?{type:'finishExit'}:p==='transit'?{type:'finishTransit'}:null;};
async function transition(p:Promise<unknown>,clearDraft=true){if(clearDraft)clear();render();await p;render();const next=finishing();if(next){const done=store.dispatch(next);render();await done;render();}}
async function send(command:Parameters<typeof applyCommand>[1],keepMovement=false){if(!keepMovement)cancelMoveInput();if(anim.active)return;if(store.status!=='ready'){notice='保存未完成，当前只可查看或重试；本轮未执行。';render();return;}const predicted=applyCommand(live()!,command);if(!predicted.ok){notice=predicted.error;render();return;}const cancelledCombination=command.type==='switch'&&draft!==null;const before=clone(live()!);const pending=store.dispatch(command);
 let playing:Promise<void>|null=null;{const after=live();
  // Animation is presentation only: any failure here must leave the input lock released and the real state drawn.
  try{if(after){freshCount=newLines(before.log,after.log).length;attrib=new Map();for(const e of inferEvents(before,after,command))if(e.k==='hit'&&e.attacker)attrib.set(`${e.target}|${e.amount}`,e.attacker);}}catch{attrib=new Map();freshCount=0;}
  try{const events=scene&&after&&animationEnabled()&&!anim.shift?inferEvents(before,after,command):[];if(scene&&events.length&&plan(events)){anim.active=true;playing=scene.animate(before,after!,events).finally(()=>{anim.active=false;render();});}}
  catch{anim.active=false;playing=null;render();}}
 clear(keepMovement);notice=cancelledCombination?'组合已取消。':'';if(command.type==='invite'){inviteChoice=undefined;inviteReject=false;}render();const r=await pending;if(!r.ok)notice=r.error;render();if(playing)await playing;const next=finishing();if(next)await transition(store.dispatch(next));return playing!==null;}
async function setTactic(actor:string,value:string){
 if(anim.active||store.status!=='ready'||!live()||live()!.phase!=='playing'||!isTactic(value))return;
 const pending=store.dispatch({type:'tactic',actor,tactic:value});
 render();const result=await pending;
 notice=result.ok?`${unitLabel(live()?.units[actor],actor)}的方针已改为${TACTIC_LABELS[value]}（不占回合）`:result.error;
 render();
}
function act(action:Action){cancelMoveInput();if(anim.active||!live()||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;
 if(sleeping(live()!.units[live()!.leader])&&action.type!=='wait')return;
 selectedSkill=null;choosingItem=null;
 if(draft?.swap){notice='换位已占双方动作卡；要改成其他动作，请先取消组合。';render();return;}
 if(draft){if(draft.editor===live()!.leader)draft.main=action;else draft.action=action;render();return;}
 if(action.type==='interact'&&action.exit){confirmExit=true;render();return;}
 void send({type:'round',action});
}
function clickCell(p:Pos){const s=live();if(anim.active||!s||s.phase!=='playing'||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;
 const id=draft?.editor??s.leader;const target=[...s.queue,...s.enemies].find(i=>s.units[i].hp>0&&same(s.units[i].pos,p)&&s.seen.includes(key(p)));
 if(selectedSkill){
  const legal=skillTargets(s,id,selectedSkill);
  if(target&&legal.includes(target)){
   const range=moveOf(selectedSkill)?.range;
   act({type:'skill',skill:selectedSkill,target:range==='user'||range==='room'?id:target});
  }else if(target){
   const action:Action={type:'skill',skill:selectedSkill,target};
   const cmd=draft&&id!==s.leader
    ?{type:'round' as const,action:draft.main??{type:'wait' as const},override:{actor:id,action}}
    :{type:'round' as const,action,...(draft?.action?{override:{actor:draft.partner,action:draft.action}}:{})};
   const checked=applyCommand(s,cmd);
   notice=checked.ok?'该招式不能指定这个目标；本轮未执行':checked.error;
   render();
  }else{notice='该招式需要存活的合法目标；本轮未执行。';render();}
  return;
 }
 if(target&&s.enemies.includes(target))act({type:'basic',target});else act({type:'move',to:p});
}
const itemName=(id:Item)=>id==='teamTonic'?itemZh(id):ITEM_NAMES[id];
function actionLabel(a:Action|null,actor?:string){const target=(id:string)=>id===actor?'自身':unitLabel(live()?.units[id],id);if(!a)return '尚未选择';if(a.type==='move')return '移动';if(a.type==='skill')return `${moveZh(a.skill)} → ${target(a.target)}`;if(a.type==='basic')return `普通攻击 → ${target(a.target)}`;if(a.type==='basicForward')return '向前普通攻击';if(a.type==='swap')return `与${target(a.target)}换位`;if(a.type==='use')return a.item==='teamTonic'?`使用${itemName(a.item)}（全队）`:`使用${itemName(a.item)} → ${target(a.target)}`;if(a.type==='interact')return a.exit?'交互并请求跨层':'取得并继续';return '等待';}
type AdventureRoom=NonNullable<World['adventureRooms']>[number];
const challengeRewardPool=()=>[
 `${challengeRewardZh('currency')}（30%）`,
 `${challengeRewardZh('item')}（25%，${ITEM_NAMES.bigBerry}与${itemZh('teamTonic')}各50%）`,
 `${challengeRewardZh('invite')}（15%）`,
 `${challengeRewardZh('tm')}（15%）`,
 `${challengeRewardZh('blessing')}（15%；清场后从可用选项中选一项）`,
].join('、');
function commissionPenaltyText(penalty:typeof COMMISSIONS[CommissionId]['penalty']):string{
 return penalty==='defenseMinusOne'?'全队防御阶段 −1（委托生效期间）':penalty==='berryHealHalf'?'树果回复减半（委托生效期间）':'无';
}
function activityStatus(s:World):string{
 if(!s.dungeon?.roguelike||s.phase==='ended')return '';
 const commissions=(s.commissions??[]).map(c=>{
  const spec=COMMISSIONS[c.id],progress=c.speedLimit===null?`${c.progress}/${c.progressTarget}`:`已用 ${c.progress}/${c.speedLimit} 轮`;
  return `<li><strong>${esc(spec.name)}</strong> · 第${c.floor}层接下 · 需本层完成 · 进度 ${progress}<p>${esc(spec.description)}</p><p class="muted">负面效果：${commissionPenaltyText(spec.penalty)}</p></li>`;
 }).join('');
 const blessings=(s.blessings??[]).map(id=>{const blessing=BLESSINGS[id];return `<li><strong>${esc(blessing.name)}</strong>：${esc(blessing.description)}</li>`;}).join('');
 return `<section class="unit" id="commission-status"><h2>进行中的委托（${(s.commissions??[]).length}/3）</h2>${commissions?`<ul>${commissions}</ul>`:'<p>暂无进行中的委托。</p>'}</section><section class="unit" id="blessing-status"><h2>已获得的祝福</h2>${blessings?`<ul>${blessings}</ul>`:'<p>尚未获得祝福。</p>'}</section>`;
}
function adventureRoomPanel(s:World,room:AdventureRoom,editor:string,ready:boolean,draftActive:boolean):string{
 const typeName=adventureRoomTypeZh(room.type),stateName=adventureRoomStateZh(room.type,room.state),canAct=ready&&editor===s.leader&&!draft?.swap;
 const heading=`${typeName}房 · ${stateName}`;
 if(room.type==='challenge'){
  if(room.state==='idle')return `<section class="service" id="adventure-room-panel" data-room-type="challenge" data-room-state="idle"><h2>${heading}</h2><p>奖励池：${challengeRewardPool()}。具体奖励在清场后公布。</p>${draftActive&&editor!==s.leader?'<p class="muted">请先切回操控者，再安排开始挑战。</p>':''}${button('start-challenge','开始挑战',!canAct,'data-action="start-challenge" class="primary"')}</section>`;
  if(room.state==='sealed')return `<section class="service" id="adventure-room-panel" data-room-type="challenge" data-room-state="sealed"><h2>${heading}</h2><p>门已封闭；击倒房间里的全部挑战敌人后会开门并发放奖励。</p></section>`;
  const reward=[...s.log].reverse().find(line=>line.startsWith('挑战奖励：'));
  return `<section class="service" id="adventure-room-panel" data-room-type="challenge" data-room-state="cleared"><h2>${heading}</h2><p id="challenge-reward-result">${reward?`实际奖励：${esc(localizeLog(s,reward.replace(/^挑战奖励：/,'')))}`:'奖励已发放；具体内容见最近事件与本轮记录。'}</p></section>`;
 }
 if(room.type==='item'){
  const item=room.item?itemName(room.item):'道具';
  return room.state==='done'?`<section class="service" id="adventure-room-panel" data-room-type="item" data-room-state="done"><h2>${heading}</h2><p>${esc(item)}已拾取，门口标记已变暗。</p></section>`:
   `<section class="service" id="adventure-room-panel" data-room-type="item" data-room-state="idle"><h2>${heading}</h2><p>交互格上有${esc(item)}，拾取后会放入本局背包。</p>${button('take-adventure-item',`拾取${esc(item)}`,!canAct,'data-action="take-adventure-item" class="primary"')}</section>`;
 }
 if(room.type==='commission')return `<section class="service" id="adventure-room-panel" data-room-type="commission" data-room-state="${room.state}"><h2>${heading}</h2><p>${room.state==='idle'?'交互后可以查看本层试炼，选择接下或拒绝；拒绝会完成此房间。':'此房间已处理；进行中的委托进度与效果显示在右侧。'}</p>${room.state==='idle'?button('interact-commission','查看本层委托',!canAct,'data-action="interact-commission"'):''}</section>`;
 return `<section class="service" id="adventure-room-panel" data-room-type="blessing" data-room-state="${room.state}"><h2>${heading}</h2><p>${room.state==='idle'?'交互后可以选择一项祝福，也可以放弃。':`此房间已处理；已获得的祝福显示在右侧。`}</p>${room.state==='idle'?button('interact-blessing','查看祝福选项',!canAct,'data-action="interact-blessing"'):''}</section>`;
}
function render(){document.body.classList.toggle('camp-mode',screen==='play'&&store.atBase);syncDungeonLayout();for(const id of ['context-actions','hud-bottom','hud-item-targets'])$(id).replaceChildren();renderOverlay();renderMain();renderExtras();renderDungeonHud();refreshTransfer();syncSleepAdvance();if(screen==='play')void ensureBoard();}

function chooseHudSkill(skill:Skill){cancelMoveInput();selectedSkill=selectedSkill===skill?null:skill;choosingItem=null;bagOpen=false;actionsOpen=false;render();}
function chooseHudItem(item:Item){
 cancelMoveInput();const s=live();if(!s||s.phase!=='playing'||store.status!=='ready'||anim.active)return;
 if((s.prog?.items[item]??0)<1){notice=`背包里没有${itemName(item)}；本轮未执行`;render();return;}
 bagOpen=false;actionsOpen=false;selectedSkill=null;
 choosingItem=choosingItem===item?null:item;render();
}
function showMoveTip(skill:Skill,actor:string){
 const s=live();if(!s||bagOpen||anim.active)return;const pending=s.phase==='learning'?s.pendingLearnMoves?.find(p=>p.actor===actor&&p.move===skill):undefined,unit=s.units[actor];
 const preview=pending&&unit?{...s,units:{...s.units,[actor]:{...unit,pp:{...unit.pp,[skill]:pending.pp},maxPp:{...unit.maxPp,[skill]:pending.pp}}}}:s;
 const detailDialog=document.getElementById('unit-details-dialog') as HTMLDialogElement|null;
 const box=(s.phase==='learning'?document.getElementById('learning-tooltip'):detailDialog?.open?document.getElementById('detail-tooltip'):null)??$('hud-tooltip');
 if(s.phase==='learning')$('hud-tooltip').hidden=true;
 box.dataset.sourceId=actor;box.innerHTML=hudMoveTip({...preview,leader:actor},skill);refreshDamagePreviews(s);box.hidden=false;
 if(box.id==='detail-tooltip'&&detailDialog){const row=detailDialog.querySelector<HTMLElement>('[data-detail-skill="'+CSS.escape(skill)+'"]')!,r=row.getBoundingClientRect(),d=detailDialog.getBoundingClientRect();box.style.left=Math.max(8,Math.min(detailDialog.clientWidth-box.offsetWidth-8,r.left-d.left-box.offsetWidth-12))+'px';box.style.top=Math.max(detailDialog.scrollTop+8,Math.min(r.top-d.top+detailDialog.scrollTop,detailDialog.scrollTop+detailDialog.clientHeight-box.offsetHeight-8))+'px';}
}
function renderDetailsPanel(s:World,disabled:boolean){
 const host=$('unit-details-layer'),previous=document.getElementById('unit-details-dialog');
 const focusId=previous?.contains(document.activeElement)?(document.activeElement as HTMLElement).id:null,scrollTop=previous?.scrollTop??0;
 host.replaceChildren();
 if(!detailsId||!s.units[detailsId]||s.phase!=='playing')return;
 const selected=detailsId,choices=[...s.queue,...s.enemies.filter(id=>!!enemyInfo(s,id))];
 host.innerHTML=unitDetails(s,selected,choices,disabled);const dialog=$('unit-details-dialog') as HTMLDialogElement;
 const close=()=>{const opener=detailsOpenerId;detailsId=null;detailsOpenerId=null;actionsOpen=false;render();if(opener)document.querySelector<HTMLButtonElement>('[data-hud-details="'+CSS.escape(opener)+'"]')?.focus({preventScroll:true});};bind('unit-detail-close',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 for(const b of host.querySelectorAll<HTMLButtonElement>('[data-detail-unit]'))b.onclick=()=>{detailsId=b.dataset.detailUnit!;render();};
 for(const b of host.querySelectorAll<HTMLButtonElement>('[data-detail-tactic]'))b.onclick=()=>{const tactic=b.dataset.detailTactic;if(isTactic(tactic))void setTactic(selected,tactic);};
 for(const b of host.querySelectorAll<HTMLButtonElement>('[data-detail-skill]')){const show=()=>showMoveTip(b.dataset.detailSkill!,selected),hide=()=>{const active=host.querySelector<HTMLButtonElement>('[data-detail-skill]:focus')??host.querySelector<HTMLButtonElement>('[data-detail-skill]:hover');if(active)showMoveTip(active.dataset.detailSkill!,selected);else{const tip=document.getElementById('detail-tooltip');if(tip)tip.hidden=true;}};b.onmouseenter=show;b.onfocus=show;b.onmouseleave=hide;b.onblur=hide;}
 dialog.showModal();dialog.scrollTop=scrollTop;if(focusId&&dialog.contains(document.getElementById(focusId)))document.getElementById(focusId)?.focus({preventScroll:true});cancelSleepAdvance();
}
function refreshSettlementOverflow(){
 const list=document.getElementById('rank-breakdown'),cue=document.getElementById('rank-more');if(!list||!cue)return;
 const bottom=list.getBoundingClientRect().bottom-20,remaining=list.scrollHeight>list.clientHeight+1?Array.from(list.children).filter(el=>el.getBoundingClientRect().bottom>bottom+.5).length:0;
 cue.textContent='还有 '+remaining+' 项';cue.hidden=remaining===0;
}
function placeInspectBelowParty(){if(!dungeonMode())return;const party=$('party');$('inspect').style.top=(party.offsetTop+party.offsetHeight+8)+'px';}
function renderDungeonHud(){
 if(!dungeonMode())return;
 const s=live()!,unavailable=store.status!=='ready'||s.phase!=='playing',disabled=anim.active||unavailable;
 $('party').innerHTML=hudParty(s,unavailable);
 placeInspectBelowParty();
 $('hud-bottom').innerHTML=hudBottom(s,quickItems,unavailable||sleeping(s.units[s.leader]),draft&&draft.editor!==s.leader?null:selectedSkill,choosingItem);
 $('hud-map').innerHTML=hudMinimap(s);
 $('activity-status').innerHTML=hudTracking(s);$('activity-status').hidden=!s.dungeon?.roguelike;
 $('hud-tooltip').hidden=true;$('hud-tooltip').innerHTML='';
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-hud-leader]'))b.onclick=()=>{actionsOpen=false;void send({type:'switch',actor:b.dataset.hudLeader!});};
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-hud-details]'))b.onclick=()=>{const id=b.dataset.hudDetails!;const close=actionsOpen&&detailsId===id;detailsId=close?null:id;detailsOpenerId=close?null:id;actionsOpen=!close;render();};
 // The old action editor retains its transactional draft, service and confirmation handlers.
 // Its move/item controls are replaced by the actual HUD controls, so no duplicate IDs remain.
 $('controls').querySelectorAll(':scope > h2,:scope > p.muted,.items').forEach(el=>el.remove());
 const draftSkills=$('controls').querySelector('.skills');
 if(draft&&draft.editor!==s.leader){draftSkills?.querySelectorAll<HTMLElement>('button').forEach(b=>{b.id='draft-'+b.id;b.querySelectorAll('small').forEach(el=>el.remove());const skill=b.id.slice('draft-skill-'.length),actor=draft!.editor;const show=()=>showMoveTip(skill,actor);const hide=()=>{$('hud-tooltip').hidden=true;};b.onmouseenter=show;b.onfocus=show;b.onmouseleave=hide;b.onblur=hide;});}else draftSkills?.remove();
 const context=$('context-actions');context.replaceChildren();
 for(const b of Array.from($('controls').querySelectorAll<HTMLButtonElement>(':scope > #take,:scope > #rest,:scope > #take-exit'))){context.append(b);}
 for(const panel of Array.from($('controls').querySelectorAll<HTMLElement>('#adventure-room-panel,#shop-panel,#exchange-panel'))){
  panel.querySelectorAll('p:not(#purse-line):not(#challenge-reward-result):not(#exchange-result),h2 small').forEach(el=>el.remove());context.append(panel);
 }
 const targetBox=$('hud-item-targets');targetBox.hidden=!choosingItem;targetBox.innerHTML='';
 if(choosingItem){
  const item=choosingItem,actor=draft?.editor??s.leader;
  const targets=item==='teamTonic'?button('item-use-teamTonic','使用（全队）',disabled,`data-hud-item-target="${esc(actor)}"`):s.queue.filter(id=>{const u=s.units[id],a=s.units[actor];return u.hp>0&&u.pos&&a.pos&&(selfOrAdjacentReachable(s.floor,a.pos,u.pos));}).map(id=>button(item==='bigBerry'?`item-target-bigBerry-${id}`:`item-target-${id}`,esc(unitLabel(s.units[id],id)),disabled,`data-hud-item-target="${esc(id)}"`)).join('');
   targetBox.innerHTML=`<strong>${esc(itemName(item))}</strong><p data-selected-item-description>${esc(itemDescription(item))}</p><div>${targets}</div>`;
  targetBox.querySelectorAll<HTMLButtonElement>('[data-hud-item-target]').forEach(b=>b.onclick=()=>act({type:'use',item,target:b.dataset.hudItemTarget!}));
 }
 renderDetailsPanel(s,disabled);
 $('hud-actions').hidden=store.status==='ready'&&(!actionsOpen||!!detailsId);
 $('hud-actions').classList.toggle('has-draft',!!draft);
 $('flow').querySelectorAll('.muted').forEach(el=>el.remove());
 $('flow').hidden=!$('flow').innerHTML.trim();
 if(s.phase==='playing'&&!confirmExit)$('flow').hidden=true;
 if(s.phase==='ended'&&store.status==='failed'){($('flow').querySelector('#settlement-save')??$('flow')).prepend($('save'));$('hud-actions').hidden=true;}
 $('hud-bag').hidden=!bagOpen;
 $('hud-bag').innerHTML=bagOpen?hudBag(s,quickItems,bagCategory,bagSlot,bagSelectedItem):'';
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-hud-skill]')){
  const skill=b.dataset.hudSkill!;b.onclick=()=>{if(draft)draft.editor=s.leader;chooseHudSkill(skill);};
  const show=()=>showMoveTip(skill,s.leader);
  const hide=()=>{$('hud-tooltip').hidden=true;};b.onmouseenter=show;b.onmouseleave=hide;b.onfocus=show;b.onblur=hide;
 }
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-hud-quick]'))b.onclick=()=>{const item=quickItems[Number(b.dataset.hudQuick)];if(item)chooseHudItem(item);};
 bind('bag-open',()=>{bagOpen=!bagOpen;choosingItem=null;render();});bind('bag-close',()=>{bagOpen=false;render();});
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-bag-slot]'))b.onclick=()=>{bagSlot=Number(b.dataset.bagSlot);render();};
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-bag-category]'))b.onclick=()=>{bagCategory=b.dataset.bagCategory!;render();};
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-bag-item]'))b.onclick=()=>{const item=b.dataset.bagItem as Item;bagSelectedItem=item;quickItems=quickItems.map((v,i)=>i===bagSlot?item:v===item?null:v);bagSlot=(bagSlot+1)%6;render();};
 document.querySelector<HTMLButtonElement>('[data-bag-clear]')?.addEventListener('click',()=>{quickItems[bagSlot]=null;render();});
 $('actions-open').onclick=()=>{actionsOpen=!actionsOpen;detailsId=null;render();};$('hud-settings').onclick=openSettings;
 if(anim.active)document.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('#controls button,#controls select,#party button,#hud-bottom button').forEach(el=>{if(!unavailable&&!el.disabled&&el.matches('[data-hud-leader],[data-hud-details],[data-hud-skill],[data-hud-quick],#bag-open'))el.dataset.animationLocked='true';el.disabled=true;});
 $('recent-events').querySelector('h2')?.remove();
 const rows=Array.from($('recent-events').querySelectorAll('li'));rows.slice(0,-3).forEach(el=>el.remove());
 // Runtime details and source IDs stay in developer diagnostics, not in the player's messages.
 if(!dev){for(const el of $('recent-events').querySelectorAll('li'))el.textContent=el.textContent?.replace(/（推断）/g,'')??'';}
}

function renderMain(){const s=live(),roguelike=!!s?.dungeon?.roguelike;$('legend-items').hidden=!s?.prog||roguelike;$('legend-items-roguelike').hidden=!s?.prog||!roguelike;$('legend-goal').hidden=roguelike;$('legend-adventures').hidden=!roguelike||!s?.adventureRooms?.length;scene?.paint(s);$('world-label').textContent=s?`${checkMode?'独立检查 · ':''}第 ${s.round} 轮 · ${s.phase==='ended'?'已结束':(s.dungeon?`第${s.dungeon.level}层`:'第一层')}`:(store.atBase?'基地':'尚未出发');const runSummary=s?`${roguelike?'':`目标 ${s.goal?'已完成':'未完成'} · `}背包 ${s.bag}${s.prog?` · ${experienceProgress(s)} · 橙橙果×${s.prog.items.berry} PP多项小补剂×${s.prog.items.tonic}${roguelike?` · ${ITEM_NAMES.bigBerry}×${s.prog.items.bigBerry??0} · ${itemName('teamTonic')}×${s.prog.items.teamTonic??0}`:''}${s.dungeon?.base?` · 钱袋 ${s.purse??0}`:''}`:''}`:'';$('goal-label').textContent=!s&&store.atBase?`已完成远征 ${store.profile?.expeditions??0} 次`:runSummary;
 const activityMarkup=s?activityStatus(s):'',activityRoot=$('activity-status');activityRoot.innerHTML=activityMarkup;activityRoot.hidden=!activityMarkup;
 $('message').textContent=(s?localizeLog(s,notice):playerText(notice)).replaceAll('主控','操控者');
 const expeditionMemory=s?.scenario==='expedition'&&s.phase!=='ended';
 const saveText=store.status==='failed'&&s?.phase==='ended'?'终局已结算，但未保存；重试成功后才能回营地':store.status==='failed'?'基地改动未保存；可以重试':store.status==='ready'&&expeditionMemory?(store.envelope?'基地档案已保存；本次远征仅在内存中':'开发者远征只在内存中；未创建营地档案'):store.status==='ready'&&s?.phase==='ended'?(store.envelope?'终局结算已保存':'开发者场景只在内存中'): {empty:'尚无可恢复记录',ready:'基地档案已保存',saving:'正在保存基地档案',failed:'基地改动未保存；可以重试',blocked:'记录无法载入，原字节已保留'}[store.status];
 $('save').innerHTML=`<div class="save-state ${store.status}">${saveText}</div><small>${esc(store.lastSaved?.replace(/^[^·]+ · /,'').replace('playing','营地状态').replace('invitation','待邀请').replace('ended','终局结算').replace('exit','待撤离').replace('transit','待跨层')??(expeditionMemory?(store.envelope?'营地存档保持出发前内容':'没有持久营地存档'):'尚无成功保存点'))}</small>${store.error?`<p class="error">${esc(store.error)}</p>`:''}${store.status==='failed'?button('retry','重试保存'):''}${store.status==='blocked'?button('export','导出原记录')+button('reset','导出后明确重置'):''}`;
 bind('retry',()=>void transition(store.retry()));
 bind('export',()=>{const raw=store.exportRaw();if(raw===null){notice='无法读取原记录，不能重置；请保留当前浏览器数据。';render();return;}download(raw);notice='已提供原记录下载；请确认文件已保留，再选择重置。';render();});
 bind('reset',()=>{if(window.confirm('仅在已保留导出原记录后重置。该操作将开始一份新存档，是否确认？'))void transition(store.resetAfterExport(createMain(newId()),true));});
 $('history').innerHTML=s?visibleLog(s).slice(-12).map(t=>`<li>${esc(localizeLog(s,t))}</li>`).join(''):'';
 if(!s&&store.atBase){renderBase();return;}
 if(!s){$('party').innerHTML='<p class="muted">出发后在这里显示队伍。</p>';$('controls').innerHTML='';$('flow').innerHTML=store.status==='empty'?(!dev?'<p>还没有存档。请返回标题开始新游戏。</p>':`<h2>开发者菜单：开始一份独立试验</h2><p>开发者场景只在本次页面内存中运行，不会写入玩家营地存档。</p><label>邀请配置 <select id="config"><option value="main-invite">固定有邀请</option><option value="main-none">无邀请对照</option><option value="expedition">远征（三层首领战，仅在内存）</option></select></label>${button('start','开始探索',false,'class="primary"')}`):'';bind('start',()=>{selectedConfig=(document.getElementById('config') as HTMLSelectElement).value;void transition(checkMode?store.start(createScenario(fixture!,newId()),scenarioProfile(fixture!)):store.start(begin(selectedConfig),selectedConfig==='expedition'?initialProfile():undefined));});return;}
 const ready=store.status==='ready',playing=s.phase==='playing',editable=ready||store.status==='saving';
 $('party').innerHTML=s.queue.map((id,i)=>{const u=s.units[id];const down=u.hp===0,level=u.level??s.prog?.level;return `<article class="unit ${id===s.leader?'leader':''}" id="unit-card-${esc(id)}"><div><strong>${esc(unitLabel(u,id))}</strong><span>${down?'倒下 · 仍占名额':id===s.leader?'操控者':'同行'}${u.protected?' · 初始成员':''} · ${u.hp}/${u.maxHp}${u.species?` · ${esc(specName(u))}`:''}${level===undefined?'':` · Lv${level}`}</span></div><div class="hp"><i style="width:${u.hp/u.maxHp*100}%"></i></div><p class="muted" data-unit-status="${esc(id)}" ${combatStatus(u)?'':'hidden'}>${esc(combatStatus(u))}</p><p>${u.learned.map(k=>`${skillLabel(u,k)} ${u.pp[k]??0}/${u.maxPp[k]??0}`).join(' · ')||'普通攻击，不耗PP'}</p>${tacticSelect(`tactic-run-${id}`,u.tactic??'together',!ready||!playing)}${button('leader-'+i,'设为操控者',!ready||!playing||down||s.leader===id)}${button('detail-'+i,'详情')}</article>`;}).join('')+(s.camp.length?`<p class="muted">此前已回营：${s.camp.map(id=>esc(resources(s,id))).join('；')}（本局不可调回）</p>`:'');
  s.queue.forEach((id,i)=>{bind('leader-'+i,()=>{void send({type:'switch',actor:id});});bind('detail-'+i,()=>{detailsId=detailsId===id?null:id;detailsOpenerId=detailsId;render();});
   const select=$(`tactic-run-${id}`) as HTMLSelectElement;select.addEventListener('change',()=>{if(isTactic(select.value))void setTactic(id,select.value);});
  });
 if(s.phase==='ended'){
  const end=s.end!;$('controls').innerHTML='';const persistentRun=s.scenario==='expedition'&&!!store.envelope;
  const resultSummary=s.dungeon?.roguelike?`<p>讨伐首领：${end.boss?'成功':'未击败'}</p>`:`<p>目标${end.goal?'已完成':'未完成'} · 已取得 ${end.acquired} · 正常带出 ${end.brought}${end.boss===undefined?'':` · 讨伐首领：${end.boss?'成功':'未挑战'}`}</p>`;
  const previousResult=$('flow').querySelector<HTMLElement>('.settlement194'),sameResult=previousResult?.dataset.runId===s.runId;
  const resultScroll=sameResult?['rank-breakdown','partner-loot-scroll','tm-list'].map(id=>{const el=document.getElementById(id);return {id,top:el?.scrollTop??0,left:el?.scrollLeft??0};}):[],flowScroll=sameResult?$('flow').scrollTop:0,resultFocus=sameResult&&$('flow').contains(document.activeElement)?(document.activeElement as HTMLElement).id:null;
  $('flow').innerHTML=s.dungeon?.roguelike?settlement(s,store.settlementSummary,ready,persistentRun):`<div class="result"><small>本局结果</small><h2>${end.outcome==='won'?'击败首领':end.outcome==='normal'?'正常撤离':'全队倒下'}${s.difficulty&&s.difficulty!=='normal'?`（${DIFFICULTY_LABEL[s.difficulty]}）`:''}</h2>${resultSummary}<p>${end.team.map(id=>`${esc(resources(s,id))}，${s.dungeon?.roguelike?'伙伴归营':end.outcome==='normal'?'按名单归营':'仍同行、倒下'}`).join('；')}</p><p>此前回营：${end.camp.length?end.camp.map(id=>esc(resources(s,id))).join('；'):'无'}。远征中已学的永久招式保留，回营后可以整备再出发。</p>${resultDetails(s)}${persistentRun?button('to-base','返回基地',!ready,'class="primary"'):button('new','开始独立试验',!ready,'class="primary"')}<p class="muted">${persistentRun?(ready?'终局已结算并自动保存。':'终局已结算，保存失败；重试成功前不能回营地。'):'这是内存开发场景；结算不会写入营地存档。'}</p></div>`;
  for(const pos of resultScroll){const el=document.getElementById(pos.id);if(el){el.scrollTop=pos.top;el.scrollLeft=pos.left;}}if(sameResult)$('flow').scrollTop=flowScroll;if(resultFocus)document.getElementById(resultFocus)?.focus({preventScroll:true});
  const tally=document.getElementById('rank-breakdown');if(tally)tally.onscroll=refreshSettlementOverflow;requestAnimationFrame(refreshSettlementOverflow);
  bind('result-settings',openSettings);
  bind('to-base',()=>{if(anim.active)return;clear();notice='';const report:CampReport={world:clone(s),summary:store.settlementSummary?clone(store.settlementSummary):null};void transition(store.returnToBase().then(ok=>{if(ok){lastCampReport=report;campPanel=null;}return ok;}));});
  bind('new',()=>{const next=checkMode?createScenario(fixture!,newId()):begin(s.scenario==='main-invite'||s.scenario==='expedition'?s.scenario:'main-none');void transition(store.newTrial(next));});return;
 }
 if(s.phase==='commission'){
  $('controls').innerHTML='';const pending=s.pendingChoices?.[0];
  if(!pending||pending.type!=='commission'){$('flow').innerHTML='<div class="result"><p class="error">缺少待处理的委托选择。</p></div>';return;}
  const spec=COMMISSIONS[pending.commission],full=(s.commissions?.length??0)>=3;
  $('flow').innerHTML=`<div class="result" id="commission-choice" role="dialog" aria-labelledby="commission-heading"><small>本层委托</small><h2 id="commission-heading">${esc(spec.name)}</h2><p>${esc(spec.description)}</p><p>完成后经验折合 ${spec.equivalentEnemies} 只敌人。</p><p>接下后立即生效的负面效果：${commissionPenaltyText(spec.penalty)}。</p><p>委托须在本层完成；未完成时成功下楼会使委托失败并移除，不发奖励、不另加惩罚。</p>${full?'<p class="error">同时进行的委托已达 3 条，无法接下；拒绝本条后此房间完成。</p>':'<p>选择接下后，本层完成即可领取奖励；也可以拒绝并完成此房间。</p>'}<div class="button-row">${button('commission-accept','接下委托',!ready||full,'class="primary"')}${button('commission-reject','拒绝并完成房间',!ready)}</div></div>`;
  bind('commission-accept',()=>void send({type:'commissionChoice',choice:'accept'}));bind('commission-reject',()=>void send({type:'commissionChoice',choice:'reject'}));return;
 }
 if(s.phase==='blessing'){
  $('controls').innerHTML='';const pending=s.pendingChoices?.[0];
  if(!pending||pending.type!=='blessing'){$('flow').innerHTML='<div class="result"><p class="error">缺少待处理的祝福选择。</p></div>';return;}
  const source=pending.source==='challenge'?'挑战奖励':'祝福房';
  $('flow').innerHTML=`<div class="result" id="blessing-choice" role="dialog" aria-labelledby="blessing-heading"><small>${source} · 可选 ${pending.options.length} 项</small><h2 id="blessing-heading">选择一项祝福</h2><div>${pending.options.map(id=>{const blessing=BLESSINGS[id];return button(`blessing-${id}`,`${esc(blessing.name)}<small style="display:block;color:#405038">${esc(blessing.description)}</small>`,!ready,'class="primary"');}).join('')}</div><div class="button-row">${button('blessing-skip','放弃祝福',!ready)}</div></div>`;
  for(const id of pending.options)bind(`blessing-${id}`,()=>void send({type:'blessingChoice',blessing:id}));bind('blessing-skip',()=>void send({type:'blessingChoice',blessing:null}));return;
 }
 if(s.phase==='tmChoice'){
  $('controls').innerHTML='';const pending=s.pendingChoices?.[0];
  if(!pending||pending.type!=='tmChoice'){$('flow').innerHTML='<div class="result"><p class="error">缺少待处理的招式机选择。</p></div>';return;}
  $('flow').innerHTML=`<div class="result" id="tm-choice" role="dialog" aria-labelledby="tm-choice-heading"><small>${SRC[pending.source]} · 下一张招式机</small><h2 id="tm-choice-heading">选择一张招式机</h2><p>选择后即可继续本轮。</p><div>${pending.options.map(move=>button(`tm-choice-${move}`,`${esc(tmZh(move))}招式机`,!ready,'class="primary"')).join('')}</div></div>`;
  for(const move of pending.options)bind(`tm-choice-${move}`,()=>void send({type:'tmChoice',move}));return;
 }
 if(s.phase==='learning'){
  $('controls').innerHTML='';const pending=s.pendingLearnMoves?.[0],unit=pending?s.units[pending.actor]:undefined;
  $('flow').innerHTML=pending&&unit?`<div class="result" id="learning-choice" role="dialog" aria-labelledby="learning-heading"><h2 id="learning-heading">${esc(unitLabel(unit,pending.actor))}可以学会新招式</h2><div class="learning-new" data-learning-preview="${esc(pending.move)}" tabindex="0"><strong>${esc(moveZh(pending.move))}</strong><span>PP ${pending.pp}/${pending.pp}</span></div><div id="learning-tooltip" role="region" aria-label="招式说明" tabindex="0"></div><p>选择要替换的招式</p><div class="learning-moves">${unit.learned.map(move=>button('learn-replace-'+move,`<strong>${esc(moveZh(move))}</strong><span>PP ${unit.pp[move]??0}/${unit.maxPp[move]??0}</span>`,!ready,`data-learning-preview="${esc(move)}" class="learning-move"`)).join('')}</div><div class="button-row">${button('learn-skip','放弃学习',!ready)}${button('learn-close','关闭',!ready,'aria-label="关闭学招选择并放弃学习"')}</div></div>`:'<p class="error">缺少待处理的学招选择。</p>';
  if(pending&&unit){for(const move of unit.learned)bind('learn-replace-'+move,()=>void send({type:'learnMove',replace:move}));for(const id of ['learn-skip','learn-close'])bind(id,()=>void send({type:'learnMove',replace:null}));for(const el of $('flow').querySelectorAll<HTMLElement>('[data-learning-preview]')){const show=()=>showMoveTip(el.dataset.learningPreview!,pending.actor);el.onmouseenter=show;el.onfocus=show;const hide=()=>{$('hud-tooltip').hidden=true;};el.onmouseleave=hide;el.onblur=hide;}showMoveTip(pending.move,pending.actor);}
  return;
 }
  if(s.phase==='evolution'){
   $('controls').innerHTML='';const pending=s.pendingEvolutions?.[0],unit=pending?s.units[pending.actor]:undefined;
   $('flow').innerHTML=pending?`<div class="result" id="evolution-choice" role="dialog" aria-labelledby="evolution-heading"><small>升级后进化</small><h2 id="evolution-heading">${esc(unitLabel(unit,pending.actor))}可以进化</h2><p>请选择下一形态。关闭选择会暂不进化，并在下次升级时再询问。</p><div>${pending.choices.map(choice=>button(`evolve-${choice}`,spName(choice),!ready,'class="primary"')).join('')}</div>${button('evolution-close','暂不进化（下次升级时再问）',!ready)}</div>`:'<p class="error">进化阶段缺少待处理选择。</p>';
   if(pending){for(const choice of pending.choices)bind(`evolve-${choice}`,()=>void send({type:'evolve',species:choice}));bind('evolution-close',()=>void send({type:'evolve',species:null}));}
   return;
  }
 if(s.phase==='invitation'){
  $('controls').innerHTML='';const pending=s.invitations.find(i=>i.status==='pending')!,preview=previewInvitation(s,inviteChoice),old=inviteChoice?s.units[inviteChoice]:null,full=s.queue.length>=3;
  const incoming=unitLabel(pending.unit,pending.unit.id);
  $('flow').innerHTML=`<h2>${esc(incoming)}想加入</h2><p>同行的新伙伴下一轮才行动。</p><div class="compare"><div><strong>新人 ${esc(incoming)}</strong><p>${pending.unit.hp}/${pending.unit.maxHp}HP</p><p>${pending.unit.learned.map(k=>skillLabel(pending.unit,k)+' '+pending.unit.pp[k]+'/'+pending.unit.maxPp[k]).map(esc).join(' · ')}</p></div><div><strong>${old?'回营 '+esc(unitLabel(old,inviteChoice!)):'同行名额'}</strong><p>${old?old.hp+'/'+old.maxHp+'HP':full?'选择一名同行回营，或让新人直接回营。':'可以补入空位。'}</p><p>${old?old.learned.map(k=>skillLabel(old,k)+' '+old.pp[k]+'/'+old.maxPp[k]).map(esc).join(' · '):''}</p></div></div><div class="button-row">${s.queue.map((id,i)=>button('out-'+i,unitLabel(s.units[id],id)+'回营',!ready,inviteChoice===id?'class="selected"':'')).join('')}${!full?button('out-none','补空位',!ready):''}</div><p>${preview.ok?'接受后加入本局同行。':esc(preview.error)}</p>${inviteReject?'<p>将拒绝这份邀请，不会生成伙伴。</p>'+button('reject-confirm','确认拒绝',!ready,'data-confirm="true"')+button('back','返回比较'):button('accept',full?'接受并替换同行':'接受同行',!ready||!preview.ok,'data-confirm="true" class="primary"')+(full?button('invite-to-camp','新人直接回营',!ready||anim.active)+'<p data-camp-invite-help>新人本局不入场，结算时加入营地名册。</p>':'')+button('reject','选择拒绝',!ready)}`;
  s.queue.forEach((id,i)=>bind('out-'+i,()=>{inviteChoice=id;inviteReject=false;render();}));bind('out-none',()=>{inviteChoice=undefined;render();});bind('accept',()=>void send({type:'invite',choice:'accept',outgoing:inviteChoice}));bind('invite-to-camp',()=>void send({type:'invite',choice:'camp'}));bind('reject',()=>{inviteReject=true;render();});bind('reject-confirm',()=>void send({type:'invite',choice:'reject'}));bind('back',()=>{inviteReject=false;render();});return;
 }
 if(s.phase==='exit'){$('controls').innerHTML='';$('flow').innerHTML='<p>本轮撤离请求已成立；正在完成终局处理。</p>';return;}
 if(s.phase==='transit'){$('controls').innerHTML='';$('flow').innerHTML='<p>本轮跨层请求已成立；正在切换楼层。</p>';return;}
 const leaderPoint=s.points.find(p=>same(p.pos,s.units[s.leader].pos)),onStairs=leaderPoint?.kind==='down'||leaderPoint?.kind==='up';
 $('flow').innerHTML=confirmExit?`<h2>${onStairs?'本轮请求跨层？':'本轮请求撤离？'}</h2><p>消耗操控者行动，敌人仍会行动。使用者轮末存活且仍在交互格才成立。</p>${button('exit-confirm',onStairs?'确认本轮跨层':'确认本轮撤离',!ready,'data-confirm="true" class="primary"')}${button('cancel-exit','继续查看')}`:'';
 bind('exit-confirm',()=>void send({type:'round',action:{type:'interact',exit:true}}));bind('cancel-exit',()=>{confirmExit=false;render();});
 const editor=draft?.editor??s.leader;const u=s.units[editor];
 const point=s.points.find(p=>same(p.pos,u.pos));const stairKind=point?.kind==='down'||point?.kind==='up';const restPoint=point?.kind==='rest';const serviceCell=point?.kind==='shop'||point?.kind==='exchange';const canCollect=!!point&&!point.used&&point.kind!=='exit'&&!stairKind&&!restPoint&&!serviceCell;const pickup=point?.kind==='berry'||point?.kind==='tonic';
 let draftText='';if(draft){const valid=draft.main&&(draft.swap||draft.action)?applyCommand(s,{type:'round',action:draft.main,...(!draft.swap?{override:{actor:draft.partner,action:draft.action!}}:{})}):null;
 draftText=`<div class="draft"><strong>本轮草稿中 · 正在编辑 ${esc(unitLabel(s.units[editor],editor))}</strong><p>${button('edit-main',`${unitLabel(s.units[s.leader],s.leader)}：${actionLabel(draft.main,s.leader)}`,draft.swap)}${button('edit-partner',`${unitLabel(s.units[draft.partner],draft.partner)}：${draft.swap?'换位（双方行动）':actionLabel(draft.action,draft.partner)}`,draft.swap)}</p><p>之后：敌方阶段</p>${draftOrder(s,draft)}${valid&&!valid.ok?`<p class="error">${esc(playerText(valid.error))}</p>`:''}${button('submit',draft.main?.type==='interact'&&draft.main.exit?'提交整轮并交互':'提交整轮',!ready||!valid?.ok,'data-confirm="true" class="primary"')}${button('cancel-draft','取消组合')}</div>`;
 }
 $('controls').innerHTML=`<h2>${draft?'组合安排':'操控者行动'} <small>${esc(unitLabel(s.units[editor],editor))}</small></h2>${draftText}<div class="button-row">${button('wait','等待（.）',!editable||(!ready&&!draft)||!!draft?.swap)}${button('arrange','安排伙伴',!editable||!!draft)}${button('swap','换位',!editable||!!draft)}</div>${choosingPartner||choosingSwap?`<p>选择另一名伙伴：</p>${s.queue.filter(id=>id!==s.leader&&s.units[id].hp>0).map(id=>button('partner-'+id,unitLabel(s.units[id],id),!editable)).join('')}`:''}<div class="skills">${u.learned.map(k=>button('skill-'+k,`${esc(skillLabel(u,k))} ${u.pp[k]??0}/${u.maxPp[k]??0}<small data-move-preview="${esc(k)}" style="display:block">${esc(moveSummary(k,{s,sourceId:editor,targetId:visibleHoverTarget(s)}))}</small>`,!editable||(!ready&&!draft)||!!draft?.swap||(u.pp[k]??0)<1,selectedSkill===k?'class="selected"':'')).join('')}</div>${s.prog?`<div class="items"><p class="muted">背包（本局，不带出）：${ITEM_NAMES.berry}×${s.prog.items.berry}（回复${PROG.berryHeal}HP）· ${ITEM_NAMES.tonic}×${s.prog.items.tonic}（每招+${PROG.tonicPp}PP）。占该成员一次行动，对自己或相邻同行。</p>${(['berry','tonic'] as Item[]).map(k=>button('use-'+k,`使用${ITEM_NAMES[k]}`,!editable||(!ready&&!draft)||!!draft?.swap,choosingItem===k?'class="selected"':'')).join('')}${choosingItem&&u.pos?`<p>对谁使用${ITEM_NAMES[choosingItem]}？</p>${s.queue.filter(id=>s.units[id].hp>0&&s.units[id].pos&&(selfOrAdjacentReachable(s.floor,u.pos!,s.units[id].pos!))).map(id=>button('item-target-'+id,id===editor?`${id}（自己）`:id,!editable)).join('')}`:''}</div>`:''}<p class="muted">${selectedSkill?`已选${esc(skillLabel(u,selectedSkill))}：<span id="selected-move-preview">${esc(moveSummary(selectedSkill,{s,sourceId:editor,targetId:visibleHoverTarget(s)}))}</span>。消耗1PP；金圈标出合法目标${moveOf(selectedSkill)?.range==='user'||moveOf(selectedSkill)?.range==='room'?'（自身）':''}。`:draft?'点地图或方向键只编辑动作，尚未执行。':'方向键移动；点相邻敌人普通攻击；K选招式。'}</p>${point&&editor===s.leader&&restPoint?button('rest',point.used?'休整点已使用':`整理招式补给（休整点，每招恢复${PROG.restPp} PP，每局一次）`,!editable||(!ready&&!draft)||!!draft?.swap||point.used):''}${point&&editor===s.leader&&!restPoint&&!serviceCell?(canCollect?button('take',pickup?`拾取${ITEM_NAMES[point!.kind as Item]}`:'取得并继续',!editable||(!ready&&!draft)||!!draft?.swap):'')+(pickup||(s.dungeon?.roguelike&&!stairKind)?'':button('take-exit',stairKind?(point!.kind==='down'?'走下楼梯（请求跨层）':'走上楼梯（请求跨层）'):canCollect?'取得／请求撤离':'请求撤离',!editable||(!ready&&!draft)||!!draft?.swap)):''}`;
 if(choosingItem==='bigBerry')document.querySelectorAll<HTMLElement>('#controls [id^="item-target-"]').forEach(el=>{const id=el.id.slice('item-target-'.length);el.id=`item-target-bigBerry-${id}`;el.dataset.action=`item-target-bigBerry-${id}`;});
 const backpack=$('controls').querySelector<HTMLElement>('.items');
 if(backpack&&s.prog&&s.dungeon?.roguelike){
  const summary=backpack.querySelector('p');if(summary)summary.textContent=`背包（本局，不带出）：${ITEM_NAMES.berry}×${s.prog.items.berry}（回复${PROG.berryHeal}HP）· ${ITEM_NAMES.tonic}×${s.prog.items.tonic}（每招+${PROG.tonicPp}PP）· ${ITEM_NAMES.bigBerry}×${s.prog.items.bigBerry??0}（回满HP，对自己或相邻同行使用）· ${itemName('teamTonic')}×${s.prog.items.teamTonic??0}（在场存活同行每招恢复${PROG.teamTonicPp}PP，不超过上限）`;
  backpack.insertAdjacentHTML('beforeend',button('use-bigBerry',`使用${ITEM_NAMES.bigBerry}`,!editable||(!ready&&!draft)||!!draft?.swap,`data-action="use-bigBerry" ${choosingItem==='bigBerry'?'class="selected"':''}`)+button('use-teamTonic',`使用${itemName('teamTonic')}`,!editable||(!ready&&!draft)||!!draft?.swap,`data-action="use-teamTonic"`));
 }
 const leaderPos=s.units[s.leader]?.pos??null,activeAdventure=(s.adventureRooms??[]).find(room=>same(room.interaction,leaderPos));
 if(activeAdventure){$('controls').insertAdjacentHTML('beforeend',adventureRoomPanel(s,activeAdventure,editor,ready,!!draft));
  bind('start-challenge',()=>act({type:'interact',exit:false}));bind('take-adventure-item',()=>act({type:'interact',exit:false}));
  bind('interact-commission',()=>act({type:'interact',exit:false}));bind('interact-blessing',()=>act({type:'interact',exit:false}));}
 if(!draft&&editor===s.leader){$('controls').insertAdjacentHTML('beforeend',servicePanel(s,point,ready));bindService(s);}
 bind('wait',()=>act({type:'wait'}));bind('arrange',()=>{actionsOpen=true;choosingPartner=true;choosingSwap=false;selectedSkill=null;render();});bind('swap',()=>{actionsOpen=true;choosingSwap=true;choosingPartner=false;selectedSkill=null;render();});
 for(const id of s.queue.filter(id=>id!==s.leader))bind('partner-'+id,()=>{const swap=choosingSwap;draft={partner:id,action:null,main:swap?{type:'swap',target:id}:null,editor:swap?s.leader:id,swap};choosingPartner=false;choosingSwap=false;render();});
 u.learned.forEach(k=>bind('skill-'+k,()=>{selectedSkill=k;choosingItem=null;render();}));
 for(const k of (s.dungeon?.roguelike?['berry','tonic','bigBerry']:['berry','tonic']) as Item[]){bind('use-'+k,()=>{if((s.prog?.items[k]??0)<1){notice=`背包里没有${ITEM_NAMES[k]}；本轮未执行`;choosingItem=null;render();return;}choosingItem=choosingItem===k?null:k;selectedSkill=null;choosingPartner=false;choosingSwap=false;render();});
  for(const id of s.queue)bind(k==='bigBerry'?`item-target-bigBerry-${id}`:'item-target-'+id,()=>{if(choosingItem===k)act({type:'use',item:k,target:id});});}bind('take',()=>act({type:'interact',exit:false}));bind('rest',()=>act({type:'interact',exit:false}));bind('take-exit',()=>act({type:'interact',exit:true}));bind('edit-main',()=>{if(draft){draft.editor=s.leader;selectedSkill=null;render();}});bind('edit-partner',()=>{if(draft){draft.editor=draft.partner;selectedSkill=null;render();}});bind('cancel-draft',()=>{clear();render();});
 if(s.dungeon?.roguelike)bind('use-teamTonic',()=>{if((s.prog?.items.teamTonic??0)<1){notice=`背包里没有${itemName('teamTonic')}；本轮未执行`;render();return;}act({type:'use',item:'teamTonic',target:editor});});
 bind('submit',()=>{if(draft?.main){const cmd={type:'round' as const,action:draft.main,...(!draft.swap?{override:{actor:draft.partner,action:draft.action!}}:{})};void send(cmd);}});
}
/** 6.5 base screen: roster, technique machines, carried moves, squad and departure. Every edit is one saved write; the next edit waits for it. */
function rankPanel(p:Profile,ready:boolean):string{
 const level=rankLevel(p.rankExp),floor=rankThreshold(level),next=rankThreshold(level+1),points=availableTalentPoints(p);
 const rows=(['vitality','offense','supplies'] as TalentId[]).map(id=>{
  const n=p.talents[id]??0;
  const effect=id==='vitality'?`全队最大 HP +${n*5}%`:id==='offense'?`对敌伤害 +${n*3}%`:`橙橙果回复 +${n} HP${n>=3?' · 出发带 1 个橙橙果':''}`;
  return `<article class="unit" id="talent-${id}"><h3>${esc(TALENTS[id].name)} <small>${n}/${TALENT_MAX_RANK}</small></h3><p>${effect}</p>${button(`talent-add-${id}`,'加一点',!ready||points<1||n>=TALENT_MAX_RANK)}</article>`;
 }).join('');
 return `<section id="rank-panel"><p id="rank-level">探险队 Lv${level}</p>
  <p id="rank-progress">下一级 ${p.rankExp-floor}/${next-floor}</p>
  <p id="talent-points">未分配天赋点：${points}</p>
  <div id="talent-tree">${rows}</div>
  ${button('talent-reset','免费重置',!ready||Object.values(p.talents).every(n=>n===0))}</section>`;
}
function renderBase(){
 const p=store.profile;
 if(!p){$('flow').innerHTML='<p class="error">基地档案缺失。</p>';return;}
 const ready=store.status==='ready';
 vaultState=normalizeVault194(p,vaultState);
 if(!p.roster.some(i=>i.id===campSelected))campSelected=p.team[0]??p.roster[0]?.id??null;
 const retry=store.status==='failed'?button('camp-retry','重试保存'):'';
 const feedbackText=notice||(store.status==='failed'?'保存失败，请重试保存。':'');
 const feedback=feedbackText||retry?`<div class="camp-feedback" role="status">${esc(playerText(feedbackText).replaceAll('主控','操控者'))}${retry}</div>`:'';
 const difficultyDescriptions:Record<Difficulty,string>={easy:'敌人较弱',normal:'标准',hard:'敌人较强'};
 const difficultyPicker='<div class="camp-difficulty" id="difficulty-picker" role="group" aria-label="远征难度">'+(['easy','normal','hard'] as Difficulty[]).map(d=>button('difficulty-'+d,DIFFICULTY_LABEL[d]+'<small>'+difficultyDescriptions[d]+'</small>',!ready,'aria-pressed="'+(p.difficulty===d)+'"')).join('')+'</div>';
 const oldDialog=document.querySelector<HTMLDialogElement>('#camp-dialog,#camp-departure');
 const samePanel=oldDialog?.dataset.campPanel===(departureOpen?'departure':campPanel);
 const focusId=samePanel?(document.activeElement as HTMLElement|null)?.id:null;
 const positions=samePanel&&oldDialog?[oldDialog,...oldDialog.querySelectorAll<HTMLElement>('[data-camp-scroll]')].map(el=>({id:el.id,top:el.scrollTop,left:el.scrollLeft})):[];
 const content=campPanel==='party'?campParty194(p,ready,campSelected!):campPanel==='vault'?campVault194(p,ready,vaultState):campPanel==='talents'?rankPanel(p,ready):campRecords194(p,lastCampReport);
 $('party').innerHTML='';$('controls').innerHTML='';
 $('flow').innerHTML=campScene(p,ready,campPanel||departureOpen?'':feedback)+(departureOpen?campDeparture194(p,ready,difficultyPicker,feedback):campPanel?campPanelMarkup(campPanel,content,feedback):'');
 const close=()=>{const panel=campPanel,wasDeparture=departureOpen;campWindowCycle++;campPanel=null;departureOpen=false;notice='';render();
  const returnId=store.status==='ready'?(wasDeparture?'depart':'camp-open-'+panel):(document.getElementById('camp-retry')?'camp-retry':'camp-menu');
  $(returnId).focus();
 };
 for(const panel of Object.keys(CAMP_BUILDINGS) as CampPanel[])bind('camp-open-'+panel,()=>{campWindowCycle++;campPanel=panel;departureOpen=false;notice='';render();});
 const dialog=document.querySelector<HTMLDialogElement>('#camp-dialog,#camp-departure');
 if(dialog){
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  bind('camp-close',close);bind('depart-cancel',close);dialog.showModal();
  for(const pos of positions){const el=document.getElementById(pos.id);if(el){el.scrollTop=pos.top;el.scrollLeft=pos.left;}}
  if(focusId&&dialog.contains(document.getElementById(focusId)))document.getElementById(focusId)?.focus({preventScroll:true});
 }
 bind('camp-menu',openSettings);bind('camp-retry',()=>{notice='';void transition(store.retry());});
 const edit=async(a:BaseAction,after?:()=>void)=>{
  if(anim.active||store.status!=='ready')return;
  const originFocus=(document.activeElement as HTMLElement|null)?.id,originPanel=campPanel,originDeparture=departureOpen,originCycle=campWindowCycle;
  const pending=store.baseAction(a);render();const r=await pending;
  notice=r.ok?(r.saved?'':'这次改动尚未保存；请重试保存'):r.error;if(r.ok&&r.saved)after?.();render();
  const currentFocus=(document.activeElement as HTMLElement|null)?.id;
  if(originFocus&&campWindowCycle===originCycle&&campPanel===originPanel&&departureOpen===originDeparture&&['camp-close','depart-cancel',originFocus].includes(currentFocus??'')){
   const target=document.getElementById(originFocus),openDialog=document.querySelector('dialog#camp-dialog[open],dialog#camp-departure[open]');
   if(target&&openDialog?.contains(target))target.focus({preventScroll:true});
  }
 };
 for(const talent of ['vitality','offense','supplies'] as TalentId[])bind('talent-add-'+talent,()=>void edit({type:'talent',talent}));
 bind('talent-reset',()=>void edit({type:'resetTalents'}));
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-camp-member]'))el.onclick=()=>{campSelected=el.dataset.campMember!;notice='';render();};
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-camp-tactic]'))el.onclick=()=>{const tactic=el.dataset.campTactic;if(campSelected&&isTactic(tactic))void edit({type:'tactic',inst:campSelected,tactic});};
 for(const i of p.roster){
  for(const l of i.learned)bind('carry-'+i.id+'-'+l.move,()=>void edit({type:'carry',inst:i.id,moves:i.carry.includes(l.move)?i.carry.filter(n=>n!==l.move):[...i.carry,l.move]}));
  bind('team-'+i.id,()=>{const team=p.team.includes(i.id)?p.team.filter(t=>t!==i.id):[...p.team,i.id];void edit({type:'team',team,leader:team.includes(p.leader)?p.leader:team[0]??p.leader});});
  bind('lead-'+i.id,()=>void edit({type:'team',team:p.team,leader:i.id}));
  bind('learn-'+i.id,()=>{const move=vaultState.move;if(move)void edit({type:'learn',inst:i.id,move});});
 }
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-vault-tab]'))el.onclick=()=>{vaultState.tab=el.dataset.vaultTab==='shards'?'shards':'tm';notice='';render();};
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-vault-by]'))el.onclick=()=>{vaultState.by=el.dataset.vaultBy==='category'?'category':'type';vaultState.filter='all';vaultState.move=null;vaultState.learner=null;render();};
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-vault-filter]'))el.onclick=()=>{vaultState.filter=el.dataset.vaultFilter!;vaultState.move=null;vaultState.learner=null;render();};
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-vault-learner]'))el.onclick=()=>{vaultState.learner=el.dataset.vaultLearner!;notice='';render();};
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-vault-shard]'))el.onclick=()=>{vaultState.shard=el.dataset.vaultShard!;render();};
 for(const m of ALL_TM_MOVES)bind('tm-'+m,()=>{vaultState.move=m;vaultState.learner=null;notice='';render();});
 for(const difficulty of ['easy','normal','hard'])if(isDifficulty(difficulty))bind('difficulty-'+difficulty,()=>void edit({type:'difficulty',difficulty}));
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-camp-move]')){
  const show=()=>{const tip=document.getElementById('camp-move-tooltip');if(tip){tip.innerHTML=campMoveTooltip194(el.dataset.campMove!);tip.hidden=false;}};
  const hide=()=>{const active=dialog?.querySelector<HTMLButtonElement>('[data-camp-move]:focus')??dialog?.querySelector<HTMLButtonElement>('[data-camp-move]:hover');const tip=document.getElementById('camp-move-tooltip');if(tip){if(active){tip.innerHTML=campMoveTooltip194(active.dataset.campMove!);tip.hidden=false;}else tip.hidden=true;}};
  el.onmouseenter=show;el.onfocus=show;el.onmouseleave=hide;el.onblur=hide;
 }
 const focusedMove=dialog?.querySelector<HTMLButtonElement>('[data-camp-move]:focus'),focusedTip=document.getElementById('camp-move-tooltip');
 if(focusedMove&&focusedTip){focusedTip.innerHTML=campMoveTooltip194(focusedMove.dataset.campMove!);focusedTip.hidden=false;}
 bind('depart',()=>{if(anim.active||store.status!=='ready')return;campWindowCycle++;departureOpen=true;campPanel=null;notice='';render();});
 bind('depart-confirm',()=>{if(anim.active||store.status!=='ready')return;clear();departureOpen=false;notice='';const pending=store.depart(newId(),newSeed(),0);render();void pending.then(()=>render());});
}

/* ---------- stage 7.2: result details, shop and exchanger panels ---------- */
/** The end-of-run record in plain words: effective or not and why, reward, purse, who went missing, where each machine went, and what the pool will do on return. */
function resultDetails(s:World):string{
 if(s.dungeon?.roguelike&&s.end){
  const summary=store.settlementSummary,won=s.end.outcome==='won';
  const brought=summary?.brought??[...s.queue,...s.camp,...(s.exchange?.sent?[s.exchange.sent]:[])].map(id=>({id,species:s.units[id].entrySpecies??s.units[id].species??''}));
  const shards=summary?.shards??[];
  const rank=summary?.rank;
  const rankRewards=rank?`<ul id="rank-breakdown"><li>深度：+${rank.depth}</li><li>击败首领：+${rank.boss}</li><li>完成委托：+${rank.commissions}（最多 3）</li><li>新招募伙伴：+${rank.recruits}（最多 2，碎片不计）</li><li>带回招式机：+${rank.tms}（最多 4）</li></ul><p id="rank-gain"><strong>探险队经验 +${rank.total}</strong> · 累计 ${rank.before} → ${rank.after}</p><p id="rank-level-change">${rank.levelAfter>rank.levelBefore?`探险队升级：Lv${rank.levelBefore} → Lv${rank.levelAfter}，获得 ${rank.levelAfter-rank.levelBefore} 个天赋点`:`探险队 Lv${rank.levelAfter}`}</p><p class="muted">三档难度的探险队经验计算相同。</p>`:'<p>本局无此项奖励</p>';
  return `<div id="settle"><section id="depth-rewards"><h2>深度和难度奖励</h2><p>到达第 ${s.dungeon.level} 层 · ${DIFFICULTY_LABEL[s.difficulty??'normal']}</p>${rankRewards}</section><section id="harvest-rewards"><h2>收获型奖励</h2><h3>带回的伙伴</h3><ul id="brought-partners">${brought.length?brought.map(i=>`<li>${esc(spName(i.species)||i.id)}</li>`).join(''):'<li>无新增伙伴</li>'}</ul><h3>伙伴碎片</h3><ul id="brought-shards">${shards.length?shards.map(i=>`<li>${esc(spName(i.species))}碎片 ×${i.count}</li>`).join(''):'<li>无</li>'}</ul><h3>招式机（${won?'已带回':'全队倒下，未带回'}）</h3><ul id="tm-list">${s.end.tms?.length?s.end.tms.map(t=>`<li>${esc(tmLine(t))}</li>`).join(''):'<li>本局没有取得招式机。</li>'}</ul></section><section id="camp-task-rewards"><h2>营地任务奖励</h2><p>本局无此项奖励</p></section></div>`;
 }

 const end=s.end!;
 if(!s.prog||end.effective===undefined)return `<p>报酬／救援未启用。${end.outcome==='wipe'?'普通背包已取得但未带出，不进入跨局库存。':''}</p>`;
 const label=(id:string)=>esc(unitLabel(s.units[id],id));
 const sum=s.scenario==='expedition'?store.settlementSummary:null;
 const savedSettlement=!!store.envelope&&store.status==='ready';
 const sp=(x:{id:string;species:string})=>`${esc(x.id)} ${esc(spName(x.species))}`;
 const pool=sum?`<ul id="pool-change">${sum.returned.length?`<li>回归名册：${sum.returned.map(sp).join('、')}</li>`:''}${sum.gone.length?`<li>永久失去（期限用完且未付费）：${sum.gone.map(sp).join('、')}</li>`:''}${sum.missing.length?`<li>本局走失、进入救援池（期限 ${ECON.window} 次有效探险，从下一局起计）：${sum.missing.map(sp).join('、')}</li>`:''}${sum.advanced.map(a=>`<li>${sp(a)}：${a.paid?'等待':'期限'} ${a.from} → ${a.to}</li>`).join('')}${!sum.returned.length&&!sum.gone.length&&!sum.missing.length&&!sum.advanced.length?'<li>救援池没有变化。</li>':''}</ul><p>账户：${sum.account.before} → ${sum.account.after}（${savedSettlement?'终局已入账':store.envelope?'保存成功后入账':'仅本次内存场景结算'}）</p>`:'';
 return `<div id="settle"><h2>结算</h2>
 <p id="eff-line">本局${end.effective?'算':'不算'}有效探险${end.reasons!.length?`：${end.reasons!.map(r=>REASON[r]).join('；')}`:'：没有完成基础目标，也没有保留新成果'}。${end.effective?'出发前就在救援池里的伙伴，等待次数各减1。':'救援池的等待次数不变。'}</p>
 <p id="reward-line">基础报酬：${end.reward}${end.reward?'（完成了 G，全灭也照付）':'（没有完成 G，不发）'}。钱袋余额 ${end.purse}：${end.outcome==='normal'?`退回账户 ${end.refund}`:'全灭，丢失'}。</p>
 <p id="lost-line">走失的伙伴：${end.lost!.length?end.lost!.map(label).join('、'):'无'}${end.outcome==='wipe'?`（初始成员不会走失；其余伙伴各以一半概率走失，${savedSettlement?'结果已随终局保存，之后打开仍保留':store.envelope?'保存成功后会保留':'结果只保存在开发场景内存中'}）`:''}。</p>
 <ul id="tm-list">${end.tms!.length?end.tms!.map(t=>`<li>${esc(tmLine(t))}</li>`).join(''):'<li>本局没有取得招式机。</li>'}</ul>
 <h2>救援池的变化</h2>${pool||'<p class="muted">没有基地档案，无救援池。</p>'}</div>`;
}
/** Shop and exchanger panels, shown when the leader stands on the cell. Buying takes no round; the exchanger takes the leader's action. */
function servicePanel(s:World,point:Point|undefined,ready:boolean):string{
 if(!point||!s.prog)return '';
 if(point.kind==='shop'&&s.shop){
  const sh=s.shop,purse=s.purse??0;
  const row=(item:ShopItem,label:string,left:number)=>{const price=ECON.price[item];const short=purse<price;
   return `<li>${esc(label)} · 价格 ${price} · 库存 ${left}${button('buy-'+item,left<1?'售罄':'购买',!ready||left<1||short)}${left>0&&short?`<small>钱袋不足，还差${price-purse}</small>`:''}</li>`;};
  return `<div class="service" id="shop-panel"><h2>商店 <small>只能用钱袋付款；买东西不占回合；本次远征期间库存固定；关闭或刷新会返回出发前；不收购</small></h2><p id="purse-line">钱袋余额：${purse}</p><ul>${row('berry',ITEM_NAMES.berry,sh.stock.berry)}${row('tonic',ITEM_NAMES.tonic,sh.stock.tonic)}${row('tm',sh.stock.tm?`招式机：${tmName(sh.stock.tm)}`:'招式机',sh.stock.tm?1:0)}</ul></div>`;
 }
 if(point.kind==='exchange'&&s.exchange){
  const ex=s.exchange;
  if(ex.used)return `<div class="service" id="exchange-panel"><h2>伙伴交换机</h2><p id="exchange-result">本局已经使用：${esc(unitLabel(s.units[ex.sent!],ex.sent!))}安全返回基地。</p></div>`;
  const cands=s.queue.filter(id=>id!==s.leader&&s.units[id].hp>0);
  const held=(s.tms??[]).map((t,i)=>({t,i})).filter(x=>x.t.fate==='held');
  return `<div class="service" id="exchange-panel"><h2>伙伴交换机 <small>每局只能用一次；占操控者一次行动；不回血、不补PP；被送回的伙伴本局不再参战，空位只能靠再次击败敌人、触发邀请来补</small></h2>
  <p>选择送回基地的同行伙伴（须存活，不能是操控者）：</p>${cands.length?cands.map(id=>button('ex-target-'+id,esc(unitLabel(s.units[id],id)),!ready,exTarget===id?'class="selected"':'')).join(''):'<p class="muted">没有可送回的伙伴。</p>'}
  <p>随行运送招式机（最多${ECON.exchangeCargo}份；${s.dungeon?.roguelike?'击败首领后才带回，全队倒下仍会丢失':'送回后全灭也不丢'}）：</p>${held.length?held.map(x=>button('ex-cargo-'+x.i,esc(tmLine(x.t).split('：')[0]),!ready,exCargo.includes(x.i)?'class="selected"':'')).join(''):'<p class="muted">本局没有持有的招式机。</p>'}
  ${button('ex-confirm','确认送回',!ready||!exTarget,'data-confirm="true" class="primary"')}</div>`;
 }
 return '';
}
function bindService(s:World){
 for(const item of ['berry','tonic','tm'] as ShopItem[])bind('buy-'+item,()=>void buyItem(item));
 for(const id of s.queue)bind('ex-target-'+id,()=>{exTarget=exTarget===id?null:id;render();});
 (s.tms??[]).forEach((_,i)=>bind('ex-cargo-'+i,()=>{exCargo=exCargo.includes(i)?exCargo.filter(n=>n!==i):exCargo.length<ECON.exchangeCargo?[...exCargo,i]:exCargo;if(exCargo.length===ECON.exchangeCargo&&!exCargo.includes(i))notice=`最多运送${ECON.exchangeCargo}份`;render();}));
 bind('ex-confirm',()=>{if(exTarget)void send({type:'round',action:{type:'exchange',target:exTarget,cargo:[...exCargo]}});});
}
/** A purchase: no round, no animation; one complete save per sale. */
async function buyItem(item:ShopItem){
 if(anim.active||!live()||store.status!=='ready')return;
 const predicted=applyCommand(live()!,{type:'buy',item});
 if(!predicted.ok){notice=predicted.error;render();return;}
 notice='';const pending=store.dispatch({type:'buy',item});render();const r=await pending;if(!r.ok)notice=r.error;render();
}

/* ---------- stage 7.1: title, new game, readability panels ---------- */
function saveSummary():string{const e=store.envelope;if(!e)return '';return `基地 · 已完成远征${e.profile?.expeditions??0}次`;}
function renderOverlay(){
 const el=$('title-screen');
 if(screen==='play'){el.hidden=true;return;}
 el.hidden=false;
 if(screen==='title'){
  el.innerHTML=renderTitle({hasRecord:store.status!=='empty',status:store.status,error:store.error,saveLine:saveSummary(),asking:askOverwrite,exported:exportedOriginal});
  $('title-screen').querySelector('.title-menu')?.insertAdjacentHTML('beforeend',button('title-settings','设置与存档'));
  bind('title-settings',openSettings);
  bind('title-continue',()=>{screen='play';notice='';render();});
  bind('title-new',requestNewGame);
  bind('overwrite-export',()=>{const raw=store.exportRaw();if(raw!==null){download(raw);exportedOriginal=true;}render();});
  bind('overwrite-yes',()=>{askOverwrite=false;openPicker(true);});
  bind('overwrite-cancel',()=>{askOverwrite=false;render();});
  return;
 }
 el.innerHTML=renderNewGame(ng,ngError);
 for(const id of STARTER_IDS){
  bind(`pick-main-${id}`,()=>{ng.main=id;if(ng.deputy===id)ng.deputy=null;ngError='';render();});
  bind(`pick-deputy-${id}`,()=>{ng.deputy=id;ngError='';render();});
 }
 bind('main-next',()=>{if(ng.main){ng.step=2;render();}});
 bind('deputy-back',()=>{ng.step=1;ngError='';render();});
 bind('newgame-cancel',()=>{screen='title';askOverwrite=false;ngError='';render();});
 bind('newgame-start',()=>{void startNewGame();});
}
function requestNewGame(){if(store.status==='empty'){openPicker(false);return;}askOverwrite=true;render();}
/** Called only after the lightweight title explicitly enters a feature. Storage validation stays in TrialStore. */
export async function openTitleAction(action?:'new'|'continue'|'settings'):Promise<void>{
 await store.whenReady;
 if(action==='new')requestNewGame();
 else if(action==='settings')openSettings();
 else if(action==='continue'&&store.status!=='empty'&&store.status!=='blocked'){screen='play';notice='';render();}
}
function openPicker(overwrite:boolean){ng={step:1,main:null,deputy:null,overwrite};ngError='';screen='newgame';render();}
async function startNewGame(){
 if(!ng.main||!ng.deputy)return;
 const made=newGameProfile(ng.main,ng.deputy);if(!made.ok){ngError=made.error;render();return;}
 const ok=await store.beginNewGame(made.profile,ng.overwrite);
 if(!ok){ngError=store.error?`没有写入新存档：${store.error}。原存档保持不变。`:'没有写入新存档；原存档保持不变。';render();return;}
 quickItems=Array.from({length:6},()=>null);bagSlot=0;bagCategory='all';bagOpen=false;campPanel=null;departureOpen=false;campSelected=null;lastCampReport=null;
 clear();notice='';vaultState.move=null;detailsId=null;pinnedId=null;hoverId=null;attrib=new Map();freshCount=0;exportedOriginal=false;screen='play';render();
}
/** View-only event rows; the engine log remains intact for animation and saving. */
let displayedLogRun="",displayedLogRows:string[]=[];
function visibleLogEntries(s:World):{t:string;fromEnd:number}[]{
 const run=s.runId+"|"+(s.dungeon?.level??0);if(displayedLogRun!==run){displayedLogRun=run;displayedLogRows=[];}
 const hidden=s.enemies.filter(id=>{const u=s.units[id];return u.pos&&!s.seen.includes(key(u.pos));});
 // Match the raw note format independently of the current floor's actor dictionary.
 const routine=/^[A-Za-z0-9_:-]+(?:移动到-?\d+,-?\d+|与[A-Za-z0-9_:-]+换位|(?:无路可走，)?等待)$/;
 // Floor enemies use w<level><a-f> or challenge c<level><a-d>; removed-floor rows cannot be localized safely.
 const retiredEnemy=(t:string)=>[...t.matchAll(/(?:^|[^A-Za-z0-9_:-])(w\d+[a-f]|c\d+[a-d])(?=$|[^A-Za-z0-9_:-])/g)].some(m=>!s.units[m[1]]);
 const rows=s.log.map((t,i)=>({t,fromEnd:s.log.length-i})).filter(({t})=>!hidden.some(id=>t.startsWith(id)&&!/[A-Za-z0-9-]/.test(t[id.length]??" "))&&!routine.test(t)&&!retiredEnemy(t));
 if(rows.length){displayedLogRows=rows.map(r=>r.t);return rows;}
 return displayedLogRows.map(t=>({t,fromEnd:Infinity}));
}
function visibleLog(s:World):string[]{return visibleLogEntries(s).map(r=>r.t);}
function renderExtras(){
 const s=live();
 const toTitle=document.getElementById('to-title');if(toTitle)toTitle.hidden=screen!=='play';
 // recent events: always visible, newest last; hits name the inferred attacker
 const box=$('recent-events');
 if(!s)box.innerHTML='';
 else{
  const rows=visibleLogEntries(s).slice(-6).map(({t,fromEnd})=>{
   let extra='';const m=/^([^\s受]+)受到(\d+)伤害/.exec(t);
   if(m&&fromEnd<=freshCount){const a=attrib.get(`${m[1]}|${m[2]}`);
    if(a){const u=s.units[a];extra=u&&u.pos&&s.seen.includes(key(u.pos))?` ← ${unitLabel(u,a)}（推断）`:' ← 视野外的敌人';}}
   return `<li>${esc(localizeLog(s,t))}${esc(extra)}</li>`;});
  box.innerHTML=`<h2>最近事件 <small>最新的在最下面；“←”后是推断的攻击者</small></h2><ol id="recent-list">${rows.join('')||'<li class="muted">还没有事件。</li>'}</ol>`;
 }
  updateInspect();
 $('guide').innerHTML='';
}
/** The enemy under a board cell, only when its cell is revealed. */
function enemyAt(p:Pos):string|null{const s=live();if(!s)return null;return s.enemies.find(id=>{const u=s.units[id];return u.hp>0&&same(u.pos,p)&&s.seen.includes(key(p));})??null;}
function updateInspect(){
 const box=$('inspect');const s=live();
 if(!s){box.innerHTML='';return;}
 const pick=hoverId??pinnedId,info=pick?enemyInfo(s,pick):null;
 if(info)box.innerHTML=`<div class="inspect-card" id="enemy-info"><strong>${esc(info.name)}</strong>${info.types?`<span>${esc(info.types)}属性</span>`:''}<p>${info.level===null?'等级未知':`Lv${info.level}`} · 生命 ${info.hp}/${info.maxHp}</p><p>作战方针：${esc(info.tactic)}</p><ul class="enemy-move-list">${info.moveRows.map(move=>`<li><details><summary><span>${esc(move.name)}</span> <span>${esc(move.type)}</span> <span>PP ${move.pp}/${move.maxPp}</span></summary><p>${esc(move.detail)}</p></details></li>`).join('')||'<li>无招式</li>'}</ul>${info.note?`<p class="muted">${esc(info.note)}</p>`:''}</div>`;
 else box.innerHTML='';
 refreshDamagePreviews(s);
}
/** Only the enemy currently under the pointer supplies a combat target; a pinned info card is not a hover target. */
function visibleHoverTarget(s:World):string|undefined{return hoverId&&enemyInfo(s,hoverId)?hoverId:undefined;}
function refreshDamagePreviews(s:World):void{
 const targetId=visibleHoverTarget(s),sourceId=draft?.editor??s.leader;
 document.querySelectorAll<HTMLElement>('[data-move-preview]').forEach(el=>{
  const id=el.dataset.movePreview,tip=el.closest<HTMLElement>('#hud-tooltip,#learning-tooltip,#detail-tooltip');if(id)el.textContent=tip?hudDamageEstimate(s,tip.dataset.sourceId??s.leader,targetId,id):moveSummary(id,{s,sourceId,targetId});
 });
 document.querySelectorAll<HTMLElement>('[data-move-accuracy]').forEach(el=>{
  const id=el.dataset.moveAccuracy;
  const tip=el.closest<HTMLElement>('#hud-tooltip,#learning-tooltip,#detail-tooltip'),actor=tip?.dataset.sourceId??sourceId;
  if(id)el.textContent=hudMoveAccuracy(s,actor,id,targetId);
 });
 if(selectedSkill){const summary=$('selected-move-preview');if(summary)summary.textContent=moveSummary(selectedSkill,{s,sourceId,targetId});}
}
/** Execution order of a combination draft and what each member would do, by running the rule code on a copy (nothing is executed). */
function draftOrder(s:World,d:NonNullable<typeof draft>):string{
 const main:Action=d.main??{type:'wait'};
 const steps=traceRound(s,{type:'round',action:main,...(!d.swap&&d.action?{override:{actor:d.partner,action:d.action}}:{})});
 if(!steps)return '<p class="muted" id="draft-order">本轮顺序暂时无法预演（草稿里有不合法的动作）。</p>';
 return `<p id="draft-order"><strong>本轮顺序：</strong>${esc(orderLine(s,steps))}</p><ul id="draft-steps">${stepRows(s,steps).map(r=>`<li>${esc(r.text)}</li>`).join('')}</ul>${d.main?'':'<p class="muted">操控者的动作还没选；预览暂按“等待”。</p>'}${!d.swap&&!d.action?'<p class="muted">伙伴的动作还没选；预览用默认行为，可以直接提交。</p>':''}`;
}
function download(raw:string,filename='trial-save-original.json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function makeBoardScene(Phaser:typeof import('phaser')){
class BoardScene extends Phaser.Scene {
 private graphics!:Phaser.GameObjects.Graphics;private pointGraphics!:Phaser.GameObjects.Graphics;private overlay!:Phaser.GameObjects.Graphics;private labels:Phaser.GameObjects.Text[]=[];private tiles:Phaser.GameObjects.Image[]=[];private sprites=new Map<string,Phaser.GameObjects.Sprite>();private views=new Map<string,UnitView>();private temp=new Set<Phaser.GameObjects.GameObject>();private skipNow:(()=>void)|null=null;private lastGeometry:ReturnType<BoardScene['geometry']>|null=null;
 constructor(){super('board');}
 preload(){preloadArt(this);}
 private dtefLayer!:DtefTerrainLayer;private painterLayer!:PainterTerrainLayer;private darkness!:DungeonDarkness;private lightWorld:World|null=null;
 update(time:number){this.dtefLayer?.update(time);this.followSprites();this.darkness?.update(time,this.partyLights());}
 private followSprites(){
  for(const view of this.views.values()){const hp=view.labels[0];if(hp){placeHp(view.sprite,hp.t,this.lastGeometry?.cell??48,view.gfx.y);hp.dx=hp.t.x-view.gfx.x;hp.dy=hp.t.y-view.gfx.y;}}
  if(this.lastGeometry?.dungeon&&this.lightWorld){const sprite=this.views.get(this.lightWorld.leader)?.sprite;if(sprite)this.cameras.main.setRoundPixels(true).setScroll(Math.round(sprite.x-this.scale.width/2),Math.round(sprite.y-this.scale.height/2));}
 }
 private partyLights(){
  const s=this.lightWorld,g=this.lastGeometry;if(!s||!g)return [];
  return s.queue.flatMap(id=>{const u=s.units[id],v=this.views.get(id);return u?.hp>0&&u.pos&&v?.sprite.visible?[{x:(v.sprite.x-g.ox)/g.cell+g.minX-.5,y:(v.sprite.y-g.oy)/g.cell+g.minY-.5,primary:id===s.leader,fire:!!(u.species&&SPECIES[u.species]?.types?.includes('Fire'))}]:[];});
 }
 private showDarkness(s:World,durationMs=0){
  if(!s.dungeon||!this.lastGeometry)return;const g=this.lastGeometry,theme=themeOfLevel(s.dungeon.boss,s.dungeon.level),map=prepareTerrainMap({width:s.dungeon.width,height:s.dungeon.height,floor:s.floor,liquid:s.liquid,seen:s.seen,seenWalls:s.seenWalls,onlyRevealed:true});
  const wallColor=terrainSource()==='dtef'?this.dtefLayer.wallColor():this.painterLayer.wallColor();const staticLights=s.points.filter(p=>(p.kind==='down'||p.kind==='up')&&s.seen.includes(key(p.pos))).map(p=>({...p.pos,inner:.3,outer:1.25,strength:.45}));
  if(theme==='ash')for(const cell of s.liquid??[]){const pos=typeof cell==='string'?{x:Number(cell.split(',')[0]),y:Number(cell.split(',')[1])}:cell;if(map.known.has(key(pos)))staticLights.push({...pos,inner:.4,outer:1.7,strength:.55});}
  this.darkness.show([s.runId,s.dungeon.level,theme,map.width,map.height].join(':'),theme,g.cell,{width:map.width,height:map.height,known:map.known,visible:playerVisibleCells(s),lights:this.partyLights(),seed:s.dungeon.seed,wallColor,staticLights},durationMs>0,durationMs);
  this.cameras.main.setBackgroundColor(darknessBackground(theme,wallColor));
 }
 create(){createAnims(this);this.darkness=new DungeonDarkness(this,Phaser.Textures.FilterMode.LINEAR);this.dtefLayer=new DtefTerrainLayer(this);this.painterLayer=new PainterTerrainLayer(this);this.events.once('shutdown',()=>{this.darkness.clear();this.dtefLayer.clear();this.painterLayer.clear();});this.graphics=this.add.graphics().setDepth(0);this.pointGraphics=this.add.graphics().setDepth(2);this.overlay=this.add.graphics().setDepth(5);this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{const s=live();if(!s)return;const g=this.geometry(s);
  // worldX/worldY already include the camera scroll, so clicks stay correct while the camera follows the leader.
  const x=Math.floor((pointer.worldX-g.ox)/g.cell)+g.minX;const y=Math.floor((pointer.worldY-g.oy)/g.cell)+g.minY;pinnedId=enemyAt({x,y});updateInspect();clickCell({x,y});});
  this.input.on('pointermove',(pointer:Phaser.Input.Pointer)=>{const s=live();if(!s)return;const g=this.geometry(s);const id=enemyAt({x:Math.floor((pointer.worldX-g.ox)/g.cell)+g.minX,y:Math.floor((pointer.worldY-g.oy)/g.cell)+g.minY});if(id!==hoverId){hoverId=id;updateInspect();}});scene=this;this.scale.on('resize',()=>{if(!anim.active)this.paint(live());});this.paint(live());}
 private showTerrain(s:World,g:ReturnType<BoardScene['geometry']>){
  if(!s.dungeon)return;const theme=themeOfLevel(s.dungeon.boss,s.dungeon.level),scale=g.cell/TILE,dungeonMap=prepareTerrainMap({width:s.dungeon.width,height:s.dungeon.height,floor:s.floor,liquid:s.liquid,seen:s.dungeon.roguelike?s.seen:[],seenWalls:s.dungeon.roguelike?s.seenWalls:[],onlyRevealed:true}),center=(p:Pos)=>({x:g.ox+(p.x-g.minX+.5)*g.cell,y:g.oy+(p.y-g.minY+.5)*g.cell});
    const dtef=terrainSource()==='dtef',seed=s.dungeon!.seed,level=s.dungeon!.level,map=dungeonMap!,floorKey=[s.runId,level,theme,seed,dtef?'dtef':'painter'].join(':');
  if(dtef){this.painterLayer.clear();this.dtefLayer.show(floorKey,{map,theme,seed,level,scale,frozen:!!(window as unknown as {__trialNoAnim?:boolean}).__trialNoAnim,center});}
  else{this.dtefLayer.clear();createTerrainArt(this,theme);const excluded=[...s.points.map(p=>p.pos),...(s.adventureRooms??[]).map(r=>r.interaction),...(s.rooms??[]).flatMap((r,i)=>i===s.bossRoom?Array.from({length:r.h},(_,dy)=>Array.from({length:r.w},(_,dx)=>({x:r.x+dx,y:r.y+dy}))).flat():[])];if(s.arrival)excluded.push(s.arrival);this.painterLayer.show(floorKey,{map,theme,seed,level,scale,excluded,center});}

 }
 geometry(s:World){if(s.dungeon){const d=s.dungeon,cell=dungeonCellSize(this.scale.height);return {minX:0,minY:0,cell,ox:0,oy:0,dungeon:true,w:d.width*cell,h:d.height*cell};}
  const minX=Math.min(...s.floor.map(p=>p.x)),maxX=Math.max(...s.floor.map(p=>p.x)),minY=Math.min(...s.floor.map(p=>p.y)),maxY=Math.max(...s.floor.map(p=>p.y));const cell=Math.min(66,(this.scale.width-80)/(maxX-minX+1),(this.scale.height-80)/(maxY-minY+1));return {minX,minY,cell,ox:(this.scale.width-(maxX-minX+1)*cell)/2,oy:(this.scale.height-(maxY-minY+1)*cell)/2,dungeon:false,w:this.scale.width,h:this.scale.height};}
 paint(s:World|null,force=false){if(!this.graphics||(anim.active&&!force))return;this.views.forEach(v=>{v.gfx.destroy();v.labels.forEach(l=>l.t.destroy());});this.views.clear();this.graphics.clear();this.pointGraphics.clear();this.overlay.clear();this.labels.forEach(t=>t.destroy());this.labels=[];this.tiles.forEach(t=>t.destroy());this.tiles=[];this.lightWorld=s;const text=(x:number,y:number,t:string,color='#d9e6e0',size=16):Phaser.GameObjects.Text=>{const label=this.add.text(x,y,t,{fontFamily:'sans-serif',fontSize:size,color,stroke:'#0b1312',strokeThickness:3}).setOrigin(.5).setDepth(6);this.labels.push(label);return label;};
 this.graphics.fillStyle(BOARD_BACKGROUND);this.graphics.fillRect(0,0,this.scale.width,this.scale.height);if(!s){this.darkness.clear();this.dtefLayer.clear();this.painterLayer.clear();this.cameras.main.setBackgroundColor(BOARD_BACKGROUND).setScroll(0,0);this.sprites.forEach(sp=>sp.setVisible(false));text(340,175,store.atBase?'基地：整备伙伴，准备好就出发。':'准备好以后，开始探索。','#8ba39b',20);return;}
 const g=this.geometry(s);const fog=g.dungeon;if(!fog)this.darkness.clear();if(fog){this.graphics.fillStyle(BOARD_BACKGROUND);this.graphics.fillRect(0,0,g.w,g.h);}const center=(p:Pos)=>({x:g.ox+(p.x-g.minX+.5)*g.cell,y:g.oy+(p.y-g.minY+.5)*g.cell});const scale=g.cell/TILE;
 const img=(key:string,c:{x:number;y:number},alpha:number,depth:number,size=1)=>this.tiles.push(this.add.image(c.x,c.y,key).setScale(scale*size).setAlpha(alpha).setDepth(depth));
 // 7.3 floor themes: boss-marked runs use the theme tiles of the floor (moss: the original stone). A missing texture falls back to the stone tile with a theme tint.
 const theme=themeOfLevel(s.dungeon?.boss,s.dungeon?.level??1),themeCfg=THEME_FLOORS.find(t=>t.theme===theme)!;
 this.cameras.main.setBackgroundColor(fog?darknessBackground(theme):BOARD_BACKGROUND);
 const tileImg=(kind:'floor'|'wall',name:string,c:{x:number;y:number},alpha:number)=>{const have=this.textures.exists(name);const im=this.add.image(c.x,c.y,have?name:kind).setScale(scale).setAlpha(alpha).setDepth(1);if(!have&&theme!=='moss')im.setTint(theme==='wet'?0x6aa8d8:0xa08c80);this.tiles.push(im);};
 const floorName=theme==='moss'?'floor':themeCfg.floorTile,wallName=theme==='moss'?'wall':themeCfg.wallTile,roomMarkers=adventureRoomMarkers(s);
 const arena=s.bossRoom!==undefined?s.rooms?.[s.bossRoom]??null:null;
 const inArena=(p:Pos)=>!!arena&&p.x>=arena.x&&p.x<arena.x+arena.w&&p.y>=arena.y&&p.y<arena.y+arena.h;
 const terrain=!!s.dungeon?.roguelike;
 const dungeonMap=s.dungeon?prepareTerrainMap({width:s.dungeon.width,height:s.dungeon.height,floor:s.floor,liquid:s.liquid,seen:s.seen,seenWalls:s.seenWalls,onlyRevealed:true}):null;
 if(terrain)this.showTerrain(s,g);else{if(fog)this.showTerrain(s,g);else{this.dtefLayer.clear();this.painterLayer.clear();}
  const floorKeys=new Set(s.floor.map(key)),walls=new Set<string>();if(!fog)for(const p of s.floor)for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const q={x:p.x+dx,y:p.y+dy};if(!floorKeys.has(key(q))&&!walls.has(key(q))){walls.add(key(q));tileImg('wall',wallName,center(q),s.seen.includes(key(p))?.85:.3);}}
 for(const wall of s.seenWalls??[]){if(floorKeys.has(wall)||walls.has(wall))continue;const [x,y]=wall.split(',').map(Number);tileImg('wall',wallName,center({x,y}),.85);walls.add(wall);}
 }
  for(const p of s.floor){
  const c=center(p),seen=s.seen.includes(key(p));if(fog&&!seen)continue;
  if(!terrain)tileImg('floor',inArena(p)?ARENA_TILE:floorName,c,seen?1:.28);
  const point=seen?s.points.find(q=>same(p,q.pos)):undefined;
  if(point){
   const visual=POINT_VISUALS[point.kind],alpha=point.used?.3:1,pg=this.pointGraphics;
   if(visual.icon==='berry'){
    pg.fillStyle(visual.color,alpha);pg.fillEllipse(c.x-g.cell*.07,c.y,g.cell*.29,g.cell*.31);pg.fillEllipse(c.x+g.cell*.07,c.y,g.cell*.29,g.cell*.31);
    pg.lineStyle(1,0x3b2b25,alpha);pg.strokeEllipse(c.x,c.y,g.cell*.42,g.cell*.34);
    pg.fillStyle(0x75a450,alpha);pg.fillTriangle(c.x,c.y-g.cell*.12,c.x+g.cell*.2,c.y-g.cell*.25,c.x+g.cell*.12,c.y-g.cell*.08);
   }else if(visual.icon==='seed'){
    pg.fillStyle(visual.color,alpha);pg.fillEllipse(c.x,c.y,g.cell*.27,g.cell*.4);pg.lineStyle(2,0x7b6338,alpha);pg.lineBetween(c.x-g.cell*.02,c.y-g.cell*.15,c.x+g.cell*.04,c.y+g.cell*.14);
   }else if(visual.icon==='rest'||visual.icon==='shop'||visual.icon==='exchange'){
    pg.fillStyle(visual.color,alpha*.4);pg.fillCircle(c.x,c.y,g.cell*.28);pg.lineStyle(2,visual.color,alpha);pg.strokeCircle(c.x,c.y,g.cell*.28);
    text(c.x,c.y,visual.icon==='rest'?'休':visual.icon==='shop'?'商':'换','#edf7f4',Math.min(20,g.cell*.3)).setAlpha(alpha);
   }else{
    const texture=visual.icon==='tonic'?'item-tonic':visual.icon;img(texture,c,alpha,2,visual.icon==='exit'||visual.icon.startsWith('stairs')?1:.8);
   }
   text(c.x,c.y+g.cell*.38,visual.name,'#e4efb0',Math.max(10,Math.min(13,g.cell/6))).setAlpha(alpha).setWordWrapWidth(g.cell*1.6,true);
  }
  if(showCoords)text(c.x-g.cell*.3,c.y+g.cell*.4,p.x+','+p.y,'#8fa89c',9);
 }
 for(const marker of roomMarkers){const c=center(marker.at),color=marker.dimmed?'#84918a':marker.state==='sealed'?'#ffb7a7':marker.roomType==='challenge'?'#f4d58d':marker.roomType==='commission'?'#a4d8e8':marker.roomType==='blessing'?'#d7b3ff':'#c4e89a';
  if(marker.kind==='interaction'){const hex=marker.roomType==='challenge'?0xf4d58d:marker.roomType==='commission'?0xa4d8e8:marker.roomType==='blessing'?0xd7b3ff:0xc4e89a;this.overlay.fillStyle(hex,marker.dimmed?0.12:0.28);this.overlay.fillCircle(c.x,c.y,g.cell*.3);this.overlay.lineStyle(2,hex,marker.dimmed?0.3:0.9);this.overlay.strokeCircle(c.x,c.y,g.cell*.3);}
  const labelAt=marker.kind==='interaction'?{x:c.x+g.cell*.27,y:c.y-g.cell*.27}:c;
  const label=text(labelAt.x,labelAt.y,marker.label,color,marker.kind==='door'?(marker.label==='封闭'?12:14):15);if(marker.dimmed)label.setAlpha(.45);
 }
 const shown=new Set<string>();const visible=(id:string)=>{const u=s.units[id];return u.pos&&u.hp>0&&s.seen.includes(key(u.pos))?u:null;};
 for(const id of [...s.enemies,...s.queue]){const u=visible(id);if(!u||!u.pos)continue;shown.add(id);const c=center(u.pos);
  // Shadow and leader ring live in a per-unit Graphics (local origin = cell centre, depth 3: above floor tiles and props, below sprites, highlights and labels) so animation can move them with the sprite.
  const ug=this.add.graphics().setDepth(3).setPosition(c.x,c.y);  // above floor tiles (1-2), below sprites (4)
 ug.fillStyle(0x000000,.35);ug.fillEllipse(0,g.cell*UNIT_GROUND_FRACTION,g.cell*.55,g.cell*.2);if(id===s.leader){ug.lineStyle(3,0xf3d997);ug.strokeEllipse(0,g.cell*UNIT_GROUND_FRACTION,g.cell*.86,g.cell*.34);}
  const direction=facingOf(u),row=facingRow(direction.x,direction.y),dex=skinFor(id,u.side,u.species),anim=animKey(dex,'Idle',row);
  let sp=this.sprites.get(id);if(!sp){sp=this.add.sprite(c.x,c.y,`${dex}-Idle`).setDepth(4);this.sprites.set(id,sp);}
  sp.clearTint();sp.setVisible(true).setAlpha(1).setPosition(c.x,c.y+g.cell*UNIT_GROUND_FRACTION).setScale(scale*(u.boss?1.5:1)).setOrigin(.5,groundOriginY(dex,'Idle'));sp.anims.timeScale=1;if(sp.anims.currentAnim?.key!==anim)sp.play(anim);
  const ut=(dx:number,dy:number,t:string,color:string)=>({t:this.add.text(c.x+dx,c.y+dy,t,{fontFamily:'sans-serif',fontSize:Math.max(10,Math.round(g.cell*.12)),color,stroke:'#0b1312',strokeThickness:3}).setOrigin(.5).setDepth(6),dx,dy});
  // Only HP sits beside the model; species names remain in the HUD and information cards.
  const hp=ut(0,0,`${u.hp}`,'#73ff7a');hp.t.setStyle({fontFamily:'Verdana, Arial, sans-serif',fontStyle:'bold',fontSize:Math.max(16,Math.round(g.cell*.22))});placeHp(sp,hp.t,g.cell,c.y);hp.dx=hp.t.x-c.x;hp.dy=hp.t.y-c.y;
  this.views.set(id,{sprite:sp,gfx:ug,labels:[hp,...(u.boss?[ut(0,-g.cell*.78,'首领','#ffd37a')]:[])],dex,row});}
 this.sprites.forEach((sp,id)=>{if(!shown.has(id))sp.setVisible(false);});this.lastGeometry=g;
 if(g.dungeon)this.followSprites();else this.cameras.main.setScroll(0,0);
 if(dungeonMap)this.showDarkness(s);
 if(selectedSkill&&s.phase==='playing'&&!draft?.swap){const editor=draft?.editor??s.leader;for(const target of skillTargets(s,editor,selectedSkill)){const u=s.units[target];if(!u?.pos||!s.seen.includes(key(u.pos)))continue;const c=center(u.pos);this.overlay.lineStyle(2,0xf1d88e);this.overlay.strokeCircle(c.x,c.y,g.cell*.46);}}
 if(s.phase==='invitation'&&inviteChoice){const p=previewInvitation(s,inviteChoice);if(p.ok){const c=center(p.pos);this.overlay.lineStyle(3,0xf1d88e);this.overlay.strokeRect(c.x-g.cell/2+3,c.y-g.cell/2+3,g.cell-6,g.cell-6);}}
 }
 /** Paints the state before the round, then plays the inferred steps on top; resolves when finished, skipped or timed out. */
 animate(before:World,after:World,events:AnimEvent[]):Promise<void>{
  const p=plan(events);this.paint(before,true);const g=this.lastGeometry;
  if(!p||!g)return Promise.resolve();
  const center=(q:Pos)=>({x:g.ox+(q.x-g.minX+.5)*g.cell,y:g.oy+(q.y-g.minY+.5)*g.cell});
  this.lightWorld=after;let revealed=false,movingFog=false;
  const st:Stage={scene:this,views:this.views,center,cell:g.cell,scale:g.cell/TILE,temp:this.temp,f:p.scale,setHitFlash:(view,on)=>{if(on)view.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);else view.sprite.clearTint();},visibleCells:after.floor.filter(q=>after.seen.includes(key(q))),onMovementStart:duration=>{if(revealed)return;revealed=true;movingFog=true;this.darkness.setMovementProgress(0);this.showTerrain(after,g);this.showDarkness(after,duration);},onMovementProgress:progress=>{if(!movingFog)return;this.darkness.setMovementProgress(progress);if(progress>=1)movingFog=false;}};
  if(!events.some(e=>e.k==='move'||e.k==='swap'||e.k==='blowaway')){this.showTerrain(after,g);this.showDarkness(after);}
  return new Promise<void>(resolve=>{
   let done=false;st.cancelled=()=>done;const finish=()=>{if(done)return;done=true;clearTimeout(timer);this.skipNow=null;this.darkness.setMovementProgress(undefined);this.tweens.killAll();this.time.removeAllEvents();this.temp.forEach(o=>o.destroy());this.temp.clear();try{this.paint(live(),true);}finally{resolve();}};
   const timer=setTimeout(finish,3000); // safety net, e.g. a hidden tab where Phaser's clock is paused
   this.skipNow=finish;
   void playEvents(st,events).then(finish,finish);
  });
 }
 exportTerrain(theme:TerrainThemeKey,layer:TerrainLayer|'floor'){exportTerrainArt(this,theme,layer);}
 skip(){this.skipNow?.();}
 /** Read-only view of what is drawn, for the browser checks: the tile textures in use, and the boss sprite's scale next to a normal unit's, with its labels. */
 debug(){const terrainImages=[...this.tiles,...this.dtefLayer.images,...this.painterLayer.images];const unit=(id:string)=>{const v=this.views.get(id);return v?{whiteFlash:v.sprite.tintMode===Phaser.TintModes.FILL&&v.sprite.tintTopLeft===0xffffff,scale:Number(v.sprite.scaleX.toFixed(3)),row:v.row,animation:v.sprite.anims.currentAnim?.key??null,originY:v.sprite.originY,frame:{x:v.sprite.frame.cutX,y:v.sprite.frame.cutY,w:v.sprite.frame.cutWidth,h:v.sprite.frame.cutHeight},ground:{centerY:v.gfx.y,y:v.gfx.y+(this.lastGeometry?.cell??0)*UNIT_GROUND_FRACTION,top:v.gfx.y+(this.lastGeometry?.cell??0)*(UNIT_GROUND_FRACTION-.1),bottom:v.gfx.y+(this.lastGeometry?.cell??0)*(UNIT_GROUND_FRACTION+.1)},x:v.sprite.x,y:v.sprite.y,labels:v.labels.map(l=>l.t.text),labelPositions:v.labels.map(l=>({text:l.t.text,x:l.t.x,y:l.t.y,width:l.t.width,height:l.t.height,originX:l.t.originX,originY:l.t.originY}))}:null;};const worldView=this.cameras.main.worldView;return {combatEffects:[...this.temp].flatMap(object=>{const effect=object.getData?.('combatEffect');return effect?[effect]:[];}),temporaryObjects:this.temp.size,terrainCache:terrainSource()==='dtef'?this.dtefLayer.debug():this.painterLayer.debug(),darkness:this.darkness.debug(),tiles:[...new Set(terrainImages.map(t=>t.texture.key))].sort(),terrain:terrainImages.filter(t=>t.texture.key.startsWith('terrain-')).map(t=>({texture:t.texture.key,frame:t.frame.name,x:t.x,y:t.y,depth:t.depth})),decorations:terrainImages.filter(t=>t.texture.key.startsWith('deco-')).map(t=>({texture:t.texture.key,frame:t.frame.name,x:t.x,y:t.y,depth:t.depth})),geometry:this.lastGeometry,cameraView:{x:worldView.x,y:worldView.y,width:worldView.width,height:worldView.height},boss:unit('boss'),leader:unit(live()?.leader??''),units:Object.fromEntries([...this.views.keys()].map(id=>[id,unit(id)]))};}
}
return BoardScene;
}
/** The title and save tools work without downloading Phaser. Load it once on entering play. */
async function ensureBoard():Promise<void>{
 if(boardLoading)return boardLoading;
 boardLoading=(async()=>{
  try{const {default:Phaser}=await import('phaser');
   const board=$('board');const game=new Phaser.Game({type:Phaser.AUTO,width:board.clientWidth||680,height:board.clientHeight||350,parent:'board',backgroundColor:'#101c1b',scene:makeBoardScene(Phaser),scale:{mode:Phaser.Scale.NONE},pixelArt:true});
   new ResizeObserver(()=>{if(board.clientWidth&&board.clientHeight)game.scale.resize(board.clientWidth,board.clientHeight);}).observe(board);
  }catch{notice='画面加载失败，请刷新重试。存档没有被清除。';$('message').textContent=notice.replaceAll('主控','操控者');}
 })();
 return boardLoading;
}
const settings=$('settings') as HTMLDialogElement;
let transferBusy=false;
let settingsTab:'display'|'keys'|'save'='display';
function setSettingsTab(tab:typeof settingsTab){settingsTab=tab;for(const name of ['display','keys','save']){$('settings-pane-'+name).hidden=name!==tab;$('settings-tab-'+name).setAttribute('aria-pressed',String(name===tab));}}
for(const name of ['display','keys','save'] as const)bind('settings-tab-'+name,()=>setSettingsTab(name));
function refreshTransfer(){
 const busy=transferBusy||store.status==='saving'||anim.active;
 ($('save-export') as HTMLButtonElement).disabled=busy||!['ready','blocked'].includes(store.status);
 ($('save-import') as HTMLButtonElement).disabled=busy||store.status==='failed';
 ($('settings-close') as HTMLButtonElement).disabled=transferBusy;
 const campTitle=$('camp-title') as HTMLButtonElement;
 campTitle.hidden=!store.atBase||screen!=='play'||dev;campTitle.disabled=transferBusy;
 $('save-export').textContent=store.status==='blocked'?'导出原记录':'导出存档';
 $('settings-profile').innerHTML=settingsProfile(store.profile);
 for(const b of settings.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'))b.disabled=transferBusy;
 const animationBox=$('anim-toggle') as HTMLInputElement;
 for(const [id,value] of [['anim-on',true],['anim-off',false]] as const){const b=$(id) as HTMLButtonElement;b.disabled=animationBox.disabled;b.setAttribute('aria-pressed',String(animationBox.checked===value));}
}
function openSettings(){
 if(anim.active)return;
 $('transfer-message').textContent=store.status==='blocked'?`${store.error}。请先导出原记录保留备份，再导入其他存档。`:store.status==='failed'?'当前改动尚未保存，请先重试保存。':'';
 refreshTransfer();setSettingsTab(store.status==='blocked'||store.status==='failed'?'save':settingsTab);settings.showModal();cancelSleepAdvance();
}
bind('open-settings',openSettings);
bind('settings-close',()=>{settings.close();syncSleepAdvance();});
settings.addEventListener('cancel',e=>{if(transferBusy)e.preventDefault();});
settings.addEventListener('close',()=>syncSleepAdvance());
bind('save-export',()=>{
 const raw=store.status==='blocked'?store.exportRaw():store.exportRecord();
 if(raw===null){$('transfer-message').textContent='没有可导出的记录，请先完成保存。';return;}
 download(raw,store.status==='blocked'?'trial-save-original.json':'trial-save.json');
 if(store.status==='blocked')exportedOriginal=true;
 $('transfer-message').textContent=store.state?.scenario==='expedition'&&store.state.phase!=='ended'?'已导出出发前的营地存档；本次远征只在内存中，不包含在文件内。':'已提供下载，请确认存档文件已保留。';
});
bind('save-import',()=>($('save-file') as HTMLInputElement).click());
$('save-file').addEventListener('change',async()=>{
 const input=$('save-file') as HTMLInputElement,file=input.files?.[0];input.value='';
 if(!file||transferBusy)return;
 transferBusy=true;refreshTransfer();
 try{
  if(file.size>5*1024*1024){$('transfer-message').textContent='存档文件超过 5 MiB，未读取或导入。请选择较小的存档文件。';return;}
  const raw=await file.text();
  if(!window.confirm('导入会覆盖当前存档，覆盖后无法恢复。建议先导出备份。确认导入这个文件吗？')){
   $('transfer-message').textContent='已取消导入，当前存档没有改动。';return;
  }
  const pending=store.importRecord(raw,true);render();
  const ok=await pending;
  if(ok){clear();campPanel=null;departureOpen=false;campSelected=null;lastCampReport=null;inviteChoice=undefined;inviteReject=false;detailsId=null;pinnedId=null;hoverId=null;attrib.clear();freshCount=0;askOverwrite=false;exportedOriginal=false;ngError='';screen=dev?'play':'title';
   $('transfer-message').textContent='存档已导入并保存，关闭设置后可继续游戏。';
  }else $('transfer-message').textContent=store.importError;
  render();
  const next=ok?finishing():null;if(next)await transition(store.dispatch(next));
 }catch{$('transfer-message').textContent='无法读取所选文件，请重新选择。当前存档没有改动。';}
 finally{transferBusy=false;refreshTransfer();}
});
function returnToTitle(){if(anim.active||transferBusy)return;clear();campPanel=null;departureOpen=false;askOverwrite=false;if(settings.open)settings.close();screen='title';render();}
bind('to-title',returnToTitle);
bind('camp-title',returnToTitle);
{const box=document.getElementById('coords-toggle') as HTMLInputElement|null;box?.addEventListener('change',()=>{showCoords=box.checked;scene?.paint(live());});}
new ResizeObserver(placeInspectBelowParty).observe($('party'));
new ResizeObserver(refreshSettlementOverflow).observe($('flow'));
window.addEventListener('resize',refreshSettlementOverflow);void document.fonts.ready.then(refreshSettlementOverflow);
setInterval(()=>{if(screen!=='play'||store.atBase)portraitTick(performance.now(),animationEnabled());},80);
bind('export-terrain',()=>{const theme=($('terrain-theme') as HTMLSelectElement).value as TerrainThemeKey,layer=($('terrain-layer') as HTMLSelectElement).value as TerrainLayer|'floor';scene?.exportTerrain(theme,layer);});
bind('open-fixture',()=>{const id=(document.getElementById('fixture') as HTMLSelectElement).value;window.open(`?fixture=${encodeURIComponent(id)}`,'_blank','noopener');});

const heldDirections=new Set<string>();let moveTimer:ReturnType<typeof setTimeout>|null=null,moveFrame:number|null=null,moveInFlight=false,moveCollecting=false,moveTap:Pos|null=null;
function cancelMoveInput(){heldDirections.clear();if(moveTimer!==null)clearTimeout(moveTimer);if(moveFrame!==null)cancelAnimationFrame(moveFrame);moveTimer=null;moveFrame=null;moveCollecting=false;moveTap=null;}
function movementEnemies(s:World):Set<string>{const cells=playerVisibleCells(s);return new Set(s.enemies.filter(id=>{const u=s.units[id];return u.hp>0&&u.pos&&cells.has(key(u.pos));}));}
function queueHeldMove(){moveFrame=requestAnimationFrame(()=>{moveFrame=null;if(!heldDirections.size)return;void flushMoveInput();});}
async function flushMoveInput(tapDirection?:Pos){
 const tap=tapDirection??moveTap;moveTap=null;
 if(moveTimer!==null)clearTimeout(moveTimer);if(moveFrame!==null)cancelAnimationFrame(moveFrame);moveTimer=null;moveFrame=null;moveCollecting=false;if(moveInFlight)return;
 const s=live();if(!s||s.phase!=='playing'||sleeping(s.units[s.leader])||anim.active||bagOpen||settings.open||screen!=='play'||store.status!=='ready'){cancelMoveInput();return;}
 const dx=tap?.x??(Number(heldDirections.has('d')||heldDirections.has('ArrowRight'))-Number(heldDirections.has('a')||heldDirections.has('ArrowLeft')));
 const dy=tap?.y??(Number(heldDirections.has('s')||heldDirections.has('ArrowDown'))-Number(heldDirections.has('w')||heldDirections.has('ArrowUp')));
 const u=s.units[draft?.editor??s.leader];if(!(dx||dy)||!u.pos)return;
 const direction={x:dx,y:dy},to=plus(u.pos,direction);
 if(draft){act({type:'move',to});return;}
 const blocked=!s.seen.includes(key(to))||!adjacentReachable(floorIndex(s.floor),u.pos,to)||s.enemies.some(id=>{const e=s.units[id];return e.hp>0&&same(e.pos,to);});
 if(blocked){cancelMoveInput();await send({type:'face',direction});return;}
 const beforeEnemies=movementEnemies(s),round=s.round,run=s.runId,level=s.dungeon?.level;
 moveInFlight=true;let played=false;
 try{played=!!(await send({type:'round',action:{type:'move',to}},true));}
 finally{moveInFlight=false;}
 const after=live();if(!after||after.runId!==run||after.dungeon?.level!==level||after.round===round||after.phase!=='playing'||store.status!=='ready'||bagOpen||settings.open){cancelMoveInput();return;}
 if([...movementEnemies(after)].some(id=>!beforeEnemies.has(id))){cancelMoveInput();return;}
 if(heldDirections.size){if(played)void flushMoveInput();else queueHeldMove();}
}
document.addEventListener('keyup',e=>{
 if(e.key==='Shift')anim.shift=false;const k=e.key.length===1?e.key.toLowerCase():e.key;if(!heldDirections.has(k))return;
 const dx=Number(heldDirections.has('d')||heldDirections.has('ArrowRight'))-Number(heldDirections.has('a')||heldDirections.has('ArrowLeft')),dy=Number(heldDirections.has('s')||heldDirections.has('ArrowDown'))-Number(heldDirections.has('w')||heldDirections.has('ArrowUp'));
 if(moveCollecting){
  // Release a quick chord as one gesture; don't block its remaining keyup with a whole round's render.
  if(!moveTap&&(dx||dy))moveTap={x:dx,y:dy};heldDirections.delete(k);
  if(!heldDirections.size){const tap=moveTap;cancelMoveInput();if(tap)void flushMoveInput(tap);}return;
 }
 const opposed=!(dx||dy);heldDirections.delete(k);if(!heldDirections.size)cancelMoveInput();else if(opposed&&!moveInFlight&&!anim.active&&moveTimer===null&&moveFrame===null)void flushMoveInput();
});
document.addEventListener('click',e=>{if((e.target as HTMLElement).closest('button,select'))cancelMoveInput();if(anim.active&&!(e.target as HTMLElement).closest('#anim-toggle, #anim-on, #anim-off, label:has(#anim-toggle), summary')){e.stopPropagation();e.preventDefault();}},true);
document.addEventListener('keydown',e=>{
 if(settings.open||(document.getElementById('unit-details-dialog') as HTMLDialogElement|null)?.open||screen!=='play'||store.atBase)return;
 if(e.key==='Shift'){anim.shift=true;if(anim.active)scene?.skip();return;}
 if(e.repeat){e.preventDefault();return;}
 if(anim.active){const direction=e.key.length===1?e.key.toLowerCase():e.key;if(heldDirections.size&&['w','a','s','d','ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(direction)&&!(e.target as HTMLElement).matches('input,select,textarea'))heldDirections.add(direction);if(e.key!=='Tab'&&e.key!=='F5')e.preventDefault();return;}
 const target=e.target as HTMLElement;if(target.matches('input,select,textarea'))return;
 if(e.key==='Enter'){if(target.matches('button[data-confirm]')&&!target.hasAttribute('disabled')){e.preventDefault();target.click();}else e.preventDefault();return;}
 if(e.key==='Escape'){
  if(bagOpen){bagOpen=false;render();return;}
  if(live()?.phase==='learning'){e.preventDefault();void send({type:'learnMove',replace:null});return;}
  if(live()?.phase==='evolution'){e.preventDefault();void send({type:'evolve',species:null});return;}
  if(live()?.phase==='invitation'&&inviteReject){inviteReject=false;notice='已取消拒绝，返回邀请比较。';}else{clear();actionsOpen=false;notice='';}render();return;
 }
 const s=live();if(!s||s.phase!=='playing'||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;
 const k=e.key.toLowerCase();
 if(k==='b'){e.preventDefault();bagOpen=!bagOpen;choosingItem=null;cancelMoveInput();render();return;}
 if(bagOpen)return;
 if(e.key==='Tab'){e.preventDefault();const alive=s.queue.filter(id=>s.units[id].hp>0);void send({type:'switch',actor:alive[(alive.indexOf(s.leader)+1)%alive.length]});return;}
 if(sleeping(s.units[s.leader])&&e.key!=='.'){if(e.key!=='F5'&&!((e.ctrlKey||e.metaKey)&&k==='r'))e.preventDefault();return;}
 if(['1','2','3','4'].includes(e.key)){e.preventDefault();const skill=s.units[draft?.editor??s.leader].learned[Number(e.key)-1];if(skill&&(s.units[draft?.editor??s.leader].pp[skill]??0)>0)chooseHudSkill(skill);return;}
 if(['5','6','7','8','9','0'].includes(e.key)){e.preventDefault();const item=quickItems[['5','6','7','8','9','0'].indexOf(e.key)];if(item)chooseHudItem(item);return;}
 const directionKey=e.key.length===1?k:e.key;
 if(['w','a','s','d','ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(directionKey)){
  e.preventDefault();const first=heldDirections.size===0;heldDirections.add(directionKey);
  // Only a fresh press collects a chord; held movement changes direction at the next step.
  if(moveCollecting)moveTap=null;
  if(first){moveCollecting=true;moveTimer=setTimeout(()=>void flushMoveInput(),40);}else if(!moveCollecting&&!moveInFlight)void flushMoveInput();return;
 }
 if(k==='f'){e.preventDefault();act({type:'basicForward'});return;}
 if(e.key==='.')act({type:'wait'});
 if(k==='k'){const skill=s.units[draft?.editor??s.leader].learned[0];if(skill)chooseHudSkill(skill);}
});
window.addEventListener('blur',()=>{cancelMoveInput();anim.shift=false;selectedSkill=null;render();});
{const box=document.getElementById('anim-toggle') as HTMLInputElement;box.checked=animationEnabled();box.disabled=params.get('anim')!==null||!!(window as unknown as {__trialNoAnim?:boolean}).__trialNoAnim;
 box.addEventListener('change',()=>{try{window.localStorage.setItem(PREF_KEY,box.checked?'on':'off');}catch{/* preference is optional */}if(!box.checked)scene?.skip();refreshTransfer();});for(const [id,value] of [['anim-on',true],['anim-off',false]] as const)bind(id,()=>{if(!box.disabled){box.checked=value;box.dispatchEvent(new Event('change'));}});}
// Read-only state inspection and the same dispatch API for private browser acceptance.
Object.assign(window,{trial:{store,autoSleep:(enabled:boolean)=>{(window as unknown as {__trialNoAutoSleep?:boolean}).__trialNoAutoSleep=!enabled;render();},profile:()=>store.profile,createScenario,applyCommand,getState:()=>store.state,camera:()=>({x:scene?.cameras.main.scrollX??0,y:scene?.cameras.main.scrollY??0}),animating:()=>anim.active,view:()=>scene?.debug(),repaint:(w:World|null)=>scene?.paint(w,true),animationEnabled}});
render();void store.whenReady.then(()=>{render();const next=finishing();if(next)void transition(store.dispatch(next));});
