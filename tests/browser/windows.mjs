import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {channel:'msedge'}),headless:true});
const results=[];
const base=process.env.TRIAL_URL;
if(!base) throw Error('Set TRIAL_URL to the local running trial.');
const artifact='.artifacts/trial/';
async function setup(fixture,mode='pass',animate=false){
 const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
 // Stage 6.4: the 22 existing checks run with animations off; only the animation check turns them on.
 await context.addInitScript(({animate})=>{if(!animate)window.__trialNoAnim=true;},{animate});
 await context.addInitScript(({mode})=>{
  const original=Storage.prototype.setItem;
  window.__fault={mode,pending:[],writes:[]};
  Storage.prototype.setItem=function(k,v){
   if(!k.startsWith('dungeon-trial.'))return original.call(this,k,v);
   window.__fault.writes.push({key:k,value:v});
   if(window.__fault.mode==='fail')throw new DOMException('Injected disk quota failure','QuotaExceededError');
   if(window.__fault.mode==='pending')return new Promise((resolve,reject)=>window.__fault.pending.push({release:()=>{original.call(this,k,v);resolve();},reject:()=>reject(Error('Injected write failure'))}));
   return original.call(this,k,v);
  };
 },{mode});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+(fixture?'?fixture='+fixture:'?dev=1'));await page.locator('#start').waitFor();
 return {context,page,errors};
}
const ready=p=>p.waitForFunction(()=>window.trial?.store.status==='ready');
const state=p=>p.evaluate(()=>window.trial.getState());
const raw=p=>p.evaluate(()=>localStorage.getItem(window.trial.store.key));
async function start(p){await p.locator('#start').click();await ready(p);}
async function key(p,k){await p.keyboard.press(k);await ready(p);}
async function click(p,id){await p.locator('#'+id).click();await ready(p);}
async function cell(p,x,y){
 const s=await state(p),b=await p.locator('canvas').boundingBox();
 if(s.dungeon){ // expedition: fixed 40 px cells, camera follows the leader
  const cam=await p.evaluate(()=>window.trial.camera());
  await p.mouse.click(b.x+(x*40+20-cam.x)*b.width/680,b.y+(y*40+20-cam.y)*b.height/350);await ready(p);return;
 }
 const xs=s.floor.map(q=>q.x),ys=s.floor.map(q=>q.y),minX=Math.min(...xs),minY=Math.min(...ys);
 const w=Math.max(...xs)-minX+1,h=Math.max(...ys)-minY+1,c=Math.min(66,600/w,270/h);
 await p.mouse.click(b.x+(340-w*c/2+(x-minX+.5)*c)*b.width/680,b.y+(175-h*c/2+(y-minY+.5)*c)*b.height/350);await ready(p);
}
async function prefix(p){await key(p,'ArrowRight');for(let i=0;i<3;i++)await cell(p,4,1);assert.equal((await state(p)).round,4);}
async function reject(p){await click(p,'reject');await click(p,'reject-confirm');}
async function exit(p){await click(p,'take-exit');await click(p,'exit-confirm');await p.waitForFunction(()=>window.trial.getState()?.phase==='ended');}
async function test(name,fn){if(process.env.TRIAL_CHECK_FILTER&&!name.includes(process.env.TRIAL_CHECK_FILTER))return;let r={name,status:'FAIL'};try{r.details=await fn();r.status='PASS';}catch(e){r.error=String(e.stack??e);}results.push(r);console.log(r.status,name,r.error??'');fs.writeFileSync(artifact+(process.env.TRIAL_CHECK_FILTER?'windows-browser-extra-results.json':'windows-browser-results.json'),JSON.stringify({origin:base,browser:await browser.version(),results},null,2));}
await test('M1、S2、S5、S8：真实输入、待邀请与终局重载、独立重开',async()=>{
 const {context,page:p,errors}=await setup();try{await start(p);await prefix(p);const invited=await state(p),before=await raw(p);
 await p.reload();await ready(p);assert.deepEqual(await state(p),invited);await click(p,'detail-0');await click(p,'detail-0');assert.equal(await raw(p),before);
 await reject(p);await key(p,'ArrowRight');await exit(p);let s=await state(p);assert.equal(s.round,6);assert.deepEqual(s.queue.map(i=>s.units[i].pos.x),[1,3,4]);assert.deepEqual(s.queue.map(i=>s.units[i].hp),[20,20,8]);assert.equal(s.end.brought,0);const terminal=s;
 await p.screenshot({path:artifact+'windows-m1-terminal.png',fullPage:true});await p.reload();await ready(p);assert.deepEqual(await state(p),terminal);
 await click(p,'new');s=await state(p);assert.equal(s.round,0);assert.notEqual(s.runId,terminal.runId);assert.deepEqual(await p.evaluate(()=>window.trial.store.envelope.recent),terminal);
 await p.reload();await ready(p);assert.deepEqual(await state(p),s);assert.deepEqual(errors,[]);return {rounds:6,invitationStable:true,terminalStable:true,newRunPreservesPrevious:true,pageErrors:errors};}finally{await context.close();}
});
await test('M2、S1：探看返回及关闭页面后同源恢复',async()=>{
 const {context,page:p,errors}=await setup();try{await start(p);await prefix(p);await reject(p);await key(p,'ArrowRight');await click(p,'take');await key(p,'ArrowRight');let s=await state(p);assert.equal(s.round,7);assert.ok(s.seen.includes('9,1'));const saved=s;
 await p.close();const q=await context.newPage();await q.goto(base+'?dev=1');await ready(q);assert.deepEqual(await state(q),saved);await key(q,'2');await key(q,'ArrowRight');await exit(q);s=await state(q);assert.equal(s.round,9);assert.deepEqual(s.queue.map(i=>s.units[i].hp),[20,20,8]);assert.deepEqual(errors,[]);return {rounds:9,restoredRevealedR:true};}finally{await context.close();}
});
await test('M3：直线技能取物与一次结算',async()=>{
 const {context,page:p,errors}=await setup();try{await start(p);await prefix(p);await reject(p);await key(p,'ArrowRight');await click(p,'take');await key(p,'ArrowRight');await key(p,'ArrowRight');await click(p,'skill-line');await cell(p,9,1);await key(p,'ArrowRight');await exit(p);const s=await state(p);assert.equal(s.round,11);assert.equal(s.units.C.hp,2);assert.equal(s.units.C.pp.line,1);assert.equal(s.end.brought,1);assert.equal(s.units.R.hp,0);await p.screenshot({path:artifact+'windows-m3-terminal.png',fullPage:true});assert.deepEqual(errors,[]);return {rounds:11,brought:1,C:2,linePP:1};}finally{await context.close();}
});
await test('M6：邀请替换、双方换位、承伤撤离',async()=>{
 const {context,page:p,errors}=await setup();try{await start(p);await prefix(p);await click(p,'out-2');await click(p,'accept');await key(p,'2');await click(p,'swap');await click(p,'partner-N');assert.ok((await p.locator('#controls').innerText()).includes('双方行动'));await click(p,'submit');await key(p,'ArrowRight');await click(p,'take');await key(p,'ArrowRight');await key(p,'ArrowRight');await key(p,'ArrowRight');await exit(p);const s=await state(p);assert.equal(s.round,11);assert.deepEqual(s.queue,['A','B','N']);assert.deepEqual(s.queue.map(i=>s.units[i].hp),[20,2,10]);assert.equal(s.units.C.hp,8);assert.deepEqual(s.camp,['C']);assert.equal(s.units.B.pp.guard,2);assert.deepEqual(errors,[]);return {rounds:11,team:['A20','B2','N10'],camp:'C8'};}finally{await context.close();}
});
await test('V1/V2、I1：直接预检、草稿取消、切主控清空、长按和详情',async()=>{
 const {context,page:p,errors}=await setup('V1');try{await start(p);const original=await state(p);await key(p,'ArrowLeft');assert.deepEqual(await state(p),original);const reason=await p.locator('#message').innerText();assert.match(reason,/B/);assert.match(reason,/4/);assert.match(reason,/先|前序/);assert.match(reason,/本轮未执行/);assert.doesNotMatch(reason,/可能/);
 await click(p,'arrange');await click(p,'partner-B');await click(p,'wait');await click(p,'edit-main');await key(p,'ArrowLeft');assert.equal((await state(p)).round,7);assert.equal(await p.locator('#submit').isEnabled(),true);await click(p,'detail-1');await click(p,'detail-1');assert.ok(await p.locator('#submit').count());await click(p,'cancel-draft');assert.deepEqual(await state(p),original);
 await click(p,'arrange');await click(p,'partner-B');await click(p,'wait');await click(p,'edit-main');await key(p,'ArrowLeft');await key(p,'2');assert.equal(await p.locator('#submit').count(),0);assert.equal((await state(p)).round,7);await key(p,'3');
 await click(p,'arrange');await click(p,'partner-B');await click(p,'wait');await click(p,'edit-main');await key(p,'ArrowLeft');await click(p,'submit');let s=await state(p);assert.equal(s.round,8);assert.deepEqual(s.queue.map(i=>s.units[i].pos.x),[2,3,4]);
 await p.keyboard.down('.');await ready(p);const once=await state(p);await p.keyboard.down('.');await p.keyboard.down('.');await p.keyboard.up('.');assert.deepEqual(await state(p),once);assert.deepEqual(errors,[]);return {directRejected:true,combinedRound:8,repeatedKeyIgnored:true};}finally{await context.close();}
});
await test('V10、S3、I1：连续邀请不跨面板、固定集结格',async()=>{
 const {context,page:p,errors}=await setup('V10');try{await start(p);await click(p,'out-0');await click(p,'accept');const first=await state(p);assert.deepEqual(first.queue,['B','C','N1']);await p.keyboard.press('Enter');assert.deepEqual(await state(p),first);await p.reload();await ready(p);assert.deepEqual(await state(p),first);await click(p,'out-1');await click(p,'accept');const s=await state(p);assert.deepEqual(s.queue,['B','N1','N2']);assert.deepEqual(s.units.N2.pos,{x:3,y:2});assert.deepEqual(s.camp,['A','C']);assert.deepEqual(errors,[]);return {anchorStable:true,noCarriedConfirmation:true};}finally{await context.close();}
});
await test('V12、S5：全灭优先、此前回营与未带出物品',async()=>{
 const {context,page:p,errors}=await setup('V12');try{await start(p);await exit(p);const s=await state(p);assert.equal(s.end.outcome,'wipe');assert.equal(s.end.acquired,1);assert.equal(s.end.brought,0);assert.deepEqual(s.end.camp,['C']);assert.equal(s.units.C.hp,8);await p.reload();await ready(p);assert.deepEqual(await state(p),s);assert.deepEqual(errors,[]);return {outcome:'wipe',acquired:1,brought:0,campC:8};}finally{await context.close();}
});
await test('S6/S7：初次保存失败、冻结与相同记录重试',async()=>{
 const {context,page:p,errors}=await setup(undefined,'fail');try{await p.locator('#start').click();await p.waitForFunction(()=>window.trial.store.status==='failed');const s=await state(p);assert.equal(await raw(p),null);assert.match(await p.locator('#save').innerText(),/尚无成功保存点/);await p.keyboard.press('ArrowRight');assert.deepEqual(await state(p),s);const first=await p.evaluate(()=>window.__fault.writes[0].value);await p.evaluate(()=>window.__fault.mode='pass');await click(p,'retry');assert.equal(await raw(p),first);assert.deepEqual(await state(p),s);assert.deepEqual(errors,[]);return {failedInitialNoDiskRecord:true,retrySamePayload:true};}finally{await context.close();}
});
await test('S6、I1：异步保存冻结、编辑草稿不排队执行',async()=>{
 const {context,page:p,errors}=await setup('V1');try{await start(p);const disk=await raw(p);await p.evaluate(()=>window.__fault.mode='pending');await p.locator('#wait').click();await p.waitForFunction(()=>window.trial.store.status==='saving');const during=await state(p);assert.equal(await raw(p),disk);
 assert.equal(await p.locator('#arrange').isEnabled(),true);await p.locator('#arrange').click();await p.locator('#partner-B').click();await p.locator('#wait').click();await p.locator('#edit-main').click();await p.keyboard.press('.');assert.equal(await p.locator('#submit').isEnabled(),false);assert.deepEqual(await state(p),during);
 await p.evaluate(()=>{window.__fault.mode='pass';window.__fault.pending.shift().release();});await ready(p);assert.deepEqual(await state(p),during);assert.equal(await p.locator('#submit').isEnabled(),true);assert.deepEqual(errors,[]);return {pendingFreeze:true,draftEditable:true,noAutomaticSubmit:true};}finally{await context.close();}
});
await test('S9：损坏记录保留、导出后明确重置',async()=>{
 const {context,page:p,errors}=await setup();try{const bad='{broken save bytes';await p.evaluate(v=>localStorage.setItem('dungeon-trial.player.v1',v),bad);await p.reload();await p.waitForFunction(()=>window.trial.store.status==='blocked');assert.equal(await raw(p),bad);const downloaded=p.waitForEvent('download');await p.locator('#export').click();const file=await downloaded;const filePath=await file.path();assert.equal(fs.readFileSync(filePath,'utf8'),bad);p.once('dialog',d=>d.accept());await p.locator('#reset').click();await ready(p);assert.equal((await state(p)).round,0);assert.deepEqual(errors,[]);return {rawExportExact:true,explicitReset:true};}finally{await context.close();}
});
await test('补充 I1：浏览器失焦事件后选招提示同步',async()=>{
 const {context,page:p,errors}=await setup('K1');try{await start(p);await click(p,'skill-strong');assert.match(await p.locator('#controls').innerText(),/已选强击/);const before=await state(p);
 await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
 assert.equal(await p.locator('#skill-strong').evaluate(el=>el.classList.contains('selected')),false);assert.doesNotMatch(await p.locator('#controls').innerText(),/已选强击/);assert.deepEqual(await state(p),before);assert.deepEqual(errors,[]);return {browserBlurEventInjected:true,selectionAndPromptAgree:true};}finally{await context.close();}
});
await test('补充 S4/S6：待退出写失败重试不重放邀请或世界轮',async()=>{
 const {context,page:p,errors}=await setup('V13');try{await start(p);await click(p,'take-exit');await click(p,'exit-confirm');assert.equal((await state(p)).phase,'invitation');const savedInvite=await raw(p);await p.reload();await ready(p);assert.equal(await raw(p),savedInvite);
 await click(p,'out-1');await p.evaluate(()=>window.__fault.mode='fail');await p.locator('#accept').click();await p.waitForFunction(()=>window.trial.store.status==='failed');const exitState=await state(p);assert.equal(exitState.phase,'exit');assert.deepEqual(exitState.queue,['A','C','N']);assert.equal(await raw(p),savedInvite);await p.keyboard.press('Enter');assert.deepEqual(await state(p),exitState);
 const failed=await p.evaluate(()=>window.__fault.writes.at(-1).value);await p.evaluate(()=>window.__fault.mode='pass');await click(p,'retry');const s=await state(p);assert.equal(s.phase,'ended');assert.equal(s.round,1);assert.deepEqual(s.queue,['A','C','N']);assert.deepEqual(s.camp,['B']);assert.equal(await p.evaluate(()=>window.__fault.writes.at(-2).value),failed);assert.deepEqual(errors,[]);return {exitRetrySamePayload:true,rounds:1,invitationOnce:true};}finally{await context.close();}
});
await test('补充 S4/S6/S8：终局写失败恢复、重开写失败保持旧记录',async()=>{
 const {context,page:p,errors}=await setup('V13');try{await start(p);await click(p,'take-exit');await click(p,'exit-confirm');await click(p,'out-1');await p.evaluate(()=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(JSON.parse(v).current.phase==='ended')throw Error('Injected terminal failure');return old.call(this,k,v);};});await p.locator('#accept').click();await p.waitForFunction(()=>window.trial.store.status==='failed');assert.equal((await state(p)).phase,'ended');assert.equal(JSON.parse(await raw(p)).current.phase,'exit');assert.equal(await p.locator('#new').isEnabled(),false);const id=(await state(p)).end.id;
 await p.reload();await ready(p);assert.equal((await state(p)).phase,'ended');assert.equal((await state(p)).end.id,id);const terminal=await raw(p);await p.evaluate(()=>window.__fault.mode='fail');await p.locator('#new').click();await p.waitForFunction(()=>window.trial.store.status==='failed');const candidate=await state(p);assert.equal(candidate.round,0);assert.equal(await raw(p),terminal);await p.keyboard.press('ArrowRight');assert.deepEqual(await state(p),candidate);const failed=await p.evaluate(()=>window.__fault.writes.at(-1).value);await p.evaluate(()=>window.__fault.mode='pass');await click(p,'retry');assert.equal(await raw(p),failed);assert.equal(await p.evaluate(()=>window.trial.store.envelope.recent.end.id),id);assert.deepEqual(errors,[]);return {terminalIdStable:true,restartOldDiskRetained:true,retrySameRunId:true};}finally{await context.close();}
});
await test('补充 加载失败：脚本请求失败显示原因并保留原记录',async()=>{
 const context=await browser.newContext();await context.addInitScript(()=>{window.__trialNoAnim=true;});const p=await context.newPage();try{await p.goto(base+'?dev=1');await p.locator('#start').waitFor();await p.evaluate(()=>localStorage.setItem('dungeon-trial.player.v1','untouched-original'));await p.route(/\/src\/main\.ts|\/assets\/index-.*\.js/,route=>route.abort('failed'));await p.reload();await p.getByText('试验脚本加载失败',{exact:false}).waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('dungeon-trial.player.v1')),'untouched-original');return {failedModuleRequest:true,originalRecordPreserved:true};}finally{await context.close();}
});
await test('补充 S9：阶段矛盾记录阻止自动退出并保留原字节',async()=>{
 const {context,page:p,errors}=await setup('V13');try{await start(p);await click(p,'take-exit');await click(p,'exit-confirm');const bytes=await p.evaluate(()=>{const key=window.trial.store.key;const record=JSON.parse(localStorage.getItem(key));record.current.phase='exit';const bytes=JSON.stringify(record);localStorage.setItem(key,bytes);return bytes;});await p.reload();await p.waitForFunction(()=>window.trial.store.status==='blocked');assert.equal(await raw(p),bytes);assert.equal(await state(p),null);assert.equal(await p.locator('#new').count(),0);assert.match(await p.locator('#save').innerText(),/记录无法载入/);assert.deepEqual(errors,[]);return {invalidPhaseBlocked:true,noAutomaticExit:true,originalBytesPreserved:true};}finally{await context.close();}
});

