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
async function setup(fixture,mode='pass'){
 const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
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
 await page.goto(base+(fixture?'?fixture='+fixture:''));await page.locator('#start').waitFor();
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
 await p.close();const q=await context.newPage();await q.goto(base);await ready(q);assert.deepEqual(await state(q),saved);await key(q,'2');await key(q,'ArrowRight');await exit(q);s=await state(q);assert.equal(s.round,9);assert.deepEqual(s.queue.map(i=>s.units[i].hp),[20,20,8]);assert.deepEqual(errors,[]);return {rounds:9,restoredRevealedR:true};}finally{await context.close();}
});
await test('M3：直线技能取物与一次结算',async()=>{
 const {context,page:p,errors}=await setup();try{await start(p);await prefix(p);await reject(p);await key(p,'ArrowRight');await click(p,'take');await key(p,'ArrowRight');await key(p,'ArrowRight');await click(p,'skill-line');await cell(p,9,1);await key(p,'ArrowRight');await exit(p);const s=await state(p);assert.equal(s.round,11);assert.equal(s.units.C.hp,2);assert.equal(s.units.C.pp.line,1);assert.equal(s.end.brought,1);assert.equal(s.units.R.hp,0);await p.screenshot({path:artifact+'windows-m3-terminal.png',fullPage:true});assert.deepEqual(errors,[]);return {rounds:11,brought:1,C:2,linePP:1};}finally{await context.close();}
});
await test('M6：邀请替换、双方换位、承伤撤离',async()=>{
 const {context,page:p,errors}=await setup();try{await start(p);await prefix(p);await click(p,'out-2');await click(p,'accept');await key(p,'2');await click(p,'swap');await click(p,'partner-N');assert.ok((await p.locator('#controls').innerText()).includes('双方行动'));await click(p,'submit');await key(p,'ArrowRight');await click(p,'take');await key(p,'ArrowRight');await key(p,'ArrowRight');await key(p,'ArrowRight');await exit(p);const s=await state(p);assert.equal(s.round,11);assert.deepEqual(s.queue,['A','B','N']);assert.deepEqual(s.queue.map(i=>s.units[i].hp),[20,2,10]);assert.equal(s.units.C.hp,8);assert.deepEqual(s.camp,['C']);assert.equal(s.units.B.pp.guard,2);assert.deepEqual(errors,[]);return {rounds:11,team:['A20','B2','N10'],camp:'C8'};}finally{await context.close();}
});
await test('V1/V2、I1：直接预检、草稿取消、切主控清空、长按和详情',async()=>{
 const {context,page:p,errors}=await setup('V1');try{await start(p);const original=await state(p);await key(p,'ArrowLeft');assert.deepEqual(await state(p),original);assert.match(await p.locator('#message').innerText(),/不可用/);
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
 const context=await browser.newContext();const p=await context.newPage();try{await p.goto(base);await p.locator('#start').waitFor();await p.evaluate(()=>localStorage.setItem('dungeon-trial.player.v1','untouched-original'));await p.route(/\/src\/main\.ts|\/assets\/index-.*\.js/,route=>route.abort('failed'));await p.reload();await p.getByText('试验脚本加载失败',{exact:false}).waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('dungeon-trial.player.v1')),'untouched-original');return {failedModuleRequest:true,originalRecordPreserved:true};}finally{await context.close();}
});
await test('补充 S9：阶段矛盾记录阻止自动退出并保留原字节',async()=>{
 const {context,page:p,errors}=await setup('V13');try{await start(p);await click(p,'take-exit');await click(p,'exit-confirm');const bytes=await p.evaluate(()=>{const key=window.trial.store.key;const record=JSON.parse(localStorage.getItem(key));record.current.phase='exit';const bytes=JSON.stringify(record);localStorage.setItem(key,bytes);return bytes;});await p.reload();await p.waitForFunction(()=>window.trial.store.status==='blocked');assert.equal(await raw(p),bytes);assert.equal(await state(p),null);assert.equal(await p.locator('#new').count(),0);assert.match(await p.locator('#save').innerText(),/记录无法载入/);assert.deepEqual(errors,[]);return {invalidPhaseBlocked:true,noAutomaticExit:true,originalBytesPreserved:true};}finally{await context.close();}
});
await browser.close();
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
