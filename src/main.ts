import Phaser from 'phaser';
import {applyCommand,previewInvitation,createMain,key,same,plus,clone,SPEC_SOURCE,type World,type Action,type Skill,type Pos} from './core/engine.ts';
import {TrialStore,SAVE_KEY,BUILD_ID,type StoragePort} from './core/save.ts';
import {createScenario,SCENARIOS,type ScenarioId} from './core/scenarios.ts';
import './style.css';
import {preloadArt,createAnims,skinFor,facingRow,animKey,TILE} from './render/sprites.ts';
const names:Record<Skill,string>={strong:'强击',line:'直线',guard:'保护',push:'推退'};
const hints:Record<Skill,string>={strong:'相邻敌人，伤害10',line:'同排／列三格，伤害10；墙和存活单位挡线',guard:'相邻另一伙伴，本次敌方阶段首次伤害减4，不治疗',push:'相邻敌人，推出一格；后格须已见且空置，无伤害无眩晕'};
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<header><div class="brand">同行<span>FIELD TRIAL / 01</span></div><div class="build">${BUILD_ID} · 私有单层试验</div></header><main><section class="left"><div class="intro"><small>探索 · 伙伴 · 选择</small><h1>下一步，由你决定。</h1><p>完成G的记录即可结束。也可以探看后段，再决定是否带回T的成果。</p></div><div class="board-head"><span id="world-label">尚未开始</span><span id="goal-label"></span></div><div id="board"></div><div class="legend"><span><i class="friend"></i>同行</span><span><i class="enemy"></i>敌人</span><span>G 基础目标／出口</span><span>T 成果／出口</span><span>暗格尚未揭示</span></div><div id="message" role="status" aria-live="polite"></div><section id="flow"></section><details><summary>本轮发生了什么</summary><ol id="history"></ol></details></section><aside><section id="save" aria-live="polite"></section><section><h2>同行队列 <small>一人一次行动 → 敌方</small></h2><div id="party"></div></section><section id="controls"></section><details><summary>操作说明与试验边界</summary><p>方向键移动；点相邻敌人普攻；句点等待。普通动作合法即推进完整一轮。技能先选招再点目标。</p><p>先安排一名伙伴，再编辑主控动作并提交。切主控不改变队列。倒下退图但仍占名额。</p><p>出口使用也占一轮，敌人仍会行动。关闭不是撤离；恢复最后成功保存点。</p><p>本试验不含救援经济、培养、跨层或真实角色素材。所有数据均为人工参数。</p></details><details><summary>检查入口（隔离存储）</summary><p>检查初态不是玩家关卡，也不替换当前试验。</p><select id="fixture">${SCENARIOS.map(id=>`<option>${id}</option>`).join('')}</select><button id="open-fixture">新窗口检查</button></details><footer>规则源 ${SPEC_SOURCE.slice(0,7)}<br>几何占位 · 无账号 · 同一网页来源本地保存</footer></aside></main>`;
const params=new URLSearchParams(location.search);const fixture=params.get('fixture') as ScenarioId|null;
const checkMode=fixture!==null&&SCENARIOS.includes(fixture);
const newId=()=>crypto.randomUUID();
let port:StoragePort;
try{port=window.localStorage;}catch{port={getItem(){throw Error('浏览器拒绝读取本地存储');},setItem(){throw Error('浏览器拒绝本地存储');}};}
// Browser diagnostics use the public controller; production storage is never replaced by fixtures.
const store=new TrialStore(port,checkMode?`dungeon-trial.check.${fixture}`:SAVE_KEY);
let selectedConfig='main-invite';
let draft:{partner:string;action:Action|null;main:Action|null;editor:string;swap:boolean}|null=null;
let selectedSkill:Skill|null=null, choosingPartner=false,choosingSwap=false,confirmExit=false;
let inviteChoice:string|undefined,inviteReject=false,notice='',recentVisible=false,detailsId:string|null=null;
let scene:BoardScene|null=null;
const $=(id:string)=>document.getElementById(id)!;
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const button=(id:string,label:string,disabled=false,extra='')=>`<button id="${id}" ${disabled?'disabled':''} ${extra}>${label}</button>`;
const live=()=>store.state;
const resources=(s:World,id:string)=>{const u=s.units[id];return `${id} ${u.hp}/${u.maxHp}HP · ${u.learned.map(k=>`${names[k]} ${u.pp[k]??0}/${u.maxPp[k]??0}`).join(' · ')||'普攻'}`;};
function bind(id:string,fn:()=>void){const el=document.getElementById(id);if(el)el.addEventListener('click',fn);}
function clear(){draft=null;selectedSkill=null;choosingPartner=false;choosingSwap=false;confirmExit=false;}
async function transition(p:Promise<unknown>,clearDraft=true){if(clearDraft)clear();render();await p;render();if(store.status==='ready'&&store.state?.phase==='exit'){const done=store.dispatch({type:'finishExit'});render();await done;render();}}
async function send(command:Parameters<typeof applyCommand>[1]){if(store.status!=='ready'){notice='保存未完成，当前只可查看或重试；本轮未执行。';render();return;}const predicted=applyCommand(live()!,command);if(!predicted.ok){notice=predicted.error;render();return;}const cancelledCombination=command.type==='switch'&&draft!==null;const pending=store.dispatch(command);clear();notice=cancelledCombination?'组合已取消。':'';if(command.type==='invite'){inviteChoice=undefined;inviteReject=false;}render();const r=await pending;if(!r.ok)notice=r.error;render();if(store.status==='ready'&&store.state?.phase==='exit')await transition(store.dispatch({type:'finishExit'}));}
function act(action:Action){if(!live()||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;
 selectedSkill=null;
 if(draft?.swap){notice='换位已占双方动作卡；要改成其他动作，请先取消组合。';render();return;}
 if(draft){if(draft.editor===live()!.leader)draft.main=action;else draft.action=action;render();return;}
 if(action.type==='interact'&&action.exit){confirmExit=true;render();return;}
 void send({type:'round',action});
}
function clickCell(p:Pos){const s=live();if(!s||s.phase!=='playing'||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;
 const id=draft?.editor??s.leader;const target=[...s.queue,...s.enemies].find(i=>s.units[i].hp>0&&same(s.units[i].pos,p)&&s.seen.includes(key(p)));
 if(selectedSkill){if(target)act({type:'skill',skill:selectedSkill,target});else{notice='该招式需要存活的合法目标；本轮未执行。';render();}return;}
 if(target&&s.enemies.includes(target))act({type:'basic',target});else act({type:'move',to:p});
}
function actionLabel(a:Action|null){if(!a)return '尚未选择';if(a.type==='move')return `移动到(${a.to.x},${a.to.y})`;if(a.type==='skill')return `${names[a.skill]} → ${a.target}`;if(a.type==='basic')return `普攻 → ${a.target}`;if(a.type==='swap')return `与${a.target}换位`;if(a.type==='interact')return a.exit?'取得／请求撤离':'取得并继续';return '等待';}
function render(){const s=live();scene?.paint(s);$('world-label').textContent=s?`${checkMode?'独立检查 · ':''}第 ${s.round} 轮 · ${s.phase==='ended'?'已结束':'第一层'}`:'单层探索试验';$('goal-label').textContent=s?`目标 ${s.goal?'已完成':'未完成'} · 背包 ${s.bag}`:'';
 $('message').textContent=notice;
 const saveText={empty:'尚无可恢复记录',ready:'已保存',saving:'正在保存，请稍候再关闭',failed:'最新结果未保存；关闭可能丢失本次变化',blocked:'记录无法载入，原字节已保留'}[store.status];
 $('save').innerHTML=`<div class="save-state ${store.status}">${saveText}</div><small>${esc(store.lastSaved?.replace(/^[^·]+ · /,'').replace('playing','完整轮末').replace('invitation','待邀请').replace('ended','终局').replace('exit','待撤离')??'尚无成功保存点')}</small>${store.error?`<p class="error">${esc(store.error)}</p>`:''}${store.status==='failed'?button('retry','重试保存'):''}${store.status==='blocked'?button('export','导出原记录')+button('reset','导出后明确重置'):''}`;
 bind('retry',()=>void transition(store.retry()));
 bind('export',()=>{const raw=store.exportRaw();if(raw===null){notice='无法读取原记录，不能重置；请保留当前浏览器数据。';render();return;}download(raw);notice='已提供原记录下载；请确认文件已保留，再选择重置。';render();});
 bind('reset',()=>{if(window.confirm('仅在已保留导出原记录后重置。该操作将开始独立试验，是否确认？'))void transition(store.resetAfterExport(createMain(newId()),true));});
 $('history').innerHTML=s?s.log.slice(-12).map(t=>`<li>${esc(t)}</li>`).join(''):'';
 if(!s){$('party').innerHTML='<p class="muted">开始后显示三个实例与独立资源。</p>';$('controls').innerHTML='';$('flow').innerHTML=store.status==='empty'?`<h2>开始一份独立试验</h2><p>进度保存在此浏览器、此网页来源。首次探索无需照路线答案操作。</p><label>邀请配置 <select id="config"><option value="main-invite">固定有邀请</option><option value="main-none">无邀请对照</option></select></label>${button('start','开始探索',false,'class="primary"')}`:'';bind('start',()=>{selectedConfig=(document.getElementById('config') as HTMLSelectElement).value;void transition(store.start(checkMode?createScenario(fixture!,newId()):createMain(newId(),selectedConfig==='main-invite')));});return;}
 const ready=store.status==='ready',playing=s.phase==='playing',editable=ready||store.status==='saving';
 $('party').innerHTML=s.queue.map((id,i)=>{const u=s.units[id];const down=u.hp===0;return `<article class="unit ${id===s.leader?'leader':''}"><div><strong>${esc(id)}</strong><span>${down?'倒下 · 仍占名额':id===s.leader?'主控':'同行'} · ${u.hp}/${u.maxHp}</span></div><div class="hp"><i style="width:${u.hp/u.maxHp*100}%"></i></div><p>${u.learned.map(k=>`${names[k]} ${u.pp[k]??0}/${u.maxPp[k]??0}`).join(' · ')||'普攻，不耗PP'}</p>${button('leader-'+i,'设为主控',!ready||!playing||down||s.leader===id)}${button('detail-'+i,'详情')}</article>`;}).join('')+(s.camp.length?`<p class="muted">此前已回营：${s.camp.map(id=>esc(resources(s,id))).join('；')}（本局不可调回）</p>`:'');
 s.queue.forEach((id,i)=>{bind('leader-'+i,()=>{void send({type:'switch',actor:id});});bind('detail-'+i,()=>{detailsId=detailsId===id?null:id;render();});});
 if(detailsId&&s.units[detailsId]){$('party').insertAdjacentHTML('beforeend',`<p class="detail">${esc(detailsId)} 已学：${s.units[detailsId].learned.map(k=>names[k]).join('、')||'无特殊招式'}。普攻6，强击10／相邻，直线10／三格且单位挡线，保护减首次伤害4，推退无伤害无眩晕。详情不改变草稿。</p>`);}
 if(s.phase==='ended'){
  const end=s.end!;$('controls').innerHTML='';$('flow').innerHTML=`<div class="result"><small>本次试验结果</small><h2>${end.outcome==='normal'?'正常撤离':'全队倒下'}</h2><p>目标${end.goal?'已完成':'未完成'} · 已取得 ${end.acquired} · 正常带出 ${end.brought}</p><p>${end.team.map(id=>`${esc(resources(s,id))}，${end.outcome==='normal'?'按名单归营':'仍同行、倒下'}`).join('；')}</p><p>此前回营：${end.camp.length?end.camp.map(id=>esc(resources(s,id))).join('；'):'无'}。资源与已学招式保留终局值，不治疗。</p><p>报酬／救援未启用。${end.outcome==='wipe'?'普通背包已取得但未带出，不进入跨局库存。':''}</p>${button('new','开始独立试验',!ready,'class="primary"')}${store.envelope?.recent?button('recent','查看最近结束记录'):''}<p class="muted">重开使用新初态，不是原局复活。终局ID ${esc(end.id)}</p>${recentVisible?`<pre>${esc(JSON.stringify(store.envelope?.recent?.end,null,2))}</pre>`:''}</div>`;
  bind('new',()=>{const next=checkMode?createScenario(fixture!,newId()):createMain(newId(),s.scenario==='main-invite');void transition(store.newTrial(next));});bind('recent',()=>{recentVisible=!recentVisible;render();});return;
 }
 if(s.phase==='invitation'){
  $('controls').innerHTML='';const pending=s.invitations.find(i=>i.status==='pending')!;const preview=previewInvitation(s,inviteChoice);const old=inviteChoice?s.units[inviteChoice]:null;
  $('flow').innerHTML=`<h2>${esc(pending.unit.id)}想加入</h2><p>邀请处理暂停世界；新人下一轮才行动。${s.request?.locked?'本轮撤离请求已成立，先处理这份邀请。':''}</p><div class="compare"><div><strong>新人 ${esc(pending.unit.id)}</strong><p>${pending.unit.hp}/${pending.unit.maxHp}HP</p><p>${pending.unit.learned.map(k=>`${names[k]} ${pending.unit.pp[k]}/${pending.unit.maxPp[k]}`).join(' · ')}</p></div><div><strong>回营 ${esc(inviteChoice??'尚未选择')}</strong><p>${old?`${old.hp}/${old.maxHp}HP`:'满员需要选一名同行者'}</p><p>${old?old.learned.map(k=>`${names[k]} ${old.pp[k]}/${old.maxPp[k]}`).join(' · '):''}</p></div></div><div class="button-row">${s.queue.map((id,i)=>button('out-'+i,`${id}回营`,!ready,inviteChoice===id?'class="selected"':'')).join('')}${s.queue.length<3?button('out-none','补空位',!ready):''}</div><p>${preview.ok?`入场 (${preview.pos.x},${preview.pos.y}) · 队列 ${preview.queue.join(' → ')} · 主控 ${preview.leader}`:esc(preview.error)}</p><p class="muted">旧人保留培养，本局不可调回；共用背包不运输，其他人不恢复。</p>${inviteReject?`<p>将拒绝这份邀请，不会生成伙伴。</p>${button('reject-confirm','确认拒绝',!ready,'data-confirm="true"')}${button('back','返回比较')}`:button('accept','确认接受并回营',!ready||!preview.ok,'data-confirm="true" class="primary"')+button('reject','选择拒绝',!ready)}`;
  s.queue.forEach((id,i)=>bind('out-'+i,()=>{inviteChoice=id;inviteReject=false;render();}));bind('out-none',()=>{inviteChoice=undefined;render();});bind('accept',()=>void send({type:'invite',choice:'accept',outgoing:inviteChoice}));bind('reject',()=>{inviteReject=true;render();});bind('reject-confirm',()=>void send({type:'invite',choice:'reject'}));bind('back',()=>{inviteReject=false;render();});return;
 }
 if(s.phase==='exit'){$('controls').innerHTML='';$('flow').innerHTML='<p>本轮撤离请求已成立；等待保存后完成一次终局。</p>';return;}
 $('flow').innerHTML=confirmExit?`<h2>本轮请求撤离？</h2><p>消耗主控行动，敌人仍会行动。使用者轮末存活且仍在交互格才成立。</p>${button('exit-confirm','确认本轮撤离',!ready,'data-confirm="true" class="primary"')}${button('cancel-exit','继续查看')}`:'';
 bind('exit-confirm',()=>void send({type:'round',action:{type:'interact',exit:true}}));bind('cancel-exit',()=>{confirmExit=false;render();});
 const editor=draft?.editor??s.leader;const u=s.units[editor];
 const point=s.points.find(p=>same(p.pos,u.pos));const canCollect=!!point&&!point.used&&point.kind!=='exit';
 let draftText='';if(draft){const valid=draft.main&&(draft.swap||draft.action)?applyCommand(s,{type:'round',action:draft.main,...(!draft.swap?{override:{actor:draft.partner,action:draft.action!}}:{})}):null;
 draftText=`<div class="draft"><strong>本轮草稿中 · 正在编辑 ${esc(editor)}</strong><p>${button('edit-main',`${s.leader}：${actionLabel(draft.main)}`,draft.swap)}${button('edit-partner',`${draft.partner}：${draft.swap?'换位（双方行动）':actionLabel(draft.action)}`,draft.swap)}</p><p>之后：敌方阶段</p>${valid&&!valid.ok?`<p class="error">${esc(valid.error)}</p>`:''}${button('submit',draft.main?.type==='interact'&&draft.main.exit?'提交整轮并请求撤离':'提交整轮',!ready||!valid?.ok,'data-confirm="true" class="primary"')}${button('cancel-draft','取消组合')}</div>`;
 }
 $('controls').innerHTML=`<h2>${draft?'组合安排':'主控行动'} <small>${esc(editor)}</small></h2>${draftText}<div class="button-row">${button('wait','等待（.）',!editable||(!ready&&!draft)||!!draft?.swap)}${button('arrange','安排伙伴',!editable||!!draft)}${button('swap','换位',!editable||!!draft)}</div>${choosingPartner||choosingSwap?`<p>选择另一名伙伴：</p>${s.queue.filter(id=>id!==s.leader&&s.units[id].hp>0).map(id=>button('partner-'+id,id,!editable)).join('')}`:''}<div class="skills">${u.learned.map(k=>button('skill-'+k,`${names[k]} ${u.pp[k]??0}/${u.maxPp[k]??0}`,!editable||(!ready&&!draft)||!!draft?.swap||(u.pp[k]??0)<1,selectedSkill===k?'class="selected"':'')).join('')}</div><p class="muted">${selectedSkill?`已选${names[selectedSkill]}：${hints[selectedSkill]}。耗1PP；金圈按当前计划标出合法目标。`:draft?'点地图或方向键只编辑动作，尚未执行。':'方向键移动；点相邻敌人普攻；K选技能。'}</p>${point&&editor===s.leader?(canCollect?button('take','取得并继续',!editable||(!ready&&!draft)||!!draft?.swap):'')+button('take-exit',canCollect?'取得／请求撤离':'请求撤离',!editable||(!ready&&!draft)||!!draft?.swap):''}`;
 bind('wait',()=>act({type:'wait'}));bind('arrange',()=>{choosingPartner=true;choosingSwap=false;selectedSkill=null;render();});bind('swap',()=>{choosingSwap=true;choosingPartner=false;selectedSkill=null;render();});
 for(const id of s.queue.filter(id=>id!==s.leader))bind('partner-'+id,()=>{const swap=choosingSwap;draft={partner:id,action:null,main:swap?{type:'swap',target:id}:null,editor:swap?s.leader:id,swap};choosingPartner=false;choosingSwap=false;render();});
 u.learned.forEach(k=>bind('skill-'+k,()=>{selectedSkill=k;render();}));bind('take',()=>act({type:'interact',exit:false}));bind('take-exit',()=>act({type:'interact',exit:true}));bind('edit-main',()=>{if(draft){draft.editor=s.leader;selectedSkill=null;render();}});bind('edit-partner',()=>{if(draft){draft.editor=draft.partner;selectedSkill=null;render();}});bind('cancel-draft',()=>{clear();render();});
 bind('submit',()=>{if(draft?.main){const cmd={type:'round' as const,action:draft.main,...(!draft.swap?{override:{actor:draft.partner,action:draft.action!}}:{})};void send(cmd);}});
}
function download(raw:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.download='trial-save-original.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
class BoardScene extends Phaser.Scene {
 private graphics!:Phaser.GameObjects.Graphics;private overlay!:Phaser.GameObjects.Graphics;private labels:Phaser.GameObjects.Text[]=[];private tiles:Phaser.GameObjects.Image[]=[];private sprites=new Map<string,Phaser.GameObjects.Sprite>();
 constructor(){super('board');}
 preload(){preloadArt(this);}
 create(){createAnims(this);this.graphics=this.add.graphics().setDepth(0);this.overlay=this.add.graphics().setDepth(5);this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{const s=live();if(!s)return;const g=this.geometry(s);const x=Math.floor((pointer.x-g.ox)/g.cell)+g.minX;const y=Math.floor((pointer.y-g.oy)/g.cell)+g.minY;clickCell({x,y});});scene=this;this.paint(live());}
 geometry(s:World){const minX=Math.min(...s.floor.map(p=>p.x)),maxX=Math.max(...s.floor.map(p=>p.x)),minY=Math.min(...s.floor.map(p=>p.y)),maxY=Math.max(...s.floor.map(p=>p.y));const cell=Math.min(66,600/(maxX-minX+1),270/(maxY-minY+1));return {minX,minY,cell,ox:(680-(maxX-minX+1)*cell)/2,oy:(350-(maxY-minY+1)*cell)/2};}
 paint(s:World|null){if(!this.graphics)return;this.graphics.clear();this.overlay.clear();this.labels.forEach(t=>t.destroy());this.labels=[];this.tiles.forEach(t=>t.destroy());this.tiles=[];const text=(x:number,y:number,t:string,color='#d9e6e0',size=16)=>this.labels.push(this.add.text(x,y,t,{fontFamily:'sans-serif',fontSize:size,color,stroke:'#0b1312',strokeThickness:3}).setOrigin(.5).setDepth(6));
 this.graphics.fillStyle(0x101c1b);this.graphics.fillRoundedRect(0,0,680,350,14);if(!s){this.sprites.forEach(sp=>sp.setVisible(false));text(340,175,'准备好以后，开始探索。','#8ba39b',20);return;}
 const g=this.geometry(s);const center=(p:Pos)=>({x:g.ox+(p.x-g.minX+.5)*g.cell,y:g.oy+(p.y-g.minY+.5)*g.cell});const scale=g.cell/TILE;
 const img=(key:string,c:{x:number;y:number},alpha:number,depth:number,size=1)=>this.tiles.push(this.add.image(c.x,c.y,key).setScale(scale*size).setAlpha(alpha).setDepth(depth));
 const floorKeys=new Set(s.floor.map(key)),walls=new Set<string>();for(const p of s.floor)for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const q={x:p.x+dx,y:p.y+dy};if(!floorKeys.has(key(q))&&!walls.has(key(q))){walls.add(key(q));img('wall',center(q),s.seen.includes(key(p))?.85:.3,1);}}
 for(const p of s.floor){const c=center(p),seen=s.seen.includes(key(p));img('floor',c,seen?1:.28,1);if(seen){const point=s.points.find(q=>same(p,q.pos));if(point){img(point.kind==='goal'?'goal':point.kind==='item'?'item':'exit',c,point.used?.45:1,2,point.kind==='exit'?1:.8);text(c.x+g.cell*.32,c.y+g.cell*.32,point.kind==='goal'?'G':point.kind==='item'?'T':'出口','#e4efb0',11);}}text(c.x-g.cell*.3,c.y+g.cell*.4,`${p.x},${p.y}`,'#8fa89c',9);}
 const shown=new Set<string>();const visible=(id:string)=>{const u=s.units[id];return u.pos&&u.hp>0&&s.seen.includes(key(u.pos))?u:null;};
 for(const id of [...s.enemies,...s.queue]){const u=visible(id);if(!u||!u.pos)continue;shown.add(id);const c=center(u.pos);
  this.graphics.fillStyle(0x000000,.35);this.graphics.fillEllipse(c.x,c.y+g.cell*.3,g.cell*.55,g.cell*.2);if(id===s.leader){this.graphics.lineStyle(3,0xf3d997);this.graphics.strokeEllipse(c.x,c.y+g.cell*.3,g.cell*.86,g.cell*.34);}
  const foes=(u.side==='enemy'?s.queue:s.enemies).map(visible).filter((v):v is NonNullable<typeof v>=>!!v&&!!v.pos);const near=foes.sort((a,b)=>Math.abs(a.pos!.x-u.pos!.x)+Math.abs(a.pos!.y-u.pos!.y)-Math.abs(b.pos!.x-u.pos!.x)-Math.abs(b.pos!.y-u.pos!.y))[0];
  const row=near?facingRow(near.pos!.x-u.pos.x,near.pos!.y-u.pos.y):u.side==='enemy'?6:2;const dex=skinFor(id,u.side);const anim=animKey(dex,'Idle',row);
  let sp=this.sprites.get(id);if(!sp){sp=this.add.sprite(c.x,c.y,`${dex}-Idle`).setDepth(4);this.sprites.set(id,sp);}
  sp.setVisible(true).setPosition(c.x,c.y+g.cell*.08).setScale(scale).setOrigin(.5,.6);if(sp.anims.currentAnim?.key!==anim)sp.play(anim);
  text(c.x-g.cell*.36,c.y-g.cell*.4,id,u.side==='enemy'?'#ffb4a6':'#cdeccf',11);text(c.x+g.cell*.3,c.y-g.cell*.4,`${u.hp}`,'#f0e8d0',11);}
 this.sprites.forEach((sp,id)=>{if(!shown.has(id))sp.setVisible(false);});
 if(selectedSkill&&s.phase==='playing'&&!draft?.swap){const editor=draft?.editor??s.leader;for(const target of [...s.queue,...s.enemies]){const u=s.units[target];if(!u.pos||!s.seen.includes(key(u.pos)))continue;const action:Action={type:'skill',skill:selectedSkill,target};const cmd=draft&&editor!==s.leader?{type:'round' as const,action:draft.main??{type:'wait' as const},override:{actor:editor,action}}:{type:'round' as const,action,...(draft?.action?{override:{actor:draft.partner,action:draft.action}}:{})};if(applyCommand(s,cmd).ok){const c=center(u.pos);this.overlay.lineStyle(2,0xf1d88e);this.overlay.strokeCircle(c.x,c.y,g.cell*.46);}}}
 if(s.phase==='invitation'&&inviteChoice){const p=previewInvitation(s,inviteChoice);if(p.ok){const c=center(p.pos);this.overlay.lineStyle(3,0xf1d88e);this.overlay.strokeRect(c.x-g.cell/2+3,c.y-g.cell/2+3,g.cell-6,g.cell-6);}}
 }
}
try{new Phaser.Game({type:Phaser.AUTO,width:680,height:350,parent:'board',backgroundColor:'#101c1b',scene:BoardScene,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},pixelArt:true});}catch(e){notice=`画面加载失败：${String(e)}。记录未清除。`;}
bind('open-fixture',()=>{const id=(document.getElementById('fixture') as HTMLSelectElement).value;window.open(`?fixture=${encodeURIComponent(id)}`,'_blank','noopener');});
document.addEventListener('keydown',e=>{if(e.repeat){e.preventDefault();return;}const target=e.target as HTMLElement;if(target.matches('input,select,textarea'))return;if(e.key==='Enter'){if(target.matches('button[data-confirm]')&&!target.hasAttribute('disabled')){e.preventDefault();target.click();}else e.preventDefault();return;}if(e.key==='Escape'){if(live()?.phase==='invitation'&&inviteReject){inviteReject=false;notice='已取消拒绝，返回邀请比较。';}else{clear();notice='未执行的选择已取消。';}render();return;}const s=live();if(!s||s.phase!=='playing'||(store.status!=='ready'&&!(draft&&store.status==='saving')))return;if(['1','2','3'].includes(e.key)&&store.status==='ready'){const id=s.queue[Number(e.key)-1];if(id){void send({type:'switch',actor:id});}return;}const directions:Record<string,Pos>={ArrowRight:{x:1,y:0},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowUp:{x:0,y:-1},d:{x:1,y:0},s:{x:0,y:1},a:{x:-1,y:0},w:{x:0,y:-1}};if(directions[e.key]){e.preventDefault();const u=s.units[draft?.editor??s.leader];if(u.pos)act({type:'move',to:plus(u.pos,directions[e.key])});}if(e.key==='.')act({type:'wait'});if(e.key.toLowerCase()==='k')document.getElementById('skill-'+s.units[draft?.editor??s.leader].learned[0])?.click();});
window.addEventListener('blur',()=>{selectedSkill=null;render();});
// Read-only state inspection and the same dispatch API for private browser acceptance.
Object.assign(window,{trial:{store,createScenario,applyCommand,getState:()=>store.state}});
render();if(store.status==='ready'&&store.state?.phase==='exit')void transition(store.dispatch({type:'finishExit'}));