/* PR5 targeted regression. Only button/keyboard interaction changes the world.
   getState/localStorage reads below are observations, not command injection. */
await test('PR5 已使用G/T和V3/V7出口仅提供撤离',async()=>{
 const observations=[];
 for(const kind of ['G','T','V3','V7']){
  const {context,page:p,errors}=await setup(kind.startsWith('V')?kind:undefined);
  try{
   if(!kind.startsWith('V'))await p.locator('#config').selectOption('main-none');
   await start(p);
   if(kind==='G'||kind==='T'){
    await prefix(p);await key(p,'ArrowRight');await click(p,'take');
    if(kind==='T'){
     await key(p,'ArrowRight');await key(p,'ArrowRight');
     await click(p,'skill-line');await cell(p,9,1);await key(p,'ArrowRight');await click(p,'take');
    }
   }else if(kind==='V3')await key(p,'ArrowLeft');
   const before=await state(p),bytes=await raw(p);
   assert.equal(await p.locator('#take').count(),0,'used/pure exit must not offer collect');
   assert.equal(await p.locator('#take-exit').isEnabled(),true);
   assert.match(await p.locator('#take-exit').innerText(),/撤离/);
   assert.doesNotMatch(await p.locator('#take-exit').innerText(),/取得|记录/);
   await click(p,'detail-0');await click(p,'detail-0');
   assert.deepEqual(await state(p),before);assert.equal(await raw(p),bytes);
   await exit(p);const after=await state(p);
   assert.equal(after.round,before.round+1);assert.equal(after.bag,before.bag);
   assert.equal(after.end.brought,kind==='T'?1:0);assert.deepEqual(errors,[]);
   observations.push({kind,noCollectButton:true,exitConsumesOneRound:true});
  }finally{await context.close();}
 }
 return observations;
});
await test('PR5 非法移动点名真实原因且说明本轮未执行',async()=>{
 const observations=[];
 for(const fixture of [undefined,'V1']){
  const {context,page:p,errors}=await setup(fixture);
  try{
   await start(p);const before=await state(p),bytes=await raw(p);
   await key(p,fixture==='V1'?'ArrowLeft':'ArrowUp');
   const text=await p.locator('#message').innerText();
   assert.match(text,/本轮未执行/);assert.doesNotMatch(text,/可能/);
   if(fixture==='V1'){assert.match(text,/B/);assert.match(text,/4/);assert.match(text,/先|前序/);}
   else assert.match(text,/墙|不可行走|非地面|不是可行走/);
   assert.deepEqual(await state(p),before);assert.equal(await raw(p),bytes);assert.deepEqual(errors,[]);
   observations.push({fixture:fixture??'main-invite',text});
  }finally{await context.close();}
 }
 // An unrevealed adjacent tile is tested by an independent engine fixture:
 // normal reveal exposes all adjacent walkable tiles, so no fake browser claim.
 return observations;
});
await test('PR5 V10拒绝确认按Esc回比较且不处理邀请',async()=>{
 const {context,page:p,errors}=await setup('V10');
 try{
  await start(p);const before=await state(p),bytes=await raw(p);
  await click(p,'reject');assert.equal(await p.locator('#reject-confirm').count(),1);
  await key(p,'Escape');
  assert.equal(await p.locator('#reject-confirm').count(),0);
  assert.equal(await p.locator('#reject').isVisible(),true);
  assert.equal(await p.locator('#accept').count(),1);
  assert.deepEqual(await state(p),before);assert.equal(await raw(p),bytes);
  assert.equal((await state(p)).invitations.filter(i=>i.status==='pending').length,2);
  assert.deepEqual(errors,[]);return {returnedToComparison:true,invitationUnchanged:true};
 }finally{await context.close();}
});
await test('PR5 伙伴草稿切主控提示取消，无草稿不误报',async()=>{
 const observations=[];
 for(const method of ['button','number']){
  const {context,page:p,errors}=await setup('V1');
  try{
   await start(p);const before=await state(p);
   await click(p,'arrange');await click(p,'partner-B');await click(p,'wait');
   await click(p,'edit-main');await key(p,'ArrowLeft');
   assert.equal(await p.locator('#submit').count(),1);
   if(method==='button')await click(p,'leader-1');else await key(p,'2');
   assert.equal(await p.locator('#submit').count(),0);
   assert.match(await p.locator('#message').innerText(),/(?:组合|草稿).*取消/);
   assert.deepEqual(await state(p),{...before,leader:'B'});
   // A second, real switch has no draft to cancel.
   if(method==='button')await click(p,'leader-2');else await key(p,'3');
   assert.doesNotMatch(await p.locator('#message').innerText(),/(?:组合|草稿).*取消/);
   assert.deepEqual(await state(p),before);assert.deepEqual(errors,[]);
   observations.push({method,draftCancelledWithNotice:true,noRoundConsumed:true,noFalseNotice:true});
  }finally{await context.close();}
 }
 return observations;
});

