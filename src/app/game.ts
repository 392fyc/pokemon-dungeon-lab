import type Phaser from 'phaser';
import {hudParty,hudBottom,hudTracking,hudBag,hudMoveTip,hudMoveAccuracy,hudDamageEstimate,tmDiscOf,blessingEffectLabel} from '../render/hud.ts';
import '../render/hud.css';
import {itemIconImg} from '../render/item-icons.ts';
import {installDrag,reconcileDrag} from './drag.ts';
import {resultBanner} from '../render/result-banner.ts';
import {applyHpBar,syncHpBars,hpTextColor} from '../render/hpbar.ts';
import {typeChips,unitDetails,settingsMarkup,settingsProfile,settlement} from '../render/panels194.ts';
import {createWiki} from '../render/wiki.ts';
import {updateMinimap,playbackMinimapWorld,boardCell,bigMinimapMarkup,minimapStats} from '../render/minimap.ts';
import '../render/panels194.css';
import {learningPanel,invitationPanel,moveCard,noticePanel,noticeTag} from '../render/choice-panels.ts';
import '../render/choice-panels.css';
import {CAMP_BUILDINGS,campScene,campPanelMarkup,campParty194,campVault194,normalizeVault194,campRecords194,campDeparture194,campMoveTooltip194,type CampPanel,type VaultState,type CampReport} from '../render/camp.ts';
import {applyCommand,bossDefeated,traceRound,playerVisibleCells,reveal,previewInvitation,createMain,createExpedition,key,same,plus,clone,facingOf,skillTargets,sleeping,ITEM_NAMES,ORB_ITEMS,PROG,COMMISSIONS,BLESSING_RARITY,BLESSINGS,type World,type Action,type Skill,type Pos,type Item,type Unit,type ShopItem,type TmItem,type Point,type CommissionId} from '../core/engine.ts';
import {ECON} from '../core/economy.ts';
import {SPECIES,ALL_TM_MOVES,STARTER_IDS,learnableMove} from '../core/roster.ts';
import {speciesZh,moveZh,tmZh,typeZh,itemZh,adventureRoomTypeZh,adventureRoomStateZh,challengeRewardZh} from '../core/names.ts';
import {moveOf} from '../core/moves.ts';
import {unitLabel,skillLabel,actionText,orderLine,stepRows,enemyInfo,localizeLog,logEntryText,logEntryShown,logPartsText,playerText,moveSummary,unitMoveLevel,adventureRoomMarkers} from '../core/describe.ts';
import {renderTitle,renderNewGame,portrait,portraitTick,type NewGameState} from '../ui/title.ts';
import {newGameProfile,initialProfile,squadOf,TALENTS,TALENT_MAX_RANK,rankLevel,rankThreshold,availableTalentPoints,type BaseAction,type Profile,type TalentId} from '../core/base.ts';
import {TACTICS,TACTIC_LABELS,isTactic,type Tactic} from '../core/tactics.ts';
import {TrialStore,SAVE_KEY,BUILD_ID,type StoragePort} from '../core/save.ts';
import {createScenario,scenarioProfile,SCENARIOS,SCENARIO_LABEL,type ScenarioId} from '../core/scenarios.ts';
import {THEME_FLOORS,themeOfLevel,ARENA_TILE,isDifficulty,type Difficulty} from '../core/dungeon.ts';
import {preloadArt,ensureCharacters,characterReady,characterFailed,characterDrawable,charactersPending,worldDex,nextFloorDex,createTerrainArt,exportTerrainArt,skinFor,facingRow,animKey,groundOriginY,UNIT_GROUND_FRACTION,TILE} from '../render/sprites.ts';
import {terrainSource} from '../render/dtef.ts';
import {DtefTerrainLayer} from '../render/dtef-scene.ts';
import {PainterTerrainLayer} from '../render/painter-scene.ts';
import {BOARD_BACKGROUND,darknessBackground,DungeonDarkness} from '../render/darkness.ts';
import {prepareTerrainMap,type TerrainThemeKey,type TerrainLayer} from '../render/terrain.ts';
import {inferEvents,plan,type AnimEvent} from '../render/animation.ts';
import {selfOrAdjacentReachable,adjacentReachable,floorIndex,walkPath} from '../render/reach.ts';
import {POINT_VISUALS,dungeonCellSize,terrainKnown} from '../render/point-visuals.ts';
import {itemDescription} from '../core/item-descriptions.ts';
import {playEvents,type Stage,type UnitView} from '../render/playback.ts';
import {resetCombatShake} from '../render/combat-effects.ts';
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
 return `Lv${level} · 升级经验 ${progress}/${required}`;
};
const FATE:Record<TmItem['fate'],string>={held:'持有中',brought:'已带回',sent:'已由伙伴运送',lost:'已取得、未带出'};
const SRC:Record<TmItem['source'],string>={target:'成果 T',shop:'商店',boss:'区域首领',challenge:'挑战奖励',blessing:'祝福奖励'};
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
dungeonLayout.innerHTML=`<div id="dungeon-hud"><div id="hud-map"></div><div id="shortcut-card"><span>WASD</span><span>移动</span><span>W+D 等</span><span>斜向移动</span><span>1—4</span><span>招式</span><span>5—0</span><span>快捷物品</span><span>Tab</span><span>切换操控</span><span>B</span><span>背包</span><span>F</span><span>向前普通攻击</span><span>.</span><span>等待</span><span>L</span><span>日志</span><span>H</span><span>百科</span><span>M</span><span>地图</span><span>Esc</span><span>关闭窗口</span></div><div id="hud-tools"><button id="actions-open" aria-label="行动菜单">⋯</button><button id="hud-settings" aria-label="设置与存档">⚙</button><button id="log-open" aria-label="打开完整记录（L）" title="完整记录（L）">记录</button></div><div id="context-actions"></div><div id="hud-actions" hidden></div><div id="hud-item-targets" hidden></div><div id="hud-bottom"></div><div id="hud-tooltip" role="tooltip" hidden></div><div id="hud-bag" hidden></div><div id="unit-details-layer"></div></div>`;
app.append(dungeonLayout);
const panelHomes=new Map<HTMLElement,Comment>();
for(const id of ['board','party','activity-status','recent-events','message','inspect','controls','flow','save',...(dev?['developer-tools']:[])]){const el=document.getElementById(id)!;const home=document.createComment(id);el.before(home);panelHomes.set(el,home);}
let actionsOpen=false,bagOpen=false,bagCategory='all',bagSlot=0;
let bagSelectedItem:string|null=null;
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
/** The stairs prompt opens by itself when the leader stands on a staircase; "不前进" closes it for that cell and a small button in the bottom bar brings it back. */
let stairsClosedKey='',stairsPromptShown=false;
/** Rooms holding the leader or a living companion: each is lit as one whole rounded rectangle (the room and the ring around it). */
const litRoomsOf=(s:World)=>(s.rooms??[]).filter(r=>s.queue.some(id=>{const u=s.units[id];return !!u&&u.hp>0&&!!u.pos&&u.pos.x>=r.x&&u.pos.x<r.x+r.w&&u.pos.y>=r.y&&u.pos.y<r.y+r.h;})).map(r=>({x:r.x,y:r.y,w:r.w,h:r.h}));
const stairsKeyOf=(s:World):string=>{const L=s.units[s.leader],p=L?.pos&&s.points.find(q=>same(q.pos,L.pos!));return p&&(p.kind==='down'||p.kind==='up')?`${s.runId}|${s.dungeon?.level??0}|${L.pos!.x},${L.pos!.y}`:'';};
let inviteChoice:string|undefined,notice='',detailsId:string|null=null,detailsOpenerId:string|null=null;
let learnChoice:string|null=null,learnKeyShown='';
let campSelected:string|null=null,departureOpen=false;
/** Set by the camp panel on every render so the drag rules below act on the profile the player sees. */
let campDragCtx:{edit:(a:BaseAction)=>Promise<void>;p:NonNullable<typeof store.profile>}|null=null;
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
/** Entries of the record with a number above `freshSeq` were written by the last command; Infinity means none are new. */
let attrib=new Map<string,string>(),freshSeq=Infinity;
/** Stage 6.4: `active` is true while a round's animation plays; every world-changing input is dropped (not queued) meanwhile. */
const anim={active:false,shift:false};
/** Playtest 1107: after a defeat or an invitation the board keeps the last frame and a centre banner for a moment before the invitation or settlement panel opens; any key or click skips it. */
let hold:{end:()=>void}|null=null;
const holdBanner=document.createElement('div');holdBanner.id='result-banner';holdBanner.setAttribute('role','status');holdBanner.hidden=true;document.body.append(holdBanner);
function startHold(b:{text:string;ms:number}):Promise<void>{
 return new Promise<void>(resolve=>{
  holdBanner.textContent=b.text;holdBanner.hidden=false;anim.active=true;
  const timer=setTimeout(()=>hold?.end(),b.ms);
  hold={end:()=>{clearTimeout(timer);hold=null;holdBanner.hidden=true;anim.active=false;try{render();}finally{resolve();}}};
 });
}
let sleepTimer:ReturnType<typeof setTimeout>|null=null,sleepTurn='';
const sleepAutoEnabled=()=>!(window as unknown as {__trialNoAutoSleep?:boolean}).__trialNoAutoSleep;
function cancelSleepAdvance(){if(sleepTimer!==null)clearTimeout(sleepTimer);sleepTimer=null;sleepTurn='';}
function syncSleepAdvance(){
 const s=live(),eligible=screen==='play'&&s?.phase==='playing'&&store.status==='ready'&&!anim.active&&!(settings.open||wikiOpen())&&!logDialog.open&&!abandonDialog.open&&!detailsId&&sleepAutoEnabled()&&sleeping(s.units[s.leader]);
 if(!eligible||!s){cancelSleepAdvance();return;}
 const turn=s.runId+'|'+s.round+'|'+s.leader;if(sleepTimer!==null&&sleepTurn===turn)return;
 cancelSleepAdvance();sleepTurn=turn;sleepTimer=setTimeout(()=>{
  sleepTimer=null;sleepTurn='';const current=live();
  if(current&&current.runId+'|'+current.round+'|'+current.leader===turn&&screen==='play'&&current.phase==='playing'&&store.status==='ready'&&!anim.active&&!(settings.open||wikiOpen())&&!logDialog.open&&!abandonDialog.open&&!detailsId&&sleepAutoEnabled()&&sleeping(current.units[current.leader]))void send({type:'round',action:{type:'wait'}});
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
/** While an animation plays, the interface shows each unit's HP as it was before the round and lowers or raises it at the moment each hit or heal lands (the engine state is already final). */
/** While a round plays, the recent-events box keeps the messages from before the round; the round's messages appear once the animation ends, so the text never runs ahead of the board. */
let logHeld:World|null=null;
let hpShown:Map<string,number>|null=null,hpShownSrc:World|null=null,hpShownView:World|null=null,hpShownVer=0,hpShownViewVer=-1;
const live=():World|null=>{
 const s=store.state;if(!s||!anim.active||!hpShown)return s;
 if(hpShownSrc!==s||hpShownViewVer!==hpShownVer){hpShownSrc=s;hpShownViewVer=hpShownVer;const shown=hpShown;hpShownView={...s,units:Object.fromEntries(Object.entries(s.units).map(([id,u])=>[id,shown.has(id)&&shown.get(id)!==u.hp?{...u,hp:shown.get(id)!}:u]))};}
 return hpShownView;
};
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
  try{if(after){freshSeq=before.logSeq??0;attrib=new Map();for(const e of inferEvents(before,after,command))if(e.k==='hit'&&e.attacker)attrib.set(`${e.target}|${e.amount}`,e.attacker);}}catch{attrib=new Map();freshSeq=Infinity;}
  try{const events=scene&&after&&animationEnabled()&&!anim.shift?inferEvents(before,after,command):[];if(scene&&events.length&&plan(events)){hpShown=new Map(Object.entries(before.units).map(([id,u])=>[id,u.hp]));hpShownVer++;logHeld=before;anim.active=true;const banner=after?resultBanner(before,after,animationEnabled()):null;let held:Promise<void>|null=null;playing=scene.animate(before,after!,events).finally(()=>{anim.active=false;hpShown=null;logHeld=null;if(banner)held=startHold(banner);render();}).then(()=>held??undefined);}}
  catch{anim.active=false;hpShown=null;logHeld=null;playing=null;render();}}
 clear(keepMovement);notice=cancelledCombination?'组合已取消。':'';if(command.type==='invite'){inviteChoice=undefined;}render();const r=await pending;if(!r.ok)notice=r.error;render();if(playing)await playing;const next=finishing();if(next)await transition(store.dispatch(next));return playing!==null;}
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
 if(action.type==='interact'&&action.exit){const s0=live();if(s0&&stairsKeyOf(s0)){stairsClosedKey='';render();return;}confirmExit=true;render();return;}
 void send({type:'round',action});
}
function clickCell(p:Pos){if(performance.now()<swallowClickUntil){swallowClickUntil=0;return;}   // this very click just stopped a walk: it does nothing else
 const s=live();if(anim.active||!s||s.phase!=='playing'||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;
 if(targetMode()){const mate=s.queue.find(i=>s.units[i].hp>0&&same(s.units[i].pos,p));if(mate)useOn(mate);return;}   // choosing a target: a click on a partner uses the item, anything else does nothing
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
 if(!target&&!draft&&s.units[s.leader].pos&&Math.max(Math.abs(p.x-s.units[s.leader].pos!.x),Math.abs(p.y-s.units[s.leader].pos!.y))>1){void autoWalk(p);return;}   // a far, empty, revealed cell: walk there
 if(target&&s.enemies.includes(target))act({type:'basic',target});else act({type:'move',to:p});
}
/* Click-to-walk (roguelike "travel" and Mystery Dungeon's touch movement): every step is an ordinary round, and the walk stops the moment something needs the player. */
let walkToken=0,swallowClickUntil=0,walkMarker:Pos|null=null;
const walkActive=()=>walkMarker!==null;
function stopWalk(fromMapClick=false){if(walkMarker===null)return;walkToken++;walkMarker=null;if(fromMapClick)swallowClickUntil=performance.now()+400;if(!anim.active)scene?.paint(live());}
/** A confused leader walks in a random direction (engine), so a walk is neither started nor continued. */
const confusedLeader=(s:World):boolean=>!!s.units[s.leader]?.status?.confusion;
/** Cells that ask for the player's attention: items, stairs and other points, adventure-room interactions. */
function attentionCells(s:World):Set<string>{const out=new Set<string>();for(const p of s.points)if(!p.used||p.kind==='down'||p.kind==='up'||p.kind==='exit'||p.kind==='shop'||p.kind==='rest'||p.kind==='exchange')out.add(key(p.pos));for(const r of s.adventureRooms??[])if(r.state!=='done')out.add(key(r.interaction));return out;}
async function autoWalk(target:Pos){
 const first=live();if(!first||first.phase!=='playing'||store.status!=='ready'||draft||choosingItem||selectedSkill||bagOpen||(settings.open||wikiOpen())||screen!=='play'||anim.active||confusedLeader(first))return;
 const token=++walkToken;cancelMoveInput();
 const plan0=(s:World)=>{const L=s.units[s.leader];if(!L?.pos)return null;const blocked=new Set(s.enemies.filter(id=>s.units[id].hp>0&&s.units[id].pos).map(id=>key(s.units[id].pos!)));return walkPath(floorIndex(s.floor),new Set(s.seen),L.pos,target,blocked,attentionCells(s));};
 if(!plan0(first))return;   // not reachable (wall, unrevealed, occupied): nothing happens
 walkMarker={x:target.x,y:target.y};scene?.paint(live());
 while(token===walkToken){
  const s=live();if(!s||s.phase!=='playing'||store.status!=='ready'||anim.active||bagOpen||(settings.open||wikiOpen())||screen!=='play'||draft||sleeping(s.units[s.leader])||confusedLeader(s))break;
  const path=plan0(s);if(!path||!path.length)break;
  const run=s.runId,level=s.dungeon?.level,round=s.round,leader=s.leader,enemiesBefore=movementEnemies(s),watched=attentionCells(s);   // read before the step: walking onto an item picks it up and clears its marker
  await send({type:'round',action:{type:'move',to:path[0]}},true);
  if(token!==walkToken)return;
  const after=live();if(!after||after.runId!==run||after.dungeon?.level!==level||after.round===round||after.phase!=='playing'||store.status!=='ready'||after.leader!==leader)break;
  {const at=after.units[leader].pos;if(!at||!same(at,path[0]))break;}   // the leader did not land where planned (confusion, blown away, swapped elsewhere)
  if([...movementEnemies(after)].some(id=>!enemiesBefore.has(id)))break;   // a new enemy came into view
  if((after.events??[]).some(e=>e.type==='hpLoss'&&e.amount>0&&after.queue.includes(e.unit)))break;   // someone lost HP this round (a Reviver Seed restoring the HP in the same blow leaves no net loss, so the events are read, not the HP difference)
  const here=after.units[leader].pos;if(!here||same(here,target)||watched.has(key(here))||attentionCells(after).has(key(here)))break;   // arrived, or stepped on something to look at
 }
 if(token===walkToken){walkMarker=null;walkToken++;scene?.paint(live());}
}
document.addEventListener('pointerdown',e=>stopWalk((e.target as HTMLElement|null)?.tagName==='CANVAS'),true);
document.addEventListener('keydown',()=>stopWalk(false),true);
const itemName=(id:Item)=>id==='teamTonic'?itemZh(id):ITEM_NAMES[id];
function actionLabel(a:Action|null,actor?:string){const target=(id:string)=>id===actor?'自身':unitLabel(live()?.units[id],id);if(!a)return '尚未选择';if(a.type==='move')return '移动';if(a.type==='skill')return `${moveZh(a.skill)} → ${target(a.target)}`;if(a.type==='basic')return `普通攻击 → ${target(a.target)}`;if(a.type==='basicForward')return '向前普通攻击';if(a.type==='swap')return `与${target(a.target)}换位`;if(a.type==='use')return a.item==='teamTonic'?`使用${itemName(a.item)}（全队）`:`使用${itemName(a.item)} → ${target(a.target)}`;if(a.type==='interact')return a.exit?'前进或撤离':'取得并继续';return '等待';}
type AdventureRoom=NonNullable<World['adventureRooms']>[number];
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
/** What a commission asks, in one short line. */
const COMMISSION_GOAL:Record<CommissionId,string>={hunter:'击倒 3 只敌人',collector:'取得 1 件道具',scout:'先进祝福房或道具房，再下楼',guardian:'下楼时全队存活',speedrun:'限定轮数内下楼'};
const commissionPenaltyTag=(penalty:typeof COMMISSIONS[CommissionId]['penalty']):string=>penalty==='defenseMinusOne'?'全队防御 −1':penalty==='berryHealHalf'?'树果回复减半':'';
/** The commission offer as a notice board: name, goal, reward (icon and number), the penalty while it runs and the floor limit, then accept or reject. */
function commissionNotice(spec:typeof COMMISSIONS[CommissionId],id:CommissionId,full:boolean,ready:boolean):string{
 const penalty=commissionPenaltyTag(spec.penalty);
 return noticePanel({id:'commission-choice',kind:'委托',title:spec.name,asDialog:true,rows:[
  {label:'目标',html:esc(COMMISSION_GOAL[id])},
  {label:'奖励',html:'<i class="notice-icon exp" aria-hidden="true"></i><b>×'+spec.equivalentEnemies+'</b>',id:'commission-reward'},
  ...(penalty?[{label:'生效期间',html:noticeTag(penalty,'bad')}]:[]),
  {label:'期限',html:esc('本层')+(full?noticeTag('已有 3 条委托','bad'):'')},
 ],buttons:button('commission-accept','接下',!ready||full,'class="paper-button is-primary" data-confirm')+button('commission-reject','拒绝',!ready,'class="paper-button"')});
}
let autoInteractKey='';
function adventureRoomPanel(s:World,room:AdventureRoom,editor:string,ready:boolean,draftActive:boolean):string{
 const canAct=ready&&editor===s.leader&&!draft?.swap;
 const attrs=(type:string)=>`data-room-type="${type}" data-room-state="${room.state}"`;
 const id='adventure-room-panel';
 if(room.type==='challenge'){
  if(room.state==='idle')return noticePanel({id,kind:'挑战',attrs:attrs('challenge'),rows:[{label:'目标',html:esc('打倒房内全部敌人')},{label:'奖励（其一）',html:['钱袋','道具','招式机','邀请','祝福'].map(t=>noticeTag(t)).join('')}],buttons:button('start-challenge','开始挑战',!canAct,'data-action="start-challenge" class="primary"')});
  if(room.state==='sealed')return noticePanel({id,kind:'挑战',attrs:attrs('challenge'),rows:[{label:'目标',html:esc('打倒房内全部敌人')}]});
  const reward=[...(s.entries??[])].reverse().find(e=>e.reward);
  return noticePanel({id,kind:'挑战',attrs:attrs('challenge'),rows:[{label:'奖励',html:esc(reward?.reward?logPartsText(reward.reward):'已发放'),id:'challenge-reward-result'}]});
 }
 if(room.type==='item'){
  const item=room.item?itemName(room.item):'道具',icon=room.item?itemIconImg(room.item,'notice-icon-img'):'';
  return room.state==='done'?noticePanel({id,kind:'道具',attrs:attrs('item'),rows:[{label:'',html:icon+esc(item)+noticeTag('已取得')}]}):
   noticePanel({id,kind:'道具',attrs:attrs('item'),rows:[{label:'',html:icon+esc(item)}],buttons:button('take-adventure-item',`拾取`,!canAct,'data-action="take-adventure-item" class="primary"')});
 }
 return '';   // commission and blessing rooms open their choice at once (see the arrival handling in renderMain), so they have no panel
}
/** Panel focus: the learn, invitation and bag windows put the focus on their main control when they open, and keep it through re-renders. */
let panelFocusKey='';
function applyPanelFocus(previousId:string):void{
 const s=live();let key='',first='';
 if(screen==='play'&&s&&s.phase==='learning'){key='learn|'+s.runId+'|'+(s.pendingLearnMoves?.[0]?.move??'');first='#learn-confirm:not(:disabled), .c195-old .c195-move:not(:disabled)';}
 else if(screen==='play'&&s&&s.phase==='invitation'){key='invite|'+(s.invitations.find(i=>i.status==='pending')?.id??'');first='#accept:not(:disabled), #out-0:not(:disabled)';}
 else if(screen==='play'&&bagOpen){key='bag';first='.c195-bag-item.is-selected, .c195-bag-item';}
 if(!key){panelFocusKey='';return;}
 // The learn and invitation windows stay hidden through the animation and pause: wait, so the focus lands once they show.
 if(key!=='bag'&&$('flow').hidden)return;
 if(key!==panelFocusKey){panelFocusKey=key;document.querySelector<HTMLElement>(first)?.focus({preventScroll:true});return;}
 const el=previousId?document.getElementById(previousId) as HTMLButtonElement|null:null;
 if(el&&!el.disabled)el.focus({preventScroll:true});
}
function render(){const active=document.activeElement as HTMLElement|null,previousId=active&&active.id&&($('flow').contains(active)||$('hud-bag').contains(active))?active.id:'';try{renderAll();}finally{applyPanelFocus(previousId);reconcileDrag();}}
function renderAll(){document.body.classList.toggle('camp-mode',screen==='play'&&store.atBase);syncDungeonLayout();for(const id of ['context-actions','hud-bottom','hud-item-targets'])$(id).replaceChildren();renderOverlay();renderMain();renderExtras();renderDungeonHud();refreshTransfer();syncSleepAdvance();if(screen==='play')void ensureBoard();}

function confirmLearn(){const s=live();if(!s||s.phase!=='learning'||!learnChoice||store.status!=='ready'||anim.active)return;const replace=learnChoice;learnChoice=null;void send({type:'learnMove',replace});}
function chooseHudSkill(skill:Skill){cancelMoveInput();selectedSkill=selectedSkill===skill?null:skill;choosingItem=null;bagOpen=false;actionsOpen=false;render();}
/** Items that act on one party member (berries, tonics, seeds...). Team tonic and the orbs act on the whole team or the user, and the Reviver Seed is automatic. */
const isTargetedItem=(item:Item):boolean=>item!=='teamTonic'&&item!=='reviverSeed'&&!ORB_ITEMS.includes(item);
/** Party members the chosen item can be used on right now (the real rule check, so a full-HP member is not offered a berry). */
let targetUsable=new Set<string>();
/** Each check simulates one whole round, about 1.7 ms per member on a late floor (measured, 5 ms for three), and render runs often, so the answer is kept until something the check reads changes. */
let targetCache:{sig:string;out:Set<string>}|null=null;
const targetSignature=(s:World,item:Item):string=>JSON.stringify([item,s.runId,s.round,s.phase,s.leader,draft?.editor,draft?.main,s.prog?.items[item],s.queue.map(id=>{const u=s.units[id];return [id,u.hp,u.maxHp,u.pos,u.status,u.pp];})]);
function itemTargets(s:World,item:Item):Set<string>{
 const sig=targetSignature(s,item);if(targetCache?.sig===sig)return new Set(targetCache.out);
 const out=computeItemTargets(s,item);targetCache={sig,out};return new Set(out);
}
function computeItemTargets(s:World,item:Item):Set<string>{
 const actor=draft?.editor??s.leader,out=new Set<string>();
 for(const id of s.queue){
  const use:Action={type:'use',item,target:id};
  const cmd=draft&&draft.editor!==s.leader?{type:'round' as const,action:draft.main??{type:'wait' as const},override:{actor,action:use}}:{type:'round' as const,action:use};
  if(applyCommand(s,cmd).ok)out.add(id);
 }
 return out;
}
const targetMode=():boolean=>!!choosingItem&&isTargetedItem(choosingItem)&&!!live()&&live()!.phase==='playing';
function useOn(id:string){if(choosingItem&&targetUsable.has(id)){const item=choosingItem;act({type:'use',item,target:id});}}
function chooseHudItem(item:Item){
 cancelMoveInput();const s=live();if(!s||s.phase!=='playing'||store.status!=='ready'||anim.active)return;
 if((s.prog?.items[item]??0)<1){notice=`背包里没有${itemName(item)}；本轮未执行`;render();return;}
 if(item==='reviverSeed'){notice='复活种子不能手动使用：队员倒下的瞬间会自动用掉。';render();return;}
 bagOpen=false;actionsOpen=false;selectedSkill=null;
 if(choosingItem===item){choosingItem=null;render();return;}
 const actor=draft?.editor??s.leader;
 // No second confirmation: the whole-team and self items (orbs, team tonic) act at once, and so does a target item with exactly one usable target; several targets open the choice.
 if(item==='teamTonic'||ORB_ITEMS.includes(item)){choosingItem=null;act({type:'use',item,target:actor});return;}
 if(isTargetedItem(item)){const ok=itemTargets(s,item);if(ok.size===1){choosingItem=null;act({type:'use',item,target:[...ok][0]});return;}}
 choosingItem=item;render();
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
 const selected=detailsId,choices=[...s.queue];
 host.innerHTML=unitDetails(s,selected,choices,disabled);const dialog=$('unit-details-dialog') as HTMLDialogElement;
 const close=()=>{const opener=detailsOpenerId;detailsId=null;detailsOpenerId=null;actionsOpen=false;render();if(opener)document.querySelector<HTMLButtonElement>('[data-hud-details="'+CSS.escape(opener)+'"]')?.focus({preventScroll:true});};bind('unit-detail-close',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 for(const b of host.querySelectorAll<HTMLButtonElement>('[data-detail-unit]'))b.onclick=()=>{detailsId=b.dataset.detailUnit!;render();};
 for(const b of host.querySelectorAll<HTMLButtonElement>('[data-detail-tactic]'))b.onclick=()=>{const tactic=b.dataset.detailTactic;if(isTactic(tactic))void setTactic(selected,tactic);};
 for(const b of host.querySelectorAll<HTMLButtonElement>('[data-detail-skill]')){const show=()=>showMoveTip(b.dataset.detailSkill!,selected),hide=()=>{const active=host.querySelector<HTMLButtonElement>('[data-detail-skill]:focus')??host.querySelector<HTMLButtonElement>('[data-detail-skill]:hover');if(active)showMoveTip(active.dataset.detailSkill!,selected);else{const tip=document.getElementById('detail-tooltip');if(tip)tip.hidden=true;}};b.onmouseenter=show;b.onfocus=show;b.onmouseleave=hide;b.onblur=hide;}
 {const tip=dialog.querySelector<HTMLElement>('#stat-tip')!;let current:HTMLElement|null=null;
  const hideTip=()=>{current=null;tip.hidden=true;for(const r of dialog.querySelectorAll('[data-stat-tip]'))r.removeAttribute('aria-describedby');};
  const showTip=(row:HTMLElement)=>{current=row;tip.textContent=row.dataset.statTip??'';tip.hidden=false;row.setAttribute('aria-describedby','stat-tip');
   const d=dialog.getBoundingClientRect(),r=row.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight,vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight;
   const lo=Math.max(d.left,0)+8,hi=Math.min(d.right,vw)-8,top0=Math.max(d.top,0)+8,bot0=Math.min(d.bottom,vh)-8;
   let x=r.right+8;if(x+w>hi)x=r.left-8-w;x=Math.max(lo,Math.min(x,hi-w));
   const y=Math.max(top0,Math.min(r.top+r.height/2-h/2,bot0-h));
   tip.style.left=(x-d.left)+'px';tip.style.top=(y-d.top)+'px';};
  for(const row of dialog.querySelectorAll<HTMLElement>('[data-stat-tip]')){
   row.addEventListener('mouseenter',()=>showTip(row));row.addEventListener('mouseleave',()=>{if(document.activeElement!==row)hideTip();});
   row.addEventListener('focus',()=>showTip(row));row.addEventListener('blur',hideTip);
   row.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){e.stopPropagation();if(current===row)hideTip();else showTip(row);}});}
  dialog.addEventListener('pointerdown',()=>{if(current&&document.activeElement!==current)hideTip();});
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&current)hideTip();});}
 dialog.showModal();dialog.scrollTop=scrollTop;if(focusId&&dialog.contains(document.getElementById(focusId)))document.getElementById(focusId)?.focus({preventScroll:true});cancelSleepAdvance();
}
function refreshSettlementOverflow(){
 const list=document.getElementById('rank-breakdown'),cue=document.getElementById('rank-more');if(!list||!cue)return;
 const bottom=list.getBoundingClientRect().bottom-20,remaining=list.scrollHeight>list.clientHeight+1?Array.from(list.children).filter(el=>el.getBoundingClientRect().bottom>bottom+.5).length:0;
 cue.textContent='还有 '+remaining+' 项';cue.hidden=remaining===0;
}
function placeInspectBelowParty(){if(!dungeonMode())return;const party=$('party'),box=$('inspect'),top=party.offsetTop+party.offsetHeight+8;box.style.top=top+'px';
 // The card never covers the recent-events log: it stops 8px above it and scrolls inside.
 box.style.setProperty('--inspect-max',Math.max(80,$('recent-events').offsetTop-top-8)+'px');}
