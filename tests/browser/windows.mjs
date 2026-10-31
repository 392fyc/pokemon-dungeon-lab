import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {BOSS} from '../../src/core/dungeon.ts';
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
// 7.5: entering play loads Phaser on demand; canvas assertions also need the scene ready.
const ready=p=>p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
const emptyReady=p=>p.waitForFunction(()=>window.trial?.store.status==='empty'&&window.trial.view());
const state=p=>p.evaluate(()=>window.trial.getState());
const raw=p=>p.evaluate(()=>localStorage.getItem(window.trial.store.key));
async function startMemory(p,world,profile=null){await p.evaluate(({world,profile})=>window.trial.store.start(world,profile),{world,profile});await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await ready(p);}
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
// 7.8: the main map's E is a real geodude (10 HP after the 0.5 enemy multiplier) that tackles the leader for 5 every round, and R is a real pidgey (10 HP)
// that walks one cell per round. Two basic attacks (6 each) defeat E, so the invitation opens after round 3 with C at 10 HP and R at x=6.
async function prefix(p){await key(p,'ArrowRight');for(let i=0;i<2;i++)await cell(p,4,1);const s=await state(p);assert.equal(s.round,3);assert.equal(s.phase,'invitation');assert.equal(s.units.C.hp,10);assert.equal(s.units.R.pos.x,6);}
/** Kills R without being hit: wait while R steps 6 -> 5, Quick Attack it from two cells away (8 of its 10 HP; it steps adjacent), then one basic attack finishes it. Three rounds; the leader must stand at x=3. */
async function clearR(p){
 await key(p,'.');await click(p,'skill-quickattack');await cell(p,5,1);await cell(p,4,1);
 const s=await state(p);assert.equal(s.units.R.hp,0);assert.equal(s.units.C.hp,10);
}
async function defeatMainEAndRecordG(p){
 await click(p,'skill-quickattack');await cell(p,4,1); // two-tile Quick Attack leaves E (10 HP) at 2 without an E attack
 await key(p,'ArrowRight');                     // E attacks once (5) as C moves adjacent
 await click(p,'skill-tackle');await cell(p,4,1); // adjacent Tackle defeats E
 await key(p,'ArrowRight');await click(p,'take'); // step onto and record G; R (now adjacent at x=5) hits C once
}
async function reject(p){await click(p,'reject');await click(p,'reject-confirm');}
async function exit(p){await click(p,'take-exit');await click(p,'exit-confirm');await p.waitForFunction(()=>window.trial.getState()?.phase==='ended');}
async function test(name,fn){if(process.env.TRIAL_CHECK_FILTER&&!name.includes(process.env.TRIAL_CHECK_FILTER))return;let r={name,status:'FAIL'};try{r.details=await fn();r.status='PASS';}catch(e){r.error=String(e.stack??e);}results.push(r);console.log(r.status,name,r.error??'');fs.writeFileSync(artifact+(process.env.TRIAL_CHECK_FILTER?'windows-browser-extra-results.json':'windows-browser-results.json'),JSON.stringify({origin:base,browser:await browser.version(),results},null,2));}
await test('M1、S2、S5、S8：开发场景真实输入、待邀请、终局与独立重开仅在内存',async()=>{
 const {context,page:p,errors}=await setup();try{await start(p);await prefix(p);const invited=await state(p);assert.equal(await raw(p),null);
 await click(p,'detail-0');await click(p,'detail-0');assert.equal(await raw(p),null);
 await reject(p);await key(p,'ArrowRight');await exit(p);let s=await state(p);assert.equal(s.round,5);assert.deepEqual(s.queue.map(i=>s.units[i].pos.x),[1,3,4]);assert.deepEqual(s.queue.map(i=>s.units[i].hp),[20,20,5]);   // E hit C twice (20->10), R's tackle on the exit round made it 5
 assert.equal(s.end.brought,0);const terminal=s;
 await p.screenshot({path:artifact+'windows-m1-terminal.png',fullPage:true});assert.equal(await raw(p),null);
 await click(p,'new');s=await state(p);assert.equal(s.round,0);assert.notEqual(s.runId,terminal.runId);assert.equal(await raw(p),null);
 await p.reload();await emptyReady(p);assert.equal(await state(p),null);assert.equal(await raw(p),null);assert.equal(invited.phase,'invitation');assert.deepEqual(errors,[]);return {rounds:5,invitationStable:true,terminalMemoryOnly:true,reloadDropsDeveloperRun:true,pageErrors:errors};}finally{await context.close();}
});
await test('M2、S1：开发场景探看与关闭后回到空的内存状态',async()=>{
 const {context,page:p,errors}=await setup();try{await start(p);await prefix(p);await reject(p);await clearR(p);await key(p,'ArrowRight');await click(p,'take');await key(p,'ArrowRight');let s=await state(p);assert.equal(s.round,9);assert.ok(s.seen.includes('9,1'));assert.equal(await raw(p),null);
 await p.close();const q=await context.newPage();await q.goto(base+'?dev=1');await q.locator('#start').waitFor();await emptyReady(q);assert.equal(await state(q),null);assert.equal(await raw(q),null);await start(q);await prefix(q);await reject(q);await key(q,'ArrowRight');await exit(q);s=await state(q);assert.equal(s.round,5);assert.deepEqual(errors,[]);return {revealedRBeforeClose:true,closeDropsDeveloperRun:true,freshRunStarts:true};}finally{await context.close();}
});
await test('M3：电光一闪两格射程、合法目标提示与T撤离',async()=>{
 const {context,page:p,errors}=await setup();try{await p.locator('#config').selectOption('main-none');await start(p);
  await click(p,'skill-quickattack');let label=await p.locator('#skill-quickattack').innerText();assert.match(label,/电光一闪/);assert.match(label,/同排／列1–2格/);assert.match(label,/造成8点基础伤害/);
  await cell(p,4,1);let s=await state(p);assert.equal(s.round,1);assert.equal(s.units.E.hp,2);assert.equal(s.units.C.pp.quickattack,1);   // E has 10 HP; the 8-point Quick Attack leaves 2 and E does not reach C
  await key(p,'ArrowRight');await click(p,'skill-tackle');await cell(p,4,1);s=await state(p);assert.equal(s.units.E.hp,0);assert.equal(s.units.C.hp,15);   // E tackled C once (5) when C stepped next to it
  await key(p,'.');await click(p,'skill-quickattack');await cell(p,5,1);s=await state(p);assert.equal(s.units.R.hp,2);assert.equal(s.units.C.pp.quickattack,0);   // R, two cells away, takes 8 of its 10 HP and steps adjacent
  await cell(p,4,1);s=await state(p);assert.equal(s.round,6);assert.equal(s.units.R.hp,0);assert.equal(s.units.C.hp,15);
  await key(p,'ArrowRight');await click(p,'take');assert.equal((await state(p)).goal,true);
  await key(p,'ArrowRight');await key(p,'ArrowRight');await key(p,'ArrowRight');s=await state(p);assert.deepEqual(s.units.C.pos,{x:7,y:1});assert.equal(s.units.C.hp,15);
  await click(p,'take');s=await state(p);assert.equal(s.round,12);assert.equal(s.bag,1);assert.equal(s.points.find(q=>q.kind==='item').used,true);
  await exit(p);s=await state(p);assert.equal(s.round,13);assert.equal(s.end.brought,1);assert.equal(s.units.C.hp,15);await p.screenshot({path:artifact+'windows-m3-terminal.png',fullPage:true});assert.deepEqual(errors,[]);return {rounds:13,brought:1,quickattackPP:0,E:0,R:0};}finally{await context.close();}
});
await test('M3：三格直线目标拒绝且不耗PP或回合',async()=>{
 const {context,page:p,errors}=await setup('K5');try{await start(p);await reject(p);const before=await state(p);
  await click(p,'skill-quickattack');await cell(p,5,1);
  assert.deepEqual(await state(p),before);assert.equal(before.units.C.pp.quickattack,1);
  assert.equal(await p.locator('#message').innerText(),'目标相距3格，超出招式射程2格；本轮未执行');assert.deepEqual(errors,[]);
  return {threeTileTargetRejected:true,noRoundOrPpSpent:true};
 }finally{await context.close();}
});
await test('M6：邀请替换、双方换位、承伤撤离',async()=>{
 const {context,page:p,errors}=await setup();try{await start(p);await prefix(p);await click(p,'out-2');await click(p,'accept');await key(p,'2');await click(p,'swap');await click(p,'partner-N');assert.ok((await p.locator('#controls').innerText()).includes('双方行动'));await click(p,'submit');
  // B now leads at x=3 and R is at 5. B waits (R steps adjacent), then trades basic attacks: R tackles B once (5), B's second hit (6+6>=10) kills it.
  await key(p,'.');await cell(p,4,1);await cell(p,4,1);assert.equal((await state(p)).units.R.hp,0);
  await key(p,'ArrowRight');await click(p,'take');await key(p,'ArrowRight');await key(p,'ArrowRight');await key(p,'ArrowRight');await exit(p);const s=await state(p);assert.equal(s.round,13);assert.deepEqual(s.queue,['A','B','N']);assert.deepEqual(s.queue.map(i=>s.units[i].hp),[20,15,10]);assert.equal(s.units.C.hp,10);assert.deepEqual(s.camp,['C']);assert.equal(s.units.B.pp.protect,2);assert.deepEqual(errors,[]);return {rounds:13,team:['A20','B15','N10'],camp:'C10'};}finally{await context.close();}
});
await test('V1/V2、I1：直接预检、草稿取消、切主控清空、长按和详情',async()=>{
 const {context,page:p,errors}=await setup('V1');try{await start(p);const original=await state(p);await key(p,'ArrowLeft');assert.deepEqual(await state(p),original);const reason=await p.locator('#message').innerText();assert.match(reason,/B/);assert.match(reason,/4/);assert.match(reason,/先|前序/);assert.match(reason,/本轮未执行/);assert.doesNotMatch(reason,/可能/);
 await click(p,'arrange');await click(p,'partner-B');await click(p,'wait');await click(p,'edit-main');await key(p,'ArrowLeft');assert.equal((await state(p)).round,7);assert.equal(await p.locator('#submit').isEnabled(),true);await click(p,'detail-1');await click(p,'detail-1');assert.ok(await p.locator('#submit').count());await click(p,'cancel-draft');assert.deepEqual(await state(p),original);
 await click(p,'arrange');await click(p,'partner-B');await click(p,'wait');await click(p,'edit-main');await key(p,'ArrowLeft');await key(p,'2');assert.equal(await p.locator('#submit').count(),0);assert.equal((await state(p)).round,7);await key(p,'3');
 await click(p,'arrange');await click(p,'partner-B');await click(p,'wait');await click(p,'edit-main');await key(p,'ArrowLeft');await click(p,'submit');let s=await state(p);assert.equal(s.round,8);assert.deepEqual(s.queue.map(i=>s.units[i].pos.x),[2,3,4]);
 await p.keyboard.down('.');await ready(p);const once=await state(p);await p.keyboard.down('.');await p.keyboard.down('.');await p.keyboard.up('.');assert.deepEqual(await state(p),once);assert.deepEqual(errors,[]);return {directRejected:true,combinedRound:8,repeatedKeyIgnored:true};}finally{await context.close();}
});
await test('V10、S3、I1：连续邀请不跨面板、固定集结格，开发场景不写存档',async()=>{
 const {context,page:p,errors}=await setup('V10');try{await start(p);await click(p,'out-0');await click(p,'accept');const first=await state(p);assert.deepEqual(first.queue,['B','C','N1']);await p.keyboard.press('Enter');assert.deepEqual(await state(p),first);assert.equal(await raw(p),null);await click(p,'out-1');await click(p,'accept');const s=await state(p);assert.deepEqual(s.queue,['B','N1','N2']);assert.deepEqual(s.units.N2.pos,{x:3,y:2});assert.deepEqual(s.camp,['A','C']);assert.equal(await raw(p),null);assert.deepEqual(errors,[]);return {anchorStable:true,noCarriedConfirmation:true,memoryOnly:true};}finally{await context.close();}
});
await test('V12、S5：开发场景全灭优先、此前回营与未带出物品',async()=>{
 const {context,page:p,errors}=await setup('V12');try{await start(p);await exit(p);const s=await state(p);assert.equal(s.end.outcome,'wipe');assert.equal(s.end.acquired,1);assert.equal(s.end.brought,0);assert.deepEqual(s.end.camp,['C']);assert.equal(s.units.C.hp,8);assert.equal(await raw(p),null);assert.deepEqual(errors,[]);return {outcome:'wipe',acquired:1,brought:0,campC:8,memoryOnly:true};}finally{await context.close();}
});
await test('S6/S7：开发场景启动与行动不写存档，也不受磁盘写失败影响',async()=>{
 const {context,page:p,errors}=await setup(undefined,'fail');try{await start(p);const before=await state(p);assert.equal(await raw(p),null);assert.equal(await p.evaluate(()=>window.trial.store.status),'ready');await key(p,'ArrowRight');assert.equal((await state(p)).round,before.round+1);assert.equal(await raw(p),null);assert.deepEqual(await p.evaluate(()=>window.__fault.writes),[]);assert.deepEqual(errors,[]);return {startMemoryOnly:true,roundMemoryOnly:true,noStorageWrites:true};}finally{await context.close();}
});
await test('S6、I1：开发场景行动不等待写入，草稿取消后不自动提交',async()=>{
 const {context,page:p,errors}=await setup('V1');try{await start(p);await p.evaluate(()=>window.__fault.mode='pending');await click(p,'wait');const during=await state(p);assert.equal(await p.evaluate(()=>window.trial.store.status),'ready');assert.equal(await raw(p),null);
 await click(p,'arrange');await click(p,'partner-B');await click(p,'wait');await click(p,'edit-main');await click(p,'wait');assert.equal(await p.locator('#submit').isEnabled(),true);assert.equal((await state(p)).round,during.round,'draft actions remain uncommitted');await click(p,'cancel-draft');assert.deepEqual(await state(p),during);
 assert.deepEqual(await p.evaluate(()=>window.__fault.writes),[]);assert.deepEqual(errors,[]);return {memoryActionDoesNotWaitForStorage:true,draftEditable:true,cancelDoesNotSubmit:true};}finally{await context.close();}
});
await test('S9：损坏记录保留、导出后明确重置',async()=>{
 const {context,page:p,errors}=await setup();try{const bad='{broken save bytes';await p.evaluate(v=>localStorage.setItem('dungeon-trial.player.v1',v),bad);await p.reload();await p.waitForFunction(()=>window.trial.store.status==='blocked');assert.equal(await raw(p),bad);const downloaded=p.waitForEvent('download');await p.locator('#export').click();const file=await downloaded;const filePath=await file.path();assert.equal(fs.readFileSync(filePath,'utf8'),bad);p.once('dialog',d=>d.accept());await p.locator('#reset').click();await ready(p);assert.equal((await state(p)).round,0);assert.deepEqual(errors,[]);return {rawExportExact:true,explicitReset:true};}finally{await context.close();}
});
await test('补充 I1：浏览器失焦事件后选招提示同步',async()=>{
 const {context,page:p,errors}=await setup('K1');try{await start(p);await click(p,'skill-tackle');assert.match(await p.locator('#controls').innerText(),/已选撞击/);const before=await state(p);
 await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
 assert.equal(await p.locator('#skill-tackle').evaluate(el=>el.classList.contains('selected')),false);assert.doesNotMatch(await p.locator('#controls').innerText(),/已选撞击/);assert.deepEqual(await state(p),before);assert.deepEqual(errors,[]);return {browserBlurEventInjected:true,selectionAndPromptAgree:true};}finally{await context.close();}
});
await test('营地存档：终局写入失败可重试，回营不再写入或重复结算',async()=>{
 const {newGameProfile}=await import('../../src/core/base.ts');
 const {context,page:p,errors}=await setup(undefined,'pass');
 try{
  const profile=newGameProfile('treecko','mudkip').profile;
  assert.equal(await p.evaluate(profile=>window.trial.store.beginNewGame(profile,true),profile),true);
  await p.reload();await ready(p);const campRaw=await raw(p),camp=JSON.parse(campRaw);assert.equal(camp.format,2);assert.equal(camp.profile.expeditions,0);
  await click(p,'depart');const run=await state(p);assert.equal(run.phase,'playing');assert.equal(await raw(p),campRaw,'departure keeps the complete pre-run camp bytes');
  await p.evaluate(()=>window.__fault.mode='fail');await click(p,'take-exit');await p.locator('#exit-confirm').click();await p.waitForFunction(()=>window.trial.store.status==='failed');
  const ended=await state(p),summary=await p.evaluate(()=>window.trial.store.settlementSummary),candidate=await p.evaluate(()=>window.trial.store.envelope);
  assert.equal(ended.phase,'ended');assert.equal(candidate.format,2);assert.equal(candidate.profile.expeditions,1);assert.equal(await raw(p),campRaw,'failed terminal write leaves the old camp bytes intact');
  assert.equal(await p.locator('#to-base').isDisabled(),true,'cannot return before a successful terminal save');assert.equal(await p.evaluate(()=>window.trial.store.status),'failed');
  const attempted=await p.evaluate(()=>window.__fault.writes.at(-1).value);await p.evaluate(()=>window.__fault.mode='pass');await click(p,'retry');
  assert.equal(await raw(p),attempted);assert.deepEqual(await state(p),ended);assert.deepEqual(await p.evaluate(()=>window.trial.store.settlementSummary),summary);assert.equal((await JSON.parse(await raw(p))).profile.expeditions,1,'retry writes the cached settled result once');
  const settledRaw=await raw(p);await click(p,'to-base');assert.equal(await state(p),null);assert.equal(await raw(p),settledRaw,'returnToBase only changes the screen');assert.deepEqual(errors,[]);
  return {departureUnchanged:true,terminalFailureKeepsResult:true,retrySettlesOnce:true,returnDoesNotWrite:true};
 }finally{await context.close();}
});
await test('补充 加载失败：脚本请求失败显示原因并保留原记录',async()=>{
 const context=await browser.newContext();await context.addInitScript(()=>{window.__trialNoAnim=true;});const p=await context.newPage();try{await p.goto(base+'?dev=1');await p.locator('#start').waitFor();await p.evaluate(()=>localStorage.setItem('dungeon-trial.player.v1','untouched-original'));await p.route(/\/src\/main\.ts|\/assets\/index-.*\.js/,route=>route.abort('failed'));await p.reload();await p.getByText('脚本加载失败',{exact:false}).waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('dungeon-trial.player.v1')),'untouched-original');return {failedModuleRequest:true,originalRecordPreserved:true};}finally{await context.close();}
});
await test('旧档迁移：进行中的远征丢弃，营地档案写成仅含营地的新格式',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.addInitScript(()=>{window.__trialNoAnim=true;});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  const legacy=fs.readFileSync(new URL('../core/fixtures77/v1-camp-unit.json',import.meta.url),'utf8');
  await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:'dungeon-trial.player.v1',value:legacy});
  await p.goto(base+'?dev=1');await ready(p);const env=await p.evaluate(()=>window.trial.store.envelope);
  assert.equal(await state(p),null);assert.equal(await p.evaluate(()=>window.trial.store.atBase),true);assert.equal(env.format,2);assert.deepEqual(Object.keys(env).sort(),['build','content','format','profile','rules','sequence']);assert.equal(env.profile.expeditions,0);assert.equal(env.sequence,5);
  assert.deepEqual(JSON.parse(await raw(p)),env);assert.equal(await p.locator('#depart').isEnabled(),true);assert.deepEqual(errors,[]);
  return {oldActiveRunDiscarded:true,campOnlyFormat2:true,sequenceAdvanced:true,baseReady:true};
 }finally{await context.close();}
});
await test('旧档迁移：旧终局只结算一次，刷新后不会重复记账',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.addInitScript(()=>{window.__trialNoAnim=true;});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  const record=JSON.parse(fs.readFileSync(new URL('../core/fixtures77/v1-profile-current.json',import.meta.url),'utf8'));
  record.current=JSON.parse(fs.readFileSync(new URL('../core/fixtures77/v1-recent-world.json',import.meta.url),'utf8'));record.recent=null;
  const legacy=JSON.stringify(record);await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:'dungeon-trial.player.v1',value:legacy});
  await p.goto(base+'?dev=1');await ready(p);let env=await p.evaluate(()=>window.trial.store.envelope);
  assert.equal(await state(p),null);assert.equal(env.format,2);assert.equal(env.profile.expeditions,1);assert.deepEqual(Object.keys(env).sort(),['build','content','format','profile','rules','sequence']);
  const migrated=await raw(p);assert.deepEqual(JSON.parse(migrated),env);await p.reload();await ready(p);env=await p.evaluate(()=>window.trial.store.envelope);assert.equal(env.profile.expeditions,1);assert.equal(await raw(p),migrated);assert.equal(await state(p),null);assert.deepEqual(errors,[]);
  return {legacyTerminalSettled:true,expeditionCountOnce:true,refreshDoesNotRepeat:true};
 }finally{await context.close();}
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
     await defeatMainEAndRecordG(p);
    if(kind==='T'){
       await cell(p,5,1);await cell(p,5,1); // R stands next to the goal cell and blocks the corridor: two basic attacks kill it (it hits C once)
       await key(p,'ArrowRight');await key(p,'ArrowRight');await key(p,'ArrowRight');await click(p,'take');
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
await test('远征：随机楼层真实键鼠，下楼并返回旧层；进度只在内存',async()=>{
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
  assert.equal(await raw(p),null);assert.match(await p.locator('#save').innerText(),/开发者远征只在内存中/);
  await viaStairs(p);s=await state(p);
  assert.equal(s.dungeon.level,1);assert.deepEqual(s.units[s.leader].pos,down);
  assert.deepEqual(s.enemies.map(id=>[id,s.units[id].hp,s.units[id].pos]),floor1Enemies);
  assert.deepEqual(errors,[]);return {seed:EXPEDITION_SEED,steps,cameraAtStairs:cam,crossed:'1->2->1'};
 }finally{await context.close();}
});
/* Stage 6.4: real keys and clicks on a fixed seed. The route reads the state only to choose the next key; invitations are refused by button. */
await test('远征6.4：拾取橙橙果、满HP非法使用被拒、受伤后用物品回复；进度只在内存',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.addInitScript(()=>{window.__trialNoAnim=true;});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'?dev=1&seed=3');await p.locator('#start').waitFor();await p.locator('#config').selectOption('expedition');await start(p);
  let s=await state(p);assert.equal(s.prog.level,5);assert.deepEqual(s.queue.map(i=>s.units[i].species),['charmander','squirtle','bulbasaur']);
  assert.match(await p.locator('#party').innerText(),/小火龙.*Lv5/s);assert.match(await p.locator('#goal-label').innerText(),/橙橙果×0/);
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
    await go(await (async()=>{const t=await state(p);const f=t.units[t.enemies.find(i=>t.units[i].hp>0&&t.units[i].pos)].pos;const floor=new Set(t.floor.map(q=>q.x+','+q.y));return [{x:f.x+1,y:f.y},{x:f.x-1,y:f.y},{x:f.x,y:f.y+1},{x:f.x,y:f.y-1}].find(c=>floor.has(c.x+','+c.y));})());
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
   assert.equal(await raw(p),null);assert.match(await p.locator('#save').innerText(),/开发者远征只在内存中/);assert.deepEqual(errors,[]);
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
   await p.reload();await emptyReady(p);assert.equal(await p.evaluate(()=>window.trial.animating()),false,'reload returns to an empty developer session without replaying a run');assert.equal(await state(p),null);
  const q=off.page;await start(q);assert.equal(await q.evaluate(()=>window.trial.animationEnabled()),false);
  await q.keyboard.press('.');assert.equal(await q.evaluate(()=>window.trial.animating()),false);await ready(q);
  assert.deepEqual(on.errors,[]);assert.deepEqual(off.errors,[]);return {blockedWhileAnimating:true,notQueued:true,reloadNoReplay:true,switchOff:true};
 }finally{await on.context.close();await off.context.close();}
});
/* Stage 6.5: the base loop with real clicks. A camp-only profile with one protect machine is installed through TrialStore.beginNewGame;
   departure and the learned move's use are then exercised in a memory-only run. */