/* Stage 5 maker self-test (2026-10-30): a swap draft stays a swap.
   Before the fix, a direction key, the period key or a map click rewrote the leader card into a move or wait
   while the partner card still read "换位", and submitting then ran the move instead of the swap. */
await test('阶段5 换位草稿不被方向键、句点或点地图改写',async()=>{
 const {context,page:p,errors}=await setup('V1');
 try{
  await start(p);await key(p,'2');const before=await state(p);assert.equal(before.leader,'B');
  await click(p,'swap');await click(p,'partner-A');
  const plan=await p.locator('#controls .draft').innerText();assert.match(plan,/与A换位/);
  await key(p,'ArrowRight');await key(p,'.');await cell(p,4,1);
  assert.equal(await p.locator('#controls .draft').innerText(),plan,'swap draft must not change');
  assert.match(await p.locator('#message').innerText(),/先取消组合/);
  assert.deepEqual(await state(p),before);
  await click(p,'submit');const s=await state(p);
  assert.equal(s.round,before.round+1);assert.deepEqual(s.units.A.pos,{x:3,y:1});assert.deepEqual(s.units.B.pos,{x:2,y:1});
  assert.ok(s.log.some(t=>t==='B与A换位'));assert.deepEqual(errors,[]);
  return {swapKept:true,executedSwap:true};
 }finally{await context.close();}
});

