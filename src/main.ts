import type Phaser from 'phaser';
import {applyCommand,traceRound,previewInvitation,createMain,createExpedition,key,same,plus,clone,skillTargets,SPEC_SOURCE,ITEM_NAMES,PROG,type World,type Action,type Skill,type Pos,type Item,type Unit,type ShopItem,type TmItem,type Point} from './core/engine.ts';
import {ECON} from './core/economy.ts';
import {SPECIES,ALL_TM_MOVES,STARTER_IDS,learnableMove} from './core/roster.ts';
import {speciesZh,moveZh,tmZh,typeZh,itemZh} from './core/names.ts';
import {moveOf} from './core/moves.ts';
import {unitLabel,skillLabel,actionText,orderLine,stepRows,enemyInfo,localizeLog,moveSummary} from './core/describe.ts';
import {renderTitle,renderNewGame,portraitTick,type NewGameState} from './ui/title.ts';
import {learnTm,newGameProfile,purseProblem,MAX_TEAM,type BaseAction} from './core/base.ts';
import {TrialStore,SAVE_KEY,BUILD_ID,type StoragePort} from './core/save.ts';
import {createScenario,scenarioProfile,SCENARIOS,SCENARIO_LABEL,type ScenarioId} from './core/scenarios.ts';
import {THEME_FLOORS,themeOfLevel,farthestRoom,ARENA_TILE} from './core/dungeon.ts';
import './style.css';
import {preloadArt,createAnims,skinFor,facingRow,animKey,TILE} from './render/sprites.ts';
import {inferEvents,plan,newLines,type AnimEvent} from './render/animation.ts';
import {playEvents,type Stage,type UnitView} from './render/playback.ts';
const specName=(u:Unit)=>u.species?speciesZh(u.species):'';
const tmName=(m:string)=>tmZh(m);
const spName=(id:string)=>speciesZh(id);
const nextExp=(s:World)=>s.prog&&s.prog.level<PROG.maxLevel?String(PROG.thresholds[s.prog.level]):'满级';
const FATE:Record<TmItem['fate'],string>={held:'持有中',brought:'已带回',sent:'已安全送回',lost:'已取得、未带出'};
const SRC:Record<TmItem['source'],string>={target:'成果 T',shop:'商店',boss:'区域首领'};
const REASON:Record<string,string>={goal:'完成了基础目标 G',recruit:'保留了本局新招募的伙伴',tm:'带回或安全送回了招式机'};
const tmLine=(t:TmItem)=>`${tmName(t.move)}（${SRC[t.source]}）：${FATE[t.fate]}`;
const params=new URLSearchParams(location.search);
/** Developer mode (stage 7.1): `?dev=1` or `?fixture=`. Only here do the fixed map, the no-invitation control, fixtures, `?seed=` and coordinates exist; the title screen is skipped. */
const dev=params.get('dev')==='1'||(params.get('fixture')!==null&&(SCENARIOS as readonly string[]).includes(params.get('fixture')!));
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<header><div class="brand">同行<span>FIELD TRIAL / 01</span></div><div class="build">${BUILD_ID} <button id="open-settings">设置与存档</button> · ${dev?'私有单层试验 · 开发者模式':'私有试玩构建'}${dev?'':'<button id="to-title">返回标题</button>'}</div></header><main><section class="left"><div class="intro"><small>探索 · 伙伴 · 选择</small><h1>下一步，由你决定。</h1><p>${dev?'完成G的记录即可结束。也可以探看后段，再决定是否带回T的成果。':'探索迷宫、击败敌人、招募伙伴；在合适的时候回到出口撤离，把成果带回基地。'}</p></div><section id="guide"></section><div class="board-head"><span id="world-label">尚未开始</span><span id="goal-label"></span></div><div id="board"></div><div class="legend"><span><i class="friend"></i>同行</span><span><i class="enemy"></i>敌人</span><span>G 基础目标／出口</span><span>T 成果／出口</span><span>下／上 楼梯</span><span id="legend-items" hidden>果／剂 橙橙果／PP补剂 · 休 休整点（每局一次） · 商 商店（稀有，用钱袋） · 换 伙伴交换机（稀有，每局一次）</span><span>暗格尚未揭示</span>${dev?'<label><input type="checkbox" id="coords-toggle"> 显示坐标（开发者）</label>':''}</div><div id="message" role="status" aria-live="polite"></div><section id="inspect" aria-live="polite"></section><section id="recent-events"></section><section id="flow"></section><details><summary>本轮发生了什么</summary><ol id="history"></ol></details></section><aside><section id="save" aria-live="polite"></section><section><h2>同行队列 <small>一人一次行动 → 敌方</small></h2><div id="party"></div></section><section id="controls"></section>${dev?`<details><summary>开发者菜单：检查入口（隔离存储）</summary><p>检查初态不是玩家关卡，也不替换当前试验。</p><select id="fixture">${SCENARIOS.map(id=>`<option value="${id}">${SCENARIO_LABEL[id]??id}</option>`).join('')}</select><button id="open-fixture">新窗口检查</button></details>`:''}<footer>规则源 ${SPEC_SOURCE.slice(0,7)}<br>几何占位 · 无账号 · 同一网页来源本地保存</footer></aside></main><div id="title-screen" class="screen" hidden></div><dialog id="settings" aria-labelledby="settings-heading"><h2 id="settings-heading">设置与存档</h2><label><input type="checkbox" id="anim-toggle"> 动作动画（按住 Shift 跳过）</label><p>营地档案保存在此浏览器、此网页来源。远征途中只有内存状态；离开前请正常撤离或完成本局。</p><button id="save-export">导出存档文件</button><button id="save-import">导入存档文件</button><input id="save-file" type="file" accept=".json,application/json" hidden><p id="transfer-message" role="status" aria-live="polite"></p><details><summary>操作说明与试验边界</summary><p>方向键移动；点相邻敌人普攻；句点等待。普通动作合法即推进完整一轮。技能先选招再点目标。</p><p>先安排一名伙伴，再编辑主控动作并提交。切主控不改变队列。倒下退图但仍占名额。</p><p>出口使用也占一轮，敌人仍会行动。撤离或全灭时会自动结算并保存；在此之前关闭或刷新会回到出发前的基地存档。</p><p>远征模式为随机三层迷宫（第3层的最远房间有区域首领，入口附近有一个普通出口，可以不挑战首领就撤离）：走到楼梯格后点击楼梯按钮请求跨层，可返回旧层。远征含本局等级、基地培养、失败回归与稀有服务点（商店、交换机）；所有数值均为人工参数。</p></details><button id="settings-close">关闭设置</button></dialog>`;
const fixture=params.get('fixture') as ScenarioId|null;
const checkMode=fixture!==null&&SCENARIOS.includes(fixture);
/** `?seed=<integer>` fixes the expedition seed (browser checks); otherwise every expedition draws a fresh one. */
const seedParam=params.get('seed');
const newSeed=()=>dev&&seedParam!==null&&/^\d+$/.test(seedParam)?Number(seedParam)>>>0:Math.floor(Math.random()*4294967296);
const begin=(config:string):World=>config==='expedition'?createExpedition(newId(),newSeed()):createMain(newId(),config==='main-invite');
const newId=()=>crypto.randomUUID();
let port:StoragePort;
try{port=window.localStorage;}catch{port={getItem(){throw Error('浏览器拒绝读取本地存储');},setItem(){throw Error('浏览器拒绝本地存储');}};}
// Browser diagnostics use the public controller; production storage is never replaced by fixtures.
const store=new TrialStore(port,checkMode?`dungeon-trial.check.${fixture}`:SAVE_KEY);
let selectedConfig='main-invite';
let draft:{partner:string;action:Action|null;main:Action|null;editor:string;swap:boolean}|null=null;
let choosingItem:Item|null=null;
let selectedSkill:Skill|null=null, choosingPartner=false,choosingSwap=false,confirmExit=false;
let inviteChoice:string|undefined,inviteReject=false,notice='',detailsId:string|null=null;
let tmPick:string|null=null;
/** 7.2: the purse chosen at the base, and the exchanger choices (companion to send, indexes of the machines to carry) before they are confirmed. */
let purseDraft=0,exTarget:string|null=null,exCargo:number[]=[];
type BoardScene=InstanceType<ReturnType<typeof makeBoardScene>>;
let scene:BoardScene|null=null;
let boardLoading:Promise<void>|null=null;
/** Stage 7.1 screens: the title and the new-game pages sit on top of the game view; developer mode starts in the game view as before. */
let screen:'title'|'newgame'|'play'=dev?'play':'title';
let ng:NewGameState={step:1,main:null,deputy:null,overwrite:false};
let askOverwrite=false,exportedOriginal=false,ngError='',showCoords=false;
let hoverId:string|null=null,pinnedId:string|null=null;
const GUIDE_KEY='trial-guide-seen'; // a separate preference outside the save record and outside the `dungeon-trial.` namespace
const guideSeen=():boolean=>{try{return window.localStorage.getItem(GUIDE_KEY)==='1';}catch{return false;}};
let guideClosed=guideSeen();
/** Who hit whom this round (inferred by the same code that drives the animation) and how many log lines the last command added. */
let attrib=new Map<string,string>(),freshCount=0;
/** Stage 6.4: `active` is true while a round's animation plays; every world-changing input is dropped (not queued) meanwhile. */
const anim={active:false,shift:false};
const PREF_KEY='trial-anim-pref'; // deliberately outside the `dungeon-trial.` namespace used by the save store
/** Animation switch: `?anim=off|on` wins, then `window.__trialNoAnim` (browser checks), then the saved checkbox, then reduced-motion. */
const animationEnabled=():boolean=>{const q=params.get('anim');if(q==='off')return false;if(q==='on')return true;if((window as unknown as {__trialNoAnim?:boolean}).__trialNoAnim)return false;
 try{const v=window.localStorage.getItem(PREF_KEY);if(v==='off')return false;if(v==='on')return true;}catch{/* storage may be blocked */}
 return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;};
const $=(id:string)=>document.getElementById(id)!;
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
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
const resources=(s:World,id:string)=>{const u=s.units[id];return `${id} ${u.hp}/${u.maxHp}HP · ${u.learned.map(k=>`${skillLabel(u,k)}（${moveSummary(k)}） ${u.pp[k]??0}/${u.maxPp[k]??0}`).join(' · ')||'普攻'}`;};
function bind(id:string,fn:()=>void){const el=document.getElementById(id);if(el)el.addEventListener('click',fn);}
function clear(){exTarget=null;exCargo=[];draft=null;selectedSkill=null;choosingItem=null;choosingPartner=false;choosingSwap=false;confirmExit=false;}
/** A saved pending exit or pending crossing is completed once, automatically, after the save succeeded. */
const finishing=():Parameters<typeof applyCommand>[1]|null=>{const p=store.state?.phase;return store.status!=='ready'?null:p==='exit'?{type:'finishExit'}:p==='transit'?{type:'finishTransit'}:null;};
async function transition(p:Promise<unknown>,clearDraft=true){if(clearDraft)clear();render();await p;render();const next=finishing();if(next){const done=store.dispatch(next);render();await done;render();}}
async function send(command:Parameters<typeof applyCommand>[1]){if(anim.active)return;if(store.status!=='ready'){notice='保存未完成，当前只可查看或重试；本轮未执行。';render();return;}const predicted=applyCommand(live()!,command);if(!predicted.ok){notice=predicted.error;render();return;}const cancelledCombination=command.type==='switch'&&draft!==null;const before=clone(live()!);const pending=store.dispatch(command);
 let playing:Promise<void>|null=null;{const after=live();
  // Animation is presentation only: any failure here must leave the input lock released and the real state drawn.
  try{if(after){freshCount=newLines(before.log,after.log).length;attrib=new Map();for(const e of inferEvents(before,after,command))if(e.k==='hit'&&e.attacker)attrib.set(`${e.target}|${e.amount}`,e.attacker);}}catch{attrib=new Map();freshCount=0;}
  try{const events=scene&&after&&animationEnabled()&&!anim.shift?inferEvents(before,after,command):[];if(scene&&events.length&&plan(events)){anim.active=true;playing=scene.animate(before,after!,events).finally(()=>{anim.active=false;render();});}}
  catch{anim.active=false;playing=null;render();}}
 clear();notice=cancelledCombination?'组合已取消。':'';if(command.type==='invite'){inviteChoice=undefined;inviteReject=false;}render();const r=await pending;if(!r.ok)notice=r.error;render();if(playing)await playing;const next=finishing();if(next)await transition(store.dispatch(next));}
function act(action:Action){if(anim.active||!live()||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;
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
function actionLabel(a:Action|null,actor?:string){if(!a)return '尚未选择';if(a.type==='move')return `移动到(${a.to.x},${a.to.y})`;if(a.type==='skill')return `${moveZh(a.skill)} → ${actor&&a.target===actor?'自身':a.target}`;if(a.type==='basic')return `普攻 → ${a.target}`;if(a.type==='swap')return `与${a.target}换位`;if(a.type==='use')return `使用${ITEM_NAMES[a.item]} → ${a.target}`;if(a.type==='interact')return a.exit?'取得／请求撤离':'取得并继续';return '等待';}
function render(){renderOverlay();renderMain();renderExtras();refreshTransfer();if(screen==='play')void ensureBoard();}
function renderMain(){const s=live();$('legend-items').hidden=!s?.prog;scene?.paint(s);$('world-label').textContent=s?`${checkMode?'独立检查 · ':''}第 ${s.round} 轮 · ${s.phase==='ended'?'已结束':(s.dungeon?`第${s.dungeon.level}层`:'第一层')}`:(store.atBase?'基地':'单层探索试验');$('goal-label').textContent=!s&&store.atBase?`已完成远征 ${store.profile?.expeditions??0} 次`:s?`目标 ${s.goal?'已完成':'未完成'} · 背包 ${s.bag}${s.prog?` · 本局Lv${s.prog.level} 经验${s.prog.exp}/${nextExp(s)} · 橙橙果×${s.prog.items.berry} PP补剂×${s.prog.items.tonic}${s.dungeon?.base?` · 钱袋 ${s.purse??0}`:''}`:''}`:'';
 $('message').textContent=notice;
 const expeditionMemory=s?.scenario==='expedition'&&s.phase!=='ended';
 const saveText=store.status==='failed'&&s?.phase==='ended'?'终局已结算，但未保存；重试成功后才能回营地':store.status==='failed'?'基地改动未保存；可以重试':store.status==='ready'&&expeditionMemory?(store.envelope?'基地档案已保存；本次远征仅在内存中':'开发者远征只在内存中；未创建营地档案'):store.status==='ready'&&s?.phase==='ended'?(store.envelope?'终局结算已保存':'开发者场景只在内存中'): {empty:'尚无可恢复记录',ready:'基地档案已保存',saving:'正在保存基地档案',failed:'基地改动未保存；可以重试',blocked:'记录无法载入，原字节已保留'}[store.status];
 $('save').innerHTML=`<div class="save-state ${store.status}">${saveText}</div><small>${esc(store.lastSaved?.replace(/^[^·]+ · /,'').replace('playing','营地状态').replace('invitation','待邀请').replace('ended','终局结算').replace('exit','待撤离').replace('transit','待跨层')??(expeditionMemory?(store.envelope?'营地存档保持出发前内容':'没有持久营地存档'):'尚无成功保存点'))}</small>${store.error?`<p class="error">${esc(store.error)}</p>`:''}${store.status==='failed'?button('retry','重试保存'):''}${store.status==='blocked'?button('export','导出原记录')+button('reset','导出后明确重置'):''}`;
 bind('retry',()=>void transition(store.retry()));
 bind('export',()=>{const raw=store.exportRaw();if(raw===null){notice='无法读取原记录，不能重置；请保留当前浏览器数据。';render();return;}download(raw);notice='已提供原记录下载；请确认文件已保留，再选择重置。';render();});
 bind('reset',()=>{if(window.confirm('仅在已保留导出原记录后重置。该操作将开始独立试验，是否确认？'))void transition(store.resetAfterExport(createMain(newId()),true));});
 $('history').innerHTML=s?visibleLog(s).slice(-12).map(t=>`<li>${esc(localizeLog(s,t))}</li>`).join(''):'';
 if(!s&&store.atBase){renderBase();return;}
 if(!s){$('party').innerHTML='<p class="muted">开始后显示三个实例与独立资源。</p>';$('controls').innerHTML='';$('flow').innerHTML=store.status==='empty'?(!dev?'<p>还没有存档。请返回标题开始新游戏。</p>':`<h2>开发者菜单：开始一份独立试验</h2><p>开发者场景只在本次页面内存中运行，不会写入玩家营地存档。</p><label>邀请配置 <select id="config"><option value="main-invite">固定有邀请</option><option value="main-none">无邀请对照</option><option value="expedition">远征（随机 2 层，旧式无基地）</option></select></label>${button('start','开始探索',false,'class="primary"')}`):'';bind('start',()=>{selectedConfig=(document.getElementById('config') as HTMLSelectElement).value;void transition(checkMode?store.start(createScenario(fixture!,newId()),scenarioProfile(fixture!)):store.start(begin(selectedConfig)));});return;}
 const ready=store.status==='ready',playing=s.phase==='playing',editable=ready||store.status==='saving';
 $('party').innerHTML=s.queue.map((id,i)=>{const u=s.units[id];const down=u.hp===0;return `<article class="unit ${id===s.leader?'leader':''}"><div><strong>${esc(id)}</strong><span>${down?'倒下 · 仍占名额':id===s.leader?'主控':'同行'}${u.protected?' · 初始成员':''} · ${u.hp}/${u.maxHp}${u.species?` · ${esc(specName(u))}${s.prog?` Lv${s.prog.level}`:''}`:''}</span></div><div class="hp"><i style="width:${u.hp/u.maxHp*100}%"></i></div><p class="muted" data-unit-status="${esc(id)}" ${combatStatus(u)?'':'hidden'}>${esc(combatStatus(u))}</p><p>${u.learned.map(k=>`${skillLabel(u,k)} ${u.pp[k]??0}/${u.maxPp[k]??0}`).join(' · ')||'普攻，不耗PP'}</p>${button('leader-'+i,'设为主控',!ready||!playing||down||s.leader===id)}${button('detail-'+i,'详情')}</article>`;}).join('')+(s.camp.length?`<p class="muted">此前已回营：${s.camp.map(id=>esc(resources(s,id))).join('；')}（本局不可调回）</p>`:'');
 s.queue.forEach((id,i)=>{bind('leader-'+i,()=>{void send({type:'switch',actor:id});});bind('detail-'+i,()=>{detailsId=detailsId===id?null:id;render();});});
 if(detailsId&&s.units[detailsId]){$('party').insertAdjacentHTML('beforeend',`<p class="detail">${esc(detailsId)} 已学：${s.units[detailsId].learned.map(k=>`${esc(skillLabel(s.units[detailsId!],k))}（${esc(moveSummary(k))}）`).join('；')||'无特殊招式'}。普攻造成6点基础伤害；选中招式后可查看射程与效果。详情不改变草稿。</p>`);}
 if(s.phase==='ended'){
  const end=s.end!;$('controls').innerHTML='';const persistentRun=s.scenario==='expedition'&&!!store.envelope;
  $('flow').innerHTML=`<div class="result"><small>本次试验结果</small><h2>${end.outcome==='normal'?'正常撤离':'全队倒下'}</h2><p>目标${end.goal?'已完成':'未完成'} · 已取得 ${end.acquired} · 正常带出 ${end.brought}${end.boss===undefined?'':` · 讨伐首领：${end.boss?'成功':'未挑战'}`}</p><p>${end.team.map(id=>`${esc(resources(s,id))}，${end.outcome==='normal'?'按名单归营':'仍同行、倒下'}`).join('；')}</p><p>此前回营：${end.camp.length?end.camp.map(id=>esc(resources(s,id))).join('；'):'无'}。资源与已学招式保留终局值，不治疗。</p>${resultDetails(s)}${persistentRun?button('to-base','回到基地',!ready,'class="primary"'):button('new','开始独立试验',!ready,'class="primary"')}<p class="muted">${persistentRun?(ready?'终局已结算并自动保存。':'终局已结算，保存失败；重试成功前不能回营地。'):'这是内存开发场景；结算不会写入营地存档。'} 终局ID ${esc(end.id)}</p></div>`;
  bind('to-base',()=>{if(anim.active)return;clear();notice='';void transition(store.returnToBase());});
  bind('new',()=>{const next=checkMode?createScenario(fixture!,newId()):begin(s.scenario==='main-invite'||s.scenario==='expedition'?s.scenario:'main-none');void transition(store.newTrial(next));});return;
 }
 if(s.phase==='invitation'){
  $('controls').innerHTML='';const pending=s.invitations.find(i=>i.status==='pending')!;const preview=previewInvitation(s,inviteChoice);const old=inviteChoice?s.units[inviteChoice]:null;
  $('flow').innerHTML=`<h2>${esc(pending.unit.id)}想加入</h2><p>邀请处理暂停世界；新人下一轮才行动。${s.request?.locked?'本轮撤离请求已成立，先处理这份邀请。':''}</p><div class="compare"><div><strong>新人 ${esc(pending.unit.id)}${pending.unit.species?` · ${esc(specName(pending.unit))}${s.prog?` Lv${s.prog.level}`:''}`:''}</strong><p>${pending.unit.hp}/${pending.unit.maxHp}HP</p><p>${pending.unit.learned.map(k=>`${skillLabel(pending.unit,k)} ${pending.unit.pp[k]}/${pending.unit.maxPp[k]}`).join(' · ')}</p></div><div><strong>回营 ${esc(inviteChoice??'尚未选择')}</strong><p>${old?`${old.hp}/${old.maxHp}HP`:'满员需要选一名同行者'}</p><p>${old?old.learned.map(k=>`${skillLabel(old,k)} ${old.pp[k]}/${old.maxPp[k]}`).join(' · '):''}</p></div></div><div class="button-row">${s.queue.map((id,i)=>button('out-'+i,`${id}回营`,!ready,inviteChoice===id?'class="selected"':'')).join('')}${s.queue.length<3?button('out-none','补空位',!ready):''}</div><p>${preview.ok?`入场 (${preview.pos.x},${preview.pos.y}) · 队列 ${preview.queue.join(' → ')} · 主控 ${preview.leader}`:esc(preview.error)}</p><p class="muted">旧人保留培养，本局不可调回；共用背包不运输，其他人不恢复。</p>${inviteReject?`<p>将拒绝这份邀请，不会生成伙伴。</p>${button('reject-confirm','确认拒绝',!ready,'data-confirm="true"')}${button('back','返回比较')}`:button('accept','确认接受并回营',!ready||!preview.ok,'data-confirm="true" class="primary"')+button('reject','选择拒绝',!ready)}`;
  s.queue.forEach((id,i)=>bind('out-'+i,()=>{inviteChoice=id;inviteReject=false;render();}));bind('out-none',()=>{inviteChoice=undefined;render();});bind('accept',()=>void send({type:'invite',choice:'accept',outgoing:inviteChoice}));bind('reject',()=>{inviteReject=true;render();});bind('reject-confirm',()=>void send({type:'invite',choice:'reject'}));bind('back',()=>{inviteReject=false;render();});return;
 }
 if(s.phase==='exit'){$('controls').innerHTML='';$('flow').innerHTML='<p>本轮撤离请求已成立；正在完成终局处理。</p>';return;}
 if(s.phase==='transit'){$('controls').innerHTML='';$('flow').innerHTML='<p>本轮跨层请求已成立；正在切换楼层。</p>';return;}
 const leaderPoint=s.points.find(p=>same(p.pos,s.units[s.leader].pos)),onStairs=leaderPoint?.kind==='down'||leaderPoint?.kind==='up';
 $('flow').innerHTML=confirmExit?`<h2>${onStairs?'本轮请求跨层？':'本轮请求撤离？'}</h2><p>消耗主控行动，敌人仍会行动。使用者轮末存活且仍在交互格才成立。</p>${button('exit-confirm',onStairs?'确认本轮跨层':'确认本轮撤离',!ready,'data-confirm="true" class="primary"')}${button('cancel-exit','继续查看')}`:'';
 bind('exit-confirm',()=>void send({type:'round',action:{type:'interact',exit:true}}));bind('cancel-exit',()=>{confirmExit=false;render();});
 const editor=draft?.editor??s.leader;const u=s.units[editor];
 const point=s.points.find(p=>same(p.pos,u.pos));const stairKind=point?.kind==='down'||point?.kind==='up';const restPoint=point?.kind==='rest';const serviceCell=point?.kind==='shop'||point?.kind==='exchange';const canCollect=!!point&&!point.used&&point.kind!=='exit'&&!stairKind&&!restPoint&&!serviceCell;const pickup=point?.kind==='berry'||point?.kind==='tonic';
 let draftText='';if(draft){const valid=draft.main&&(draft.swap||draft.action)?applyCommand(s,{type:'round',action:draft.main,...(!draft.swap?{override:{actor:draft.partner,action:draft.action!}}:{})}):null;
 draftText=`<div class="draft"><strong>本轮草稿中 · 正在编辑 ${esc(editor)}</strong><p>${button('edit-main',`${s.leader}：${actionLabel(draft.main,s.leader)}`,draft.swap)}${button('edit-partner',`${draft.partner}：${draft.swap?'换位（双方行动）':actionLabel(draft.action,draft.partner)}`,draft.swap)}</p><p>之后：敌方阶段</p>${draftOrder(s,draft)}${valid&&!valid.ok?`<p class="error">${esc(valid.error)}</p>`:''}${button('submit',draft.main?.type==='interact'&&draft.main.exit?'提交整轮并请求撤离':'提交整轮',!ready||!valid?.ok,'data-confirm="true" class="primary"')}${button('cancel-draft','取消组合')}</div>`;
 }
 $('controls').innerHTML=`<h2>${draft?'组合安排':'主控行动'} <small>${esc(editor)}</small></h2>${draftText}<div class="button-row">${button('wait','等待（.）',!editable||(!ready&&!draft)||!!draft?.swap)}${button('arrange','安排伙伴',!editable||!!draft)}${button('swap','换位',!editable||!!draft)}</div>${choosingPartner||choosingSwap?`<p>选择另一名伙伴：</p>${s.queue.filter(id=>id!==s.leader&&s.units[id].hp>0).map(id=>button('partner-'+id,id,!editable)).join('')}`:''}<div class="skills">${u.learned.map(k=>button('skill-'+k,`${esc(skillLabel(u,k))} ${u.pp[k]??0}/${u.maxPp[k]??0}<small style="display:block">${esc(moveSummary(k))}</small>`,!editable||(!ready&&!draft)||!!draft?.swap||(u.pp[k]??0)<1,selectedSkill===k?'class="selected"':'')).join('')}</div>${s.prog?`<div class="items"><p class="muted">背包（本局，不带出）：${ITEM_NAMES.berry}×${s.prog.items.berry}（回复${PROG.berryHeal}HP）· ${ITEM_NAMES.tonic}×${s.prog.items.tonic}（每招+${PROG.tonicPp}PP）。占该成员一次行动，对自己或相邻同行。</p>${(['berry','tonic'] as Item[]).map(k=>button('use-'+k,`使用${ITEM_NAMES[k]}`,!editable||(!ready&&!draft)||!!draft?.swap,choosingItem===k?'class="selected"':'')).join('')}${choosingItem&&u.pos?`<p>对谁使用${ITEM_NAMES[choosingItem]}？</p>${s.queue.filter(id=>s.units[id].hp>0&&s.units[id].pos&&(id===editor||Math.abs(s.units[id].pos!.x-u.pos!.x)+Math.abs(s.units[id].pos!.y-u.pos!.y)===1)).map(id=>button('item-target-'+id,id===editor?`${id}（自己）`:id,!editable)).join('')}`:''}</div>`:''}<p class="muted">${selectedSkill?`已选${esc(skillLabel(u,selectedSkill))}：${esc(moveSummary(selectedSkill))}。消耗1PP；金圈标出合法目标${moveOf(selectedSkill)?.range==='user'||moveOf(selectedSkill)?.range==='room'?'（自身）':''}。`:draft?'点地图或方向键只编辑动作，尚未执行。':'方向键移动；点相邻敌人普攻；K选招式。'}</p>${point&&editor===s.leader&&restPoint?button('rest',point.used?'休整点已使用':'整理招式补给（休整点，每局一次）',!editable||(!ready&&!draft)||!!draft?.swap||point.used):''}${point&&editor===s.leader&&!restPoint&&!serviceCell?(canCollect?button('take',pickup?`拾取${ITEM_NAMES[point!.kind as Item]}`:'取得并继续',!editable||(!ready&&!draft)||!!draft?.swap):'')+(pickup?'':button('take-exit',stairKind?(point!.kind==='down'?'走下楼梯（请求跨层）':'走上楼梯（请求跨层）'):canCollect?'取得／请求撤离':'请求撤离',!editable||(!ready&&!draft)||!!draft?.swap)):''}`;
 if(!draft&&editor===s.leader){$('controls').insertAdjacentHTML('beforeend',servicePanel(s,point,ready));bindService(s);}
 bind('wait',()=>act({type:'wait'}));bind('arrange',()=>{choosingPartner=true;choosingSwap=false;selectedSkill=null;render();});bind('swap',()=>{choosingSwap=true;choosingPartner=false;selectedSkill=null;render();});
 for(const id of s.queue.filter(id=>id!==s.leader))bind('partner-'+id,()=>{const swap=choosingSwap;draft={partner:id,action:null,main:swap?{type:'swap',target:id}:null,editor:swap?s.leader:id,swap};choosingPartner=false;choosingSwap=false;render();});
 u.learned.forEach(k=>bind('skill-'+k,()=>{selectedSkill=k;choosingItem=null;render();}));
 for(const k of ['berry','tonic'] as Item[]){bind('use-'+k,()=>{if(s.prog!.items[k]<1){notice=`背包里没有${ITEM_NAMES[k]}；本轮未执行`;choosingItem=null;render();return;}choosingItem=choosingItem===k?null:k;selectedSkill=null;choosingPartner=false;choosingSwap=false;render();});
  for(const id of s.queue)bind('item-target-'+id,()=>{if(choosingItem===k)act({type:'use',item:k,target:id});});}bind('take',()=>act({type:'interact',exit:false}));bind('rest',()=>act({type:'interact',exit:false}));bind('take-exit',()=>act({type:'interact',exit:true}));bind('edit-main',()=>{if(draft){draft.editor=s.leader;selectedSkill=null;render();}});bind('edit-partner',()=>{if(draft){draft.editor=draft.partner;selectedSkill=null;render();}});bind('cancel-draft',()=>{clear();render();});
 bind('submit',()=>{if(draft?.main){const cmd={type:'round' as const,action:draft.main,...(!draft.swap?{override:{actor:draft.partner,action:draft.action!}}:{})};void send(cmd);}});
}
/** 6.5 base screen: roster, technique machines, carried moves, squad and departure. Every edit is one saved write; the next edit waits for it. */
function renderBase(){
 const p=store.profile;const ready=store.status==='ready';
 if(!p){$('flow').innerHTML='<p class="error">基地档案缺失。</p>';$('party').innerHTML='';$('controls').innerHTML='';return;}
 $('party').innerHTML=`<h2>名册 <small>${p.roster.length}只 · 每只最多携带2招</small></h2>`+p.roster.map(i=>{const pos=p.team.indexOf(i.id);
  return `<article class="unit ${i.id===p.leader&&pos>=0?'leader':''}" id="inst-${i.id}"><div><strong>${esc(i.id)}</strong><span>${esc(spName(i.species))} · ${pos>=0?`出发第${pos+1}位${i.id===p.leader?' · 主控':''}`:'留守'}</span></div>
  ${i.protected?'<p class="muted">初始成员：全灭时不会走失</p>':''}<p>已学：${i.learned.map(l=>`${esc(moveZh(l.move))}（${esc(moveSummary(l.move))}；PP${l.pp}）`).join('、')}</p>
  <p>携带：${i.carry.length?i.carry.map(n=>`${esc(moveZh(n))}（${esc(moveSummary(n))}）`).join('、'):'无'}</p>
  <div>${i.learned.map(l=>button(`carry-${i.id}-${l.move}`,`${i.carry.includes(l.move)?'卸下':'携带'} ${esc(moveZh(l.move))}`,!ready,i.carry.includes(l.move)?'class="selected"':'')).join('')}</div>
  <div>${button(`team-${i.id}`,pos>=0?'移出队伍':'加入队伍',!ready)}${button(`lead-${i.id}`,'设为主控',!ready||pos<0||i.id===p.leader)}</div></article>`;}).join('');
 const vault=ALL_TM_MOVES.map(m=>button(`tm-${m}`,`${esc(tmName(m))}招式机 ×${p.vault[m]??0}`,!ready||(p.vault[m]??0)<1,tmPick===m?'class="selected"':'')).join('');
 const learnRows=tmPick?`<p>把${esc(tmName(tmPick))}招式机教给：</p>${p.roster.map(i=>{const r=learnTm(p,i.id,tmPick!);return button(`learn-${i.id}`,`${esc(i.id)} ${esc(spName(i.species))}：${r.ok?'可学习':esc(r.error.split('；')[0])}`,!ready);}).join('')}`:'';
 purseDraft=Math.min(purseDraft,Math.floor(Math.min(ECON.purseMax,p.account)/ECON.purseStep)*ECON.purseStep);
 const poolHtml=p.rescue.length?p.rescue.map(r=>{const warn=!r.paid&&r.left===1;
  return `<article class="unit rescue${warn?' warn':''}" id="rescue-${esc(r.inst.id)}"><div><strong>${esc(r.inst.id)}</strong><span>${esc(spName(r.inst.species))} · ${r.paid?`已付费 · 再经过 ${r.left} 次有效探险后回归`:`未付费 · 剩余期限 ${r.left} 次有效探险`}</span></div>${warn?'<p class="warn-text" style="color:#ffd27a;font-weight:700">下次有效探险后失去！请在出发前付费。</p>':''}<p>已学：${r.inst.learned.map(l=>esc(moveZh(l.move))).join('、')}</p>${r.paid?'':button(`rescue-pay-${r.inst.id}`,`付救援费 ${ECON.rescueCost}`,!ready)}</article>`;}).join(''):'<p class="muted" id="rescue-empty">救援池是空的。</p>';
 const lostHtml=p.lost.length?`<ul id="lost-list">${p.lost.map(l=>`<li>${esc(l.id)} ${esc(spName(l.species))}：第${l.expedition}次远征后永久失去</li>`).join('')}</ul>`:'<p class="muted">还没有永久失去的伙伴。</p>';
 $('flow').innerHTML=`<div class="result" id="base"><small>基地</small><h2>整备后再出发</h2>
  <p>已完成远征 ${p.expeditions} 次。招式机在这里永久教给一只伙伴；换下的招式不会丢，也不会退还招式机。</p>
  <h2>账户与救援</h2><p id="account">账户余额：<strong>${p.account}</strong>（只在基地使用：付救援费 ${ECON.rescueCost}，或装进出发的钱袋）</p>
  <div id="rescue-pool">${poolHtml}</div>
  <h2>已失去的伙伴</h2>${lostHtml}
  <h2>仓库（招式机）</h2><div>${vault}</div>${learnRows}
  <h2>出发队伍</h2><p id="squad">${p.team.map((id,n)=>`${n+1}. ${esc(id)} ${esc(spName(p.roster.find(i=>i.id===id)!.species))}${id===p.leader?'（主控）':''}`).join(' → ')}（选择顺序即队列顺序，最多${MAX_TEAM}只）</p>
  <p class="muted">出发是免费的基本整备：全员HP、PP全满；本局等级从1开始；新的随机地图。</p><p class="warn-text">远征途中只有内存状态。关闭或刷新页面会回到出发前的营地存档，本次远征作废。</p>
  <h2>出发前：钱袋</h2><p id="purse-picker">钱袋：<strong id="purse-value">${purseDraft}</strong>（0到${Math.min(ECON.purseMax,p.account)}，每档${ECON.purseStep}；出发时从账户扣除，只能在局内商店花；正常撤离退回，全灭丢失）</p>${button('purse-down','减少',!ready||purseDraft<=0)}${button('purse-up','增加',!ready||purseDraft+ECON.purseStep>Math.min(ECON.purseMax,p.account))}
  ${button('depart','出发',!ready,'data-confirm="true" class="primary"')}</div>`;
 $('controls').innerHTML='';
 const edit=async(a:BaseAction,after?:()=>void)=>{if(anim.active||store.status!=='ready')return;const pending=store.baseAction(a);render();const r=await pending;notice=r.ok?(r.saved?'':'这次改动尚未保存；请重试保存'):r.error;if(r.ok&&r.saved)after?.();render();};
 for(const i of p.roster){
  for(const l of i.learned)bind(`carry-${i.id}-${l.move}`,()=>void edit({type:'carry',inst:i.id,moves:i.carry.includes(l.move)?i.carry.filter(n=>n!==l.move):[...i.carry,l.move]}));
  bind(`team-${i.id}`,()=>{const pos=p.team.indexOf(i.id);const team=pos>=0?p.team.filter(t=>t!==i.id):[...p.team,i.id];
   void edit({type:'team',team,leader:team.includes(p.leader)?p.leader:team[0]??p.leader});});
  bind(`lead-${i.id}`,()=>void edit({type:'team',team:p.team,leader:i.id}));
  bind(`learn-${i.id}`,()=>{const m=tmPick;if(m)void edit({type:'learn',inst:i.id,move:m},()=>{tmPick=null;});});
 }
 for(const r of p.rescue)bind(`rescue-pay-${r.inst.id}`,()=>void edit({type:'rescue',inst:r.inst.id}));
 bind('purse-down',()=>{purseDraft=Math.max(0,purseDraft-ECON.purseStep);render();});bind('purse-up',()=>{purseDraft+=ECON.purseStep;render();});
 for(const m of ALL_TM_MOVES)bind(`tm-${m}`,()=>{tmPick=tmPick===m?null:m;notice='';render();});
 bind('depart',()=>{if(anim.active||store.status!=='ready')return;const bad=purseProblem(p,purseDraft);if(bad){notice=bad;render();return;}clear();tmPick=null;notice='';const amount=purseDraft;purseDraft=0;const pending=store.depart(newId(),newSeed(),amount);render();void pending.then(()=>{render();});});
}

/* ---------- stage 7.2: result details, shop and exchanger panels ---------- */
/** The end-of-run record in plain words: effective or not and why, reward, purse, who went missing, where each machine went, and what the pool will do on return. */
function resultDetails(s:World):string{
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
  return `<div class="service" id="shop-panel"><h2>商店 <small>只能用钱袋付款；买东西不占回合；本次远征期间库存固定；关闭或刷新会回到出发前；首版不收购</small></h2><p id="purse-line">钱袋余额：${purse}</p><ul>${row('berry',ITEM_NAMES.berry,sh.stock.berry)}${row('tonic',ITEM_NAMES.tonic,sh.stock.tonic)}${row('tm',sh.stock.tm?`招式机：${tmName(sh.stock.tm)}`:'招式机',sh.stock.tm?1:0)}</ul></div>`;
 }
 if(point.kind==='exchange'&&s.exchange){
  const ex=s.exchange;
  if(ex.used)return `<div class="service" id="exchange-panel"><h2>伙伴交换机</h2><p>本局已经使用：${esc(unitLabel(s.units[ex.sent!],ex.sent!))}安全回到基地。每局只能用一次。</p></div>`;
  const cands=s.queue.filter(id=>id!==s.leader&&s.units[id].hp>0);
  const held=(s.tms??[]).map((t,i)=>({t,i})).filter(x=>x.t.fate==='held');
  return `<div class="service" id="exchange-panel"><h2>伙伴交换机 <small>每局只能用一次；占主控一次行动；不回血、不补PP；被送回的伙伴本局不再参战，空位只能靠再次击败敌人、触发邀请来补</small></h2>
  <p>选择送回基地的同行伙伴（须存活，不能是主控）：</p>${cands.length?cands.map(id=>button('ex-target-'+id,esc(unitLabel(s.units[id],id)),!ready,exTarget===id?'class="selected"':'')).join(''):'<p class="muted">没有可送回的伙伴。</p>'}
  <p>随行运送招式机（最多${ECON.exchangeCargo}份；送回后全灭也不丢）：</p>${held.length?held.map(x=>button('ex-cargo-'+x.i,esc(tmLine(x.t).split('：')[0]),!ready,exCargo.includes(x.i)?'class="selected"':'')).join(''):'<p class="muted">本局没有持有的招式机。</p>'}
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
  bind('title-new',()=>{if(store.status==='empty'){openPicker(false);return;}askOverwrite=true;render();});
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
function openPicker(overwrite:boolean){ng={step:1,main:null,deputy:null,overwrite};ngError='';screen='newgame';render();}
async function startNewGame(){
 if(!ng.main||!ng.deputy)return;
 const made=newGameProfile(ng.main,ng.deputy);if(!made.ok){ngError=made.error;render();return;}
 const ok=await store.beginNewGame(made.profile,ng.overwrite);
 if(!ok){ngError=store.error?`没有写入新存档：${store.error}。原存档保持不变。`:'没有写入新存档；原存档保持不变。';render();return;}
 clear();notice='';tmPick=null;detailsId=null;pinnedId=null;hoverId=null;attrib=new Map();freshCount=0;exportedOriginal=false;screen='play';render();
}
/** Log lines the player may see: lines about an enemy on an unrevealed cell are dropped. */
function visibleLog(s:World):string[]{
 const hidden=s.enemies.filter(id=>{const u=s.units[id];return u.pos&&!s.seen.includes(key(u.pos));});
 return s.log.filter(t=>!hidden.some(id=>t.startsWith(id)&&!/[A-Za-z0-9-]/.test(t[id.length]??' ')));
}
function renderExtras(){
 const s=live();
 const toTitle=document.getElementById('to-title');if(toTitle)toTitle.hidden=screen!=='play';
 // recent events: always visible, newest last; hits name the inferred attacker
 const box=$('recent-events');
 if(!s)box.innerHTML='';
 else{
  const shown=new Set(visibleLog(s));
  const tail=s.log.slice(-6);const total=tail.length;
  const rows=tail.map((t,i)=>({t,fromEnd:total-i})).filter(r=>shown.has(r.t)).map(({t,fromEnd})=>{
   let extra='';const m=/^([^\s受]+)受到(\d+)伤害/.exec(t);
   if(m&&fromEnd<=freshCount){const a=attrib.get(`${m[1]}|${m[2]}`);
    if(a){const u=s.units[a];extra=u&&u.pos&&s.seen.includes(key(u.pos))?` ← ${unitLabel(u,a)}（推断）`:' ← 视野外的敌人';}}
   return `<li>${esc(localizeLog(s,t))}${esc(extra)}</li>`;});
  box.innerHTML=`<h2>最近事件 <small>最新的在最下面；“←”后是推断的攻击者</small></h2><ol id="recent-list">${rows.join('')||'<li class="muted">还没有事件。</li>'}</ol>`;
 }
 updateInspect();
 // first-expedition guide
 const g=$('guide');
 if(!dev&&screen==='play'&&s&&s.scenario==='expedition'&&!guideClosed){
  g.innerHTML=`<div class="guide-card" id="guide-card" role="note"><h2>第一次远征：三件事</h2><ul><li><strong>移动：</strong>方向键，或点相邻的格子；点相邻的敌人是普攻。你每行动一次，伙伴和敌人也各行动一次。</li><li><strong>伙伴：</strong>不安排时，伙伴会自己攻击相邻的敌人，否则跟着你走。想指定时，先点“安排伙伴”选一位，再给 Ta 选动作，最后编辑你自己的动作并提交。</li><li><strong>撤离：</strong>站在出口（起点）或楼梯上，点“请求撤离”并确认。正常撤离才能把成果带回基地；全员倒下则本局什么也带不出，伙伴仍会回到基地。</li></ul><button id="guide-close">知道了，不再显示</button></div>`;
  bind('guide-close',()=>{guideClosed=true;try{window.localStorage.setItem(GUIDE_KEY,'1');}catch{/* the preference is optional */}render();});
 }else g.innerHTML='';
}
/** The enemy under a board cell, only when its cell is revealed. */
function enemyAt(p:Pos):string|null{const s=live();if(!s)return null;return s.enemies.find(id=>{const u=s.units[id];return u.hp>0&&same(u.pos,p)&&s.seen.includes(key(p));})??null;}
function updateInspect(){
 const box=$('inspect');const s=live();
 if(!s){box.innerHTML='';return;}
 const pick=hoverId??pinnedId;const info=pick?enemyInfo(s,pick):null;
 box.innerHTML=info?`<div class="inspect-card" id="enemy-info"><strong>${esc(info.name)}</strong>${info.types?`<span>${esc(info.types)}属性</span>`:''}<p>生命 ${info.hp}/${info.maxHp} · 伤害 ${esc(info.damage)}</p><p>${esc(info.behavior)}</p>${info.note?`<p class="muted">${esc(info.note)}</p>`:''}</div>`:'<p class="muted" id="enemy-hint">把鼠标移到（或点击）已发现的敌人上，可以查看物种、生命、行为和伤害。</p>';
}
/** Execution order of a combination draft and what each member would do, by running the rule code on a copy (nothing is executed). */
function draftOrder(s:World,d:NonNullable<typeof draft>):string{
 const main:Action=d.main??{type:'wait'};
 const steps=traceRound(s,{type:'round',action:main,...(!d.swap&&d.action?{override:{actor:d.partner,action:d.action}}:{})});
 if(!steps)return '<p class="muted" id="draft-order">本轮顺序暂时无法预演（草稿里有不合法的动作）。</p>';
 return `<p id="draft-order"><strong>本轮顺序：</strong>${esc(orderLine(s,steps))}</p><ul id="draft-steps">${stepRows(s,steps).map(r=>`<li>${esc(r.text)}</li>`).join('')}</ul>${d.main?'':'<p class="muted">主控的动作还没选；预览暂按“等待”。</p>'}${!d.swap&&!d.action?'<p class="muted">伙伴的动作还没选；预览用默认行为，可以直接提交。</p>':''}`;
}
function download(raw:string,filename='trial-save-original.json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function makeBoardScene(Phaser:typeof import('phaser')){
class BoardScene extends Phaser.Scene {
 private graphics!:Phaser.GameObjects.Graphics;private overlay!:Phaser.GameObjects.Graphics;private labels:Phaser.GameObjects.Text[]=[];private tiles:Phaser.GameObjects.Image[]=[];private sprites=new Map<string,Phaser.GameObjects.Sprite>();private views=new Map<string,UnitView>();private temp=new Set<Phaser.GameObjects.GameObject>();private skipNow:(()=>void)|null=null;private lastGeometry:ReturnType<BoardScene['geometry']>|null=null;
 constructor(){super('board');}
 preload(){preloadArt(this);}
 create(){createAnims(this);this.graphics=this.add.graphics().setDepth(0);this.overlay=this.add.graphics().setDepth(5);this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{const s=live();if(!s)return;const g=this.geometry(s);
  // worldX/worldY already include the camera scroll, so clicks stay correct while the camera follows the leader.
  const x=Math.floor((pointer.worldX-g.ox)/g.cell)+g.minX;const y=Math.floor((pointer.worldY-g.oy)/g.cell)+g.minY;pinnedId=enemyAt({x,y});updateInspect();clickCell({x,y});});
  this.input.on('pointermove',(pointer:Phaser.Input.Pointer)=>{const s=live();if(!s)return;const g=this.geometry(s);const id=enemyAt({x:Math.floor((pointer.worldX-g.ox)/g.cell)+g.minX,y:Math.floor((pointer.worldY-g.oy)/g.cell)+g.minY});if(id!==hoverId){hoverId=id;updateInspect();}});scene=this;this.paint(live());}
 geometry(s:World){if(s.dungeon){const d=s.dungeon;return {minX:0,minY:0,cell:40,ox:0,oy:0,dungeon:true,w:d.width*40,h:d.height*40};}
  const minX=Math.min(...s.floor.map(p=>p.x)),maxX=Math.max(...s.floor.map(p=>p.x)),minY=Math.min(...s.floor.map(p=>p.y)),maxY=Math.max(...s.floor.map(p=>p.y));const cell=Math.min(66,600/(maxX-minX+1),270/(maxY-minY+1));return {minX,minY,cell,ox:(680-(maxX-minX+1)*cell)/2,oy:(350-(maxY-minY+1)*cell)/2,dungeon:false,w:680,h:350};}
 paint(s:World|null,force=false){if(!this.graphics||(anim.active&&!force))return;this.views.forEach(v=>{v.gfx.destroy();v.labels.forEach(l=>l.t.destroy());});this.views.clear();this.graphics.clear();this.overlay.clear();this.labels.forEach(t=>t.destroy());this.labels=[];this.tiles.forEach(t=>t.destroy());this.tiles=[];const text=(x:number,y:number,t:string,color='#d9e6e0',size=16)=>this.labels.push(this.add.text(x,y,t,{fontFamily:'sans-serif',fontSize:size,color,stroke:'#0b1312',strokeThickness:3}).setOrigin(.5).setDepth(6));
 this.graphics.fillStyle(0x101c1b);this.graphics.fillRoundedRect(0,0,680,350,14);if(!s){this.cameras.main.setScroll(0,0);this.sprites.forEach(sp=>sp.setVisible(false));text(340,175,store.atBase?'基地：整备伙伴，准备好就出发。':'准备好以后，开始探索。','#8ba39b',20);return;}
 const g=this.geometry(s);const fog=g.dungeon;if(fog){this.graphics.fillStyle(0x101c1b);this.graphics.fillRect(0,0,g.w,g.h);}const center=(p:Pos)=>({x:g.ox+(p.x-g.minX+.5)*g.cell,y:g.oy+(p.y-g.minY+.5)*g.cell});const scale=g.cell/TILE;
 const img=(key:string,c:{x:number;y:number},alpha:number,depth:number,size=1)=>this.tiles.push(this.add.image(c.x,c.y,key).setScale(scale*size).setAlpha(alpha).setDepth(depth));
 // 7.3 floor themes: boss-marked runs use the theme tiles of the floor (moss: the original stone). A missing texture falls back to the stone tile with a theme tint.
 const theme=themeOfLevel(s.dungeon?.boss,s.dungeon?.level??1),themeCfg=THEME_FLOORS.find(t=>t.theme===theme)!;
 const tileImg=(kind:'floor'|'wall',name:string,c:{x:number;y:number},alpha:number)=>{const have=this.textures.exists(name);const im=this.add.image(c.x,c.y,have?name:kind).setScale(scale).setAlpha(alpha).setDepth(1);if(!have&&theme!=='moss')im.setTint(theme==='wet'?0x6aa8d8:0xa08c80);this.tiles.push(im);};
 const floorName=theme==='moss'?'floor':themeCfg.floorTile,wallName=theme==='moss'?'wall':themeCfg.wallTile;
 const arena=theme==='ash'&&s.rooms&&s.dungeon?.boss?(()=>{const n=farthestRoom(s.rooms,new Set(s.floor.map(key)));return n<0?null:s.rooms[n];})():null;
 const inArena=(p:Pos)=>!!arena&&p.x>=arena.x&&p.x<arena.x+arena.w&&p.y>=arena.y&&p.y<arena.y+arena.h;
 const floorKeys=new Set(s.floor.map(key)),walls=new Set<string>();for(const p of s.floor)for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const q={x:p.x+dx,y:p.y+dy};if(!floorKeys.has(key(q))&&!walls.has(key(q))){if(fog&&!s.seen.includes(key(p)))continue;walls.add(key(q));tileImg('wall',wallName,center(q),s.seen.includes(key(p))?.85:.3);}}
 for(const p of s.floor){const c=center(p),seen=s.seen.includes(key(p));if(fog&&!seen)continue;tileImg('floor',inArena(p)?ARENA_TILE:floorName,c,seen?1:.28);if(seen){const point=s.points.find(q=>same(p,q.pos));if(point&&point.kind==='rest'){this.overlay.fillStyle(0x6ec3ff,point.used?.18:.4);this.overlay.fillCircle(c.x,c.y,g.cell*.34);this.overlay.lineStyle(2,0x9fdcff,point.used?.3:1);this.overlay.strokeCircle(c.x,c.y,g.cell*.34);text(c.x,c.y,'休','#e4f4ff',16);}else if(point&&(point.kind==='shop'||point.kind==='exchange')){const col=point.kind==='shop'?0xf2b84b:0xc58bff;this.overlay.fillStyle(col,point.used?.2:.4);this.overlay.fillCircle(c.x,c.y,g.cell*.34);this.overlay.lineStyle(2,col,point.used?.3:1);this.overlay.strokeCircle(c.x,c.y,g.cell*.34);text(c.x,c.y,point.kind==='shop'?'商':'换','#fff4dc',16);}else if(point&&(point.kind==='berry'||point.kind==='tonic')){img(point.kind==='berry'?'item-berry':'item-tonic',c,point.used?.3:1,2,.8);text(c.x+g.cell*.32,c.y+g.cell*.32,point.kind==='berry'?'果':'剂','#e4efb0',11);}else if(point){const stairs=point.kind==='down'||point.kind==='up';img(point.kind==='goal'?'goal':point.kind==='item'?'item':point.kind==='down'?'stairs-down':point.kind==='up'?'stairs-up':'exit',c,point.used?.45:1,2,point.kind==='exit'||stairs?1:.8);text(c.x+g.cell*.32,c.y+g.cell*.32,point.kind==='goal'?'G':point.kind==='item'?'T':point.kind==='down'?'下':point.kind==='up'?'上':'出口','#e4efb0',11);}}if(showCoords)text(c.x-g.cell*.3,c.y+g.cell*.4,`${p.x},${p.y}`,'#8fa89c',9);}
 const shown=new Set<string>();const visible=(id:string)=>{const u=s.units[id];return u.pos&&u.hp>0&&s.seen.includes(key(u.pos))?u:null;};
 for(const id of [...s.enemies,...s.queue]){const u=visible(id);if(!u||!u.pos)continue;shown.add(id);const c=center(u.pos);
  // Shadow and leader ring live in a per-unit Graphics (local origin = cell centre, depth 3: above floor tiles and props, below sprites, highlights and labels) so animation can move them with the sprite.
  const ug=this.add.graphics().setDepth(3).setPosition(c.x,c.y);  // above floor tiles (1-2), below sprites (4)
 ug.fillStyle(0x000000,.35);ug.fillEllipse(0,g.cell*.3,g.cell*.55,g.cell*.2);if(id===s.leader){ug.lineStyle(3,0xf3d997);ug.strokeEllipse(0,g.cell*.3,g.cell*.86,g.cell*.34);}
  const foes=(u.side==='enemy'?s.queue:s.enemies).map(visible).filter((v):v is NonNullable<typeof v>=>!!v&&!!v.pos);const near=foes.sort((a,b)=>Math.abs(a.pos!.x-u.pos!.x)+Math.abs(a.pos!.y-u.pos!.y)-Math.abs(b.pos!.x-u.pos!.x)-Math.abs(b.pos!.y-u.pos!.y))[0];
  const row=near?facingRow(near.pos!.x-u.pos.x,near.pos!.y-u.pos.y):u.side==='enemy'?6:2;const dex=skinFor(id,u.side,u.species);const anim=animKey(dex,'Idle',row);
  let sp=this.sprites.get(id);if(!sp){sp=this.add.sprite(c.x,c.y,`${dex}-Idle`).setDepth(4);this.sprites.set(id,sp);}
  sp.setVisible(true).setAlpha(1).setPosition(c.x,c.y+g.cell*.08).setScale(scale*(u.boss?1.5:1)).setOrigin(.5,.6);sp.anims.timeScale=1;if(sp.anims.currentAnim?.key!==anim)sp.play(anim);
  const ut=(dx:number,dy:number,t:string,color:string)=>({t:this.add.text(c.x+dx,c.y+dy,t,{fontFamily:'sans-serif',fontSize:10,color,stroke:'#0b1312',strokeThickness:3}).setOrigin(.5).setDepth(6),dx,dy});
  // Labels sit on the shadow line at the cell's foot, clear of the sprite's head and of the corner point marks.
  this.views.set(id,{sprite:sp,gfx:ug,labels:[ut(-g.cell*.3,g.cell*.46,id,u.side==='enemy'?'#ffb4a6':'#cdeccf'),ut(g.cell*.3,g.cell*.46,`${u.hp}`,'#f0e8d0'),...(u.boss?[ut(0,-g.cell*.78,'首领','#ffd37a')]:[])],dex,row});}
 this.sprites.forEach((sp,id)=>{if(!shown.has(id))sp.setVisible(false);});this.lastGeometry=g;
 {const cam=this.cameras.main,lead=s.units[s.leader]?.pos;
  // Dungeon maps are bigger than the 680x350 view: follow the leader, clamped to the map (centred when the map is smaller).
  if(g.dungeon){const c=lead?center(lead):{x:g.w/2,y:g.h/2};const fit=(v:number,view:number,size:number)=>size<=view?(size-view)/2:Math.min(Math.max(v-view/2,0),size-view);cam.setScroll(fit(c.x,680,g.w),fit(c.y,350,g.h));}else cam.setScroll(0,0);}
 if(selectedSkill&&s.phase==='playing'&&!draft?.swap){const editor=draft?.editor??s.leader;for(const target of skillTargets(s,editor,selectedSkill)){const u=s.units[target];if(!u?.pos||!s.seen.includes(key(u.pos)))continue;const c=center(u.pos);this.overlay.lineStyle(2,0xf1d88e);this.overlay.strokeCircle(c.x,c.y,g.cell*.46);}}
 if(s.phase==='invitation'&&inviteChoice){const p=previewInvitation(s,inviteChoice);if(p.ok){const c=center(p.pos);this.overlay.lineStyle(3,0xf1d88e);this.overlay.strokeRect(c.x-g.cell/2+3,c.y-g.cell/2+3,g.cell-6,g.cell-6);}}
 }
 /** Paints the state before the round, then plays the inferred steps on top; resolves when finished, skipped or timed out. */
 animate(before:World,after:World,events:AnimEvent[]):Promise<void>{
  const p=plan(events);this.paint(before,true);const g=this.lastGeometry;
  if(!p||!g)return Promise.resolve();
  const center=(q:Pos)=>({x:g.ox+(q.x-g.minX+.5)*g.cell,y:g.oy+(q.y-g.minY+.5)*g.cell});
  const st:Stage={scene:this,views:this.views,center,cell:g.cell,scale:g.cell/TILE,temp:this.temp,f:p.scale};
  return new Promise<void>(resolve=>{
   let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);this.skipNow=null;this.tweens.killAll();this.time.removeAllEvents();this.temp.forEach(o=>o.destroy());this.temp.clear();try{this.paint(live(),true);}finally{resolve();}};
   const timer=setTimeout(finish,3000); // safety net, e.g. a hidden tab where Phaser's clock is paused
   this.skipNow=finish;
   void playEvents(st,events).then(finish,finish);
  });
 }
 skip(){this.skipNow?.();}
 /** Read-only view of what is drawn, for the browser checks: the tile textures in use, and the boss sprite's scale next to a normal unit's, with its labels. */
 debug(){const unit=(id:string)=>{const v=this.views.get(id);return v?{scale:Number(v.sprite.scaleX.toFixed(3)),labels:v.labels.map(l=>l.t.text)}:null;};return {tiles:[...new Set(this.tiles.map(t=>t.texture.key))].sort(),boss:unit('boss'),leader:unit(live()?.leader??'')};}
}
return BoardScene;
}
/** The title and save tools work without downloading Phaser. Load it once on entering play. */
async function ensureBoard():Promise<void>{
 if(boardLoading)return boardLoading;
 boardLoading=(async()=>{
  try{const {default:Phaser}=await import('phaser');
   new Phaser.Game({type:Phaser.AUTO,width:680,height:350,parent:'board',backgroundColor:'#101c1b',scene:makeBoardScene(Phaser),scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},pixelArt:true});
  }catch{notice='画面加载失败，请刷新重试。存档没有被清除。';$('message').textContent=notice;}
 })();
 return boardLoading;
}
const settings=$('settings') as HTMLDialogElement;
let transferBusy=false;
function refreshTransfer(){
 const busy=transferBusy||store.status==='saving'||anim.active;
 ($('save-export') as HTMLButtonElement).disabled=busy||!['ready','blocked'].includes(store.status);
 ($('save-import') as HTMLButtonElement).disabled=busy||store.status==='failed';
 ($('settings-close') as HTMLButtonElement).disabled=transferBusy;
 $('save-export').textContent=store.status==='blocked'?'导出原记录':'导出存档文件';
}
function openSettings(){
 if(anim.active)return;
 $('transfer-message').textContent=store.status==='blocked'?`${store.error}。请先导出原记录保留备份，再导入其他存档。`:store.status==='failed'?'当前改动尚未保存，请先重试保存。':'';
 refreshTransfer();settings.showModal();
}
bind('open-settings',openSettings);
bind('settings-close',()=>settings.close());
settings.addEventListener('cancel',e=>{if(transferBusy)e.preventDefault();});
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
  if(ok){clear();inviteChoice=undefined;inviteReject=false;detailsId=null;pinnedId=null;hoverId=null;attrib.clear();freshCount=0;purseDraft=0;askOverwrite=false;exportedOriginal=false;ngError='';screen=dev?'play':'title';
   $('transfer-message').textContent='存档已导入并保存，关闭设置后可继续游戏。';
  }else $('transfer-message').textContent=store.importError;
  render();
  const next=ok?finishing():null;if(next)await transition(store.dispatch(next));
 }catch{$('transfer-message').textContent='无法读取所选文件，请重新选择。当前存档没有改动。';}
 finally{transferBusy=false;refreshTransfer();}
});
bind('to-title',()=>{if(anim.active)return;clear();askOverwrite=false;screen='title';render();});
{const box=document.getElementById('coords-toggle') as HTMLInputElement|null;box?.addEventListener('change',()=>{showCoords=box.checked;scene?.paint(live());});}
setInterval(()=>{if(screen!=='play')portraitTick(performance.now(),animationEnabled());},80);
bind('open-fixture',()=>{const id=(document.getElementById('fixture') as HTMLSelectElement).value;window.open(`?fixture=${encodeURIComponent(id)}`,'_blank','noopener');});
document.addEventListener('keyup',e=>{if(e.key==='Shift')anim.shift=false;});
// While a round plays, every click on a control is swallowed before its own handler sees it (nothing is queued); the animation switch stays usable.
document.addEventListener('click',e=>{if(anim.active&&!(e.target as HTMLElement).closest('#anim-toggle, label:has(#anim-toggle), summary')){e.stopPropagation();e.preventDefault();}},true);
document.addEventListener('keydown',e=>{if(settings.open||screen!=='play')return;if(e.key==='Shift'){anim.shift=true;if(anim.active)scene?.skip();return;}if(e.repeat){e.preventDefault();return;}if(anim.active){if(e.key!=='Tab'&&e.key!=='F5')e.preventDefault();return;}const target=e.target as HTMLElement;if(target.matches('input,select,textarea'))return;if(e.key==='Enter'){if(target.matches('button[data-confirm]')&&!target.hasAttribute('disabled')){e.preventDefault();target.click();}else e.preventDefault();return;}if(e.key==='Escape'){if(live()?.phase==='invitation'&&inviteReject){inviteReject=false;notice='已取消拒绝，返回邀请比较。';}else{clear();notice='未执行的选择已取消。';}render();return;}const s=live();if(!s||s.phase!=='playing'||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;if(['1','2','3'].includes(e.key)&&store.status==='ready'){const id=s.queue[Number(e.key)-1];if(id){void send({type:'switch',actor:id});}return;}const directions:Record<string,Pos>={ArrowRight:{x:1,y:0},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowUp:{x:0,y:-1},d:{x:1,y:0},s:{x:0,y:1},a:{x:-1,y:0},w:{x:0,y:-1}};if(directions[e.key]){e.preventDefault();const u=s.units[draft?.editor??s.leader];if(u.pos)act({type:'move',to:plus(u.pos,directions[e.key])});}if(e.key==='.')act({type:'wait'});if(e.key.toLowerCase()==='k')document.getElementById('skill-'+s.units[draft?.editor??s.leader].learned[0])?.click();});
window.addEventListener('blur',()=>{anim.shift=false;selectedSkill=null;render();});
{const box=document.getElementById('anim-toggle') as HTMLInputElement;box.checked=animationEnabled();box.disabled=params.get('anim')!==null||!!(window as unknown as {__trialNoAnim?:boolean}).__trialNoAnim;
 box.addEventListener('change',()=>{try{window.localStorage.setItem(PREF_KEY,box.checked?'on':'off');}catch{/* preference is optional */}if(!box.checked)scene?.skip();});}
// Read-only state inspection and the same dispatch API for private browser acceptance.
Object.assign(window,{trial:{store,profile:()=>store.profile,createScenario,applyCommand,getState:()=>store.state,camera:()=>({x:scene?.cameras.main.scrollX??0,y:scene?.cameras.main.scrollY??0}),animating:()=>anim.active,view:()=>scene?.debug(),animationEnabled}});
render();void store.whenReady.then(()=>{render();const next=finishing();if(next)void transition(store.dispatch(next));});
