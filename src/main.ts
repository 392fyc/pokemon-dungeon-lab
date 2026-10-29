import Phaser from 'phaser';
import {applyCommand,previewInvitation,createMain,createExpedition,key,same,plus,clone,SPEC_SOURCE,ITEM_NAMES,PROG,type World,type Action,type Skill,type Pos,type Item,type Unit} from './core/engine.ts';
import {SPECIES,TM_MOVES,TM_NAMES} from './core/roster.ts';
import {learnTm,MAX_TEAM,type BaseAction} from './core/base.ts';
import {TrialStore,SAVE_KEY,BUILD_ID,type StoragePort} from './core/save.ts';
import {createScenario,SCENARIOS,type ScenarioId} from './core/scenarios.ts';
import './style.css';
import {preloadArt,createAnims,skinFor,facingRow,animKey,TILE} from './render/sprites.ts';
import {inferEvents,plan,type AnimEvent} from './render/animation.ts';
import {playEvents,type Stage,type UnitView} from './render/playback.ts';
const names:Record<Skill,string>={strong:'强击',line:'直线',guard:'保护',push:'推退'};
const CN:Record<string,string>={bulbasaur:'妙蛙种子',charmander:'小火龙',squirtle:'杰尼龟',pidgey:'波波',rattata:'小拉达',spearow:'烈雀',pikachu:'皮卡丘',zubat:'超音蝠',geodude:'小拳石'};
const specName=(u:Unit)=>u.species?(CN[u.species]??SPECIES[u.species]?.name??u.species):'';
const tmName=(m:string)=>TM_NAMES[m]??m;
const spName=(id:string)=>CN[id]??SPECIES[id]?.name??id;
const nextExp=(s:World)=>s.prog&&s.prog.level<PROG.maxLevel?String(PROG.thresholds[s.prog.level]):'满级';
const hints:Record<Skill,string>={strong:'相邻敌人，伤害10',line:'同排／列三格，伤害10；墙和存活单位挡线',guard:'相邻另一伙伴，本次敌方阶段首次伤害减4，不治疗',push:'相邻敌人，推出一格；后格须已见且空置，无伤害无眩晕'};
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<header><div class="brand">同行<span>FIELD TRIAL / 01</span></div><div class="build">${BUILD_ID} · 私有单层试验</div></header><main><section class="left"><div class="intro"><small>探索 · 伙伴 · 选择</small><h1>下一步，由你决定。</h1><p>完成G的记录即可结束。也可以探看后段，再决定是否带回T的成果。</p></div><div class="board-head"><span id="world-label">尚未开始</span><span id="goal-label"></span></div><div id="board"></div><div class="legend"><span><i class="friend"></i>同行</span><span><i class="enemy"></i>敌人</span><span>G 基础目标／出口</span><span>T 成果／出口</span><span>下／上 楼梯</span><span id="legend-items" hidden>果／剂 橙橙果／PP补剂 · 休 休整点（每局一次）</span><span>暗格尚未揭示</span><label><input type="checkbox" id="anim-toggle"> 动作动画（按住 Shift 跳过）</label></div><div id="message" role="status" aria-live="polite"></div><section id="flow"></section><details><summary>本轮发生了什么</summary><ol id="history"></ol></details></section><aside><section id="save" aria-live="polite"></section><section><h2>同行队列 <small>一人一次行动 → 敌方</small></h2><div id="party"></div></section><section id="controls"></section><details><summary>操作说明与试验边界</summary><p>方向键移动；点相邻敌人普攻；句点等待。普通动作合法即推进完整一轮。技能先选招再点目标。</p><p>先安排一名伙伴，再编辑主控动作并提交。切主控不改变队列。倒下退图但仍占名额。</p><p>出口使用也占一轮，敌人仍会行动。关闭不是撤离；恢复最后成功保存点。</p><p>远征模式为随机两层迷宫：走到楼梯格后点击楼梯按钮请求跨层，可返回旧层。本试验不含救援经济与永久培养（远征含本局等级）；所有数值均为人工参数。</p></details><details><summary>检查入口（隔离存储）</summary><p>检查初态不是玩家关卡，也不替换当前试验。</p><select id="fixture">${SCENARIOS.map(id=>`<option>${id}</option>`).join('')}</select><button id="open-fixture">新窗口检查</button></details><footer>规则源 ${SPEC_SOURCE.slice(0,7)}<br>几何占位 · 无账号 · 同一网页来源本地保存</footer></aside></main>`;
const params=new URLSearchParams(location.search);const fixture=params.get('fixture') as ScenarioId|null;
const checkMode=fixture!==null&&SCENARIOS.includes(fixture);
/** `?seed=<integer>` fixes the expedition seed (browser checks); otherwise every expedition draws a fresh one. */
const seedParam=params.get('seed');
const newSeed=()=>seedParam!==null&&/^\d+$/.test(seedParam)?Number(seedParam)>>>0:Math.floor(Math.random()*4294967296);
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
let inviteChoice:string|undefined,inviteReject=false,notice='',recentVisible=false,detailsId:string|null=null;
let tmPick:string|null=null;
let scene:BoardScene|null=null;
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
const resources=(s:World,id:string)=>{const u=s.units[id];return `${id} ${u.hp}/${u.maxHp}HP · ${u.learned.map(k=>`${names[k]} ${u.pp[k]??0}/${u.maxPp[k]??0}`).join(' · ')||'普攻'}`;};
function bind(id:string,fn:()=>void){const el=document.getElementById(id);if(el)el.addEventListener('click',fn);}
function clear(){draft=null;selectedSkill=null;choosingItem=null;choosingPartner=false;choosingSwap=false;confirmExit=false;}
/** A saved pending exit or pending crossing is completed once, automatically, after the save succeeded. */
const finishing=():Parameters<typeof applyCommand>[1]|null=>{const p=store.state?.phase;return store.status!=='ready'?null:p==='exit'?{type:'finishExit'}:p==='transit'?{type:'finishTransit'}:null;};
async function transition(p:Promise<unknown>,clearDraft=true){if(clearDraft)clear();render();await p;render();const next=finishing();if(next){const done=store.dispatch(next);render();await done;render();}}
async function send(command:Parameters<typeof applyCommand>[1]){if(anim.active)return;if(store.status!=='ready'){notice='保存未完成，当前只可查看或重试；本轮未执行。';render();return;}const predicted=applyCommand(live()!,command);if(!predicted.ok){notice=predicted.error;render();return;}const cancelledCombination=command.type==='switch'&&draft!==null;const before=clone(live()!);const pending=store.dispatch(command);
 let playing:Promise<void>|null=null;{const after=live();
  // Animation is presentation only: any failure here must leave the input lock released and the real state drawn.
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
 if(selectedSkill){if(target)act({type:'skill',skill:selectedSkill,target});else{notice='该招式需要存活的合法目标；本轮未执行。';render();}return;}
 if(target&&s.enemies.includes(target))act({type:'basic',target});else act({type:'move',to:p});
}
function actionLabel(a:Action|null){if(!a)return '尚未选择';if(a.type==='move')return `移动到(${a.to.x},${a.to.y})`;if(a.type==='skill')return `${names[a.skill]} → ${a.target}`;if(a.type==='basic')return `普攻 → ${a.target}`;if(a.type==='swap')return `与${a.target}换位`;if(a.type==='use')return `使用${ITEM_NAMES[a.item]} → ${a.target}`;if(a.type==='interact')return a.exit?'取得／请求撤离':'取得并继续';return '等待';}
function render(){const s=live();$('legend-items').hidden=!s?.prog;scene?.paint(s);$('world-label').textContent=s?`${checkMode?'独立检查 · ':''}第 ${s.round} 轮 · ${s.phase==='ended'?'已结束':(s.dungeon?`第${s.dungeon.level}层`:'第一层')}`:(store.atBase?'基地':'单层探索试验');$('goal-label').textContent=!s&&store.atBase?`已完成远征 ${store.profile?.expeditions??0} 次`:s?`目标 ${s.goal?'已完成':'未完成'} · 背包 ${s.bag}${s.prog?` · 本局Lv${s.prog.level} 经验${s.prog.exp}/${nextExp(s)} · 橙橙果×${s.prog.items.berry} PP补剂×${s.prog.items.tonic}`:''}`:'';
 $('message').textContent=notice;
 const saveText={empty:'尚无可恢复记录',ready:'已保存',saving:'正在保存，请稍候再关闭',failed:'最新结果未保存；关闭可能丢失本次变化',blocked:'记录无法载入，原字节已保留'}[store.status];
 $('save').innerHTML=`<div class="save-state ${store.status}">${saveText}</div><small>${esc(store.lastSaved?.replace(/^[^·]+ · /,'').replace('playing','完整轮末').replace('invitation','待邀请').replace('ended','终局').replace('exit','待撤离').replace('transit','待跨层')??'尚无成功保存点')}</small>${store.error?`<p class="error">${esc(store.error)}</p>`:''}${store.status==='failed'?button('retry','重试保存'):''}${store.status==='blocked'?button('export','导出原记录')+button('reset','导出后明确重置'):''}`;
 bind('retry',()=>void transition(store.retry()));
 bind('export',()=>{const raw=store.exportRaw();if(raw===null){notice='无法读取原记录，不能重置；请保留当前浏览器数据。';render();return;}download(raw);notice='已提供原记录下载；请确认文件已保留，再选择重置。';render();});
 bind('reset',()=>{if(window.confirm('仅在已保留导出原记录后重置。该操作将开始独立试验，是否确认？'))void transition(store.resetAfterExport(createMain(newId()),true));});
 $('history').innerHTML=s?s.log.slice(-12).map(t=>`<li>${esc(t)}</li>`).join(''):'';
 if(!s&&store.atBase){renderBase();return;}
 if(!s){$('party').innerHTML='<p class="muted">开始后显示三个实例与独立资源。</p>';$('controls').innerHTML='';$('flow').innerHTML=store.status==='empty'?`<h2>开始一份独立试验</h2><p>进度保存在此浏览器、此网页来源。首次探索无需照路线答案操作。</p><label>邀请配置 <select id="config"><option value="main-invite">固定有邀请</option><option value="main-none">无邀请对照</option><option value="expedition">远征（随机 2 层）</option></select></label>${button('start','开始探索',false,'class="primary"')}`:'';bind('start',()=>{selectedConfig=(document.getElementById('config') as HTMLSelectElement).value;void transition(store.start(checkMode?createScenario(fixture!,newId()):begin(selectedConfig)));});return;}
 const ready=store.status==='ready',playing=s.phase==='playing',editable=ready||store.status==='saving';
 $('party').innerHTML=s.queue.map((id,i)=>{const u=s.units[id];const down=u.hp===0;return `<article class="unit ${id===s.leader?'leader':''}"><div><strong>${esc(id)}</strong><span>${down?'倒下 · 仍占名额':id===s.leader?'主控':'同行'} · ${u.hp}/${u.maxHp}${u.species?` · ${esc(specName(u))}${s.prog?` Lv${s.prog.level}`:''}`:''}</span></div><div class="hp"><i style="width:${u.hp/u.maxHp*100}%"></i></div><p>${u.learned.map(k=>`${names[k]} ${u.pp[k]??0}/${u.maxPp[k]??0}`).join(' · ')||'普攻，不耗PP'}</p>${button('leader-'+i,'设为主控',!ready||!playing||down||s.leader===id)}${button('detail-'+i,'详情')}</article>`;}).join('')+(s.camp.length?`<p class="muted">此前已回营：${s.camp.map(id=>esc(resources(s,id))).join('；')}（本局不可调回）</p>`:'');
 s.queue.forEach((id,i)=>{bind('leader-'+i,()=>{void send({type:'switch',actor:id});});bind('detail-'+i,()=>{detailsId=detailsId===id?null:id;render();});});
 if(detailsId&&s.units[detailsId]){$('party').insertAdjacentHTML('beforeend',`<p class="detail">${esc(detailsId)} 已学：${s.units[detailsId].learned.map(k=>names[k]).join('、')||'无特殊招式'}。普攻6，强击10／相邻，直线10／三格且单位挡线，保护减首次伤害4，推退无伤害无眩晕。详情不改变草稿。</p>`);}
 if(s.phase==='ended'){
  const end=s.end!;$('controls').innerHTML='';$('flow').innerHTML=`<div class="result"><small>本次试验结果</small><h2>${end.outcome==='normal'?'正常撤离':'全队倒下'}</h2><p>目标${end.goal?'已完成':'未完成'} · 已取得 ${end.acquired} · 正常带出 ${end.brought}</p><p>${end.team.map(id=>`${esc(resources(s,id))}，${end.outcome==='normal'?'按名单归营':'仍同行、倒下'}`).join('；')}</p><p>此前回营：${end.camp.length?end.camp.map(id=>esc(resources(s,id))).join('；'):'无'}。资源与已学招式保留终局值，不治疗。</p><p>报酬／救援未启用。${end.outcome==='wipe'?'普通背包已取得但未带出，不进入跨局库存。':''}</p>${end.tm?`<p id="tm-line">招式机：${esc(tmName(end.tm.move))}，${end.tm.brought?'已带出，回到基地后进入仓库':'已取得、未带出，不进入仓库'}。</p>`:''}${s.scenario==='expedition'&&s.prog?button('to-base','回到基地',!ready,'class="primary"'):button('new','开始独立试验',!ready,'class="primary"')}${store.envelope?.recent?button('recent','查看最近结束记录'):''}<p class="muted">重开使用新初态，不是原局复活。终局ID ${esc(end.id)}</p>${recentVisible?`<pre>${esc(JSON.stringify(store.envelope?.recent?.end,null,2))}</pre>`:''}</div>`;
  bind('to-base',()=>{if(anim.active)return;clear();notice='';void transition(store.returnToBase());});
  bind('new',()=>{const next=checkMode?createScenario(fixture!,newId()):begin(s.scenario==='main-invite'||s.scenario==='expedition'?s.scenario:'main-none');void transition(store.newTrial(next));});bind('recent',()=>{recentVisible=!recentVisible;render();});return;
 }
 if(s.phase==='invitation'){
  $('controls').innerHTML='';const pending=s.invitations.find(i=>i.status==='pending')!;const preview=previewInvitation(s,inviteChoice);const old=inviteChoice?s.units[inviteChoice]:null;
  $('flow').innerHTML=`<h2>${esc(pending.unit.id)}想加入</h2><p>邀请处理暂停世界；新人下一轮才行动。${s.request?.locked?'本轮撤离请求已成立，先处理这份邀请。':''}</p><div class="compare"><div><strong>新人 ${esc(pending.unit.id)}${pending.unit.species?` · ${esc(specName(pending.unit))}${s.prog?` Lv${s.prog.level}`:''}`:''}</strong><p>${pending.unit.hp}/${pending.unit.maxHp}HP</p><p>${pending.unit.learned.map(k=>`${names[k]} ${pending.unit.pp[k]}/${pending.unit.maxPp[k]}`).join(' · ')}</p></div><div><strong>回营 ${esc(inviteChoice??'尚未选择')}</strong><p>${old?`${old.hp}/${old.maxHp}HP`:'满员需要选一名同行者'}</p><p>${old?old.learned.map(k=>`${names[k]} ${old.pp[k]}/${old.maxPp[k]}`).join(' · '):''}</p></div></div><div class="button-row">${s.queue.map((id,i)=>button('out-'+i,`${id}回营`,!ready,inviteChoice===id?'class="selected"':'')).join('')}${s.queue.length<3?button('out-none','补空位',!ready):''}</div><p>${preview.ok?`入场 (${preview.pos.x},${preview.pos.y}) · 队列 ${preview.queue.join(' → ')} · 主控 ${preview.leader}`:esc(preview.error)}</p><p class="muted">旧人保留培养，本局不可调回；共用背包不运输，其他人不恢复。</p>${inviteReject?`<p>将拒绝这份邀请，不会生成伙伴。</p>${button('reject-confirm','确认拒绝',!ready,'data-confirm="true"')}${button('back','返回比较')}`:button('accept','确认接受并回营',!ready||!preview.ok,'data-confirm="true" class="primary"')+button('reject','选择拒绝',!ready)}`;
  s.queue.forEach((id,i)=>bind('out-'+i,()=>{inviteChoice=id;inviteReject=false;render();}));bind('out-none',()=>{inviteChoice=undefined;render();});bind('accept',()=>void send({type:'invite',choice:'accept',outgoing:inviteChoice}));bind('reject',()=>{inviteReject=true;render();});bind('reject-confirm',()=>void send({type:'invite',choice:'reject'}));bind('back',()=>{inviteReject=false;render();});return;
 }
 if(s.phase==='exit'){$('controls').innerHTML='';$('flow').innerHTML='<p>本轮撤离请求已成立；等待保存后完成一次终局。</p>';return;}
 if(s.phase==='transit'){$('controls').innerHTML='';$('flow').innerHTML='<p>本轮跨层请求已成立；等待保存后完成一次转场。</p>';return;}
 const leaderPoint=s.points.find(p=>same(p.pos,s.units[s.leader].pos)),onStairs=leaderPoint?.kind==='down'||leaderPoint?.kind==='up';
 $('flow').innerHTML=confirmExit?`<h2>${onStairs?'本轮请求跨层？':'本轮请求撤离？'}</h2><p>消耗主控行动，敌人仍会行动。使用者轮末存活且仍在交互格才成立。</p>${button('exit-confirm',onStairs?'确认本轮跨层':'确认本轮撤离',!ready,'data-confirm="true" class="primary"')}${button('cancel-exit','继续查看')}`:'';
 bind('exit-confirm',()=>void send({type:'round',action:{type:'interact',exit:true}}));bind('cancel-exit',()=>{confirmExit=false;render();});
 const editor=draft?.editor??s.leader;const u=s.units[editor];
 const point=s.points.find(p=>same(p.pos,u.pos));const stairKind=point?.kind==='down'||point?.kind==='up';const restPoint=point?.kind==='rest';const canCollect=!!point&&!point.used&&point.kind!=='exit'&&!stairKind&&!restPoint;const pickup=point?.kind==='berry'||point?.kind==='tonic';
 let draftText='';if(draft){const valid=draft.main&&(draft.swap||draft.action)?applyCommand(s,{type:'round',action:draft.main,...(!draft.swap?{override:{actor:draft.partner,action:draft.action!}}:{})}):null;
 draftText=`<div class="draft"><strong>本轮草稿中 · 正在编辑 ${esc(editor)}</strong><p>${button('edit-main',`${s.leader}：${actionLabel(draft.main)}`,draft.swap)}${button('edit-partner',`${draft.partner}：${draft.swap?'换位（双方行动）':actionLabel(draft.action)}`,draft.swap)}</p><p>之后：敌方阶段</p>${valid&&!valid.ok?`<p class="error">${esc(valid.error)}</p>`:''}${button('submit',draft.main?.type==='interact'&&draft.main.exit?'提交整轮并请求撤离':'提交整轮',!ready||!valid?.ok,'data-confirm="true" class="primary"')}${button('cancel-draft','取消组合')}</div>`;
 }
 $('controls').innerHTML=`<h2>${draft?'组合安排':'主控行动'} <small>${esc(editor)}</small></h2>${draftText}<div class="button-row">${button('wait','等待（.）',!editable||(!ready&&!draft)||!!draft?.swap)}${button('arrange','安排伙伴',!editable||!!draft)}${button('swap','换位',!editable||!!draft)}</div>${choosingPartner||choosingSwap?`<p>选择另一名伙伴：</p>${s.queue.filter(id=>id!==s.leader&&s.units[id].hp>0).map(id=>button('partner-'+id,id,!editable)).join('')}`:''}<div class="skills">${u.learned.map(k=>button('skill-'+k,`${names[k]} ${u.pp[k]??0}/${u.maxPp[k]??0}`,!editable||(!ready&&!draft)||!!draft?.swap||(u.pp[k]??0)<1,selectedSkill===k?'class="selected"':'')).join('')}</div>${s.prog?`<div class="items"><p class="muted">背包（本局，不带出）：${ITEM_NAMES.berry}×${s.prog.items.berry}（回复${PROG.berryHeal}HP）· ${ITEM_NAMES.tonic}×${s.prog.items.tonic}（每招+${PROG.tonicPp}PP）。占该成员一次行动，对自己或相邻同行。</p>${(['berry','tonic'] as Item[]).map(k=>button('use-'+k,`使用${ITEM_NAMES[k]}`,!editable||(!ready&&!draft)||!!draft?.swap,choosingItem===k?'class="selected"':'')).join('')}${choosingItem&&u.pos?`<p>对谁使用${ITEM_NAMES[choosingItem]}？</p>${s.queue.filter(id=>s.units[id].hp>0&&s.units[id].pos&&(id===editor||Math.abs(s.units[id].pos!.x-u.pos!.x)+Math.abs(s.units[id].pos!.y-u.pos!.y)===1)).map(id=>button('item-target-'+id,id===editor?`${id}（自己）`:id,!editable)).join('')}`:''}</div>`:''}<p class="muted">${selectedSkill?`已选${names[selectedSkill]}：${hints[selectedSkill]}${s.prog&&s.prog.level>1?`（本局等级加成：伤害+${s.prog.level-1}）`:''}。耗1PP；金圈按当前计划标出合法目标。`:draft?'点地图或方向键只编辑动作，尚未执行。':'方向键移动；点相邻敌人普攻；K选技能。'}</p>${point&&editor===s.leader&&restPoint?button('rest',point.used?'休整点已使用':'整理招式补给（休整点，每局一次）',!editable||(!ready&&!draft)||!!draft?.swap||point.used):''}${point&&editor===s.leader&&!restPoint?(canCollect?button('take',pickup?`拾取${ITEM_NAMES[point!.kind as Item]}`:'取得并继续',!editable||(!ready&&!draft)||!!draft?.swap):'')+(pickup?'':button('take-exit',stairKind?(point!.kind==='down'?'走下楼梯（请求跨层）':'走上楼梯（请求跨层）'):canCollect?'取得／请求撤离':'请求撤离',!editable||(!ready&&!draft)||!!draft?.swap)):''}`;
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
 const mv=(i:typeof p.roster[number],n:string)=>i.learned.find(l=>l.move===n)!;
 $('party').innerHTML=`<h2>名册 <small>${p.roster.length}只 · 每只最多携带2招，两招行为须不同</small></h2>`+p.roster.map(i=>{const pos=p.team.indexOf(i.id);
  return `<article class="unit ${i.id===p.leader&&pos>=0?'leader':''}" id="inst-${i.id}"><div><strong>${esc(i.id)}</strong><span>${esc(spName(i.species))} · ${pos>=0?`出发第${pos+1}位${i.id===p.leader?' · 主控':''}`:'留守'}</span></div>
  <p>已学：${i.learned.map(l=>`${esc(l.move)}（${names[l.behavior]} PP${l.pp}）`).join('、')}</p>
  <p>携带：${i.carry.length?i.carry.map(n=>`${esc(n)}（${names[mv(i,n).behavior]}）`).join('、'):'无'}</p>
  <div>${i.learned.map(l=>button(`carry-${i.id}-${l.move}`,`${i.carry.includes(l.move)?'卸下':'携带'} ${esc(l.move)}`,!ready,i.carry.includes(l.move)?'class="selected"':'')).join('')}</div>
  <div>${button(`team-${i.id}`,pos>=0?'移出队伍':'加入队伍',!ready)}${button(`lead-${i.id}`,'设为主控',!ready||pos<0||i.id===p.leader)}</div></article>`;}).join('');
 const vault=TM_MOVES.map(m=>button(`tm-${m}`,`${esc(tmName(m))} ×${p.vault[m]??0}`,!ready||(p.vault[m]??0)<1,tmPick===m?'class="selected"':'')).join('');
 const learnRows=tmPick?`<p>把${esc(tmName(tmPick))}教给：</p>${p.roster.map(i=>{const r=learnTm(p,i.id,tmPick!);return button(`learn-${i.id}`,`${esc(i.id)} ${esc(spName(i.species))}：${r.ok?'可学习':esc(r.error.split('；')[0])}`,!ready);}).join('')}`:'';
 const recent=store.envelope?.recent;
 $('flow').innerHTML=`<div class="result" id="base"><small>基地</small><h2>整备后再出发</h2>
  <p>已完成远征 ${p.expeditions} 次。招式机在这里永久教给一只伙伴；换下的招式不会丢，也不会退还招式机。</p>
  <h2>仓库（招式机）</h2><div>${vault}</div>${learnRows}
  <h2>出发队伍</h2><p id="squad">${p.team.map((id,n)=>`${n+1}. ${esc(id)} ${esc(spName(p.roster.find(i=>i.id===id)!.species))}${id===p.leader?'（主控）':''}`).join(' → ')}（选择顺序即队列顺序，最多${MAX_TEAM}只）</p>
  <p class="muted">出发是免费的基本整备：全员HP、PP全满；本局等级从1开始；新的随机地图。</p>
  ${button('depart','出发',!ready,'data-confirm="true" class="primary"')}${recent?.end?button('recent','查看最近结束记录'):''}${recentVisible?`<pre>${esc(JSON.stringify(recent?.end,null,2))}</pre>`:''}</div>`;
 $('controls').innerHTML='';
 const edit=async(a:BaseAction,after?:()=>void)=>{if(anim.active||store.status!=='ready')return;const pending=store.baseAction(a);render();const r=await pending;notice=r.ok?(r.saved?'':'这次改动尚未保存；请重试保存'):r.error;if(r.ok&&r.saved)after?.();render();};
 for(const i of p.roster){
  for(const l of i.learned)bind(`carry-${i.id}-${l.move}`,()=>void edit({type:'carry',inst:i.id,moves:i.carry.includes(l.move)?i.carry.filter(n=>n!==l.move):[...i.carry,l.move]}));
  bind(`team-${i.id}`,()=>{const pos=p.team.indexOf(i.id);const team=pos>=0?p.team.filter(t=>t!==i.id):[...p.team,i.id];
   void edit({type:'team',team,leader:team.includes(p.leader)?p.leader:team[0]??p.leader});});
  bind(`lead-${i.id}`,()=>void edit({type:'team',team:p.team,leader:i.id}));
  bind(`learn-${i.id}`,()=>{const m=tmPick;if(m)void edit({type:'learn',inst:i.id,move:m},()=>{tmPick=null;});});
 }
 for(const m of TM_MOVES)bind(`tm-${m}`,()=>{tmPick=tmPick===m?null:m;notice='';render();});
 bind('recent',()=>{recentVisible=!recentVisible;render();});
 bind('depart',()=>{if(anim.active||store.status!=='ready')return;clear();tmPick=null;notice='';const pending=store.depart(newId(),newSeed());render();void pending.then(()=>{render();});});
}
function download(raw:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.download='trial-save-original.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
class BoardScene extends Phaser.Scene {
 private graphics!:Phaser.GameObjects.Graphics;private overlay!:Phaser.GameObjects.Graphics;private labels:Phaser.GameObjects.Text[]=[];private tiles:Phaser.GameObjects.Image[]=[];private sprites=new Map<string,Phaser.GameObjects.Sprite>();private views=new Map<string,UnitView>();private temp=new Set<Phaser.GameObjects.GameObject>();private skipNow:(()=>void)|null=null;private lastGeometry:ReturnType<BoardScene['geometry']>|null=null;
 constructor(){super('board');}
 preload(){preloadArt(this);}
 create(){createAnims(this);this.graphics=this.add.graphics().setDepth(0);this.overlay=this.add.graphics().setDepth(5);this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{const s=live();if(!s)return;const g=this.geometry(s);
  // worldX/worldY already include the camera scroll, so clicks stay correct while the camera follows the leader.
  const x=Math.floor((pointer.worldX-g.ox)/g.cell)+g.minX;const y=Math.floor((pointer.worldY-g.oy)/g.cell)+g.minY;clickCell({x,y});});scene=this;this.paint(live());}
 geometry(s:World){if(s.dungeon){const d=s.dungeon;return {minX:0,minY:0,cell:40,ox:0,oy:0,dungeon:true,w:d.width*40,h:d.height*40};}
  const minX=Math.min(...s.floor.map(p=>p.x)),maxX=Math.max(...s.floor.map(p=>p.x)),minY=Math.min(...s.floor.map(p=>p.y)),maxY=Math.max(...s.floor.map(p=>p.y));const cell=Math.min(66,600/(maxX-minX+1),270/(maxY-minY+1));return {minX,minY,cell,ox:(680-(maxX-minX+1)*cell)/2,oy:(350-(maxY-minY+1)*cell)/2,dungeon:false,w:680,h:350};}
 paint(s:World|null,force=false){if(!this.graphics||(anim.active&&!force))return;this.views.forEach(v=>{v.gfx.destroy();v.labels.forEach(l=>l.t.destroy());});this.views.clear();this.graphics.clear();this.overlay.clear();this.labels.forEach(t=>t.destroy());this.labels=[];this.tiles.forEach(t=>t.destroy());this.tiles=[];const text=(x:number,y:number,t:string,color='#d9e6e0',size=16)=>this.labels.push(this.add.text(x,y,t,{fontFamily:'sans-serif',fontSize:size,color,stroke:'#0b1312',strokeThickness:3}).setOrigin(.5).setDepth(6));
 this.graphics.fillStyle(0x101c1b);this.graphics.fillRoundedRect(0,0,680,350,14);if(!s){this.cameras.main.setScroll(0,0);this.sprites.forEach(sp=>sp.setVisible(false));text(340,175,store.atBase?'基地：整备伙伴，准备好就出发。':'准备好以后，开始探索。','#8ba39b',20);return;}
 const g=this.geometry(s);const fog=g.dungeon;if(fog){this.graphics.fillStyle(0x101c1b);this.graphics.fillRect(0,0,g.w,g.h);}const center=(p:Pos)=>({x:g.ox+(p.x-g.minX+.5)*g.cell,y:g.oy+(p.y-g.minY+.5)*g.cell});const scale=g.cell/TILE;
 const img=(key:string,c:{x:number;y:number},alpha:number,depth:number,size=1)=>this.tiles.push(this.add.image(c.x,c.y,key).setScale(scale*size).setAlpha(alpha).setDepth(depth));
 const floorKeys=new Set(s.floor.map(key)),walls=new Set<string>();for(const p of s.floor)for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const q={x:p.x+dx,y:p.y+dy};if(!floorKeys.has(key(q))&&!walls.has(key(q))){if(fog&&!s.seen.includes(key(p)))continue;walls.add(key(q));img('wall',center(q),s.seen.includes(key(p))?.85:.3,1);}}
 for(const p of s.floor){const c=center(p),seen=s.seen.includes(key(p));if(fog&&!seen)continue;img('floor',c,seen?1:.28,1);if(seen){const point=s.points.find(q=>same(p,q.pos));if(point&&point.kind==='rest'){this.overlay.fillStyle(0x6ec3ff,point.used?.18:.4);this.overlay.fillCircle(c.x,c.y,g.cell*.34);this.overlay.lineStyle(2,0x9fdcff,point.used?.3:1);this.overlay.strokeCircle(c.x,c.y,g.cell*.34);text(c.x,c.y,'休','#e4f4ff',16);}else if(point&&(point.kind==='berry'||point.kind==='tonic')){img(point.kind==='berry'?'item-berry':'item-tonic',c,point.used?.3:1,2,.8);text(c.x+g.cell*.32,c.y+g.cell*.32,point.kind==='berry'?'果':'剂','#e4efb0',11);}else if(point){const stairs=point.kind==='down'||point.kind==='up';img(point.kind==='goal'?'goal':point.kind==='item'?'item':point.kind==='down'?'stairs-down':point.kind==='up'?'stairs-up':'exit',c,point.used?.45:1,2,point.kind==='exit'||stairs?1:.8);text(c.x+g.cell*.32,c.y+g.cell*.32,point.kind==='goal'?'G':point.kind==='item'?'T':point.kind==='down'?'下':point.kind==='up'?'上':'出口','#e4efb0',11);}}text(c.x-g.cell*.3,c.y+g.cell*.4,`${p.x},${p.y}`,'#8fa89c',9);}
 const shown=new Set<string>();const visible=(id:string)=>{const u=s.units[id];return u.pos&&u.hp>0&&s.seen.includes(key(u.pos))?u:null;};
 for(const id of [...s.enemies,...s.queue]){const u=visible(id);if(!u||!u.pos)continue;shown.add(id);const c=center(u.pos);
  // Shadow and leader ring live in a per-unit Graphics (local origin = cell centre, depth 3: above floor tiles and props, below sprites, highlights and labels) so animation can move them with the sprite.
  const ug=this.add.graphics().setDepth(3).setPosition(c.x,c.y);  // above floor tiles (1-2), below sprites (4)
 ug.fillStyle(0x000000,.35);ug.fillEllipse(0,g.cell*.3,g.cell*.55,g.cell*.2);if(id===s.leader){ug.lineStyle(3,0xf3d997);ug.strokeEllipse(0,g.cell*.3,g.cell*.86,g.cell*.34);}
  const foes=(u.side==='enemy'?s.queue:s.enemies).map(visible).filter((v):v is NonNullable<typeof v>=>!!v&&!!v.pos);const near=foes.sort((a,b)=>Math.abs(a.pos!.x-u.pos!.x)+Math.abs(a.pos!.y-u.pos!.y)-Math.abs(b.pos!.x-u.pos!.x)-Math.abs(b.pos!.y-u.pos!.y))[0];
  const row=near?facingRow(near.pos!.x-u.pos.x,near.pos!.y-u.pos.y):u.side==='enemy'?6:2;const dex=skinFor(id,u.side,u.species);const anim=animKey(dex,'Idle',row);
  let sp=this.sprites.get(id);if(!sp){sp=this.add.sprite(c.x,c.y,`${dex}-Idle`).setDepth(4);this.sprites.set(id,sp);}
  sp.setVisible(true).setAlpha(1).setPosition(c.x,c.y+g.cell*.08).setScale(scale).setOrigin(.5,.6);sp.anims.timeScale=1;if(sp.anims.currentAnim?.key!==anim)sp.play(anim);
  const ut=(dx:number,dy:number,t:string,color:string)=>({t:this.add.text(c.x+dx,c.y+dy,t,{fontFamily:'sans-serif',fontSize:11,color,stroke:'#0b1312',strokeThickness:3}).setOrigin(.5).setDepth(6),dx,dy});
  this.views.set(id,{sprite:sp,gfx:ug,labels:[ut(-g.cell*.36,-g.cell*.4,id,u.side==='enemy'?'#ffb4a6':'#cdeccf'),ut(g.cell*.3,-g.cell*.4,`${u.hp}`,'#f0e8d0')],dex,row});}
 this.sprites.forEach((sp,id)=>{if(!shown.has(id))sp.setVisible(false);});this.lastGeometry=g;
 {const cam=this.cameras.main,lead=s.units[s.leader]?.pos;
  // Dungeon maps are bigger than the 680x350 view: follow the leader, clamped to the map (centred when the map is smaller).
  if(g.dungeon){const c=lead?center(lead):{x:g.w/2,y:g.h/2};const fit=(v:number,view:number,size:number)=>size<=view?(size-view)/2:Math.min(Math.max(v-view/2,0),size-view);cam.setScroll(fit(c.x,680,g.w),fit(c.y,350,g.h));}else cam.setScroll(0,0);}
 if(selectedSkill&&s.phase==='playing'&&!draft?.swap){const editor=draft?.editor??s.leader;for(const target of [...s.queue,...s.enemies]){const u=s.units[target];if(!u.pos||!s.seen.includes(key(u.pos)))continue;const action:Action={type:'skill',skill:selectedSkill,target};const cmd=draft&&editor!==s.leader?{type:'round' as const,action:draft.main??{type:'wait' as const},override:{actor:editor,action}}:{type:'round' as const,action,...(draft?.action?{override:{actor:draft.partner,action:draft.action}}:{})};if(applyCommand(s,cmd).ok){const c=center(u.pos);this.overlay.lineStyle(2,0xf1d88e);this.overlay.strokeCircle(c.x,c.y,g.cell*.46);}}}
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
}
try{new Phaser.Game({type:Phaser.AUTO,width:680,height:350,parent:'board',backgroundColor:'#101c1b',scene:BoardScene,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},pixelArt:true});}catch(e){notice=`画面加载失败：${String(e)}。记录未清除。`;}
bind('open-fixture',()=>{const id=(document.getElementById('fixture') as HTMLSelectElement).value;window.open(`?fixture=${encodeURIComponent(id)}`,'_blank','noopener');});
document.addEventListener('keyup',e=>{if(e.key==='Shift')anim.shift=false;});
// While a round plays, every click on a control is swallowed before its own handler sees it (nothing is queued); the animation switch stays usable.
document.addEventListener('click',e=>{if(anim.active&&!(e.target as HTMLElement).closest('#anim-toggle, label:has(#anim-toggle), summary')){e.stopPropagation();e.preventDefault();}},true);
document.addEventListener('keydown',e=>{if(e.key==='Shift'){anim.shift=true;if(anim.active)scene?.skip();return;}if(e.repeat){e.preventDefault();return;}if(anim.active){if(e.key!=='Tab'&&e.key!=='F5')e.preventDefault();return;}const target=e.target as HTMLElement;if(target.matches('input,select,textarea'))return;if(e.key==='Enter'){if(target.matches('button[data-confirm]')&&!target.hasAttribute('disabled')){e.preventDefault();target.click();}else e.preventDefault();return;}if(e.key==='Escape'){if(live()?.phase==='invitation'&&inviteReject){inviteReject=false;notice='已取消拒绝，返回邀请比较。';}else{clear();notice='未执行的选择已取消。';}render();return;}const s=live();if(!s||s.phase!=='playing'||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;if(['1','2','3'].includes(e.key)&&store.status==='ready'){const id=s.queue[Number(e.key)-1];if(id){void send({type:'switch',actor:id});}return;}const directions:Record<string,Pos>={ArrowRight:{x:1,y:0},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowUp:{x:0,y:-1},d:{x:1,y:0},s:{x:0,y:1},a:{x:-1,y:0},w:{x:0,y:-1}};if(directions[e.key]){e.preventDefault();const u=s.units[draft?.editor??s.leader];if(u.pos)act({type:'move',to:plus(u.pos,directions[e.key])});}if(e.key==='.')act({type:'wait'});if(e.key.toLowerCase()==='k')document.getElementById('skill-'+s.units[draft?.editor??s.leader].learned[0])?.click();});
window.addEventListener('blur',()=>{anim.shift=false;selectedSkill=null;render();});
{const box=document.getElementById('anim-toggle') as HTMLInputElement;box.checked=animationEnabled();box.disabled=params.get('anim')!==null||!!(window as unknown as {__trialNoAnim?:boolean}).__trialNoAnim;
 box.addEventListener('change',()=>{try{window.localStorage.setItem(PREF_KEY,box.checked?'on':'off');}catch{/* preference is optional */}if(!box.checked)scene?.skip();});}
// Read-only state inspection and the same dispatch API for private browser acceptance.
Object.assign(window,{trial:{store,profile:()=>store.profile,createScenario,applyCommand,getState:()=>store.state,camera:()=>({x:scene?.cameras.main.scrollX??0,y:scene?.cameras.main.scrollY??0}),animating:()=>anim.active,animationEnabled}});
render();{const next=finishing();if(next)void transition(store.dispatch(next));}