/* Stage 6.3 expedition: fixed seed, real keyboard and mouse. Route finding below only reads the state to choose the next key. */
const EXPEDITION_SEED=process.env.EXPEDITION_SEED??'3';
async function walkTo(p,target,{mouseFirst=false}={}){
 const arrows={'1,0':'ArrowRight','0,1':'ArrowDown','-1,0':'ArrowLeft','0,-1':'ArrowUp'};
 for(let step=0;step<150;step++){
  const s=await state(p),c=s.units[s.leader].pos;if(c.x===target.x&&c.y===target.y)return step;
  const floor=new Set(s.floor.map(q=>q.x+','+q.y)),dist=new Map([[target.x+','+target.y,0]]),q=[target];
  for(let i=0;i<q.length;i++)for(const d of Object.keys(arrows)){const [dx,dy]=d.split(',').map(Number),n={x:q[i].x+dx,y:q[i].y+dy},k=n.x+','+n.y;if(floor.has(k)&&!dist.has(k)){dist.set(k,dist.get(q[i].x+','+q[i].y)+1);q.push(n);}}
  const taken=new Set([...s.queue,...s.enemies].map(id=>s.units[id]).filter(u=>u.hp>0&&u.pos).map(u=>u.pos.x+','+u.pos.y));
  const options=Object.keys(arrows).map(d=>{const [dx,dy]=d.split(',').map(Number),k=(c.x+dx)+','+(c.y+dy);return {d,dx,dy,k};})
   .filter(o=>s.seen.includes(o.k)&&!taken.has(o.k)&&dist.has(o.k)).sort((a,b)=>dist.get(a.k)-dist.get(b.k));
  assert.ok(options.length,'no step available at '+JSON.stringify(c));
  if(mouseFirst&&step===0)await cell(p,c.x+options[0].dx,c.y+options[0].dy);else await key(p,arrows[options[0].d]);
 }
 throw Error('route not finished');
}
async function viaStairs(p){await click(p,'take-exit');await click(p,'exit-confirm');await p.waitForFunction(()=>window.trial.getState()?.phase==='playing');}
await test('远征：随机楼层真实键鼠，下楼、返回旧层、重载一致',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.addInitScript(()=>{window.__trialNoAnim=true;});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'?dev=1&seed='+EXPEDITION_SEED);await p.locator('#start').waitFor();await p.locator('#config').selectOption('expedition');await start(p);
  let s=await state(p);assert.equal(s.scenario,'expedition');assert.equal(s.dungeon.level,1);assert.equal(s.dungeon.seed,Number(EXPEDITION_SEED));
  const down=s.points.find(q=>q.kind==='down').pos;
  const steps=await walkTo(p,down,{mouseFirst:true});
  const cam=await p.evaluate(()=>window.trial.camera());
  await p.screenshot({path:artifact+'windows-expedition-floor1.png',fullPage:true});
  s=await state(p);const roundBeforeStairs=s.round;
  await viaStairs(p);s=await state(p);const stored1=s.dungeon.stored['1'],floor1Enemies=stored1.enemies.map(id=>[id,stored1.units[id].hp,stored1.units[id].pos]); // floor 1 as it was left
  assert.equal(s.dungeon.level,2);assert.equal(s.round,roundBeforeStairs+1);
  const up=s.points.find(q=>q.kind==='up').pos;assert.deepEqual(s.units[s.leader].pos,up);
  assert.ok(s.queue.every(id=>s.units[id].hp<=0||s.units[id].pos));
  await p.screenshot({path:artifact+'windows-expedition-floor2.png',fullPage:true});
  const away=await raw(p);await p.reload();await ready(p);assert.deepEqual(await state(p),s);assert.equal(await raw(p),away);
  await viaStairs(p);s=await state(p);
  assert.equal(s.dungeon.level,1);assert.deepEqual(s.units[s.leader].pos,down);
  assert.deepEqual(s.enemies.map(id=>[id,s.units[id].hp,s.units[id].pos]),floor1Enemies);
  assert.deepEqual(errors,[]);return {seed:EXPEDITION_SEED,steps,cameraAtStairs:cam,crossed:'1->2->1'};
 }finally{await context.close();}
});
/* Stage 6.4: real keys and clicks on a fixed seed. The route reads the state only to choose the next key; invitations are refused by button. */
await test('远征6.4：拾取橙橙果、满HP非法使用被拒、受伤后用物品回复并重载一致',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.addInitScript(()=>{window.__trialNoAnim=true;});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'?dev=1&seed=3');await p.locator('#start').waitFor();await p.locator('#config').selectOption('expedition');await start(p);
  let s=await state(p);assert.equal(s.prog.level,1);assert.deepEqual(s.queue.map(i=>s.units[i].species),['charmander','squirtle','bulbasaur']);
  assert.match(await p.locator('#party').innerText(),/小火龙.*Lv1/s);assert.match(await p.locator('#goal-label').innerText(),/橙橙果×0/);
  const arrows={'1,0':'ArrowRight','0,1':'ArrowDown','-1,0':'ArrowLeft','0,-1':'ArrowUp'};
  const settleInvite=async()=>{while((await state(p)).phase==='invitation')await reject(p);};
  async function go(target){
   for(let step=0;step<80;step++){
    await settleInvite();const t=await state(p),c=t.units[t.leader].pos;if(c.x===target.x&&c.y===target.y)return;
    const floor=new Set(t.floor.map(q=>q.x+','+q.y)),dist=new Map([[target.x+','+target.y,0]]),q=[target];
    for(let i=0;i<q.length;i++)for(const d of Object.keys(arrows)){const [dx,dy]=d.split(',').map(Number),n={x:q[i].x+dx,y:q[i].y+dy},k=n.x+','+n.y;if(floor.has(k)&&!dist.has(k)){dist.set(k,dist.get(q[i].x+','+q[i].y)+1);q.push(n);}}
    const taken=new Set([...t.queue,...t.enemies].map(id=>t.units[id]).filter(u=>u.hp>0&&u.pos).map(u=>u.pos.x+','+u.pos.y));
    const opts=Object.keys(arrows).map(d=>{const [dx,dy]=d.split(',').map(Number);return {d,k:(c.x+dx)+','+(c.y+dy)};}).filter(o=>t.seen.includes(o.k)&&!taken.has(o.k)&&dist.has(o.k)).sort((a,b)=>dist.get(a.k)-dist.get(b.k));
    assert.ok(opts.length,'no step at '+JSON.stringify(c));await key(p,arrows[opts[0].d]);
   }
   throw Error('route not finished');
  }
  const berry=s.points.find(q=>q.kind==='berry').pos;
  await go(berry);await settleInvite();s=await state(p);
  await click(p,'take');s=await state(p);assert.deepEqual(s.prog.items,{berry:1,tonic:0});assert.equal(s.points.find(q=>q.kind==='berry').used,true);
  assert.match(await p.locator('#goal-label').innerText(),/橙橙果×1/);assert.equal(await p.locator('#take').count(),0);
  // refusal: everyone is still at full HP (or the user is healthy), so the berry is refused with its reason
  const full=s.queue.every(i=>s.units[i].hp===s.units[i].maxHp);
  if(full){await click(p,'use-berry');await p.locator('#item-target-C').click();await ready(p);assert.match(await p.locator('#message').innerText(),/HP已满.*本轮未执行/);assert.deepEqual(await state(p),s);}
  // get hurt: walk next to the melee enemy and hold the line until someone is below max HP
  const foe=s.units[s.enemies.find(i=>s.units[i].ai==='melee')];
  await go(await (async()=>{const t=await state(p);const f=t.units[t.enemies.find(i=>t.units[i].ai==='melee')].pos;const floor=new Set(t.floor.map(q=>q.x+','+q.y));return [{x:f.x+1,y:f.y},{x:f.x-1,y:f.y},{x:f.x,y:f.y+1},{x:f.x,y:f.y-1}].find(c=>floor.has(c.x+','+c.y));})());
  for(let i=0;i<8;i++){await settleInvite();s=await state(p);if(s.queue.some(id=>s.units[id].hp>0&&s.units[id].hp<s.units[id].maxHp))break;await key(p,'.');}
  await settleInvite();s=await state(p);
  const hurt=s.queue.filter(id=>s.units[id].hp>0&&s.units[id].hp<s.units[id].maxHp);assert.ok(hurt.length,'someone was hurt');
  const lead=s.units[s.leader].pos,near=hurt.find(id=>Math.abs(s.units[id].pos.x-lead.x)+Math.abs(s.units[id].pos.y-lead.y)<=1);
  assert.ok(near,'hurt member within reach of the leader: '+JSON.stringify({hurt,lead}));
  const before=s.units[near].hp,max=s.units[near].maxHp,rounds=s.round;
  await click(p,'use-berry');assert.match(await p.locator('#controls').innerText(),/对谁使用橙橙果/);await p.locator('#item-target-'+near).click();await ready(p);
  const after=await state(p);assert.equal(after.prog.items.berry,0);assert.equal(after.round,rounds+1);
  assert.ok(after.log.some(t=>t.includes('使用橙橙果')&&t.includes(`HP ${before}→${Math.min(max,before+8)}`)),'berry restores 8 HP up to the maximum (an enemy hit in the same round is separate)');
  await p.screenshot({path:artifact+'windows-expedition-items.png',fullPage:true});
  await p.reload();await ready(p);assert.deepEqual(await state(p),after);assert.deepEqual(errors,[]);
  return {seed:3,pickedUp:true,refusedWhenFull:full,healed:[near,before,after.units[near].hp,max]};
 }finally{await context.close();}
});
await test('6.4 动画：演出期间世界不推进、输入不积压，结束后新输入生效；关闭开关不演出',async()=>{
 const on=await setup('K1','pass',true),off=await setup('K1');
 try{const p=on.page;await start(p);assert.equal(await p.evaluate(()=>window.trial.animationEnabled()),true);
  const s0=await state(p);await p.keyboard.press('.'); // wait: the melee enemy H hits back, so a hit step is played
  assert.equal(await p.evaluate(()=>window.trial.animating()),true,'animation is playing right after the round');
  const s1=await state(p);assert.equal(s1.round,s0.round+1);
  const during=await p.evaluate(()=>{const r=[],ev=k=>document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
   for(const k of ['.','ArrowRight','ArrowLeft','1','2','3'])ev(k);
   for(const id of ['wait','arrange','swap','leader-1']){const b=document.getElementById(id);if(!b)throw Error('missing control '+id);b.click();}
   return {animating:window.trial.animating(),round:window.trial.getState().round};});
  assert.equal(during.animating,true);assert.equal(during.round,s1.round,'inputs during the animation do not advance the world');
  if(await p.evaluate(()=>window.trial.animating())){const box=await p.locator('canvas').boundingBox();await p.mouse.click(box.x+box.width/2,box.y+box.height/2);assert.equal((await state(p)).round,s1.round,'a board click during the animation does not advance the world');}
  await p.waitForFunction(()=>!window.trial.animating());await p.waitForTimeout(500);
  assert.deepEqual(await state(p),s1,'nothing was queued while animating');
  await p.keyboard.press('.');await ready(p);assert.equal((await state(p)).round,s1.round+1,'a new input after the animation takes effect');
  await p.waitForFunction(()=>!window.trial.animating());
  await p.reload();await ready(p);assert.equal(await p.evaluate(()=>window.trial.animating()),false,'reload shows the final state without replay');
  const q=off.page;await start(q);assert.equal(await q.evaluate(()=>window.trial.animationEnabled()),false);
  await q.keyboard.press('.');assert.equal(await q.evaluate(()=>window.trial.animating()),false);await ready(q);
  assert.deepEqual(on.errors,[]);assert.deepEqual(off.errors,[]);return {blockedWhileAnimating:true,notQueued:true,reloadNoReplay:true,switchOff:true};
 }finally{await on.context.close();await off.context.close();}
});
/* Stage 6.5: the whole base loop with real clicks. CHECK ENTRY: the record is pre-seeded with a FINISHED expedition holding a protect machine
   (written to the page's own storage before it loads), because walking a whole random expedition is covered by the earlier checks and is slow.
   Everything after that is real clicks: return to base, learn, carry (one refusal), team, departure, reload, and using the learned move in the new run. */