await test('基地6.5：回到基地、学习招式机、配招、编队、出发，新一局用上学到的招式',async()=>{
  const {initialProfile}=await import('../../src/core/base.ts');
  const profile=initialProfile();profile.vault={protect:1};profile.expeditions=1;
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.addInitScript(()=>{window.__trialNoAnim=true;window.__failWrites=false;
   const original=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,val){if(window.__failWrites&&key.startsWith('dungeon-trial.'))throw new DOMException('Injected disk quota failure','QuotaExceededError');return original.call(this,key,val);};
  });
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
   await p.goto(base+'?dev=1&seed=4243');await p.locator('#start').waitFor();
   assert.equal(await p.evaluate(profile=>window.trial.store.beginNewGame(profile,true),profile),true);await p.reload();await ready(p);
   let s=await state(p);assert.equal(s,null);
  const baseMoves=await p.locator('#party').innerText();assert.match(baseMoves,/上下左右相邻/);assert.match(baseMoves,/基础伤害/);assert.doesNotMatch(baseMoves,/两招行为须不同/);
  const prof=()=>p.evaluate(()=>window.trial.profile());
  let pr=await prof();assert.deepEqual(pr.vault,{protect:1});assert.equal(pr.expeditions,1);assert.deepEqual(pr.roster.map(i=>i.species),['charmander','squirtle','bulbasaur']);
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
   const campBeforeDeparture=await raw(p);
  await click(p,'depart');s=await state(p);
  assert.deepEqual(s.queue,['A','B','C']);assert.equal(s.leader,'B');assert.equal(s.round,0);assert.equal(s.prog.level,5);assert.equal(s.dungeon.seed,4243);
  assert.deepEqual(s.units.B.moves,['tackle','protect']);assert.deepEqual(s.units.B.pp,{tackle:3,protect:1});assert.equal(s.units.B.hp,s.units.B.maxHp);
   assert.deepEqual(s.units.A.species,'squirtle');assert.equal(await raw(p),campBeforeDeparture,'departure leaves the camp record byte-for-byte unchanged');
  // The learned protect applies to B itself; the nearby ally gets no protection state.
  const ally=['A','C'].find(id=>Math.abs(s.units[id].pos.x-s.units.B.pos.x)+Math.abs(s.units[id].pos.y-s.units.B.pos.y)===1);assert.ok(ally,'an ally stands next to the leader');
  await click(p,'skill-protect');await cell(p,s.units.B.pos.x,s.units.B.pos.y);
  s=await state(p);assert.equal(s.round,1);assert.equal(s.units.B.pp.protect,0);assert.ok(s.units.B.protect>0,'守住保护使用者本人');assert.equal(s.units[ally].protect,0,'相邻队友没有获得守住状态');assert.ok(s.log.includes('B进入守住状态'));
  assert.match(await p.locator('[data-unit-status="B"]').innerText(),/守住：剩余2个敌方阶段/);
   assert.equal(await raw(p),campBeforeDeparture,'turn actions remain in memory until terminal settlement');
  assert.deepEqual(errors,[]);return {learned:'protect',carried:['tackle','protect'],selfProtected:'B',adjacentAllyUnaffected:ally,squad:['P2','P3','P1'],usedInRun:true,writeFailureFrozeAndRetried:true};
 }finally{await context.close();}
});
/* Stage 6.5 rest point: fixed memory worlds are made by the rule code, then actions use real clicks. */
await test('基地6.5：休整点按钮只用一次，PP已满时被拒且不消耗机会',async()=>{
 const {createExpedition,applyCommand}=await import('../../src/core/engine.ts');
 const {initialProfile,squadOf}=await import('../../src/core/base.ts');
 const profile=initialProfile();let spentMove='';
 const makeWorld=(spent)=>{let w=createExpedition('rest-run',3,2,squadOf(profile));w.units.C.pos=w.points.find(q=>q.kind==='down').pos;
  spentMove=w.units.C.learned[0];assert.ok(spentMove,'the rest fixture needs one learned move');
  w=applyCommand(w,{type:'round',action:{type:'interact',exit:true}}).state;w=applyCommand(w,{type:'finishTransit'}).state;
  for(const id of ['A','B']){w.units[id].hp=0;w.units[id].pos=null;}w.units.C.pos={x:14,y:9};if(spent)w.units.C.pp[spentMove]=0;return w;};
 const full=makeWorld(false),spent=makeWorld(true);
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(()=>{window.__trialNoAnim=true;});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'?dev=1');await p.locator('#start').waitFor();await emptyReady(p);await startMemory(p,full,profile);await p.locator('#rest').waitFor();
  const s0=await state(p);assert.equal(s0.points.find(q=>q.kind==='rest').used,false);
  await p.locator('#rest').click();await ready(p);          // PP are full: refused with the reason, nothing changes
  assert.deepEqual(await state(p),s0);assert.match(await p.locator('#message').innerText(),/PP都已满.*没有消耗/);
  // Reload discards the first developer world; create a second in-memory fixture with one PP spent.
  await p.reload();await p.locator('#start').waitFor();await emptyReady(p);await startMemory(p,spent,profile);
  await click(p,'rest');const s1=await state(p);
  assert.equal(s1.units.C.pp[spentMove],Math.min(2,s0.units.C.maxPp[spentMove]));assert.equal(s1.points.find(q=>q.kind==='rest').used,true);assert.equal(s1.round,s0.round+1);
  assert.equal(await p.locator('#rest').isDisabled(),true);
  assert.equal(await raw(p),null);assert.deepEqual(errors,[]);
  return {refusedWhenFull:true,usedOnce:true,fixturesMemoryOnly:true};
 }finally{await context.close();}
});
/* Stage 7.2: create a wipe fixture in memory through TrialStore.start; only its settled camp profile is installed for the real base UI. */
await test('失败与救援7.2：完成G→全灭→伙伴走失→基地付费→下一局有效探险后回归',async()=>{
 const {createExpedition,reveal}=await import('../../src/core/engine.ts');
 const {newGameProfile,squadOf}=await import('../../src/core/base.ts');
 const profile=newGameProfile('chikorita','cyndaquil').profile;
 profile.roster.push({id:'P3',species:'pidgey',learned:[{move:'tackle',pp:3},{move:'gust',pp:3}],carry:['tackle','gust'],protected:false});
 profile.next=4;profile.team=['P1','P2','P3'];profile.leader='P1';
 const w=createExpedition('rescue-run',4242,2,squadOf(profile),0);
 const g=w.points.find(q=>q.kind==='goal').pos;const k=q=>q.x+','+q.y;const floor=new Set(w.floor.map(k));
 const near=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},{x:2,y:0},{x:-2,y:0}].map(d=>({x:g.x+d.x,y:g.y+d.y})).filter(q=>floor.has(k(q)));
 assert.ok(near.length>=4,'enough free cells around G');
 w.units.A.pos={...g};w.units.B.pos=near[1];w.units.C.pos=near[2];
 for(const id of w.queue)w.units[id].hp=1;
 const foe=w.units[w.enemies[0]];foe.pos=near[0];foe.hp=200;foe.maxHp=200;foe.ai='chase';foe.damage=4;foe.range=1;
 w.prog.rng=7;reveal(w);
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(()=>{window.__trialNoAnim=true;});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'?dev=1&seed=4300');await p.locator('#start').waitFor();await emptyReady(p);await startMemory(p,w,profile);await p.locator('#take').waitFor();
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
  let pr=await p.evaluate(()=>window.trial.profile());
  assert.equal(pr.account,100);assert.deepEqual(pr.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P3',false,4]]);assert.deepEqual(pr.team,['P1','P2']);
  assert.equal(await raw(p),null,'the developer world and settlement remain in memory until a camp-only fixture is made');
  assert.equal(await p.evaluate(profile=>window.trial.store.beginNewGame(profile,true),pr),true);
  await p.reload();await ready(p);assert.equal(await state(p),null);assert.deepEqual(await p.evaluate(()=>window.trial.profile()),pr);
  assert.match(await p.locator('#account').innerText(),/100/);assert.match(await p.locator('#rescue-P3').innerText(),/未付费.*4/);
  await p.screenshot({path:artifact+'windows-rescue-2-base.png',fullPage:true});
   const unpaidBase=structuredClone(pr);await p.reload();await ready(p);assert.equal(await state(p),null);assert.deepEqual(await p.evaluate(()=>window.trial.profile()),unpaidBase);
  await click(p,'rescue-pay-P3');
  pr=await p.evaluate(()=>window.trial.profile());assert.equal(pr.account,40);assert.deepEqual(pr.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P3',true,1]]);
  assert.match(await p.locator('#rescue-P3').innerText(),/已付费/);assert.equal(await p.locator('#rescue-pay-P3').count(),0);
   const paidBase=structuredClone(pr);await p.reload();await ready(p);assert.equal(await state(p),null);assert.deepEqual(await p.evaluate(()=>window.trial.profile()),paidBase);
   assert.equal(await p.locator('#depart').isEnabled(),true,'the base remains able to start an expedition after rescue payment');
  await click(p,'purse-up');await click(p,'purse-up');assert.equal(await p.locator('#purse-value').innerText(),'40');assert.equal(await p.locator('#purse-up').isDisabled(),true,'no more than the account holds');
  const paidCampRaw=await raw(p);await click(p,'depart');await p.waitForFunction(()=>window.trial.getState()!==null);await ready(p);
  s=await state(p);assert.equal(s.purse,40);assert.deepEqual(s.queue,['A','B']);
  assert.equal((await p.evaluate(()=>window.trial.profile())).account,0);assert.equal(await raw(p),paidCampRaw,'departure preserves the paid camp wallet');
   const goal=s.points.find(q=>q.kind==='goal').pos;assert.deepEqual(s.units.A.pos,{x:16,y:6});assert.deepEqual(goal,{x:8,y:5});
   // Real enemies now walk up to the leader on the way (floor 1 has three): the route keeps stepping toward G, fights nothing on purpose, and refuses any invitation a defeated enemy leaves.
   for(let i=0;i<40;i++){let t=await state(p);if(t.phase==='invitation'){await reject(p);continue;}const a=t.units.A.pos;if(a.x===goal.x&&a.y===goal.y)break;await key(p,a.x>goal.x?'ArrowLeft':'ArrowUp');}
   assert.deepEqual((await state(p)).units.A.pos,goal,'real movement reaches G');await click(p,'take');assert.equal((await state(p)).goal,true);
   await exit(p);
  s=await state(p);assert.equal(s.end.outcome,'normal');assert.equal(s.end.effective,true);assert.equal(s.end.refund,40);
  assert.match(await p.locator('#pool-change').innerText(),/P3 波波/);
   const secondEnd=structuredClone(s),settledRaw=await raw(p);assert.equal(JSON.parse(settledRaw).profile.expeditions,2,'the completed effective run is settled before returning to base');
  await click(p,'to-base');
  pr=await p.evaluate(()=>window.trial.profile());
  assert.equal(pr.account,140);assert.deepEqual(pr.rescue,[]);assert.deepEqual(pr.roster.map(i=>i.id),['P1','P2','P3']);assert.deepEqual(pr.roster[2].carry,['tackle','gust']);
  assert.equal(await p.locator('#rescue-empty').count(),1);
  await p.screenshot({path:artifact+'windows-rescue-3-returned.png',fullPage:true});
   assert.equal(await raw(p),settledRaw,'returnToBase does not write the already settled camp record');await p.reload();await ready(p);assert.equal(await state(p),null);assert.deepEqual(await p.evaluate(()=>window.trial.profile()),pr);assert.equal(await p.locator('#depart').isEnabled(),true,'the base can start another expedition after P3 returns');
  assert.deepEqual(errors,[]);return {wipe:true,lost:['C'],paid:60,returnedAfterEffectiveRun:true,account:pr.account};
 }finally{await context.close();}
});
/* Stage 7.2: shop and exchanger panels use separate memory fixtures on seed 103, with real clicks for every service action. */
await test('服务点7.2：商店购买不占回合；交换机送回伙伴与招式机',async()=>{
 const {createExpedition,reveal}=await import('../../src/core/engine.ts');
 const {newGameProfile,squadOf}=await import('../../src/core/base.ts');
 const profile=newGameProfile('chikorita','cyndaquil').profile;
 profile.roster.push({id:'P3',species:'pidgey',learned:[{move:'tackle',pp:3},{move:'gust',pp:3}],carry:['tackle','gust'],protected:false});
 profile.next=4;profile.team=['P1','P2','P3'];profile.leader='P1';
 const makeWorld=(kind,items)=>{const w=createExpedition('svc-run',103,2,squadOf(profile),100);w.units.A.pos={...w.points.find(q=>q.kind===kind).pos};   // 7.8 changed the generated floor, so the service cells are read, not hard-coded
  w.tms=items;w.bag=1;reveal(w);return w;};
 const shopWorld=makeWorld('shop',[{move:'protect',source:'target',fate:'held'}]);
 const exchangeWorld=makeWorld('exchange',[{move:'protect',source:'target',fate:'held'},{move:'roar',source:'shop',fate:'held'}]);
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(()=>{window.__trialNoAnim=true;});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'?dev=1&seed=4300');await p.locator('#start').waitFor();await emptyReady(p);await startMemory(p,shopWorld,profile);await p.locator('#shop-panel').waitFor();
  assert.match(await p.locator('#shop-panel').innerText(),/橙橙果.*价格 20.*库存 2/s);
  assert.equal(await p.locator('#take').count(),0,'no pickup button on a shop cell');
  await click(p,'buy-berry');
  let s=await state(p);assert.equal(s.purse,80);assert.equal(s.prog.items.berry,1);assert.equal(s.round,0);assert.deepEqual(s.shop.trades,[{item:'berry',price:20}]);
  await click(p,'buy-tm');s=await state(p);assert.equal(s.purse,0);assert.deepEqual(s.tms.map(t=>[t.move,t.source,t.fate]),[['protect','target','held'],['roar','shop','held']]);
  assert.equal(await p.locator('#buy-tonic').isDisabled(),true);assert.match(await p.locator('#shop-panel').innerText(),/钱袋不足，还差30/);
  await p.screenshot({path:artifact+'windows-service-1-shop.png',fullPage:true});
  assert.equal(await raw(p),null);assert.match(await p.locator('#shop-panel').innerText(),/本次远征期间库存固定/);
  await p.reload();await p.locator('#start').waitFor();await emptyReady(p);await startMemory(p,exchangeWorld,profile);await p.locator('#exchange-panel').waitFor();
  assert.equal(await p.locator('#ex-target-A').count(),0,'the leader cannot be chosen');assert.equal(await p.locator('#ex-confirm').isDisabled(),true);
  await click(p,'ex-target-C');await click(p,'ex-cargo-1');await p.screenshot({path:artifact+'windows-service-2-exchange.png',fullPage:true});
  await click(p,'ex-confirm');await p.waitForFunction(()=>window.trial.getState().exchange.used);await ready(p);
  s=await state(p);assert.deepEqual(s.queue,['A','B']);assert.deepEqual(s.exchange,{level:1,used:true,sent:'C'});assert.deepEqual(s.tms.map(t=>t.fate),['held','sent']);assert.equal(s.round,1);
  assert.match(await p.locator('#exchange-panel').innerText(),/本局已经使用/);
  assert.equal(await raw(p),null);assert.deepEqual(errors,[]);return {boughtWithoutRound:true,exchangeOnce:true,fixturesMemoryOnly:true};
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
   await p.locator('#tactic-base-P1').selectOption('followme');await ready(p);
   await p.locator('#tactic-base-P2').selectOption('avoid');await ready(p);
   const pr=await p.evaluate(()=>window.trial.profile());
  assert.deepEqual(pr.roster.map(i=>i.species),['treecko','mudkip']);assert.deepEqual(pr.team,['P1','P2']);assert.equal(pr.leader,'P1');assert.equal(pr.expeditions,0);
   assert.deepEqual(pr.roster.map(i=>i.tactic),['followme','avoid'],'base tactics are saved per instance');
  const base1=await p.locator('#base').innerText()+await p.locator('#party').innerText();assert.match(base1,/木守宫/);assert.match(base1,/水跃鱼/);assert.match(base1,/树叶/);assert.doesNotMatch(base1,/leafage|watergun/);
   const campBeforeRun=await raw(p);await p.locator('#depart').click();await p.waitForFunction(()=>window.trial.getState()!==null);await ready(p);
    let s=await state(p);assert.equal(s.scenario,'expedition');assert.deepEqual(s.queue,['A','B']);assert.equal(s.units.A.species,'treecko');assert.equal(s.leader,'A');assert.equal(s.units.A.tactic,'followme');assert.equal(s.units.B.tactic,'avoid');
    assert.match(await p.locator('#goal-label').innerText(),/本局等级 Lv5 · 升级经验 0\/5/);assert.match(await p.locator('#goal-label').innerText(),/升到下一级需当前等级经验/);
   assert.equal(await raw(p),campBeforeRun,'departure leaves the selected camp tactics in the saved profile');
   const beforeMenu=structuredClone(s);await p.locator('#tactic-run-B').selectOption('wait');await p.waitForFunction(()=>window.trial.getState().units.B.tactic==='wait');
   beforeMenu.units.B.tactic='wait';assert.deepEqual(await state(p),beforeMenu,'changing a maze tactic changes only that unit and does not advance a round');assert.equal(await raw(p),campBeforeRun);
  assert.equal(await p.locator('#guide-card').count(),1);assert.equal(await p.locator('#enemy-hint').count(),1);
  await p.locator('#guide-close').click();assert.equal(await p.locator('#guide-card').count(),0);
   // the first-run guide (an aside) covers the unit cards, so the tactic hover happens after it is closed
   await p.locator('#unit-card-B').hover();await p.waitForSelector('#unit-info');assert.match(await p.locator('#unit-info').innerText(),/原地待命/);
  for(const k of ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp']){await p.keyboard.press(k);await ready(p);if((await state(p)).round>0)break;}
   assert.ok((await state(p)).round>0,'a real key press advanced the run');assert.equal(await raw(p),campBeforeRun,'run actions do not change the camp record');
  assert.ok((await p.locator('#recent-list li').count())>0,'recent events are visible');
  await p.reload();await p.locator('#title-continue').waitFor();
   assert.equal(await raw(p),campBeforeRun,'refresh preserves the exact pre-departure camp bytes');
    await p.locator('#title-continue').click();await ready(p);assert.equal(await state(p),null);assert.equal(await p.locator('#depart').isEnabled(),true);assert.equal(await p.locator('#guide-card').count(),0,'the guide stays closed');
    assert.deepEqual((await p.evaluate(()=>window.trial.profile())).roster.map(i=>i.tactic),['followme','avoid'],'unsettled maze tactic edits are discarded by refresh');
    assert.deepEqual(errors,[]);return {roster:pr.roster.map(i=>i.species),baseTactics:['followme','avoid'],mazeEditNoTurn:true,tacticHover:true,refreshReturnsToCamp:true};
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
await test('7.1/7.8 可读性：悬停敌人看等级与招式、组合草稿显示执行顺序与默认行为',async()=>{
 const {context,page:p,errors}=await setup('K1');
 try{
  await start(p);const s=await state(p);const h=s.units.H;
  const b=await p.locator('canvas').boundingBox();
  const xs=s.floor.map(q=>q.x),ys=s.floor.map(q=>q.y),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX+1,hh=Math.max(...ys)-minY+1,c=Math.min(66,600/w,270/hh);
  await p.mouse.move(b.x+(340-w*c/2+(h.pos.x-minX+.5)*c)*b.width/680,b.y+(175-hh*c/2+(h.pos.y-minY+.5)*c)*b.height/350);
  await p.waitForSelector('#enemy-info');const info=await p.locator('#enemy-info').innerText();
  const {moveZh}=await import('../../src/core/names.ts');assert.match(info,/H/);assert.match(info,new RegExp(`等级 Lv${h.level}`));assert.ok(info.includes(`${h.hp}/${h.maxHp}`));assert.match(info,/作战方针：主动出击/);assert.match(info,/招式：/);
  assert.ok(h.learned.length>0);for(const move of h.learned)assert.ok(info.includes(moveZh(move)),`enemy info shows ${move}`);
  await click(p,'arrange');await click(p,'partner-B');
  const order=await p.locator('#draft-order').innerText();assert.match(order,/→.*敌方/);
  assert.match(await p.locator('#draft-steps').innerText(),/默认行为/);
  assert.deepEqual(await state(p),s);assert.deepEqual(errors,[]);return {inspect:true,enemyLevel:h.level,enemyMoves:h.learned.map(moveZh),orderLine:order};
 }finally{await context.close();}
});
/* UI-only fixture: this starts directly at the legal evolution prompt so the browser check
   proves the choice/defer controls work. It is not evidence of a battle level-up trigger. */
await test('7.8 UI夹具：伊布进化选择与暂缓按钮实际可点击',async()=>{
 const {createScenario}=await import('../../src/core/scenarios.ts');
 const {speciesUnit}=await import('../../src/core/engine.ts');
 const evolutionWorld=()=>{
  const w=createScenario('K1','evolution-ui-fixture');
  const pos=w.units.A.pos;
  w.units.A=speciesUnit('A','eevee',20,pos);
  w.phase='evolution';
  w.pendingEvolutions=[{actor:'A',choices:['vaporeon','jolteon','flareon']}];
  return w;
 };
 const first=await setup('K1');
 try{
  await startMemory(first.page,evolutionWorld());
  assert.equal((await state(first.page)).phase,'evolution');
  assert.match(await first.page.locator('#evolution-choice').innerText(),/伊布可以进化/);
  assert.match(await first.page.locator('#evolution-choice').innerText(),/下次升级时再询问/);
  for(const id of ['vaporeon','jolteon','flareon'])assert.equal(await first.page.locator('#evolve-'+id).count(),1);
  await click(first.page,'evolve-vaporeon');
  const chosen=await state(first.page);
  assert.equal(chosen.phase,'playing');assert.equal(chosen.units.A.species,'vaporeon');assert.equal(chosen.round,0);
  assert.deepEqual(first.errors,[]);
 }finally{await first.context.close();}
 const second=await setup('K1');
 try{
  await startMemory(second.page,evolutionWorld());
  await click(second.page,'evolution-close');
  const deferred=await state(second.page);
  assert.equal(deferred.phase,'playing');assert.equal(deferred.units.A.species,'eevee');assert.equal(deferred.round,0);
  assert.deepEqual(second.errors,[]);
  return {uiOnlyFixture:true,choiceButtonApplied:true,deferButtonApplied:true,notCombatLevelUpEvidence:true};
 }finally{await second.context.close();}
});
/* Stage 7.3: the boss floor, through the developer menu scenes (isolated storage). BOSS: whole floor shown, the team beside the boss. BOSSX: the team on the lobby exit.
   The mouse is moved over canvas cells with the same fixed 40 px cell geometry the other dungeon checks use. */
async function hoverCell(p,x,y){
 const s=await state(p),b=await p.locator('canvas').boundingBox(),cam=await p.evaluate(()=>window.trial.camera());
 await p.mouse.move(b.x+(x*40+20-cam.x)*b.width/680,b.y+(y*40+20-cam.y)*b.height/350);
}
await test('7.3 首领层（开发者菜单场景）：灰烬地砖、首领放大与名牌、首领信息、吹飞被拒的中文原因、从前庭撤离见结算',async()=>{
 const {context,page:p,errors}=await setup('BOSS');
 try{
  const options=await p.locator('#fixture option').allTextContents();assert.ok(options.includes('首领层（紧邻首领）'),'the developer menu offers the boss scene: '+options);
  await start(p);
  const s=await state(p);assert.equal(s.dungeon.level,3);assert.equal(s.dungeon.boss,true);assert.equal(s.units.boss.maxHp,71);assert.equal(s.units.boss.hp,s.units.boss.maxHp);
  const v=await p.evaluate(()=>window.trial.view());
  assert.deepEqual(v.tiles.filter(t=>/^(floor|wall)/.test(t)),['floor-arena','floor-ash','wall-basalt'],'ash theme tiles and the arena tile, no stone tiles');
  assert.ok(Math.abs(v.boss.scale/v.leader.scale-1.5)<0.01,'the boss is drawn 1.5 times larger: '+v.boss.scale/v.leader.scale);assert.ok(v.boss.labels.includes('首领'),'the boss carries a name tag');
  await hoverCell(p,s.units.boss.pos.x,s.units.boss.pos.y);await p.waitForSelector('#enemy-info');
  const info=await p.locator('#enemy-info').innerText();
  const {moveZh}=await import('../../src/core/names.ts'),boss=s.units.boss;assert.match(info,/风速狗（首领）/);assert.ok(info.includes(`${boss.hp}/${boss.maxHp}`));assert.match(info,new RegExp(`等级 Lv${boss.level}`));assert.match(info,/区域首领/);
  for(const move of boss.learned)assert.ok(info.includes(moveZh(move)),`boss info shows ${move}`);assert.match(info,/击败后有概率发出加入邀请/);
  await p.screenshot({path:artifact+'windows-boss-1-floor.png',fullPage:true});
  await click(p,'skill-roar');await cell(p,s.units.boss.pos.x,s.units.boss.pos.y);
  await p.waitForFunction(()=>document.getElementById('message').textContent.includes('首领不能被吹飞'));
  assert.equal(await p.locator('#message').innerText(),'首领不能被吹飞；本轮未执行');
  const after=await state(p);assert.equal(after.round,0);assert.deepEqual(after.units.A.pp,s.units.A.pp,'no PP spent');assert.deepEqual(after.units.boss.pos,s.units.boss.pos);
  assert.deepEqual(errors,[]);return {tiles:v.tiles,bossScale:v.boss.scale,message:'首领不能被吹飞；本轮未执行'};
 }finally{await context.close();}
});
await test('7.3 首领层：不挑战首领，从前庭普通出口撤离，看到结算画面（未挑战）',async()=>{
 const {context,page:p,errors}=await setup('BOSSX');
 try{
  await start(p);
  const s=await state(p),exitPos=s.points.find(q=>q.kind==='exit').pos;assert.deepEqual(s.units[s.leader].pos,exitPos);assert.equal(s.units.boss.maxHp,71);assert.equal(s.units.boss.hp,s.units.boss.maxHp);
  await exit(p);
  const end=await state(p);assert.equal(end.phase,'ended');assert.equal(end.end.outcome,'normal');assert.equal(end.end.boss,false);
  const text=await p.locator('.result').innerText();assert.match(text,/讨伐首领：未挑战/);assert.match(text,/结算/);
  await p.screenshot({path:artifact+'windows-boss-2-result.png',fullPage:true});
  assert.deepEqual(errors,[]);return {settlement:true,boss:'未挑战'};
 }finally{await context.close();}
});
await test('7.3 新游戏→出发→第1层：苔石主题（原石地与岩壁），三层带首领的远征',async()=>{
 const {context,page:p,errors}=await plainContext();
 try{
  await p.goto(base);await p.locator('#title-new').waitFor();await p.locator('#title-new').click();
  await newGameClicks(p,'treecko','mudkip');
  await p.locator('#depart').click();await p.waitForFunction(()=>window.trial.getState()!==null);await ready(p);
  const s=await state(p);assert.equal(s.dungeon.floors,3);assert.equal(s.dungeon.boss,true);assert.equal(s.dungeon.level,1);assert.equal(s.dungeon.base,true);
  const v=await p.evaluate(()=>window.trial.view());assert.deepEqual(v.tiles.filter(t=>/^(floor|wall)/.test(t)),['floor','wall'],'floor 1 shows the original stone tiles');
  assert.match(await p.locator('#world-label').innerText(),/第1层/);
  await p.screenshot({path:artifact+'windows-boss-3-floor1.png',fullPage:true});
  assert.deepEqual(errors,[]);return {tiles:v.tiles,floors:s.dungeon.floors};
 }finally{await context.close();}
});
await test('7.7a 状态卡片：守住与反击递减、攻防阶段显示；开发场景仅在内存',async()=>{
 const {context,page:p,errors}=await setup('K1');
 try{
  const {createScenario}=await import('../../src/core/scenarios.ts');const fixture=createScenario('K1','status-card');fixture.units.B.protect=2;fixture.units.B.counter=1;fixture.units.B.stages={atk:1,def:-2};
  await startMemory(p,fixture);await key(p,'2');const before=await state(p);
  await click(p,'skill-protect');await cell(p,before.units.A.pos.x,before.units.A.pos.y);
  assert.deepEqual(await state(p),before);
  assert.equal(await p.locator('#message').innerText(),'这种招式的目标必须填使用者自己；本轮未执行');
  const status=p.locator('[data-unit-status="B"]');
  assert.equal(await status.innerText(),'守住：剩余2个敌方阶段 · 反击：剩余1个敌方阶段 · 攻击+1 · 防御-2');
  assert.equal(await p.locator('[data-unit-status="C"]').innerText(),'');
  await p.screenshot({path:artifact+'windows-move-status.png',fullPage:true});
  await click(p,'wait');assert.equal(await status.innerText(),'守住：剩余1个敌方阶段 · 攻击+1 · 防御-2');
  await click(p,'wait');assert.equal(await status.innerText(),'攻击+1 · 防御-2');
  assert.equal(await raw(p),null);assert.deepEqual(errors,[]);
  return {countdowns:true,zeroStatusesHidden:true,stages:true,memoryOnly:true};
 }finally{await context.close();}
});
await test('7.7b 仓库：三招可见、学习、配招，新远征使用新版招式机清单',async()=>{
 const {newGameProfile}=await import('../../src/core/base.ts');
 const profile=newGameProfile('treecko','chikorita').profile;
 // Explicit inventory fixture: this check tests learning and equipping, not earning the machines.
 profile.vault={quickguard:1,reflect:1,lightscreen:1};
 const {context,page:p,errors}=await plainContext();
 try{
  await p.goto(base+'?dev=1&seed=16763');await p.locator('#start').waitFor();
  assert.equal(await p.evaluate(pr=>window.trial.store.beginNewGame(pr,true),profile),true);await p.reload();await ready(p);
  for(const [move,label,inst] of [['quickguard','快速防守','P1'],['reflect','反射壁','P2'],['lightscreen','光墙','P2']]){
   assert.match(await p.locator('#tm-'+move).innerText(),new RegExp(label));
   await click(p,'tm-'+move);await click(p,'learn-'+inst);
   assert.ok((await p.evaluate(()=>window.trial.profile())).roster.find(i=>i.id===inst).learned.some(l=>l.move===move));
  }
  await click(p,'carry-P1-pound');await click(p,'carry-P1-quickguard');
  await click(p,'carry-P2-tackle');await click(p,'carry-P2-magicalleaf');
  await click(p,'carry-P2-reflect');await click(p,'carry-P2-lightscreen');
  const prepared=await p.evaluate(()=>window.trial.profile());
  assert.deepEqual(prepared.roster[0].carry,['leafage','quickguard']);
  assert.deepEqual(prepared.roster[1].carry,['reflect','lightscreen']);
  await p.screenshot({path:artifact+'windows-team-guard-warehouse.png',fullPage:true});
  await p.reload();await ready(p);assert.deepEqual(await p.evaluate(()=>window.trial.profile()),prepared);const campBytes=await raw(p);
  await click(p,'depart');const s=await state(p);assert.equal(await raw(p),campBytes,'departure does not save the expedition world');assert.equal(s.dungeon.tmPool,3);
  assert.ok(s.units.A.learned.includes('quickguard'));assert.deepEqual(s.units.B.learned,['reflect','lightscreen']);
  assert.deepEqual(errors,[]);return {injectedCampInventory:true,learnedAndEquipped:true,newPool:3,expeditionMemoryOnly:true};
 }finally{await context.close();}
});

await test('7.7b 状态：实际施放团队保护、倒计时与快速防守；开发场景只在内存',async()=>{
 const {context,page:p,errors}=await setup('K1');
 try{
  const {createScenario}=await import('../../src/core/scenarios.ts');const fixture=createScenario('K1','team-guard-status'),unit=fixture.units.B;
  for(const move of ['reflect','lightscreen','quickguard']){unit.learned.push(move);unit.pp[move]=3;unit.maxPp[move]=3;}
  for(const id of fixture.enemies)fixture.units[id].damage=0;
  await startMemory(p,fixture);await key(p,'2');
  for(const move of ['reflect','lightscreen']){const s=await state(p);await click(p,'skill-'+move);await cell(p,s.units.B.pos.x,s.units.B.pos.y);}
  const guarded=await state(p);
  assert.equal(guarded.units.B.reflect,8);assert.equal(guarded.units.B.lightscreen,9);
  const status=p.locator('[data-unit-status="B"]');
  assert.match(await status.innerText(),/反射壁：剩余8个敌方阶段/);assert.match(await status.innerText(),/光墙：剩余9个敌方阶段/);
  await p.screenshot({path:artifact+'windows-team-guard-status.png',fullPage:true});
  await click(p,'skill-quickguard');await cell(p,guarded.units.B.pos.x,guarded.units.B.pos.y);
  const quick=await state(p);assert.equal(quick.units.B.lastMove,'quickguard');
  for(const u of Object.values(quick.units))assert.equal(Object.hasOwn(u,'quickguard'),false);
  assert.match(await p.locator('#history').textContent(),/快速防守/);
  assert.equal(await raw(p),null);assert.deepEqual(errors,[]);return {fixtureMoves:true,realCasts:true,reflect:8,lightscreen:9,quickGuardTransient:true,memoryOnly:true};
 }finally{await context.close();}
});
await browser.close();
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