function renderDungeonHud(){
 if(!dungeonMode())return;
 const s=live()!,unavailable=store.status!=='ready'||s.phase!=='playing',disabled=anim.active||unavailable;
 $('party').innerHTML=hudParty(s,unavailable);
 document.getElementById('target-hint')?.remove();   // the hint floats over the map (not inside the party list), so it is cleared here on every redraw
 if(targetMode()){
  // Choose-a-target state: usable cards are lit with an arrow, the rest dimmed and not clickable; a hint line sits on top (picking a partner as in Mystery Dungeon).
  targetUsable=itemTargets(s,choosingItem!);
  s.queue.slice(0,3).forEach((id,i)=>{const card=document.getElementById('unit-card-'+id);if(!card)return;
   if(targetUsable.has(id)){card.classList.add('is-target');card.insertAdjacentHTML('beforeend','<span class="hud-target-arrow" aria-hidden="true"></span><kbd class="hud-target-key">'+(i+1)+'</kbd>');
    card.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=false;});
    card.querySelector('.hud-party-main')?.setAttribute('aria-label','对'+unitLabel(s.units[id],id)+'使用');}
   else{card.classList.add('is-dim');card.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=true;});}});
  {const actor=draft?.editor??s.leader,why=targetUsable.size?'':(()=>{const r=applyCommand(s,draft&&draft.editor!==s.leader?{type:'round',action:draft.main??{type:'wait'},override:{actor,action:{type:'use',item:choosingItem!,target:actor}}}:{type:'round',action:{type:'use',item:choosingItem!,target:actor}});return r.ok?'现在没有可以使用的目标；本轮未执行':r.error;})();   // nobody can use it right now: say why
   document.getElementById('dungeon-hud')!.insertAdjacentHTML('beforeend','<div class="hud-target-hint" id="target-hint" role="status"><strong>选择使用目标</strong><span>'+esc(itemName(choosingItem!))+'</span><button type="button" id="target-cancel">取消</button><small data-selected-item-description>'+esc(itemDescription(choosingItem!))+'</small>'+(why?'<small id="target-none">'+esc(why)+'</small>':'')+'</div>');}
  bind('target-cancel',()=>{choosingItem=null;render();});
 }else targetUsable=new Set();
 placeInspectBelowParty();
 $('hud-bottom').innerHTML=hudBottom(s,quickItems,unavailable||sleeping(s.units[s.leader]),draft&&draft.editor!==s.leader?null:selectedSkill,choosingItem);
 updateMinimap($('hud-map'),scene?.minimapWorld(s)??s);
 syncHpBars(document,k=>{const u=s.units[k.slice(2)];return u?{hp:u.hp,max:u.maxHp}:undefined;},hpAnimated());
 $('activity-status').innerHTML=hudTracking(s);$('activity-status').hidden=!s.dungeon?.roguelike;
 $('hud-tooltip').hidden=true;$('hud-tooltip').innerHTML='';
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-hud-leader]'))b.onclick=()=>{if(targetMode()){useOn(b.dataset.hudLeader!);return;}actionsOpen=false;void send({type:'switch',actor:b.dataset.hudLeader!});};
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-hud-details]'))b.onclick=()=>{const id=b.dataset.hudDetails!;const close=actionsOpen&&detailsId===id;detailsId=close?null:id;detailsOpenerId=close?null:id;actionsOpen=!close;render();};
 // The old action editor retains its transactional draft, service and confirmation handlers.
 // Its move/item controls are replaced by the actual HUD controls, so no duplicate IDs remain.
 $('controls').querySelectorAll(':scope > h2,:scope > p.muted,.items').forEach(el=>el.remove());
 const draftSkills=$('controls').querySelector('.skills');
 if(draft&&draft.editor!==s.leader){draftSkills?.querySelectorAll<HTMLElement>('button').forEach(b=>{b.id='draft-'+b.id;b.querySelectorAll('small').forEach(el=>el.remove());const skill=b.id.slice('draft-skill-'.length),actor=draft!.editor;const show=()=>showMoveTip(skill,actor);const hide=()=>{$('hud-tooltip').hidden=true;};b.onmouseenter=show;b.onfocus=show;b.onmouseleave=hide;b.onblur=hide;});}else draftSkills?.remove();
 const context=$('context-actions');context.replaceChildren();
 for(const b of Array.from($('controls').querySelectorAll<HTMLButtonElement>(':scope > #take,:scope > #take-exit'))){context.append(b);}
 for(const panel of Array.from($('controls').querySelectorAll<HTMLElement>('#adventure-room-panel,#shop-panel,#exchange-panel,#rest-panel'))){
  if(!panel.classList.contains('panel195'))panel.querySelectorAll('p:not(#purse-line):not(#challenge-reward-result):not(#exchange-result),h2 small').forEach(el=>el.remove());context.append(panel);
 }
 {// Services, rooms and the shop open as a centred panel; × closes it until the leader moves, and a small button brings it back.
  const lp=s.units[s.leader]?.pos,svcKey=lp?`${s.runId}|${s.dungeon?.level??0}|${lp.x},${lp.y}`:'',panels=Array.from(context.querySelectorAll<HTMLElement>('.service'));
  if(serviceClosedKey&&serviceClosedKey!==svcKey)serviceClosedKey='';
  if(panels.length&&serviceClosedKey===svcKey){const kind=panels[0].id==='shop-panel'?'商店':panels[0].id==='exchange-panel'?'交换机':panels[0].id==='rest-panel'?'休整点':({challenge:'挑战',item:'道具',commission:'委托',blessing:'祝福'} as Record<string,string>)[panels[0].dataset.roomType??'']??'房间';
   panels.forEach(el=>el.remove());   // closed with ×: an ordinary button next to the bag button brings it back (no floating bar)
   document.querySelector('#hud-bottom .hud-bag-button-wrap')?.insertAdjacentHTML('afterbegin','<button type="button" id="service-reopen" class="hud-bag-open hud-service-open">'+kind+'</button>');bind('service-reopen',()=>{serviceClosedKey='';render();});}
  else if(panels.length){for(const el of panels){if(!el.querySelector('.service-close'))el.insertAdjacentHTML('afterbegin','<button type="button" class="paper-close service-close" aria-label="关闭面板（Esc）">×</button>');}
   context.querySelectorAll<HTMLButtonElement>('.service-close').forEach(b=>b.onclick=()=>{serviceClosedKey=svcKey;render();});}
 }
 {// closed with "不前进": a small button next to the bag button reopens the prompt while the leader still stands on the stairs
  const here=stairsKeyOf(s);
  if(here&&!anim.active&&s.points.some(q=>q.kind==='down'&&same(q.pos,s.units[s.leader].pos!)))scene?.flushPrefetch(s);   // not while a step animates: decoding sheets there would hitch the camera
  if(here&&stairsClosedKey===here&&!anim.active)document.querySelector('#hud-bottom .hud-bag-button-wrap')?.insertAdjacentHTML('afterbegin','<button type="button" id="stairs-reopen" class="hud-bag-open hud-service-open">楼梯</button>');
  bind('stairs-reopen',()=>{stairsClosedKey='';render();});
 }
 $('hud-item-targets').hidden=true;   // items act at once or open the party target state; there is no separate confirm bar
 renderDetailsPanel(s,disabled);
 $('hud-actions').hidden=store.status==='ready'&&(!actionsOpen||!!detailsId);
 $('hud-actions').classList.toggle('has-draft',!!draft);
 {const menu=$('hud-actions'),existing=document.getElementById('abandon-open');if(runCanBeAbandoned()){if(!existing)menu.insertAdjacentHTML('beforeend','<button id="abandon-open" type="button" class="abandon-open">放弃探险…</button>');bind('abandon-open',openAbandon);}else existing?.remove();}
 $('flow').querySelectorAll('.muted').forEach(el=>el.remove());
 $('flow').hidden=!$('flow').innerHTML.trim();
 if(s.phase==='playing'&&!confirmExit&&!stairsPromptShown)$('flow').hidden=true;
 if(anim.active&&s.phase!=='playing'&&s.phase!=='exit'&&s.phase!=='transit')$('flow').hidden=true;
 if(s.phase==='ended'&&store.status==='failed'){($('flow').querySelector('#settlement-save')??$('flow')).prepend($('save'));$('hud-actions').hidden=true;}
 $('hud-bag').hidden=!bagOpen;
 $('hud-bag').innerHTML=bagOpen?hudBag(s,quickItems,bagCategory,bagSlot,bagSelectedItem,!unavailable&&!anim.active):'';
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-hud-skill]')){
  const skill=b.dataset.hudSkill!;b.onclick=()=>{if(draft)draft.editor=s.leader;chooseHudSkill(skill);};
  const show=()=>showMoveTip(skill,s.leader);
  const hide=()=>{$('hud-tooltip').hidden=true;};b.onmouseenter=show;b.onmouseleave=hide;b.onfocus=show;b.onblur=hide;
 }
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-hud-quick]'))b.onclick=()=>{const item=quickItems[Number(b.dataset.hudQuick)];if(item)chooseHudItem(item);};
 bind('bag-open',()=>{bagOpen=!bagOpen;choosingItem=null;render();});bind('bag-close',()=>{bagOpen=false;render();});
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-bag-slot]'))b.onclick=()=>{bagSlot=Number(b.dataset.bagSlot);render();};
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-bag-category]'))b.onclick=()=>{bagCategory=b.dataset.bagCategory!;render();};
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-bag-item]'))b.onclick=()=>{bagSelectedItem=b.dataset.bagItem!;render();};
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-bag-tm]'))b.onclick=()=>{bagSelectedItem='tm:'+b.dataset.bagTm;render();};
 document.querySelector<HTMLButtonElement>('[data-bag-pin]')?.addEventListener('click',e=>{const item=(e.currentTarget as HTMLElement).dataset.bagPin as Item;bagSelectedItem=item;quickItems=quickItems.map((v,i)=>i===bagSlot?item:v===item?null:v);render();});
 document.querySelector<HTMLButtonElement>('[data-bag-unpin]')?.addEventListener('click',e=>{const item=(e.currentTarget as HTMLElement).dataset.bagUnpin as Item;quickItems=quickItems.map(v=>v===item?null:v);render();});
 document.querySelector<HTMLButtonElement>('[data-bag-use]')?.addEventListener('click',e=>{chooseHudItem((e.currentTarget as HTMLElement).dataset.bagUse as Item);});
 $('actions-open').onclick=()=>{actionsOpen=!actionsOpen;detailsId=null;render();};$('hud-settings').onclick=openSettings;
 if(anim.active)document.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('#controls button,#controls select,#party button,#hud-bottom button').forEach(el=>{if(!unavailable&&!el.disabled&&el.matches('[data-hud-leader],[data-hud-details],[data-hud-skill],[data-hud-quick],#bag-open'))el.dataset.animationLocked='true';el.disabled=true;});
 $('recent-events').scrollTop=Math.min($('recent-events').scrollHeight,$('recent-events').scrollTop);
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
 $('history').innerHTML=s?visibleLog(s).slice(-12).map(t=>`<li>${esc(t)}</li>`).join(''):'';
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
  $('flow').innerHTML=commissionNotice(spec,pending.commission,full,ready);
  bind('commission-accept',()=>void send({type:'commissionChoice',choice:'accept'}));bind('commission-reject',()=>void send({type:'commissionChoice',choice:'reject'}));return;
 }
 if(s.phase==='blessing'){
  $('controls').innerHTML='';const pending=s.pendingChoices?.[0];
  if(!pending||pending.type!=='blessing'){$('flow').innerHTML='<div class="result"><p class="error">缺少待处理的祝福选择。</p></div>';return;}
  const source=pending.source==='challenge'?'挑战奖励':'祝福',refreshes=s.blessingRefreshes??0;
  // The blessing choice is a paper notice panel like the commission offer: one card per blessing (name and effect), then a way out.
  $('flow').innerHTML=noticePanel({id:'blessing-choice',kind:source,asDialog:true,rows:[{label:'',html:'<span class="notice-cards">'+pending.options.map(id=>{const blessing=BLESSINGS[id];return button(`blessing-${id}`,`<strong>${esc(blessing.name)}<em class="rarity-tag">${esc(BLESSING_RARITY.names[blessing.rarity])}</em></strong><span>${esc(blessingEffectLabel(id))}</span>`,!ready,`class="paper-button notice-card" data-rarity="${blessing.rarity}"`);}).join('')+'</span>'}],buttons:button('blessing-refresh',`刷新（${refreshes}）`,!ready||refreshes<=0,'class="paper-button"')+button('blessing-skip','放弃',!ready,'class="paper-button"')});
  for(const id of pending.options)bind(`blessing-${id}`,()=>void send({type:'blessingChoice',blessing:id}));bind('blessing-refresh',()=>void send({type:'blessingRefresh'}));bind('blessing-skip',()=>void send({type:'blessingChoice',blessing:null}));return;
 }
 if(s.phase==='tmChoice'){
  $('controls').innerHTML='';const pending=s.pendingChoices?.[0];
  if(!pending||pending.type!=='tmChoice'){$('flow').innerHTML='<div class="result"><p class="error">缺少待处理的招式机选择。</p></div>';return;}
  $('flow').innerHTML=`<div class="result" id="tm-choice" role="dialog" aria-labelledby="tm-choice-heading"><small>${SRC[pending.source]} · 下一张招式机</small><h2 id="tm-choice-heading">选择一张招式机</h2><p>选择后即可继续本轮。</p><div class="choice-grid">${pending.options.map(move=>button(`tm-choice-${move}`,`<strong class="choice-title">${esc(tmZh(move))}招式机</strong>`,!ready,'class="primary choice-card"')).join('')}</div></div>`;
  for(const move of pending.options)bind(`tm-choice-${move}`,()=>void send({type:'tmChoice',move}));return;
 }
 if(s.phase==='learning'){
  $('controls').innerHTML='';const pending=s.pendingLearnMoves?.[0],unit=pending?s.units[pending.actor]:undefined;
  if(!pending||!unit){$('flow').innerHTML='<p class="error">缺少待处理的学招选择。</p>';return;}
  const learnKey=s.runId+'|'+pending.actor+'|'+pending.move;if(learnKeyShown!==learnKey){learnKeyShown=learnKey;learnChoice=null;}
  $('flow').innerHTML=learningPanel(s,pending,unit,learnChoice,ready);
  for(const move of unit.learned)bind('learn-replace-'+move,()=>{learnChoice=move;render();});
  bind('learn-confirm',confirmLearn);bind('learn-skip',()=>void send({type:'learnMove',replace:null}));
  return;
 }
  if(s.phase==='evolution'){
   $('controls').innerHTML='';const pending=s.pendingEvolutions?.[0],unit=pending?s.units[pending.actor]:undefined;
   $('flow').innerHTML=pending?`<div class="result" id="evolution-choice" role="dialog" aria-labelledby="evolution-heading"><small>升级后进化</small><h2 id="evolution-heading">${esc(unitLabel(unit,pending.actor))}可以进化</h2><p>请选择下一形态。关闭选择会暂不进化，并在下次升级时再询问。</p><div>${pending.choices.map(choice=>button(`evolve-${choice}`,spName(choice),!ready,'class="primary"')).join('')}</div>${button('evolution-close','暂不进化（下次升级时再问）',!ready)}</div>`:'<p class="error">进化阶段缺少待处理选择。</p>';
   if(pending){for(const choice of pending.choices)bind(`evolve-${choice}`,()=>void send({type:'evolve',species:choice}));bind('evolution-close',()=>void send({type:'evolve',species:null}));}
   return;
  }
 if(s.phase==='invitation'){
  $('controls').innerHTML='';const pending=s.invitations.find(i=>i.status==='pending')!,preview=previewInvitation(s,inviteChoice);
  $('flow').innerHTML=invitationPanel(s,pending,inviteChoice,preview,ready);
  s.queue.forEach((id,i)=>bind('out-'+i,()=>{inviteChoice=inviteChoice===id?undefined:id;render();}));
  bind('accept',()=>void send({type:'invite',choice:'accept',outgoing:inviteChoice}));bind('invite-to-camp',()=>void send({type:'invite',choice:'camp'}));bind('reject',()=>void send({type:'invite',choice:'reject'}));return;
 }
 if(s.phase==='exit'){$('controls').innerHTML='';$('flow').innerHTML='';return;}
 if(s.phase==='transit'){$('controls').innerHTML='';$('flow').innerHTML='';return;}
 const leaderPoint=s.points.find(p=>same(p.pos,s.units[s.leader].pos)),onStairs=leaderPoint?.kind==='down'||leaderPoint?.kind==='up';
 const stairsKey=stairsKeyOf(s);if(stairsClosedKey&&stairsClosedKey!==stairsKey)stairsClosedKey='';
 stairsPromptShown=!!stairsKey&&stairsClosedKey!==stairsKey&&!draft&&!confirmExit;
 const stairsUp=(()=>{const L=s.units[s.leader],p=L?.pos&&s.points.find(q=>same(q.pos,L.pos!));return p?.kind==='up';})();
 $('flow').innerHTML=stairsPromptShown?`<section class="paper-window c195 c195-stairs" id="stairs-prompt" role="dialog" aria-label="楼梯"><p class="stairs-ask">${stairsUp?'要回到上一层吗？':'要前进到下一层吗？'}</p><footer class="c195-foot">${button('stairs-go',stairsUp?'返回':'前进',!ready,'class="paper-button is-primary" data-confirm="true"')}${button('stairs-stay',stairsUp?'不返回':'不前进',!ready,'class="paper-button"')}</footer></section>`:confirmExit?`<section class="paper-window c195 c195-stairs" id="exit-prompt" role="dialog" aria-label="撤离"><p class="stairs-ask">要撤离吗？</p><footer class="c195-foot">${button('exit-confirm','撤离',!ready,'class="paper-button is-primary" data-confirm="true"')}${button('cancel-exit','不撤离',false,'class="paper-button"')}</footer></section>`:'';
 bind('stairs-go',()=>{stairsClosedKey=stairsKey;void send({type:'round',action:{type:'interact',exit:true}});});bind('stairs-stay',()=>{stairsClosedKey=stairsKey;render();});
 bind('exit-confirm',()=>void send({type:'round',action:{type:'interact',exit:true}}));bind('cancel-exit',()=>{confirmExit=false;render();});
 const editor=draft?.editor??s.leader;const u=s.units[editor];
 const point=s.points.find(p=>same(p.pos,u.pos));const stairKind=point?.kind==='down'||point?.kind==='up';const restPoint=point?.kind==='rest';const serviceCell=point?.kind==='shop'||point?.kind==='exchange';const canCollect=!!point&&!point.used&&point.kind!=='exit'&&!stairKind&&!restPoint&&!serviceCell;const pickup=point?.kind==='berry'||point?.kind==='tonic';
 let draftText='';if(draft){const valid=draft.main&&(draft.swap||draft.action)?applyCommand(s,{type:'round',action:draft.main,...(!draft.swap?{override:{actor:draft.partner,action:draft.action!}}:{})}):null;
 draftText=`<div class="draft"><strong>本轮草稿中 · 正在编辑 ${esc(unitLabel(s.units[editor],editor))}</strong><p>${button('edit-main',`${unitLabel(s.units[s.leader],s.leader)}：${actionLabel(draft.main,s.leader)}`,draft.swap)}${button('edit-partner',`${unitLabel(s.units[draft.partner],draft.partner)}：${draft.swap?'换位（双方行动）':actionLabel(draft.action,draft.partner)}`,draft.swap)}</p><p>之后：敌方阶段</p>${draftOrder(s,draft)}${valid&&!valid.ok?`<p class="error">${esc(playerText(valid.error))}</p>`:''}${button('submit',draft.main?.type==='interact'&&draft.main.exit?'提交整轮并交互':'提交整轮',!ready||!valid?.ok,'data-confirm="true" class="primary"')}${button('cancel-draft','取消组合')}</div>`;
 }
 $('controls').innerHTML=`<h2>${draft?'组合安排':'操控者行动'} <small>${esc(unitLabel(s.units[editor],editor))}</small></h2>${draftText}<div class="button-row">${button('wait','等待（.）',!editable||(!ready&&!draft)||!!draft?.swap)}${button('arrange','安排伙伴',!editable||!!draft)}${button('swap','换位',!editable||!!draft)}</div>${choosingPartner||choosingSwap?`<p>选择另一名伙伴：</p>${s.queue.filter(id=>id!==s.leader&&s.units[id].hp>0).map(id=>button('partner-'+id,unitLabel(s.units[id],id),!editable)).join('')}`:''}<div class="skills">${u.learned.map(k=>button('skill-'+k,`${esc(skillLabel(u,k))} ${u.pp[k]??0}/${u.maxPp[k]??0}<small data-move-preview="${esc(k)}" style="display:block">${esc(moveSummary(k,{s,sourceId:editor,targetId:visibleHoverTarget(s)}))}</small>`,!editable||(!ready&&!draft)||!!draft?.swap||(u.pp[k]??0)<1,selectedSkill===k?'class="selected"':'')).join('')}</div>${s.prog?`<div class="items"><p class="muted">背包（本局，不带出）：${ITEM_NAMES.berry}×${s.prog.items.berry}（回复${PROG.berryHeal}HP）· ${ITEM_NAMES.tonic}×${s.prog.items.tonic}（每招+${PROG.tonicPp}PP）。占该成员一次行动，对自己或相邻同行。</p>${(['berry','tonic'] as Item[]).map(k=>button('use-'+k,`使用${ITEM_NAMES[k]}`,!editable||(!ready&&!draft)||!!draft?.swap,choosingItem===k?'class="selected"':'')).join('')}${choosingItem&&u.pos?`<p>对谁使用${ITEM_NAMES[choosingItem]}？</p>${s.queue.filter(id=>s.units[id].hp>0&&s.units[id].pos&&(selfOrAdjacentReachable(s.floor,u.pos!,s.units[id].pos!))).map(id=>button('item-target-'+id,id===editor?`${id}（自己）`:id,!editable)).join('')}`:''}</div>`:''}<p class="muted">${selectedSkill?`已选${esc(skillLabel(u,selectedSkill))}：<span id="selected-move-preview">${esc(moveSummary(selectedSkill,{s,sourceId:editor,targetId:visibleHoverTarget(s)}))}</span>。消耗1PP；金圈标出合法目标${moveOf(selectedSkill)?.range==='user'||moveOf(selectedSkill)?.range==='room'?'（自身）':''}。`:draft?'点地图或方向键只编辑动作，尚未执行。':'方向键移动；点相邻敌人普通攻击；K选招式。'}</p>${point&&editor===s.leader&&!restPoint&&!serviceCell?(canCollect?button('take',pickup?`拾取${ITEM_NAMES[point!.kind as Item]}`:'取得并继续',!editable||(!ready&&!draft)||!!draft?.swap):'')+(pickup||stairKind||(s.dungeon?.roguelike&&!stairKind)?'':button('take-exit',canCollect?'取得（继续）':'撤离',!editable||(!ready&&!draft)||!!draft?.swap)):''}`;
 if(choosingItem==='bigBerry')document.querySelectorAll<HTMLElement>('#controls [id^="item-target-"]').forEach(el=>{const id=el.id.slice('item-target-'.length);el.id=`item-target-bigBerry-${id}`;el.dataset.action=`item-target-bigBerry-${id}`;});
 const backpack=$('controls').querySelector<HTMLElement>('.items');
 if(backpack&&s.prog&&s.dungeon?.roguelike){
  const summary=backpack.querySelector('p');if(summary)summary.textContent=`背包（本局，不带出）：${ITEM_NAMES.berry}×${s.prog.items.berry}（回复${PROG.berryHeal}HP）· ${ITEM_NAMES.tonic}×${s.prog.items.tonic}（每招+${PROG.tonicPp}PP）· ${ITEM_NAMES.bigBerry}×${s.prog.items.bigBerry??0}（回满HP，对自己或相邻同行使用）· ${itemName('teamTonic')}×${s.prog.items.teamTonic??0}（在场存活同行每招恢复${PROG.teamTonicPp}PP，不超过上限）`;
  backpack.insertAdjacentHTML('beforeend',button('use-bigBerry',`使用${ITEM_NAMES.bigBerry}`,!editable||(!ready&&!draft)||!!draft?.swap,`data-action="use-bigBerry" ${choosingItem==='bigBerry'?'class="selected"':''}`)+button('use-teamTonic',`使用${itemName('teamTonic')}`,!editable||(!ready&&!draft)||!!draft?.swap,`data-action="use-teamTonic"`));
 }
 const leaderPos=s.units[s.leader]?.pos??null,activeAdventure=(s.adventureRooms??[]).find(room=>same(room.interaction,leaderPos));
 // A commission or blessing room opens its choice as soon as the leader stands on the cell: no panel with a single button in between.
 if(activeAdventure&&(activeAdventure.type==='commission'||activeAdventure.type==='blessing')&&activeAdventure.state==='idle'&&!draft&&editor===s.leader&&ready&&!(window as unknown as {__trialNoAutoInteract?:boolean}).__trialNoAutoInteract){   // the flag lets a test that proves one key = one round keep the step and the choice apart
  const arrival=`${s.runId}|${s.dungeon?.level??0}|${activeAdventure.room}|${s.leader}`;   // per room and per controller: a companion who takes over on the cell opens it too
  // Claimed only when no animation is running, and given back when the check at the timeout fails: the first render after a step is drawn while the step's
  // animation still plays, and a key claimed then would never fire again for this room.
  if(autoInteractKey!==arrival&&!anim.active){autoInteractKey=arrival;setTimeout(()=>{const now=live();if(now&&now.phase==='playing'&&!anim.active&&!draft&&store.status==='ready'&&same(now.units[now.leader]?.pos??null,activeAdventure.interaction))act({type:'interact',exit:false});else autoInteractKey='';},0);}
 }
 if(activeAdventure&&!(activeAdventure.type==='challenge'&&activeAdventure.state==='sealed')&&!(activeAdventure.type==='commission'||activeAdventure.type==='blessing')){   // no room panel in the middle of a challenge fight, and none for the rooms that open their choice at once
  $('controls').insertAdjacentHTML('beforeend',adventureRoomPanel(s,activeAdventure,editor,ready,!!draft));
  bind('start-challenge',()=>act({type:'interact',exit:false}));bind('take-adventure-item',()=>act({type:'interact',exit:false}));}
 if(editor===s.leader&&(!draft||point?.kind==='rest')){$('controls').insertAdjacentHTML('beforeend',servicePanel(s,point,ready||!!draft,!!draft?.swap));bindService(s);}   // the rest point stays reachable while a combination is being arranged
 bind('wait',()=>act({type:'wait'}));bind('arrange',()=>{actionsOpen=true;choosingPartner=true;choosingSwap=false;selectedSkill=null;render();});bind('swap',()=>{actionsOpen=true;choosingSwap=true;choosingPartner=false;selectedSkill=null;render();});
 for(const id of s.queue.filter(id=>id!==s.leader))bind('partner-'+id,()=>{const swap=choosingSwap;draft={partner:id,action:null,main:swap?{type:'swap',target:id}:null,editor:swap?s.leader:id,swap};choosingPartner=false;choosingSwap=false;render();});
 u.learned.forEach(k=>bind('skill-'+k,()=>{selectedSkill=k;choosingItem=null;render();}));
 for(const k of (s.dungeon?.roguelike?['berry','tonic','bigBerry']:['berry','tonic']) as Item[]){bind('use-'+k,()=>{choosingPartner=false;choosingSwap=false;chooseHudItem(k);});
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
 bind('camp-menu',openSettings);bind('camp-retry',()=>{notice='';void transition(store.retry()).then(()=>{if(store.status==='ready'&&!document.querySelector('dialog#camp-dialog[open],dialog#camp-departure[open]'))document.getElementById('depart')?.focus({preventScroll:true});});});
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
 campDragCtx={edit:a=>edit(a),p};
 for(const talent of ['vitality','offense','supplies'] as TalentId[])bind('talent-add-'+talent,()=>void edit({type:'talent',talent}));
 bind('talent-reset',()=>void edit({type:'resetTalents'}));
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-camp-member]'))el.onclick=()=>{campSelected=el.dataset.campMember!;notice='';render();};
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-camp-tactic]'))el.onclick=()=>{const tactic=el.dataset.campTactic;if(campSelected&&isTactic(tactic))void edit({type:'tactic',inst:campSelected,tactic});};
 for(const i of p.roster){
  for(const l of i.learned)bind('carry-'+i.id+'-'+l.move,()=>void edit({type:'carry',inst:i.id,moves:i.carry.includes(l.move)?i.carry.filter(n=>n!==l.move):[...i.carry,l.move]}));
  bind('team-'+i.id,()=>{const team=p.team.includes(i.id)?p.team.filter(t=>t!==i.id):[...p.team,i.id];void edit({type:'team',team,leader:team.includes(p.leader)?p.leader:team[0]??p.leader});});
  bind('lead-'+i.id,()=>void edit({type:'team',team:p.team,leader:i.id}));
  bind('learn-'+i.id,()=>{const move=vaultState.move;if(!move)return;
   // Four moves already carried: ask which one to replace (or learn without carrying), like the in-run learning window.
   if(i.carry.length>=4&&!i.learned.some(l=>l.move===move)){void askLearnCarry(i,move).then(choice=>{if(choice)void edit({type:'learn',inst:i.id,move,replace:choice.replace});});return;}
   void edit({type:'learn',inst:i.id,move});});
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
  const rankRewards=rank?`<ul id="rank-breakdown"><li>深度：+${rank.depth}</li><li>击败首领：+${rank.boss}</li><li>完成委托：+${rank.commissions}（最多 3）</li><li>新招募伙伴：+${rank.recruits}（最多 2，碎片不计）</li><li>带回招式机：+${rank.tms}（最多 4）</li></ul><p id="rank-gain"><strong>探险队经验 +${rank.total}</strong> · 累计 ${rank.before} → ${rank.after}</p><p id="rank-level-change">${rank.levelAfter>rank.levelBefore?`探险队升级：Lv${rank.levelBefore} → Lv${rank.levelAfter}，获得 ${rank.levelAfter-rank.levelBefore} 个天赋点`:`探险队 Lv${rank.levelAfter}`}</p>`:'<p>本局无此项奖励</p>';
  return `<div id="settle"><section id="depth-rewards"><h2>深度和难度奖励</h2><p>到达第 ${s.dungeon.level} 层 · ${DIFFICULTY_LABEL[s.difficulty??'normal']}</p>${rankRewards}</section><section id="harvest-rewards"><h2>收获型奖励</h2><h3>带回的伙伴</h3><ul id="brought-partners">${brought.length?brought.map(i=>`<li>${esc(spName(i.species)||i.id)}</li>`).join(''):'<li>无新增伙伴</li>'}</ul><h3>伙伴碎片</h3><ul id="brought-shards">${shards.length?shards.map(i=>`<li>${esc(spName(i.species))}碎片 ×${i.count}</li>`).join(''):'<li>无</li>'}</ul><h3>招式机（${won?'已带回':'全队倒下，未带回'}）</h3><ul id="tm-list">${s.end.tms?.length?s.end.tms.map(t=>`<li>${esc(tmLine(t))}</li>`).join(''):'<li>本局没有取得招式机。</li>'}</ul></section><section id="camp-task-rewards"><h2>营地任务奖励</h2><p>本局无此项奖励</p></section></div>`;
 }

 const end=s.end!;
 if(!s.prog||end.effective===undefined)return `<p>报酬／救援未启用。</p>`;
 const label=(id:string)=>esc(unitLabel(s.units[id],id));
 const sum=s.scenario==='expedition'?store.settlementSummary:null;
 const savedSettlement=!!store.envelope&&store.status==='ready';
 const sp=(x:{id:string;species:string})=>`${esc(x.id)} ${esc(spName(x.species))}`;
 const pool=sum?`<ul id="pool-change">${sum.returned.length?`<li>回归名册：${sum.returned.map(sp).join('、')}</li>`:''}${sum.gone.length?`<li>永久失去：${sum.gone.map(sp).join('、')}</li>`:''}${sum.missing.length?`<li>走失：${sum.missing.map(sp).join('、')}</li>`:''}${sum.advanced.map(a=>`<li>${sp(a)}：${a.paid?'等待':'期限'} ${a.from} → ${a.to}</li>`).join('')}${!sum.returned.length&&!sum.gone.length&&!sum.missing.length&&!sum.advanced.length?'<li>救援池没有变化。</li>':''}</ul><p>账户：${sum.account.before} → ${sum.account.after}（${savedSettlement?'终局已入账':store.envelope?'保存成功后入账':'仅本次内存场景结算'}）</p>`:'';
 return `<div id="settle"><h2>结算</h2>
 <p id="eff-line">本局${end.effective?'算':'不算'}有效探险${end.reasons!.length?`：${end.reasons!.map(r=>REASON[r]).join('；')}`:''}</p>
 <p id="reward-line">基础报酬：${end.reward}${end.reward?'（完成了 G，全灭也照付）':'（没有完成 G，不发）'}。钱袋余额 ${end.purse}：${end.outcome==='normal'?`退回账户 ${end.refund}`:'全灭，丢失'}。</p>
 <p id="lost-line">走失的伙伴：${end.lost!.length?end.lost!.map(label).join('、'):'无'}</p>
 <ul id="tm-list">${end.tms!.length?end.tms!.map(t=>`<li>${esc(tmLine(t))}</li>`).join(''):'<li>本局没有取得招式机。</li>'}</ul>
 <h2>救援池的变化</h2>${pool||'<p class="muted">无</p>'}</div>`;
}
/** Shop and exchanger panels, shown when the leader stands on the cell. Buying takes no round; the exchanger takes the leader's action. */
/** Shop stock beyond the three fixed rows: the cure berry, heal seed (stock existed, never listed), the four orbs and the Reviver Seed. */
let shopSelected:ShopItem='berry',serviceClosedKey='';
const SHOP_EXTRA=['pechaBerry','healSeed','slumberOrb','totterOrb','luminousOrb','rollcallOrb','reviverSeed'] as const;
function servicePanel(s:World,point:Point|undefined,ready:boolean,swapping=false):string{
 if(!point||!s.prog)return '';
 if(point.kind==='shop'&&s.shop){
  const sh=s.shop,purse=s.purse??0;
  const goods:ShopItem[]=['berry','tonic','tm',...SHOP_EXTRA];
  const stockOf=(item:ShopItem)=>item==='tm'?(sh.stock.tm?1:0):(sh.stock[item]??0);
  const nameOf=(item:ShopItem)=>item==='tm'?(sh.stock.tm?`招式机：${tmName(sh.stock.tm)}`:'招式机'):ITEM_NAMES[item];
  const picked=goods.includes(shopSelected)?shopSelected:'berry',price=ECON.price[picked],left=stockOf(picked),short=purse<price;
  const iconOf=(item:ShopItem,big=false)=>item!=='tm'?itemIconImg(item as Item,big?'shop-icon is-big':'shop-icon'):`<span class="shop-icon tm-icon">${sh.stock.tm?tmDiscOf(sh.stock.tm):''}</span>`;
  const rows=goods.map(item=>{const pr=ECON.price[item],lf=stockOf(item),sh2=purse<pr&&lf>0;
   return `<li><button type="button" id="shop-pick-${item}" class="shop-row${item===picked?' is-selected':''}${lf<1?' is-sold':''}${sh2?' is-short':''}" aria-pressed="${item===picked}">${iconOf(item)}<span class="shop-name">${esc(nameOf(item))}</span><span class="shop-price">价格 ${pr}</span><span class="shop-stock">库存 ${lf}</span></button></li>`;}).join('');
  const description=picked==='tm'?(sh.stock.tm?moveSummary(sh.stock.tm,undefined,undefined,unitMoveLevel(s,s.units[s.leader])):'已经卖完了。'):itemDescription(picked as Item);
  return `<div class="service panel195 shop195" id="shop-panel" role="dialog" aria-labelledby="shop-heading"><h2 class="paper-plaque" id="shop-heading">商店</h2><p id="purse-line" class="shop-purse">钱袋余额：<strong>${purse}</strong></p><div class="shop-body"><ul class="shop-list" aria-label="商品">${rows}</ul><aside class="shop-detail" aria-label="商品详情"><div class="shop-detail-head">${iconOf(picked,true)}<div><strong>${esc(nameOf(picked))}</strong><small class="${left>0&&short?'is-short':''}">价格 <b class="shop-price-num">${price}</b> · 库存 ${left}</small></div></div><p class="shop-detail-text">${esc(description)}</p>${button('buy-'+picked,left<1?'售罄':'购买',!ready||left<1||short,'class="paper-button is-primary"')}</aside></div></div>`;
 }
 if(point.kind==='rest'){   // a centred paper panel like the shop: what the rest does, one button; a used point shows nothing
  if(point.used)return '';
  return `<div class="service panel195 rest195" id="rest-panel" role="dialog" aria-labelledby="rest-heading"><h2 class="paper-plaque" id="rest-heading">休整点</h2><p id="rest-text">每个招式 PP +${PROG.restPp}</p>${button('rest','休整',!ready||swapping,'class="primary"')}</div>`;
 }
 if(point.kind==='exchange'&&s.exchange){
  const ex=s.exchange;
  if(ex.used)return `<div class="service" id="exchange-panel"><h2>伙伴交换机</h2><p id="exchange-result">本局已经使用：${esc(unitLabel(s.units[ex.sent!],ex.sent!))}安全返回基地。</p></div>`;
  const cands=s.queue.filter(id=>id!==s.leader&&s.units[id].hp>0);
  const held=(s.tms??[]).map((t,i)=>({t,i})).filter(x=>x.t.fate==='held');
  return `<div class="service" id="exchange-panel"><h2>伙伴交换机</h2>
  <p>送回基地：</p>${cands.length?cands.map(id=>button('ex-target-'+id,esc(unitLabel(s.units[id],id)),!ready,exTarget===id?'class="selected"':'')).join(''):'<p class="muted">无</p>'}
  <p>随行招式机（最多${ECON.exchangeCargo}份）：</p>${held.length?held.map(x=>button('ex-cargo-'+x.i,esc(tmLine(x.t).split('：')[0]),!ready,exCargo.includes(x.i)?'class="selected"':'')).join(''):'<p class="muted">无</p>'}
  ${button('ex-confirm','确认送回',!ready||!exTarget,'data-confirm="true" class="primary"')}</div>`;
 }
 return '';
}
function bindService(s:World){
 for(const item of ['berry','tonic','tm',...SHOP_EXTRA] as ShopItem[]){bind('buy-'+item,()=>void buyItem(item));bind('shop-pick-'+item,()=>{shopSelected=item;render();});}
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
 // The picker shows a starter from the start, so that starter is the selection and the confirm button is live.
 if(ng.step===1&&!ng.main)ng.main=STARTER_IDS[0];
 if(ng.step===2&&!ng.deputy)ng.deputy=STARTER_IDS.find(id=>id!==ng.main)??null;
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
 clear();notice='';vaultState.move=null;detailsId=null;pinnedId=null;hoverId=null;attrib=new Map();freshSeq=Infinity;exportedOriginal=false;screen='play';render();
}
/** The whole run's record, kept by the interface (the engine keeps only the last 80 entries). Rows are built from the engine's structured entries (`World.entries`) when they arrive, so they stay readable after a floor change. No log text is read or parsed here. */
type LogRow={n:number;text:string;damage?:{target:string;amount:number}};
const RUN_LOG_LIMIT=2000;
let runLogId="",runLogRows:LogRow[]=[],runLogLast=0;
function trackRunLog(s:World):void{
 if(s.runId!==runLogId||(s.logSeq??0)<runLogLast){runLogId=s.runId;runLogRows=[];runLogLast=0;}
 for(const e of s.entries??[]){
  if(e.n<=runLogLast||!logEntryShown(s,e))continue;
  runLogRows.push({n:e.n,text:logEntryText(e),...(e.damage?{damage:{target:e.damage.target,amount:e.damage.amount}}:{})});
 }
 runLogLast=s.logSeq??runLogLast;
 if(runLogRows.length>RUN_LOG_LIMIT)runLogRows.splice(0,runLogRows.length-RUN_LOG_LIMIT);
}
function visibleLogEntries(s:World):LogRow[]{trackRunLog(s);return runLogRows;}
function visibleLog(s:World):string[]{return visibleLogEntries(s).map(r=>r.text);}
/** Full log window (L): every kept entry of this run, newest last, opened scrolled to the bottom. The engine keeps at most 80 raw entries (note() in engine.ts). */
const logDialog=document.createElement('dialog');logDialog.id='log-dialog';logDialog.setAttribute('aria-labelledby','log-title');
logDialog.innerHTML='<div class="log-head"><h2 id="log-title">本局记录</h2><button type="button" id="log-close" aria-label="关闭记录（Esc）">×</button></div><ol id="log-list"></ol>';document.body.append(logDialog);
logDialog.addEventListener('cancel',e=>{e.preventDefault();closeLog();});
logDialog.querySelector('#log-close')!.addEventListener('click',()=>closeLog());
/** Camp: the same replace-a-move window as the in-run one, for a machine used on a member that already carries four moves. Resolves null when cancelled. */
function askLearnCarry(inst:{id:string;species:string;carry:string[];learned:{move:string;pp:number}[]},move:string):Promise<{replace:string|null}|null>{
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.id='learn-carry-dialog';dialog.className='paper-window c195 c195-learn';dialog.setAttribute('aria-labelledby','learn-carry-heading');
  let chosen:string|null=null;const finish=(v:{replace:string|null}|null)=>{dialog.close();dialog.remove();resolve(v);};
  const ppOf=(m:string)=>inst.learned.find(l=>l.move===m)?.pp??0,side='friend' as const,name=speciesZh(inst.species);
  const draw=()=>{dialog.innerHTML=`<h2 class="paper-plaque">带哪些招式</h2><header class="c195-head"><div><div class="c195-learner-types">${SPECIES[inst.species]?typeChips(SPECIES[inst.species].types??[]):''}</div><h3 id="learn-carry-heading" class="c195-title">${esc(name)}学会了${esc(moveZh(move))}，但已经带了 4 个招式</h3></div></header>
   <div class="c195-learn-grid"><div class="c195-col"><h4>新招式</h4>${moveCard(move,ppOf(move)||learnableMoveMaxPp(inst.species,move),learnableMoveMaxPp(inst.species,move),side,{tag:'新'})}</div><div class="c195-col"><h4>现在携带的招式</h4><div class="c195-old">${inst.carry.map((m,n)=>moveCard(m,ppOf(m),ppOf(m),side,{key:n+1,selected:m===chosen,button:{id:'carry-replace-'+m,disabled:false}})).join('')}</div></div></div>
   <footer class="c195-foot"><button type="button" id="carry-confirm" class="paper-button is-primary"${chosen?'':' disabled'}>${chosen?`让${esc(moveZh(chosen))}让位，带上${esc(moveZh(move))}`:'让位并带上'}</button><button type="button" id="carry-only-learn" class="paper-button">只学不带</button><button type="button" id="carry-cancel" class="paper-button">取消</button></footer>`;
   for(const m of inst.carry)(dialog.querySelector('#carry-replace-'+CSS.escape(m)) as HTMLElement).onclick=()=>{chosen=m;draw();(dialog.querySelector('#carry-confirm') as HTMLElement).focus();};
   (dialog.querySelector('#carry-confirm') as HTMLElement).onclick=()=>{if(chosen)finish({replace:chosen});};
   (dialog.querySelector('#carry-only-learn') as HTMLElement).onclick=()=>finish({replace:null});
   (dialog.querySelector('#carry-cancel') as HTMLElement).onclick=()=>finish(null);};
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
  dialog.addEventListener('keydown',e=>{const n=Number(e.key);if(n>=1&&n<=inst.carry.length){e.preventDefault();chosen=inst.carry[n-1];draw();(dialog.querySelector('#carry-confirm') as HTMLElement).focus();}});
  draw();document.body.append(dialog);dialog.showModal();(dialog.querySelector('.c195-old .c195-move') as HTMLElement|null)?.focus();
 });
}
const learnableMoveMaxPp=(species:string,move:string):number=>learnableMove(species,move)?.pp??0;
/** Give up the run (settings and the "…" menu): a confirmation first, naming what is lost; the engine then settles it exactly like a wipe. */
const abandonDialog=document.createElement('dialog');abandonDialog.id='abandon-dialog';abandonDialog.className='paper-window c195';abandonDialog.setAttribute('aria-labelledby','abandon-heading');document.body.append(abandonDialog);
abandonDialog.addEventListener('cancel',e=>{e.preventDefault();abandonDialog.close();syncSleepAdvance();});
function runCanBeAbandoned():boolean{const s=live();return screen==='play'&&!store.atBase&&!!s&&!!s.prog&&s.phase!=='ended'&&s.pendingEnd!=='won'&&!(s.dungeon?.roguelike&&bossDefeated(s));}
function openAbandon(){
 const s=live();if(!runCanBeAbandoned()||!s||anim.active||store.status!=='ready')return;
 if(settings.open)settings.close();cancelMoveInput();cancelSleepAdvance();
 const level=Math.max(1,Math.min(3,s.dungeon?.level??1));
 abandonDialog.innerHTML=`<h2 class="paper-plaque">放弃探险</h2><h3 id="abandon-heading" class="c195-title">要放弃这一局探险吗？</h3><ul class="c195-consequences"><li>这一局<strong>立刻结束</strong>，按“全队倒下”结算，不能继续。</li><li>本局取得的<strong>招式机全部丢失</strong>，没有带出的物品和钱袋也作废。</li><li>参加这局的伙伴都会回到营地，不会走失。</li><li>探险队经验照样结算：按到达的<strong>第 ${level} 层</strong>发放，没有击败首领的奖励。</li></ul><footer class="c195-foot"><button type="button" id="abandon-cancel" class="paper-button is-primary">继续探险</button><button type="button" id="abandon-confirm" class="paper-button">确认放弃</button></footer>`;
 (abandonDialog.querySelector('#abandon-cancel') as HTMLElement).onclick=()=>{abandonDialog.close();syncSleepAdvance();};
 (abandonDialog.querySelector('#abandon-confirm') as HTMLElement).onclick=()=>{abandonDialog.close();clear();notice='';void send({type:'abandon'});};
 abandonDialog.showModal();(abandonDialog.querySelector('#abandon-cancel') as HTMLElement).focus();
}
function openLog(){
 const s=live();if(!s||screen!=='play'||store.atBase||logDialog.open||(settings.open||wikiOpen()))return;
 hold?.end();   // the pause is over once the record is open: the next click is the window's, not a skip
 cancelMoveInput();cancelSleepAdvance();
 const rows=visibleLogEntries(s).map(r=>`<li>${esc(r.text)}</li>`);
 $('log-list').innerHTML=rows.join('')||'<li class="muted">还没有记录。</li>';
 logDialog.showModal();const list=$('log-list');list.scrollTop=list.scrollHeight;
}
function closeLog(){if(logDialog.open)logDialog.close();syncSleepAdvance();}
function renderExtras(){
 const s=live();
 const toTitle=document.getElementById('to-title');if(toTitle)toTitle.hidden=screen!=='play';
 // recent events: always visible, newest last; hits name the inferred attacker
 const box=$('recent-events');
 if(!s)box.innerHTML='';
 else{
  const rows=visibleLogEntries(logHeld??s).slice(-60).map(({n,text,damage})=>{
   let extra='';
   if(damage&&n>freshSeq){const a=attrib.get(`${damage.target}|${damage.amount}`);
    // The "inferred" note is a developer diagnostic; the player sees only the name.
    if(a){const u=s.units[a];extra=u&&u.pos&&s.seen.includes(key(u.pos))?` ← ${unitLabel(u,a)}${dev?'（推断）':''}`:' ← 视野外的敌人';}}
   return `<li>${esc(text)}${esc(extra)}</li>`;});
  const stick=box.scrollTop+box.clientHeight>=box.scrollHeight-4;
  box.innerHTML=`<ol id="recent-list">${rows.join('')||'<li class="muted">还没有事件。</li>'}</ol>`;
  if(stick||!box.dataset.touched)box.scrollTop=box.scrollHeight;
 }
  updateInspect();
 $('guide').innerHTML='';
}
/** The enemy under a board cell, only when its cell is revealed. */
/** Names of map objects (drops, props, services), shown only while the pointer is over a revealed one. */
const mapHint=document.createElement('div');mapHint.id='map-hint';mapHint.hidden=true;document.body.append(mapHint);
function mapObjectName(s:World,p:Pos):string|null{
 if(!s.seen.includes(key(p)))return null;
 const room=(s.adventureRooms??[]).find(r=>same(r.interaction,p));
 if(room)return room.type==='item'&&room.item&&room.state!=='done'?`${adventureRoomTypeZh('item')}房：${ITEM_NAMES[room.item]}`:`${adventureRoomTypeZh(room.type)}房 · ${adventureRoomStateZh(room.type,room.state)}`;
 const point=s.points.find(q=>same(q.pos,p));return point?POINT_VISUALS[point.kind].name:null;
}
function showMapHint(s:World,cell:Pos,e:MouseEvent|undefined){
 const name=enemyAt(cell)?null:mapObjectName(s,cell);
 if(!name||!e||typeof e.clientX!=='number'){mapHint.hidden=true;return;}
 mapHint.textContent=name;mapHint.style.left=Math.min(innerWidth-160,e.clientX+14)+'px';mapHint.style.top=Math.max(8,e.clientY-30)+'px';mapHint.hidden=false;
}
function enemyAt(p:Pos):string|null{const s=live();if(!s)return null;return s.enemies.find(id=>{const u=s.units[id];return u.hp>0&&same(u.pos,p)&&s.seen.includes(key(p));})??null;}
/** A hit or heal lands in the middle of an animation: only the HP numbers and bars change (party cards, the bottom bar, the enemy card), not a whole redraw, so the animation keeps its frame budget. */
/** The damage trail runs only while animations play: off, skipped (Shift) or reduced motion leave the bar without it. */
const hpAnimated=():boolean=>animationEnabled()&&!anim.shift&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function patchHpDisplays():void{
 const s=live();if(!s)return;
 for(const id of s.queue){
  const u=s.units[id],card=document.getElementById('unit-card-'+id);if(!u||!card)continue;
  const text=card.querySelector('.hud-party-hp');if(text)text.textContent=u.hp+'/'+u.maxHp;
  const track=card.querySelector<HTMLElement>('.hud-hp-track');if(track)applyHpBar(track,u.hp,u.maxHp,hpAnimated());
 }
 const leader=s.units[s.leader];
 if(leader){
  const value=document.querySelector('#hud-bottom .hud-current-hp-value');if(value)value.textContent='HP '+leader.hp+'/'+leader.maxHp;
  const big=document.querySelector<HTMLElement>('#hud-bottom .hud-hp-track-large');if(big)applyHpBar(big,leader.hp,leader.maxHp,hpAnimated());
 }
 if(inspectShown())updateInspect();
}
function updateInspect(){
 const box=$('inspect');const s=live();
 if(!s){box.innerHTML='';return;}
 const pick=hoverId??pinnedId,info=pick?enemyInfo(s,pick):null;
 if(info)box.innerHTML=`<div class="inspect-card" id="enemy-info"><button type="button" class="inspect-close" id="inspect-close" aria-label="关闭信息卡（Esc）">×</button><strong>${esc(info.name)}</strong>${info.types?`<span>${esc(info.types)}属性</span>`:''}<p>${info.level===null?'等级未知':`Lv${info.level}`} · 生命 ${info.hp}/${info.maxHp}</p><p>作战方针：${esc(info.tactic)}</p><p class="enemy-status" id="enemy-status">状态：${info.statuses.length?esc(info.statuses.join('、')):'无'}</p><ul class="enemy-move-list">${info.moveRows.map(move=>`<li><details><summary><span>${esc(move.name)}</span> <span>${esc(move.type)}</span> <span>PP ${move.pp}/${move.maxPp}</span></summary><p>${esc(move.detail)}</p></details></li>`).join('')||'<li>无招式</li>'}</ul>${info.note?`<p class="muted">${esc(info.note)}</p>`:''}</div>`;
 else box.innerHTML='';
 bind('inspect-close',closeInspect);placeInspectBelowParty();
 refreshDamagePreviews(s);
}
/** The info card can be closed with its × button or Esc; closing also forgets the hovered enemy until the pointer enters one again. */
function inspectShown():boolean{const s=live();const pick=hoverId??pinnedId;return !!s&&!!pick&&!!enemyInfo(s,pick);}
function closeInspect(){pinnedId=null;hoverId=null;updateInspect();}
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
 private graphics!:Phaser.GameObjects.Graphics;private pointGraphics!:Phaser.GameObjects.Graphics;private overlay!:Phaser.GameObjects.Graphics;private labels:Phaser.GameObjects.Text[]=[];private tiles:Phaser.GameObjects.Image[]=[];private sprites=new Map<string,Phaser.GameObjects.Sprite>();private views=new Map<string,UnitView>();private temp=new Set<Phaser.GameObjects.GameObject>();private skipNow:(()=>void)|null=null;private lastGeometry:ReturnType<BoardScene['geometry']>|null=null;private shown:{before:World;after:World;revealed:boolean}|null=null;private minimapSig='';
 constructor(){super('board');}
 preload(){preloadArt(this);}
 private dtefLayer!:DtefTerrainLayer;private painterLayer!:PainterTerrainLayer;private darkness!:DungeonDarkness;private lightWorld:World|null=null;
 update(time:number){this.dtefLayer?.update(time);this.followSprites();this.floatZs(time);this.darkness?.update(time,this.partyLights());this.syncMinimap();}
 /** The world as the board draws it right now, for the small map. While a round plays, the engine state is already the end of the round, so units stand where their sprites are and what is known switches from the old state to the new one at the moment the board reveals the new terrain. Outside an animation this is the state itself. */
 minimapWorld(s:World):World{
  const sh=this.shown,g=this.lastGeometry;if(!sh||!g||!anim.active)return s;
  return playbackMinimapWorld(sh.before,sh.after,sh.revealed,id=>boardCell(this.views.get(id),this.placeholders.includes(id),g));
 }
 /** Keeps the small map in step with the board while a round plays (the interface itself is drawn only when something is clicked or the round ends). */
 private syncMinimap(){
  if(!anim.active||!this.shown)return;   // never read store.state here: it clones the whole world
  const w=this.minimapWorld(this.shown.after),sig=(this.shown.revealed?'1':'0')+Object.values(w.units).map(u=>u.pos?u.pos.x+','+u.pos.y:'x').join('|');
  if(sig===this.minimapSig)return;this.minimapSig=sig;
  const host=document.getElementById('hud-map');if(host)updateMinimap(host,w);
 }
 private followSprites(){
  for(const view of this.views.values()){const hp=view.labels[0];if(hp){placeHp(view.sprite,hp.t,this.lastGeometry?.cell??48,view.gfx.y);hp.dx=hp.t.x-view.gfx.x;hp.dy=hp.t.y-view.gfx.y;}}
  if(this.lastGeometry?.dungeon&&this.lightWorld){const sprite=this.views.get(this.lightWorld.leader)?.sprite;if(sprite)this.cameras.main.setRoundPixels(true).setScroll(Math.round(sprite.x-this.scale.width/2),Math.round(sprite.y-this.scale.height/2));}
 }
 /** Sleep marks: floating pixel "Z"s ride above a sleeping unit's head; positions are recomputed every frame from the sprite, so no tween objects can outlive a repaint. */
 private zPlace(view:UnitView,i:number,phase:number){const sp=view.sprite,cell=this.lastGeometry?.cell??48,z=view.zs![i],head=sp.y-sp.originY*sp.displayHeight+sp.displayHeight*.32;
  if(!view.zMoving){z.setPosition(Math.round(sp.x+cell*.16),Math.round(head)).setAlpha(1);return;}
  z.setPosition(Math.round(sp.x+cell*(.05+.1*phase)+Math.sin((phase+i)*5)*cell*.04),Math.round(head-phase*cell*.5)).setAlpha(Math.min(1,phase*5)*(1-phase)).setScale(.7+.5*phase);}
 private floatZs(time:number){for(const view of this.views.values()){if(!view.zs||!view.zMoving)continue;view.zs.forEach((_,i)=>this.zPlace(view,i,((time/2400)+i/3)%1));}}
 private partyLights(){
  const s=this.lightWorld,g=this.lastGeometry;if(!s||!g)return [];
  return s.queue.flatMap(id=>{const u=s.units[id],v=this.views.get(id);return u?.hp>0&&u.pos&&v?.sprite.visible?[{x:(v.sprite.x-g.ox)/g.cell+g.minX-.5,y:(v.sprite.y-g.oy)/g.cell+g.minY-.5,primary:id===s.leader}]:[];});
 }
 /** Sprites load on demand: what this world shows now first (units are drawn only once their sheets are ready, so none flashes blank), then the next floor's planned enemies while the player is busy elsewhere. */
 private prefetched='';
 /** The next floor's species arrive one at a time while the player is idle (decoding a sheet costs a few milliseconds, which must never land in the middle of a walk or an animation). */
 private drip:string[]=[];private dripTimer:ReturnType<typeof setTimeout>|null=null;
 private dripNext(){
  if(this.dripTimer!==null||!this.drip.length)return;
  this.dripTimer=setTimeout(()=>{this.dripTimer=null;if(!this.graphics?.scene)return;
   if(anim.active||heldDirections.size||moveInFlight||walkActive()){this.dripNext();return;}
   const d=this.drip.shift()!;void ensureCharacters(this,[d]).then(()=>this.dripNext());},900);
 }
 /** Sheets still missing: the picture is drawn at once without those units (a gap of a moment), one repaint follows when they are in, and a unit still without its sheet after 1.2 s is drawn as a shadow and a dot. A slow load is retried every 3 s. */
 /** The world of the last explicit `trial.repaint` (browser checks); any ordinary paint drops it. */
 private pinned:World|null=null;
 private waitingSince=0;private everShown=false;private repaintScheduled=false;private placeholders:string[]=[];private placeholderTimer:ReturnType<typeof setTimeout>|null=null;
 private fetchSprites(s:World|null,force=false):void{
  if(!s)return;
  const next=nextFloorDex(s),mark=s.runId+'|'+(s.dungeon?.level??0);
  if(next.length&&this.prefetched!==mark){this.prefetched=mark;for(const d of next)if(!characterReady(d)&&!this.drip.includes(d))this.drip.push(d);this.dripNext();}
  const missing=worldDex(s).filter(d=>!characterReady(d));
  const canvas=this.game.canvas;
  if(!missing.length){this.waitingSince=0;this.everShown=true;canvas.style.opacity='';return;}
  if(!this.waitingSince)this.waitingSince=performance.now();
  canvas.style.opacity=this.everShown||performance.now()-this.waitingSince>1200?'':'0';   // only the very first picture of the session waits invisibly, and for 1.2 s at most (the camera has no leader to follow yet); later floors just show a short gap
  const again=(ms:number)=>{if(this.placeholderTimer!==null)clearTimeout(this.placeholderTimer);this.placeholderTimer=setTimeout(()=>{this.placeholderTimer=null;if(this.graphics?.scene)this.paint(this.pinned??live()??s,force);},ms);};   // a world given to `trial.repaint` (pinned) keeps being drawn by this late repaint until the next ordinary paint; the real game never pins, so there it draws the current world
  again(1300);
  void ensureCharacters(this,missing).then(()=>{   // many repaints may queue on the same load chain: they are merged into one catch-up repaint
   if(this.repaintScheduled)return;this.repaintScheduled=true;
   queueMicrotask(()=>{this.repaintScheduled=false;if(!this.graphics?.scene)return;this.paint(force?s:live()??s,force);if(worldDex(live()??s).some(d=>!characterReady(d)))again(3000);});
  });   // an explicit repaint of a given world (force) draws that world; an ordinary one draws whatever is current
 }
 /** Standing on the stairs down (the question is on screen): the next floor's species are fetched now, all at once, instead of one by one. */
 flushPrefetch(s:World){const need=nextFloorDex(s).filter(d=>!characterReady(d));if(need.length){this.drip=[];void ensureCharacters(this,need);}}
 private showDarkness(s:World,durationMs=0){
  if(!s.dungeon||!this.lastGeometry)return;const g=this.lastGeometry,theme=themeOfLevel(s.dungeon.boss,s.dungeon.level),map=prepareTerrainMap({width:s.dungeon.width,height:s.dungeon.height,floor:s.floor,liquid:s.liquid,seen:terrainKnown(s).seen,seenWalls:terrainKnown(s).seenWalls,onlyRevealed:true});
  const wallColor=terrainSource()==='dtef'?this.dtefLayer.wallColor():this.painterLayer.wallColor();const staticLights=s.points.filter(p=>(p.kind==='down'||p.kind==='up')&&s.seen.includes(key(p.pos))).map(p=>({...p.pos,inner:.3,outer:1.25,strength:.45}));
  if(theme==='ash')for(const cell of s.liquid??[]){const pos=typeof cell==='string'?{x:Number(cell.split(',')[0]),y:Number(cell.split(',')[1])}:cell;if(map.known.has(key(pos)))staticLights.push({...pos,inner:.4,outer:1.7,strength:.55});}
  this.darkness.show([s.runId,s.dungeon.level,theme,map.width,map.height].join(':'),theme,g.cell,{width:map.width,height:map.height,known:map.known,litRooms:litRoomsOf(s),lights:this.partyLights(),seed:s.dungeon.seed,wallColor,staticLights},durationMs>0);
  this.cameras.main.setBackgroundColor(darknessBackground(theme,wallColor));
 }
 create(){this.darkness=new DungeonDarkness(this,Phaser.Textures.FilterMode.LINEAR);this.dtefLayer=new DtefTerrainLayer(this);this.painterLayer=new PainterTerrainLayer(this);this.events.once('shutdown',()=>{this.darkness.clear();this.dtefLayer.clear();this.painterLayer.clear();});this.graphics=this.add.graphics().setDepth(0);this.pointGraphics=this.add.graphics().setDepth(2);this.overlay=this.add.graphics().setDepth(5);this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{const s=live();if(!s)return;const g=this.geometry(s);
  // worldX/worldY already include the camera scroll, so clicks stay correct while the camera follows the leader.
  const x=Math.floor((pointer.worldX-g.ox)/g.cell)+g.minX;const y=Math.floor((pointer.worldY-g.oy)/g.cell)+g.minY;pinnedId=enemyAt({x,y});updateInspect();clickCell({x,y});});
  this.input.on('pointermove',(pointer:Phaser.Input.Pointer)=>{const s=live();if(!s)return;const g=this.geometry(s);const cell={x:Math.floor((pointer.worldX-g.ox)/g.cell)+g.minX,y:Math.floor((pointer.worldY-g.oy)/g.cell)+g.minY};const id=enemyAt(cell);if(id!==hoverId){hoverId=id;updateInspect();}showMapHint(s,cell,pointer.event as MouseEvent);});scene=this;this.scale.on('resize',()=>{if(!anim.active)this.paint(live());});this.paint(live());}
 /** A 64 px room prop standing on the bottom edge of its cell, a little taller than the cell, under the units (depth 2). Finished or emptied props are greyed and dimmed. */
 private prop(key:string,c:{x:number;y:number},cell:number,alpha:number,spent:boolean){
  const im=this.add.image(c.x,c.y+cell/2,key).setOrigin(.5,1).setScale(cell*1.1/64).setAlpha(alpha).setDepth(2);if(spent)im.setTint(0x888888);this.tiles.push(im);
 }
 private showTerrain(s:World,g:ReturnType<BoardScene['geometry']>){
  if(!s.dungeon)return;const theme=themeOfLevel(s.dungeon.boss,s.dungeon.level),scale=g.cell/TILE,dungeonMap=prepareTerrainMap({width:s.dungeon.width,height:s.dungeon.height,floor:s.floor,liquid:s.liquid,seen:s.dungeon.roguelike?terrainKnown(s).seen:[],seenWalls:s.dungeon.roguelike?terrainKnown(s).seenWalls:[],onlyRevealed:true}),center=(p:Pos)=>({x:g.ox+(p.x-g.minX+.5)*g.cell,y:g.oy+(p.y-g.minY+.5)*g.cell});
    const dtef=terrainSource()==='dtef',seed=s.dungeon!.seed,level=s.dungeon!.level,map=dungeonMap!,floorKey=[s.runId,level,theme,seed,dtef?'dtef':'painter'].join(':');
  if(dtef){this.painterLayer.clear();this.dtefLayer.show(floorKey,{map,theme,seed,level,scale,frozen:!!(window as unknown as {__trialNoAnim?:boolean}).__trialNoAnim,center});}
  else{this.dtefLayer.clear();createTerrainArt(this,theme);const excluded=[...s.points.map(p=>p.pos),...(s.adventureRooms??[]).map(r=>r.interaction),...(s.rooms??[]).flatMap((r,i)=>i===s.bossRoom?Array.from({length:r.h},(_,dy)=>Array.from({length:r.w},(_,dx)=>({x:r.x+dx,y:r.y+dy}))).flat():[])];if(s.arrival)excluded.push(s.arrival);this.painterLayer.show(floorKey,{map,theme,seed,level,scale,excluded,center});}

 }
 geometry(s:World){if(s.dungeon){const d=s.dungeon,cell=dungeonCellSize(this.scale.height);return {minX:0,minY:0,cell,ox:0,oy:0,dungeon:true,w:d.width*cell,h:d.height*cell};}
  const minX=Math.min(...s.floor.map(p=>p.x)),maxX=Math.max(...s.floor.map(p=>p.x)),minY=Math.min(...s.floor.map(p=>p.y)),maxY=Math.max(...s.floor.map(p=>p.y));const cell=Math.min(66,(this.scale.width-80)/(maxX-minX+1),(this.scale.height-80)/(maxY-minY+1));return {minX,minY,cell,ox:(this.scale.width-(maxX-minX+1)*cell)/2,oy:(this.scale.height-(maxY-minY+1)*cell)/2,dungeon:false,w:this.scale.width,h:this.scale.height};}
 /** Browser checks only: stops every unit's idle animation on its first frame, so two screenshots of the same picture are identical (call after each repaint). */
 freezeSprites(){this.views.forEach(v=>{const a=v.sprite.anims;if(a.currentAnim)a.pause(a.currentAnim.frames[0]);});}
 pinPaint(w:World|null){this.pinned=w;this.paint(w,true);}
 paint(s:World|null,force=false){if(!this.graphics||(anim.active&&!force))return;if(!force)this.pinned=null;this.fetchSprites(s,force);this.views.forEach(v=>{v.gfx.destroy();v.labels.forEach(l=>l.t.destroy());v.zs?.forEach(z=>z.destroy());});this.views.clear();this.graphics.clear();this.pointGraphics.clear();this.overlay.clear();this.placeholders=[];this.labels.forEach(t=>t.destroy());this.labels=[];this.tiles.forEach(t=>t.destroy());this.tiles=[];this.lightWorld=s;const text=(x:number,y:number,t:string,color='#d9e6e0',size=16):Phaser.GameObjects.Text=>{const label=this.add.text(x,y,t,{fontFamily:'sans-serif',fontSize:size,color,stroke:'#0b1312',strokeThickness:3}).setOrigin(.5).setDepth(6);this.labels.push(label);return label;};
 this.graphics.fillStyle(BOARD_BACKGROUND);this.graphics.fillRect(0,0,this.scale.width,this.scale.height);if(!s){this.darkness.clear();this.dtefLayer.clear();this.painterLayer.clear();this.cameras.main.setBackgroundColor(BOARD_BACKGROUND).setScroll(0,0);this.sprites.forEach(sp=>sp.setVisible(false));return;}
 const g=this.geometry(s);const fog=g.dungeon;const nowVisible=s.dungeon?playerVisibleCells(s):null;if(!fog)this.darkness.clear();if(fog){this.graphics.fillStyle(BOARD_BACKGROUND);this.graphics.fillRect(0,0,g.w,g.h);}const center=(p:Pos)=>({x:g.ox+(p.x-g.minX+.5)*g.cell,y:g.oy+(p.y-g.minY+.5)*g.cell});const scale=g.cell/TILE;
 const img=(key:string,c:{x:number;y:number},alpha:number,depth:number,size=1)=>this.tiles.push(this.add.image(c.x,c.y,key).setScale(scale*size).setAlpha(alpha).setDepth(depth));
 // 7.3 floor themes: boss-marked runs use the theme tiles of the floor (moss: the original stone). A missing texture falls back to the stone tile with a theme tint.
 const theme=themeOfLevel(s.dungeon?.boss,s.dungeon?.level??1),themeCfg=THEME_FLOORS.find(t=>t.theme===theme)!;
 this.cameras.main.setBackgroundColor(fog?darknessBackground(theme):BOARD_BACKGROUND);
 const tileImg=(kind:'floor'|'wall',name:string,c:{x:number;y:number},alpha:number)=>{const have=this.textures.exists(name);const im=this.add.image(c.x,c.y,have?name:kind).setScale(scale).setAlpha(alpha).setDepth(1);if(!have&&theme!=='moss')im.setTint(theme==='wet'?0x6aa8d8:0xa08c80);this.tiles.push(im);};
 const floorName=theme==='moss'?'floor':themeCfg.floorTile,wallName=theme==='moss'?'wall':themeCfg.wallTile,roomMarkers=adventureRoomMarkers(s);
 const arena=s.bossRoom!==undefined?s.rooms?.[s.bossRoom]??null:null;
 const inArena=(p:Pos)=>!!arena&&p.x>=arena.x&&p.x<arena.x+arena.w&&p.y>=arena.y&&p.y<arena.y+arena.h;
 const terrain=!!s.dungeon?.roguelike;
 const dungeonMap=s.dungeon?prepareTerrainMap({width:s.dungeon.width,height:s.dungeon.height,floor:s.floor,liquid:s.liquid,seen:terrainKnown(s).seen,seenWalls:terrainKnown(s).seenWalls,onlyRevealed:true}):null;
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
   const prop=visual.icon==='rest'?'room-rest':visual.icon==='shop'?'room-shop':null;
   if(prop)this.prop(prop,c,g.cell,point.used?.45:1,!!point.used);
   else if(visual.icon==='exchange'){
    pg.fillStyle(visual.color,alpha*.4);pg.fillCircle(c.x,c.y,g.cell*.28);pg.lineStyle(2,visual.color,alpha);pg.strokeCircle(c.x,c.y,g.cell*.28);
    text(c.x,c.y,'换','#edf7f4',Math.min(20,g.cell*.3)).setAlpha(alpha);
   }else if(visual.icon==='drop'){
    // A picked-up drop is gone. One that was seen but is out of sight right now is drawn dimmer, so it is not mistaken for a live item.
    if(!point.used)this.tiles.push(this.add.image(c.x,c.y,visual.texture!).setScale(g.cell*.62/32).setAlpha(!nowVisible||nowVisible.has(key(p))?1:.55).setDepth(2));
   }else{
    img(visual.icon,c,alpha,2,visual.icon==='exit'||visual.icon.startsWith('stairs')?1:.8);
    if(!visual.icon.startsWith('stairs'))text(c.x,c.y+g.cell*.38,visual.name,'#e4efb0',Math.max(10,Math.min(13,g.cell/6))).setAlpha(alpha).setWordWrapWidth(g.cell*1.6,true);
   }
  }
  if(showCoords)text(c.x-g.cell*.3,c.y+g.cell*.4,p.x+','+p.y,'#8fa89c',9);
 }
 for(const marker of roomMarkers){const c=center(marker.at),color=marker.dimmed?'#84918a':marker.state==='sealed'?'#ffb7a7':marker.roomType==='challenge'?'#f4d58d':marker.roomType==='commission'?'#a4d8e8':marker.roomType==='blessing'?'#d7b3ff':'#c4e89a';
  if(marker.kind==='interaction'){this.prop(marker.roomType==='challenge'?'room-challenge':marker.roomType==='commission'?'room-commission':marker.roomType==='blessing'?'room-blessing':'room-treasure',c,g.cell,marker.dimmed?.45:1,marker.dimmed);continue;}
  const label=text(c.x,c.y,marker.label,color,marker.kind==='door'?(marker.label==='封闭'?12:14):15);if(marker.dimmed)label.setAlpha(.45);
 }
 const shown=new Set<string>();const visible=(id:string)=>{const u=s.units[id];return u.pos&&u.hp>0&&s.seen.includes(key(u.pos))?u:null;};
 for(const id of [...s.enemies,...s.queue]){const u=visible(id);if(!u||!u.pos)continue;if(!characterDrawable(this,skinFor(id,u.side,u.species))){   // sheets not here yet: nothing for the first moments, then a shadow and a dot, so a unit that exists is never invisible
   const waited=this.waitingSince>0&&performance.now()-this.waitingSince>1200;
   if(waited||characterFailed(skinFor(id,u.side,u.species))){const pc=center(u.pos);this.placeholders.push(id);this.overlay.fillStyle(0x000000,.35);this.overlay.fillEllipse(pc.x,pc.y+g.cell*UNIT_GROUND_FRACTION,g.cell*.55,g.cell*.2);this.overlay.fillStyle(u.side==='enemy'?0xff7a6a:0x7fe0c0,1);this.overlay.fillCircle(pc.x,pc.y,g.cell*.13);this.overlay.lineStyle(2,0x0b1312);this.overlay.strokeCircle(pc.x,pc.y,g.cell*.13);}
   continue;}
  shown.add(id);const c=center(u.pos);
  // Shadow and leader ring live in a per-unit Graphics (local origin = cell centre, depth 3: above floor tiles and props, below sprites, highlights and labels) so animation can move them with the sprite.
  const ug=this.add.graphics().setDepth(3).setPosition(c.x,c.y);  // above floor tiles (1-2), below sprites (4)
 ug.fillStyle(0x000000,.35);ug.fillEllipse(0,g.cell*UNIT_GROUND_FRACTION,g.cell*.55,g.cell*.2);if(id===s.leader){ug.lineStyle(3,0xf3d997);ug.strokeEllipse(0,g.cell*UNIT_GROUND_FRACTION,g.cell*.86,g.cell*.34);}
  const direction=facingOf(u),row=facingRow(direction.x,direction.y),dex=skinFor(id,u.side,u.species),anim=animKey(dex,'Idle',row);
  let sp=this.sprites.get(id);if(!sp){sp=this.add.sprite(c.x,c.y,`${dex}-Idle`).setDepth(4);this.sprites.set(id,sp);}
  sp.clearTint();sp.setVisible(true).setAlpha(1).setPosition(c.x,c.y+g.cell*UNIT_GROUND_FRACTION).setScale(scale*(u.boss?1.5:1)).setOrigin(.5,groundOriginY(dex,'Idle'));sp.anims.timeScale=1;if(sp.anims.currentAnim?.key!==anim)sp.play(anim);
  // Sleeping units (born asleep, slp, nap; either side) hold one frame: the sheets have no Sleep action.
  const asleep=!!u.asleep||sleeping(u);if(asleep)sp.anims.pause(sp.anims.currentAnim?.frames[0]);else if(sp.anims.isPaused)sp.anims.resume();
  const ut=(dx:number,dy:number,t:string,color:string)=>({t:this.add.text(c.x+dx,c.y+dy,t,{fontFamily:'sans-serif',fontSize:Math.max(10,Math.round(g.cell*.12)),color,stroke:'#0b1312',strokeThickness:3}).setOrigin(.5).setDepth(6),dx,dy});
  // Only HP sits beside the model; species names remain in the HUD and information cards.
  const hp=ut(0,0,`${u.hp}`,hpTextColor(u.hp,u.maxHp));hp.t.setStyle({fontFamily:'Verdana, Arial, sans-serif',fontStyle:'bold',fontSize:Math.max(16,Math.round(g.cell*.22))});placeHp(sp,hp.t,g.cell,c.y);hp.dx=hp.t.x-c.x;hp.dy=hp.t.y-c.y;
  const view:UnitView={sprite:sp,gfx:ug,labels:[hp,...(u.boss?[ut(0,-g.cell*.78,'首领','#ffd37a')]:[])],dex,row};
  if(asleep){const moving=animationEnabled()&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;view.zMoving=moving;
   view.zs=Array.from({length:moving?3:1},()=>this.add.text(c.x,c.y,moving?'Z':'Zz',{fontFamily:'Verdana, Arial, sans-serif',fontStyle:'bold',fontSize:Math.max(14,Math.round(g.cell*.26)),color:'#cfe8ff',stroke:'#16304f',strokeThickness:3}).setOrigin(.5).setDepth(7));
   view.zs.forEach((_,i)=>this.zPlace(view,i,(i/3)%1));}
  this.views.set(id,view);}
 this.sprites.forEach((sp,id)=>{if(!shown.has(id))sp.setVisible(false);});this.lastGeometry=g;
 if(g.dungeon)this.followSprites();else this.cameras.main.setScroll(0,0);
 if(dungeonMap)this.showDarkness(s);
 if(walkMarker&&s.phase==='playing'){const c=center(walkMarker);this.overlay.lineStyle(2,0x9fe3ff);this.overlay.strokeCircle(c.x,c.y,g.cell*.34);this.overlay.lineStyle(1,0x9fe3ff,.55);this.overlay.strokeCircle(c.x,c.y,g.cell*.2);}
 if(selectedSkill&&s.phase==='playing'&&!draft?.swap){const editor=draft?.editor??s.leader;for(const target of skillTargets(s,editor,selectedSkill)){const u=s.units[target];if(!u?.pos||!s.seen.includes(key(u.pos)))continue;const c=center(u.pos);this.overlay.lineStyle(2,0xf1d88e);this.overlay.strokeCircle(c.x,c.y,g.cell*.46);}}
 }
 /** Paints the state before the round, then plays the inferred steps on top; resolves when finished, skipped or timed out. */
 animate(before:World,after:World,events:AnimEvent[]):Promise<void>{
  const p=plan(events);this.paint(before,true);const g=this.lastGeometry;
  if(!p||!g)return Promise.resolve();
  const shown={before,after,revealed:false};this.shown=shown;this.minimapSig='';
  const center=(q:Pos)=>({x:g.ox+(q.x-g.minX+.5)*g.cell,y:g.oy+(q.y-g.minY+.5)*g.cell});
  this.lightWorld=after;let revealed=false;const terrainAtStart=!events.some(e=>e.k==='move'||e.k==='swap'||e.k==='blowaway'),seenBefore=new Set(before.seen),seenAfter=new Set(after.seen),camera=this.cameras.main,cameraX=camera.x,cameraY=camera.y;
  const st:Stage={scene:this,views:this.views,onHp:(id,hp)=>{const hpLabel=this.views.get(id)?.labels[0]?.t;if(hpLabel){hpLabel.setText(String(hp));const max=after.units[id]?.maxHp??before.units[id]?.maxHp;if(max)hpLabel.setColor(hpTextColor(hp,max));}hpShown?.set(id,hp);hpShownVer++;patchHpDisplays();},center,cell:g.cell,scale:g.cell/TILE,temp:this.temp,f:p.scale,setHitFlash:(view,on)=>{if(on)view.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);else view.sprite.clearTint();},effectCells:caster=>{const seen=terrainAtStart||revealed?seenAfter:seenBefore,room=after.rooms?.find(r=>caster.x>=r.x&&caster.x<r.x+r.w&&caster.y>=r.y&&caster.y<r.y+r.h);return after.floor.filter(q=>seen.has(key(q))&&(room?q.x>=room.x&&q.x<room.x+room.w&&q.y>=room.y&&q.y<room.y+room.h:Math.max(Math.abs(q.x-caster.x),Math.abs(q.y-caster.y))<=2));},reduceMotion:!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,onMovementStart:duration=>{if(revealed)return;revealed=true;shown.revealed=true;this.showTerrain(after,g);this.showDarkness(after,duration);}};
  if(!events.some(e=>e.k==='move'||e.k==='swap'||e.k==='blowaway')){shown.revealed=true;this.showTerrain(after,g);this.showDarkness(after);}
  return new Promise<void>(resolve=>{
   let done=false;st.cancelled=()=>done;const finish=()=>{if(done)return;done=true;clearTimeout(timer);this.skipNow=null;this.shown=null;this.tweens.killAll();this.time.removeAllEvents();this.temp.forEach(o=>o.destroy());this.temp.clear();resetCombatShake(this);camera.setPosition(cameraX,cameraY);try{this.paint(store.state,true);}finally{resolve();}};
   const timer=setTimeout(finish,3000); // safety net, e.g. a hidden tab where Phaser's clock is paused
   this.skipNow=finish;
   void playEvents(st,events).then(finish,finish);
  });
 }
 exportTerrain(theme:TerrainThemeKey,layer:TerrainLayer|'floor'){exportTerrainArt(this,theme,layer);}
 skip(){this.skipNow?.();}
 /** Read-only view of what is drawn, for the browser checks: the tile textures in use, and the boss sprite's scale next to a normal unit's, with its labels. */
 darknessAlpha(x:number,y:number){return this.darkness.alphaAt(x,y);}
 debug(){const terrainImages=[...this.tiles,...this.dtefLayer.images,...this.painterLayer.images];const unit=(id:string)=>{const v=this.views.get(id);return v?{texture:v.sprite.texture.key,whiteFlash:v.sprite.tintMode===Phaser.TintModes.FILL&&v.sprite.tintTopLeft===0xffffff,scale:Number(v.sprite.scaleX.toFixed(3)),row:v.row,animation:v.sprite.anims.currentAnim?.key??null,originY:v.sprite.originY,frame:{x:v.sprite.frame.cutX,y:v.sprite.frame.cutY,w:v.sprite.frame.cutWidth,h:v.sprite.frame.cutHeight},ground:{centerY:v.gfx.y,y:v.gfx.y+(this.lastGeometry?.cell??0)*UNIT_GROUND_FRACTION,top:v.gfx.y+(this.lastGeometry?.cell??0)*(UNIT_GROUND_FRACTION-.1),bottom:v.gfx.y+(this.lastGeometry?.cell??0)*(UNIT_GROUND_FRACTION+.1)},x:v.sprite.x,y:v.sprite.y,labels:v.labels.map(l=>l.t.text),labelColors:v.labels.map(l=>l.t.style.color),sleepMarks:(v.zs??[]).map(z=>({text:z.text,x:z.x,y:z.y,alpha:z.alpha})),spritePaused:v.sprite.anims.isPaused,labelPositions:v.labels.map(l=>({text:l.t.text,x:l.t.x,y:l.t.y,width:l.t.width,height:l.t.height,originX:l.t.originX,originY:l.t.originY}))}:null;};const worldView=this.cameras.main.worldView;return {drops:this.tiles.filter(t=>t.texture.key.startsWith('item2-')).map(t=>({texture:t.texture.key,alpha:t.alpha})),placeholders:[...this.placeholders],floatTexts:[...this.temp].flatMap(o=>{const t=o as Phaser.GameObjects.Text;return t.type==='Text'?[{text:t.text,color:t.style.color,x:Math.round(t.x),y:Math.round(t.y)}]:[];}),combatEffects:[...this.temp].flatMap(object=>{const effect=object.getData?.('combatEffect');return effect?[effect]:[];}),temporaryObjects:this.temp.size,terrainCache:terrainSource()==='dtef'?this.dtefLayer.debug():this.painterLayer.debug(),darkness:this.darkness.debug(),tiles:[...new Set(terrainImages.map(t=>t.texture.key))].sort(),terrain:terrainImages.filter(t=>t.texture.key.startsWith('terrain-')).map(t=>({texture:t.texture.key,frame:t.frame.name,x:t.x,y:t.y,depth:t.depth})),decorations:terrainImages.filter(t=>t.texture.key.startsWith('deco-')).map(t=>({texture:t.texture.key,frame:t.frame.name,x:t.x,y:t.y,depth:t.depth})),geometry:this.lastGeometry,cameraView:{x:worldView.x,y:worldView.y,width:worldView.width,height:worldView.height},cameraPosition:{x:this.cameras.main.x,y:this.cameras.main.y},boss:unit('boss'),leader:unit(live()?.leader??''),units:Object.fromEntries([...this.views.keys()].map(id=>[id,unit(id)]))};}
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
/** The in-game wiki (D-20261109-03): opens from settings or H, in the camp and in the dungeon. Opening it pauses held input and the sleep auto-advance; closing resumes them. */
const wiki=createWiki({showRules:dev,onOpen:()=>{cancelMoveInput();cancelSleepAdvance();},onClose:()=>syncSleepAdvance()});
/** The big map (M, G13.1/G13.3): a centred window of the whole floor. Like the wiki it pauses held input and the sleep auto-advance and locks the board while open. */
const bigMap=(()=>{
 const dialog=document.createElement('dialog');dialog.id='map-dialog';dialog.className='paper-window map194';dialog.setAttribute('aria-labelledby','map-heading');
 dialog.innerHTML='<h2 id="map-heading" class="paper-plaque">地图</h2><button type="button" id="map-close" class="paper-close" aria-label="关闭地图">×</button><div class="hud-minimap-heading map-heading-line"></div><div class="map-body"></div>';
 document.body.append(dialog);
 const close=()=>{if(dialog.open)dialog.close();};
 dialog.querySelector('#map-close')!.addEventListener('click',close);
 dialog.addEventListener('close',()=>syncSleepAdvance());
 return {dialog,isOpen:()=>dialog.open,close,open(s:World){if(dialog.open)return;const m=bigMinimapMarkup(s);
  dialog.querySelector('.map-heading-line')!.innerHTML=m.heading;const body=dialog.querySelector<HTMLElement>('.map-body')!;body.innerHTML=m.svg;body.style.setProperty('--map-aspect',m.width+'/'+m.height);
  cancelMoveInput();cancelSleepAdvance();dialog.showModal();}};
})();
function wikiOpen(){return wiki.isOpen()||bigMap.isOpen();}   // either modal window locks the board
function openWiki(){if(!wiki.isOpen())wiki.open();}
bind('settings-wiki',()=>{if(transferBusy)return;settings.close();openWiki();});
let transferBusy=false;
let settingsTab:'display'|'keys'|'save'='display';
function setSettingsTab(tab:typeof settingsTab){settingsTab=tab;for(const name of ['display','keys','save']){$('settings-pane-'+name).hidden=name!==tab;$('settings-tab-'+name).setAttribute('aria-pressed',String(name===tab));}}
for(const name of ['display','keys','save'] as const)bind('settings-tab-'+name,()=>setSettingsTab(name));
function refreshTransfer(){
 const busy=transferBusy||store.status==='saving'||anim.active;
 ($('save-export') as HTMLButtonElement).disabled=busy||!['ready','blocked'].includes(store.status);
 ($('save-import') as HTMLButtonElement).disabled=busy||store.status==='failed';
 ($('settings-close') as HTMLButtonElement).disabled=transferBusy;
 ($('settings-wiki') as HTMLButtonElement).disabled=transferBusy;
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
 ($('settings-run') as HTMLElement).hidden=!runCanBeAbandoned();
 $('transfer-message').textContent=store.status==='blocked'?`${store.error}。请先导出原记录保留备份，再导入其他存档。`:store.status==='failed'?'当前改动尚未保存，请先重试保存。':'';
 refreshTransfer();setSettingsTab(store.status==='blocked'||store.status==='failed'?'save':settingsTab);settings.showModal();cancelSleepAdvance();
}
bind('open-settings',openSettings);
{const box=document.getElementById('recent-events')!;box.addEventListener('click',()=>openLog());box.addEventListener('wheel',()=>{box.dataset.touched='1';},{passive:true});box.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();openLog();}});box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('aria-label','最近事件；点击打开完整记录');}bind('log-open',openLog);bind('abandon-run',openAbandon);
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
  if(ok){clear();campPanel=null;departureOpen=false;campSelected=null;lastCampReport=null;inviteChoice=undefined;detailsId=null;pinnedId=null;hoverId=null;attrib.clear();freshSeq=Infinity;askOverwrite=false;exportedOriginal=false;ngError='';screen=dev?'play':'title';
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
 const s=live();if(!s||s.phase!=='playing'||sleeping(s.units[s.leader])||anim.active||bagOpen||(settings.open||wikiOpen())||screen!=='play'||store.status!=='ready'){cancelMoveInput();return;}
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
 const after=live();if(!after||after.runId!==run||after.dungeon?.level!==level||after.round===round||after.phase!=='playing'||store.status!=='ready'||bagOpen||(settings.open||wikiOpen())){cancelMoveInput();return;}
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
document.addEventListener('click',e=>{if(hold&&!(e.target as HTMLElement).closest('dialog')){e.stopPropagation();e.preventDefault();hold.end();return;}if((e.target as HTMLElement).closest('button,select'))cancelMoveInput();if(anim.active&&!(e.target as HTMLElement).closest('#anim-toggle, #anim-on, #anim-off, label:has(#anim-toggle), summary, #log-open, #recent-events, #log-dialog, #wiki-dialog, #map-dialog, #abandon-dialog, #learn-carry-dialog')){e.stopPropagation();e.preventDefault();}},true);
document.addEventListener('keydown',e=>{
 if(bigMap.isOpen()){if((e.key==='m'||e.key==='M')&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(!e.repeat)bigMap.close();}return;}   // Esc closes through the dialog's own cancel
 if(logDialog.open||abandonDialog.open||wikiOpen())return;
 if(hold&&e.key!=='F5'&&!((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='r')){e.preventDefault();e.stopPropagation();if(!e.repeat)hold.end();return;}
 if(logDialog.open||abandonDialog.open||wikiOpen())return;
 if((e.key==='m'||e.key==='M')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&screen==='play'&&!store.atBase&&!settings.open&&!(e.target as HTMLElement).matches('input,select,textarea')&&!document.querySelector('dialog[open]')){const ms=live();if(ms?.dungeon&&ms.phase==='playing'&&$('flow').hidden&&!bagOpen&&!choosingItem&&!draft&&!stairsPromptShown&&!confirmExit){e.preventDefault();if(!e.repeat)bigMap.open(ms);return;}}   // the big map, also while an animation plays
 if((e.key==='h'||e.key==='H')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&screen==='play'&&!settings.open&&!(e.target as HTMLElement).matches('input,select,textarea')&&!document.querySelector('dialog[open]')){e.preventDefault();if(!e.repeat)openWiki();return;}   // the wiki, also while an animation plays and in the camp
 if((settings.open||wikiOpen())||(document.getElementById('unit-details-dialog') as HTMLDialogElement|null)?.open||screen!=='play'||store.atBase)return;
 if((e.key==='l'||e.key==='L')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!(e.target as HTMLElement).matches('input,select,textarea')){e.preventDefault();if(!e.repeat)openLog();return;}   // also while an animation plays
 if(e.key==='Shift'){anim.shift=true;if(anim.active)scene?.skip();return;}
 if(e.repeat){e.preventDefault();return;}
 if(anim.active){const direction=e.key.length===1?e.key.toLowerCase():e.key;if(heldDirections.size&&['w','a','s','d','ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(direction)&&!(e.target as HTMLElement).matches('input,select,textarea'))heldDirections.add(direction);if(e.key!=='Tab'&&e.key!=='F5')e.preventDefault();return;}
 const target=e.target as HTMLElement;if(target.matches('input,select,textarea'))return;
 {const ls=live();if(ls?.phase==='learning'&&store.status==='ready'){const unit=ls.pendingLearnMoves?.[0]?ls.units[ls.pendingLearnMoves[0].actor]:undefined;
  if(unit&&['1','2','3','4'].includes(e.key)&&unit.learned[Number(e.key)-1]){e.preventDefault();learnChoice=unit.learned[Number(e.key)-1];render();return;}
  if(e.key==='Enter'&&learnChoice&&!target.matches('button:not([data-confirm])')){e.preventDefault();confirmLearn();return;}}}
 {const is=live();if(is?.phase==='invitation'&&store.status==='ready'&&is.queue.length>=3){
  const index=['1','2','3'].indexOf(e.key);if(index>=0&&is.queue[index]){e.preventDefault();inviteChoice=inviteChoice===is.queue[index]?undefined:is.queue[index];render();(document.getElementById('accept') as HTMLButtonElement|null)?.focus({preventScroll:true});return;}
  const accept=document.getElementById('accept') as HTMLButtonElement|null;
  if(e.key==='Enter'&&inviteChoice&&accept&&!accept.disabled&&!target.matches('button:not([data-confirm])')){e.preventDefault();accept.click();return;}}}
 if(e.key==='Enter'){if(target.matches('button')&&!target.hasAttribute('disabled')&&(target.hasAttribute('data-confirm')||target.closest('#flow,#hud-bag'))){e.preventDefault();target.click();}else e.preventDefault();return;}
 if(e.key==='Escape'){
  if(bagOpen){e.preventDefault();bagOpen=false;render();return;}
  if(choosingItem){e.preventDefault();choosingItem=null;render();return;}   // only the target state closes: a combination draft and a service panel stay as they are
  if(document.querySelector('#context-actions .service-close')){e.preventDefault();(document.querySelector('#context-actions .service-close') as HTMLElement).click();return;}
  if(inspectShown()){e.preventDefault();closeInspect();return;}
  if(live()?.phase==='learning'){e.preventDefault();void send({type:'learnMove',replace:null});return;}
  if(live()?.phase==='evolution'){e.preventDefault();void send({type:'evolve',species:null});return;}
  clear();actionsOpen=false;notice='';render();return;
 }
 const s=live();if(!s||s.phase!=='playing'||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;
 const k=e.key.toLowerCase();
 if(k==='l'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();openLog();return;}
 if(k==='b'){e.preventDefault();bagOpen=!bagOpen;choosingItem=null;cancelMoveInput();render();return;}
 if(bagOpen)return;
 if(e.key==='Tab'){e.preventDefault();const alive=s.queue.filter(id=>s.units[id].hp>0);void send({type:'switch',actor:alive[(alive.indexOf(s.leader)+1)%alive.length]});return;}
 if(sleeping(s.units[s.leader])&&e.key!=='.'){if(e.key!=='F5'&&!((e.ctrlKey||e.metaKey)&&k==='r'))e.preventDefault();return;}
 if(targetMode()&&['1','2','3','4'].includes(e.key)){e.preventDefault();const id=e.key==='4'?undefined:s.queue[Number(e.key)-1];if(id)useOn(id);return;}   // 4 has no card: it does not switch to a move behind the player's back
 if(['1','2','3','4'].includes(e.key)){e.preventDefault();const skill=s.units[draft?.editor??s.leader].learned[Number(e.key)-1];if(skill&&(s.units[draft?.editor??s.leader].pp[skill]??0)>0)chooseHudSkill(skill);return;}
 if(['5','6','7','8','9','0'].includes(e.key)){e.preventDefault();const item=quickItems[['5','6','7','8','9','0'].indexOf(e.key)];if(item)chooseHudItem(item);return;}
 const directionKey=e.key.length===1?k:e.key;
 if(['w','a','s','d','ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(directionKey)){
  e.preventDefault();if(choosingItem){choosingItem=null;render();}   // walking away leaves the target state
  const first=heldDirections.size===0;heldDirections.add(directionKey);
  // Only a fresh press collects a chord; held movement changes direction at the next step.
  if(moveCollecting)moveTap=null;
  if(first){moveCollecting=true;moveTimer=setTimeout(()=>void flushMoveInput(),40);}else if(!moveCollecting&&!moveInFlight)void flushMoveInput();return;
 }
 if(k==='f'){e.preventDefault();act({type:'basicForward'});return;}
 if(e.key==='.')act({type:'wait'});
 if(k==='k'){const skill=s.units[draft?.editor??s.leader].learned[0];if(skill)chooseHudSkill(skill);}
});
document.addEventListener('contextmenu',e=>{if(targetMode()){e.preventDefault();choosingItem=null;render();}});
window.addEventListener('blur',()=>{cancelMoveInput();anim.shift=false;selectedSkill=null;render();});
{const box=document.getElementById('anim-toggle') as HTMLInputElement;box.checked=animationEnabled();box.disabled=params.get('anim')!==null||!!(window as unknown as {__trialNoAnim?:boolean}).__trialNoAnim;
 box.addEventListener('change',()=>{try{window.localStorage.setItem(PREF_KEY,box.checked?'on':'off');}catch{/* preference is optional */}if(!box.checked)scene?.skip();refreshTransfer();});for(const [id,value] of [['anim-on',true],['anim-off',false]] as const)bind(id,()=>{if(!box.disabled){box.checked=value;box.dispatchEvent(new Event('change'));}});}
/* ---- Drag and drop (pointer events; mouse and touch). Clicking stays available for every action below. ---- */
function pinQuick(item:Item,slot:number){quickItems=quickItems.map((v,i)=>i===slot?item:v===item?null:v);bagSlot=slot;bagSelectedItem=item;render();}
const quickIndex=(el:HTMLElement)=>Number(el.dataset.bagSlot??el.dataset.hudQuick);
function dropMember(id:string,target:HTMLElement){
 const ctx=campDragCtx;if(!ctx)return;const p=ctx.p;let team=[...p.team];
 const keepLeader=(t:string[])=>({type:'team' as const,team:t,leader:t.includes(p.leader)?p.leader:t[0]});
 if(target.matches('#camp-party-roster,.camp194-roster-block')){if(team.includes(id)&&team.length>1)void ctx.edit(keepLeader(team.filter(t=>t!==id)));return;}
 const over=target.dataset.campMember;
 if(over&&over!==id){const at=team.indexOf(over);if(team.includes(id)){const from=team.indexOf(id);[team[from],team[at]]=[team[at],team[from]];}else team[at]=id;void ctx.edit(keepLeader(team));}
 else if(!over){if(team.includes(id))team=[...team.filter(t=>t!==id),id];else if(team.length<3)team.push(id);else return;void ctx.edit(keepLeader(team));}
}
function dropMove(source:HTMLElement,target:HTMLElement){
 const ctx=campDragCtx;if(!ctx||!campSelected)return;const inst=ctx.p.roster.find(i=>i.id===campSelected);if(!inst)return;
 const move=source.dataset.campMove!,carried=!!source.closest('#camp-party-carry');let carry=[...inst.carry];
 if(target.matches('#camp-party-learned')){if(carried)carry=carry.filter(m=>m!==move);else return;}
 else if(target.matches('#camp-party-carry .camp194-move-tile')){const over=target.dataset.campMove!;if(over===move)return;
  if(carried){const a=carry.indexOf(move),b=carry.indexOf(over);[carry[a],carry[b]]=[carry[b],carry[a]];}else carry=carry.map(m=>m===over?move:m);}
 else{if(carried)carry=[...carry.filter(m=>m!==move),move];else if(carry.length<4)carry.push(move);else return;}
 void ctx.edit({type:'carry',inst:inst.id,moves:carry});
}
installDrag([
 // Backpack: drag an item onto a quick slot (in the bag or on the bottom bar) to pin it.
 {source:'.c195-bag-item[data-bag-item]:not([data-bag-item="reviverSeed"])',targets:'.c195-slot,.hud-quick-slot[data-hud-quick]',accept:(src,t)=>quickItems[quickIndex(t)]!==src.dataset.bagItem,drop:(src,target)=>pinQuick(src.dataset.bagItem as Item,quickIndex(target))},
 // ...move or swap a pinned item between slots, or drag it off onto the item grid to unpin it.
 {source:'.c195-slot:not(.is-empty)',targets:'.c195-slot,.hud-quick-slot[data-hud-quick],.c195-bag-grid',accept:(src,t)=>t.matches('.c195-bag-grid')||quickIndex(t)!==quickIndex(src),
  drop:(src,target)=>{const a=quickIndex(src);if(target.matches('.c195-bag-grid')){quickItems[a]=null;render();return;}const b=quickIndex(target);[quickItems[a],quickItems[b]]=[quickItems[b],quickItems[a]];bagSlot=b;render();}},
 // Camp: roster card or team slot onto the team slots (add, replace, reorder); a team slot onto the roster to send it back to camp.
 {source:'.camp194-roster-select[data-camp-member]',targets:'.camp194-team-slot',drop:(src,target)=>dropMember(src.dataset.campMember!,target)},
 {source:'.camp194-team-slot[data-camp-member]',targets:'.camp194-team-slot,#camp-party-roster,.camp194-roster-block',accept:(_src,t)=>!t.matches('#camp-party-roster,.camp194-roster-block')||(campDragCtx?.p.team.length??0)>1,drop:(src,target)=>dropMember(src.dataset.campMember!,target)},
 // Camp: moves between the learned list and the carried four, and the order of the carried four.
 {source:'.camp194-move-tile[data-camp-move]',targets:'#camp-party-carry,#camp-party-learned,#camp-party-carry .camp194-move-tile',accept:(src,t)=>{
   const carried=!!src.closest('#camp-party-carry'),inst=campDragCtx?.p.roster.find(i=>i.id===campSelected);
   if(t.matches('#camp-party-learned'))return carried;                                   // only a carried move can be set down there
   if(t.matches('#camp-party-carry .camp194-move-tile'))return t.dataset.campMove!==src.dataset.campMove;   // replace or swap with another carried move
   return carried||(inst?inst.carry.length<4:false);                                      // the empty part of the list: only while there is room
  },drop:dropMove},
]);
// Read-only state inspection and the same dispatch API for private browser acceptance.
Object.assign(window,{trial:{store,minimapStats,walking:walkActive,render,spritesReady:()=>!charactersPending()&&document.querySelector<HTMLElement>('#board canvas')?.style.opacity!=='0',autoSleep:(enabled:boolean)=>{(window as unknown as {__trialNoAutoSleep?:boolean}).__trialNoAutoSleep=!enabled;render();},profile:()=>store.profile,createScenario,applyCommand,getState:()=>store.state,camera:()=>({x:scene?.cameras.main.scrollX??0,y:scene?.cameras.main.scrollY??0}),animating:()=>anim.active,view:()=>scene?.debug(),reveal:(w:World)=>reveal(w),maskAlpha:(x:number,y:number)=>scene?.darknessAlpha(x,y)??0,repaint:(w:World|null)=>scene?.pinPaint(w),freezeSprites:()=>scene?.freezeSprites(),animationEnabled}});
render();void store.whenReady.then(()=>{render();const next=finishing();if(next)void transition(store.dispatch(next));});