await test('基地6.5：回到基地、学习招式机、配招、编队、出发，新一局用上学到的招式',async()=>{
 const {createExpedition}=await import('../../src/core/engine.ts');
 const {RULE_VERSION,CONTENT_VERSION}=await import('../../src/core/engine.ts');
 const {SAVE_KEY,BUILD_ID}=await import('../../src/core/save.ts');
 const {closeOut}=await import('../../src/core/engine.ts');
 const w=createExpedition('seeded-run',4242);w.goal=true;w.prog.exp=2;w.bag=1;w.tms=[{move:'protect',source:'target',fate:'held'}];w.phase='ended';
 w.end=closeOut(w,'normal');
 const record=JSON.stringify({format:1,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:5,current:w,recent:null});
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(({k,v})=>{window.__trialNoAnim=true;
  const original=Storage.prototype.setItem;try{if(!localStorage.getItem(k))original.call(localStorage,k,v);}catch{}
  window.__failWrites=false;
  Storage.prototype.setItem=function(key,val){if(window.__failWrites&&key.startsWith('dungeon-trial.'))throw new DOMException('Injected disk quota failure','QuotaExceededError');return original.call(this,key,val);};
 },{k:SAVE_KEY,v:record});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'?dev=1&seed=4243');await p.locator('#to-base').waitFor();await ready(p);
  assert.equal(await p.locator('#new').count(),0,'an expedition result offers the base, not a new independent trial');
  assert.match(await p.locator('#tm-list').innerText(),/保护.*已带回/);
  await click(p,'to-base');
  let s=await state(p);assert.equal(s,null);
  const prof=()=>p.evaluate(()=>window.trial.profile());
  let pr=await prof();assert.deepEqual(pr.vault,{protect:1});assert.equal(pr.expeditions,1);assert.deepEqual(pr.roster.map(i=>i.species),['charmander','squirtle','bulbasaur']);
  assert.deepEqual(await p.evaluate(()=>window.trial.store.envelope.recent.end.tms),[{move:'protect',source:'target',fate:'brought'}]);
  await p.screenshot({path:artifact+'windows-base-1.png',fullPage:true});
  // learning
  await click(p,'tm-protect');await click(p,'learn-P3');pr=await prof();
  assert.deepEqual(pr.vault,{});assert.deepEqual(pr.roster[2].learned.map(l=>l.move),['tackle','seedbomb','protect']);
  assert.equal(await p.locator('#tm-protect').isDisabled(),true,'no machine left to use twice');
  // carry: a third move is refused with a reason and nothing changes; then swap seedbomb for protect
  const before=await raw(p);await click(p,'carry-P3-protect');
  assert.match(await p.locator('#message').innerText(),/最多携带2招/);assert.equal(await raw(p),before);
  await click(p,'carry-P3-seedbomb');await click(p,'carry-P3-protect');pr=await prof();assert.deepEqual(pr.roster[2].carry,['tackle','protect']);
  // team: remove and re-add P1 so the order becomes P2, P3, P1; P3 stays the leader; "设为主控" is disabled for the current leader
  await click(p,'team-P1');await click(p,'team-P1');pr=await prof();
  assert.deepEqual(pr.team,['P2','P3','P1']);assert.equal(pr.leader,'P3');assert.equal(await p.locator('#lead-P3').isDisabled(),true);await click(p,'lead-P1');assert.equal((await prof()).leader,'P1');await click(p,'lead-P3');
  assert.match(await p.locator('#squad').innerText(),/1\. P2.*2\. P3.*主控.*3\. P1/);
  // a failed write freezes the base until the same write is retried
  await p.evaluate(()=>{window.__failWrites=true;});await click(p,'team-P1').catch(()=>{});
  await p.waitForFunction(()=>window.trial.store.status==='failed');
  assert.equal(await p.locator('#depart').isDisabled(),true);assert.equal(await p.locator('#retry').count(),1);
  await p.evaluate(()=>{window.__failWrites=false;});await click(p,'retry');
  pr=await prof();assert.deepEqual(pr.team,['P2','P3']);
  await click(p,'team-P1');pr=await prof();assert.deepEqual(pr.team,['P2','P3','P1']);
  await p.reload();await ready(p);assert.deepEqual(await prof(),pr);
  await p.screenshot({path:artifact+'windows-base-2.png',fullPage:true});
  // departure
  await click(p,'depart');s=await state(p);
  assert.deepEqual(s.queue,['A','B','C']);assert.equal(s.leader,'B');assert.equal(s.round,0);assert.equal(s.prog.level,1);assert.equal(s.dungeon.seed,4243);
  assert.deepEqual(s.units.B.moves,['tackle','protect']);assert.deepEqual(s.units.B.pp,{strong:3,guard:1});assert.equal(s.units.B.hp,s.units.B.maxHp);
  assert.deepEqual(s.units.A.species,'squirtle');assert.equal(await p.evaluate(()=>window.trial.store.envelope.recent.runId),'seeded-run');
  await p.reload();await ready(p);assert.deepEqual(await state(p),s);
  // the learned move is usable: B protects an adjacent ally
  const ally=['A','C'].find(id=>Math.abs(s.units[id].pos.x-s.units.B.pos.x)+Math.abs(s.units[id].pos.y-s.units.B.pos.y)===1);assert.ok(ally,'an ally stands next to the leader');
  await click(p,'skill-guard');await cell(p,s.units[ally].pos.x,s.units[ally].pos.y);
  s=await state(p);assert.equal(s.round,1);assert.equal(s.units.B.pp.guard,0);
  assert.deepEqual(errors,[]);return {learned:'protect',carried:['tackle','protect'],squad:['P2','P3','P1'],usedInRun:true,writeFailureFrozeAndRetried:true};
 }finally{await context.close();}
});
/* Stage 6.5 rest point. CHECK ENTRY: a saved floor-2 world (built by the rule code, leader standing on the rest point, one move low) is written to the page's storage before it loads; the rest is real clicks. */
await test('基地6.5：休整点按钮只用一次，PP已满时被拒且不消耗机会',async()=>{
 const {createExpedition,applyCommand,RULE_VERSION,CONTENT_VERSION}=await import('../../src/core/engine.ts');
 const {SAVE_KEY,BUILD_ID}=await import('../../src/core/save.ts');
 const {initialProfile,squadOf}=await import('../../src/core/base.ts');
 let w=createExpedition('rest-run',3,2,squadOf(initialProfile()));w.units.C.pos=w.points.find(q=>q.kind==='down').pos;
 w=applyCommand(w,{type:'round',action:{type:'interact',exit:true}}).state;w=applyCommand(w,{type:'finishTransit'}).state;
 for(const id of ['A','B']){w.units[id].hp=0;w.units[id].pos=null;}
 w.units.C.pos={x:14,y:9};
 const full=JSON.stringify({format:1,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:5,current:w,recent:null,profile:initialProfile()});
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(({k,v})=>{window.__trialNoAnim=true;try{if(!localStorage.getItem(k))localStorage.setItem(k,v);}catch{}},{k:SAVE_KEY,v:full});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'?dev=1');await p.locator('#rest').waitFor();await ready(p);
  const s0=await state(p);assert.equal(s0.points.find(q=>q.kind==='rest').used,false);
  await p.locator('#rest').click();await ready(p);          // PP are full: refused with the reason, nothing changes
  assert.deepEqual(await state(p),s0);assert.match(await p.locator('#message').innerText(),/PP都已满.*没有消耗/);
  // lower one move through the saved record, as if a fight had spent it, then reload
  await p.evaluate(()=>{const k=window.trial.store.key,e=JSON.parse(localStorage.getItem(k));e.current.units.C.pp.line=0;localStorage.setItem(k,JSON.stringify(e));});
  await p.reload();await ready(p);
  await click(p,'rest');const s1=await state(p);
  assert.equal(s1.units.C.pp.line,1);assert.equal(s1.points.find(q=>q.kind==='rest').used,true);assert.equal(s1.round,s0.round+1);
  assert.equal(await p.locator('#rest').isDisabled(),true);
  await p.reload();await ready(p);assert.deepEqual(await state(p),s1);assert.deepEqual(errors,[]);
  return {refusedWhenFull:true,usedOnce:true};
 }finally{await context.close();}
});
/* Stage 7.2: failure, rescue and return, with real clicks. CHECK ENTRY: the record is pre-seeded (written to the page's own storage before it loads) with a run
   in progress: the leader stands on G, every member has 1 HP, and a chasing enemy with 200 HP is next to them; random state 7 makes the third member
   (P3, an ordinary partner) go missing. Everything after that is real clicks: take G, wait until the wipe, read the result, return to the base,
   pay the rescue, set a purse, depart, finish an effective run (the second run is moved onto its G cell by editing the saved record, as the 6.5 check does), and
   see the partner back on the roster. */
await test('失败与救援7.2：完成G→全灭→伙伴走失→基地付费→下一局有效探险后回归',async()=>{
 const {createExpedition,reveal,RULE_VERSION,CONTENT_VERSION}=await import('../../src/core/engine.ts');
 const {newGameProfile,squadOf}=await import('../../src/core/base.ts');
 const {SAVE_KEY,BUILD_ID}=await import('../../src/core/save.ts');
 const profile=newGameProfile('chikorita','cyndaquil').profile;
 profile.roster.push({id:'P3',species:'pidgey',learned:[{move:'tackle',behavior:'strong',pp:3},{move:'gust',behavior:'line',pp:3}],carry:['tackle','gust'],protected:false});
 profile.next=4;profile.team=['P1','P2','P3'];profile.leader='P1';
 const w=createExpedition('rescue-run',4242,2,squadOf(profile),0);
 const g=w.points.find(q=>q.kind==='goal').pos;const k=q=>q.x+','+q.y;const floor=new Set(w.floor.map(k));
 const near=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},{x:2,y:0},{x:-2,y:0}].map(d=>({x:g.x+d.x,y:g.y+d.y})).filter(q=>floor.has(k(q)));
 assert.ok(near.length>=4,'enough free cells around G');
 w.units.A.pos={...g};w.units.B.pos=near[1];w.units.C.pos=near[2];
 for(const id of w.queue)w.units[id].hp=1;
 const foe=w.units[w.enemies[0]];foe.pos=near[0];foe.hp=200;foe.maxHp=200;foe.ai='chase';foe.damage=4;foe.range=1;
 w.prog.rng=7;reveal(w);
 const record=JSON.stringify({format:1,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:5,current:w,recent:null,profile});
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(({k,v})=>{window.__trialNoAnim=true;const original=Storage.prototype.setItem;try{if(!localStorage.getItem(k))original.call(localStorage,k,v);}catch{}},{k:SAVE_KEY,v:record});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'?dev=1&seed=4300');await p.locator('#take').waitFor();await ready(p);
  await click(p,'take');assert.equal((await state(p)).goal,true);
  for(let i=0;i<30&&(await state(p)).phase!=='ended';i++)await click(p,'wait');
  let s=await state(p);assert.equal(s.phase,'ended');assert.equal(s.end.outcome,'wipe');
  assert.deepEqual(s.end.lost,['C']);assert.equal(s.end.reward,100);assert.equal(s.end.effective,true);
  await p.locator('#settle').waitFor();
  assert.match(await p.locator('#eff-line').innerText(),/算有效探险.*完成了基础目标 G/);
  assert.match(await p.locator('#reward-line').innerText(),/基础报酬：100/);
  assert.match(await p.locator('#lost-line').innerText(),/C 波波/);
  assert.match(await p.locator('#pool-change').innerText(),/P3 波波/);
  assert.match(await p.locator('#pool-change').innerText(),/进入救援池/);
  await p.screenshot({path:artifact+'windows-rescue-1-result.png',fullPage:true});
  await p.reload();await ready(p);assert.deepEqual((await state(p)).end,s.end,'the draw is not redone after a reload');
  await click(p,'to-base');
  let pr=await p.evaluate(()=>window.trial.profile());
  assert.equal(pr.account,100);assert.deepEqual(pr.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P3',false,4]]);assert.deepEqual(pr.team,['P1','P2']);
  assert.match(await p.locator('#account').innerText(),/100/);assert.match(await p.locator('#rescue-P3').innerText(),/未付费.*4/);
  await p.screenshot({path:artifact+'windows-rescue-2-base.png',fullPage:true});
  await click(p,'rescue-pay-P3');
  pr=await p.evaluate(()=>window.trial.profile());assert.equal(pr.account,40);assert.deepEqual(pr.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P3',true,1]]);
  assert.match(await p.locator('#rescue-P3').innerText(),/已付费/);assert.equal(await p.locator('#rescue-pay-P3').count(),0);
  await click(p,'purse-up');await click(p,'purse-up');assert.equal(await p.locator('#purse-value').innerText(),'40');assert.equal(await p.locator('#purse-up').isDisabled(),true,'no more than the account holds');
  await click(p,'depart');await p.waitForFunction(()=>window.trial.getState()!==null);await ready(p);
  s=await state(p);assert.equal(s.purse,40);assert.deepEqual(s.queue,['A','B']);
  assert.equal((await p.evaluate(()=>window.trial.profile())).account,0);
  // second run: stand the leader on G in the saved record, then finish with real clicks
  await p.evaluate(()=>{const key=window.trial.store.key,e=JSON.parse(localStorage.getItem(key)),w=e.current,g=w.points.find(q=>q.kind==='goal').pos;
   w.units.A.pos={x:g.x,y:g.y};if(w.units.B.pos.x===g.x&&w.units.B.pos.y===g.y)throw Error('B on G');localStorage.setItem(key,JSON.stringify(e));});
  await p.reload();await ready(p);
  await click(p,'take-exit');await click(p,'exit-confirm');await p.waitForFunction(()=>window.trial.getState()?.phase==='ended');
  s=await state(p);assert.equal(s.end.outcome,'normal');assert.equal(s.end.effective,true);assert.equal(s.end.refund,40);
  assert.match(await p.locator('#pool-change').innerText(),/P3 波波/);
  await click(p,'to-base');
  pr=await p.evaluate(()=>window.trial.profile());
  assert.equal(pr.account,140);assert.deepEqual(pr.rescue,[]);assert.deepEqual(pr.roster.map(i=>i.id),['P1','P2','P3']);assert.deepEqual(pr.roster[2].carry,['tackle','gust']);
  assert.equal(await p.locator('#rescue-empty').count(),1);
  await p.screenshot({path:artifact+'windows-rescue-3-returned.png',fullPage:true});
  await p.reload();await ready(p);assert.deepEqual(await p.evaluate(()=>window.trial.profile()),pr);
  assert.deepEqual(errors,[]);return {wipe:true,lost:['C'],paid:60,returnedAfterEffectiveRun:true,account:pr.account};
 }finally{await context.close();}
});
/* Stage 7.2: shop and exchanger panels with real clicks. CHECK ENTRY: seed 103 has a shop (3,10) and an exchanger (7,3) on floor 1; the record is pre-seeded
   with the leader on the shop cell, a 100 purse and one held machine. Buying takes no round; each sale is one save; the exchanger takes the leader's action. */
await test('服务点7.2：商店购买不占回合且读档不刷新；交换机送回伙伴与招式机',async()=>{
 const {createExpedition,reveal,RULE_VERSION,CONTENT_VERSION}=await import('../../src/core/engine.ts');
 const {newGameProfile,squadOf}=await import('../../src/core/base.ts');
 const {SAVE_KEY,BUILD_ID}=await import('../../src/core/save.ts');
 const profile=newGameProfile('chikorita','cyndaquil').profile;
 profile.roster.push({id:'P3',species:'pidgey',learned:[{move:'tackle',behavior:'strong',pp:3},{move:'gust',behavior:'line',pp:3}],carry:['tackle','gust'],protected:false});
 profile.next=4;profile.team=['P1','P2','P3'];profile.leader='P1';
 const w=createExpedition('svc-run',103,2,squadOf(profile),100);
 w.units.A.pos={x:3,y:10};w.tms=[{move:'protect',source:'target',fate:'held'}];w.bag=1;reveal(w);
 const record=JSON.stringify({format:1,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:5,current:w,recent:null,profile});
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(({k,v})=>{window.__trialNoAnim=true;const original=Storage.prototype.setItem;try{if(!localStorage.getItem(k))original.call(localStorage,k,v);}catch{}},{k:SAVE_KEY,v:record});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'?dev=1&seed=4300');await p.locator('#shop-panel').waitFor();await ready(p);
  assert.match(await p.locator('#shop-panel').innerText(),/橙橙果.*价格 20.*库存 2/s);
  assert.equal(await p.locator('#take').count(),0,'no pickup button on a shop cell');
  await click(p,'buy-berry');
  let s=await state(p);assert.equal(s.purse,80);assert.equal(s.prog.items.berry,1);assert.equal(s.round,0);assert.deepEqual(s.shop.trades,[{item:'berry',price:20}]);
  await click(p,'buy-tm');s=await state(p);assert.equal(s.purse,0);assert.deepEqual(s.tms.map(t=>[t.move,t.source,t.fate]),[['protect','target','held'],['roar','shop','held']]);
  assert.equal(await p.locator('#buy-tonic').isDisabled(),true);assert.match(await p.locator('#shop-panel').innerText(),/钱袋不足，还差30/);
  await p.screenshot({path:artifact+'windows-service-1-shop.png',fullPage:true});
  await p.reload();await ready(p);assert.deepEqual((await state(p)).shop,s.shop,'a reload does not refresh the stock');
  await p.evaluate(()=>{const key=window.trial.store.key,e=JSON.parse(localStorage.getItem(key));e.current.units.A.pos={x:7,y:3};localStorage.setItem(key,JSON.stringify(e));});
  await p.reload();await ready(p);await p.locator('#exchange-panel').waitFor();
  assert.equal(await p.locator('#ex-target-A').count(),0,'the leader cannot be chosen');assert.equal(await p.locator('#ex-confirm').isDisabled(),true);
  await click(p,'ex-target-C');await click(p,'ex-cargo-1');await p.screenshot({path:artifact+'windows-service-2-exchange.png',fullPage:true});
  await click(p,'ex-confirm');await p.waitForFunction(()=>window.trial.getState().exchange.used);await ready(p);
  s=await state(p);assert.deepEqual(s.queue,['A','B']);assert.deepEqual(s.exchange,{level:1,used:true,sent:'C'});assert.deepEqual(s.tms.map(t=>t.fate),['held','sent']);assert.equal(s.round,1);
  assert.match(await p.locator('#exchange-panel').innerText(),/本局已经使用/);
  await p.reload();await ready(p);assert.deepEqual(await state(p),s);assert.deepEqual(errors,[]);return {boughtWithoutRound:true,exchangeOnce:true};
 }finally{await context.close();}
});
/* Stage 7.1: title, new game, overwrite confirmation and readability. (a) and (b) use no developer parameter at all. */
async function plainContext(){
 const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
 await context.addInitScript(()=>{window.__trialNoAnim=true;});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 return {context,page,errors};
}
async function newGameClicks(p,main,deputy){
 await p.locator('#pick-main-'+main).click();await p.locator('#main-next').click();
 await p.locator('#pick-deputy-'+deputy).click();await p.locator('#newgame-start').click();
 await p.locator('#depart').waitFor();await ready(p);
}
await test('7.1(a) 全新存档：标题→新游戏→选主控与副手→基地→出发，只用真实点击与按键',async()=>{
 const {context,page:p,errors}=await plainContext();
 try{
  await p.goto(base);await p.locator('#title-new').waitFor();
  for(const sel of ['#start','#fixture','#config','#coords-toggle','#title-continue','#open-fixture'])assert.equal(await p.locator(sel).count(),0,sel+' must not exist on the player path');
  await p.locator('#title-new').click();
  assert.equal(await p.locator('.starter-card').count(),9);
  const text=await p.locator('#title-screen').innerText();
  for(const n of ['妙蛙种子','小火龙','杰尼龟','菊草叶','火球鼠','小锯鳄','木守宫','火稚鸡','水跃鱼'])assert.ok(text.includes(n),n);
  assert.match(text,/撞击/);assert.doesNotMatch(text,/tackle/);
  assert.equal(await p.locator('#main-next').isDisabled(),true);
  await p.locator('#pick-main-treecko').click();await p.locator('#main-next').click();
  assert.equal(await p.locator('.starter-card').count(),8);assert.equal(await p.locator('#pick-deputy-treecko').count(),0);
  assert.equal(await p.locator('#newgame-start').isDisabled(),true);
  await p.locator('#pick-deputy-mudkip').click();await p.locator('#newgame-start').click();
  await p.locator('#depart').waitFor();await ready(p);
  const pr=await p.evaluate(()=>window.trial.profile());
  assert.deepEqual(pr.roster.map(i=>i.species),['treecko','mudkip']);assert.deepEqual(pr.team,['P1','P2']);assert.equal(pr.leader,'P1');assert.equal(pr.expeditions,0);
  const base1=await p.locator('#base').innerText()+await p.locator('#party').innerText();assert.match(base1,/木守宫/);assert.match(base1,/水跃鱼/);assert.match(base1,/树叶/);assert.doesNotMatch(base1,/leafage|watergun/);
  await p.locator('#depart').click();await p.waitForFunction(()=>window.trial.getState()!==null);await ready(p);
  const s=await state(p);assert.equal(s.scenario,'expedition');assert.deepEqual(s.queue,['A','B']);assert.equal(s.units.A.species,'treecko');assert.equal(s.leader,'A');
  assert.equal(await p.locator('#guide-card').count(),1);assert.equal(await p.locator('#enemy-hint').count(),1);
  await p.locator('#guide-close').click();assert.equal(await p.locator('#guide-card').count(),0);
  for(const k of ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp']){await p.keyboard.press(k);await ready(p);if((await state(p)).round>0)break;}
  assert.ok((await state(p)).round>0,'a real key press advanced the run');
  assert.ok((await p.locator('#recent-list li').count())>0,'recent events are visible');
  await p.reload();await p.locator('#title-continue').waitFor();
  await p.locator('#title-continue').click();await ready(p);assert.equal(await p.locator('#guide-card').count(),0,'the guide stays closed');
  assert.deepEqual(errors,[]);return {roster:pr.roster.map(i=>i.species),guideOnce:true};
 }finally{await context.close();}
});
await test('7.1(b) 已有存档：新游戏需要确认，取消后原存档不变，可导出原记录',async()=>{
 const {context,page:p,errors}=await plainContext();
 try{
  await p.goto(base);await p.locator('#title-new').click();await newGameClicks(p,'chikorita','totodile');
  const original=await raw(p);assert.ok(original);
  await p.reload();await p.locator('#title-continue').waitFor();
  await p.locator('#title-new').click();await p.locator('#overwrite-box').waitFor();
  assert.equal(await raw(p),original);
  await p.locator('#overwrite-cancel').click();assert.equal(await p.locator('#overwrite-box').count(),0);assert.equal(await raw(p),original);
  await p.locator('#title-new').click();
  const [download]=await Promise.all([p.waitForEvent('download'),p.locator('#overwrite-export').click()]);
  assert.equal(fs.readFileSync(await download.path(),'utf8'),original);
  await p.locator('#overwrite-yes').click();await p.locator('#pick-main-torchic').click();await p.locator('#main-next').click();
  await p.locator('#pick-deputy-cyndaquil').click();assert.equal(await raw(p),original);
  await p.locator('#deputy-back').click();await p.locator('#newgame-cancel').click();await p.locator('#title-continue').waitFor();assert.equal(await raw(p),original);
  await p.locator('#title-continue').click();assert.deepEqual((await p.evaluate(()=>window.trial.profile())).roster.map(i=>i.species),['chikorita','totodile']);
  await p.locator('#to-title').click();await p.locator('#title-new').click();await p.locator('#overwrite-yes').click();await newGameClicks(p,'torchic','cyndaquil');
  const after=await raw(p);assert.notEqual(after,original);assert.deepEqual((await p.evaluate(()=>window.trial.profile())).roster.map(i=>i.species),['torchic','cyndaquil']);
  assert.deepEqual(errors,[]);return {cancelKeptOriginal:true,exportMatches:true,overwriteAfterConfirm:true};
 }finally{await context.close();}
});
await test('7.1 可读性：悬停敌人看信息、组合草稿显示执行顺序与默认行为',async()=>{
 const {context,page:p,errors}=await setup('K1');
 try{
  await start(p);const s=await state(p);const h=s.units.H;
  const b=await p.locator('canvas').boundingBox();
  const xs=s.floor.map(q=>q.x),ys=s.floor.map(q=>q.y),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX+1,hh=Math.max(...ys)-minY+1,c=Math.min(66,600/w,270/hh);
  await p.mouse.move(b.x+(340-w*c/2+(h.pos.x-minX+.5)*c)*b.width/680,b.y+(175-hh*c/2+(h.pos.y-minY+.5)*c)*b.height/350);
  await p.waitForSelector('#enemy-info');const info=await p.locator('#enemy-info').innerText();
  assert.match(info,/H/);assert.match(info,/24\/24/);assert.match(info,/追击/);assert.match(info,/8/);
  await click(p,'arrange');await click(p,'partner-B');
  const order=await p.locator('#draft-order').innerText();assert.match(order,/→.*敌方/);
  assert.match(await p.locator('#draft-steps').innerText(),/默认行为/);
  assert.deepEqual(await state(p),s);assert.deepEqual(errors,[]);return {inspect:true,orderLine:order};
 }finally{await context.close();}
});
await browser.close();
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
