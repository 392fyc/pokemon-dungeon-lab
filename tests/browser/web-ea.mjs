import assert from 'node:assert/strict';
import {confirmDeparture} from './camp-ui.mjs';
import {campControl} from './camp-ui.mjs';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.TRIAL_URL;
if(!base)throw Error('Set TRIAL_URL.');
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const result={platform:process.platform,url:base,browser:await browser.version(),checks:[]};
const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
const p=await context.newPage(),errors=[],failed=[],scriptRequests=[],backdrops=[];
p.on('request',r=>{if(r.resourceType()==='script')scriptRequests.push(r.url());});
p.on('pageerror',e=>errors.push(e.message));
p.on('response',r=>{
 if(r.status()>=400)failed.push(r.url());
 if(/\/assets\/camp\/base\.png$/.test(r.url()))backdrops.push({url:r.url(),status:r.status(),type:r.headers()['content-type']});
});
p.on('requestfailed',r=>failed.push(r.url()));
p.setDefaultTimeout(15000);
const raw=()=>p.evaluate(()=>localStorage.getItem('dungeon-trial.player.v1'));
const readyOn=page=>page.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
const ready=()=>readyOn(p);
async function clickUI(page,id){
 if(id==='open-settings'&&await page.locator('#hud-settings').isVisible())id='hud-settings';
 id=await campControl(page,id);
 const target=page.locator('#'+id),actions=page.locator('#hud-actions'),actionsOpen=page.locator('#actions-open');
 if(await target.count()&&await actions.count()&&await actions.isHidden()&&await actionsOpen.isVisible()&&await target.evaluate(el=>!!(el.closest('#controls,#hud-actions')||(el.closest('#save')&&!el.closest('#flow'))))){await actionsOpen.click();await readyOn(page);}
 await target.click();await readyOn(page);
}
async function clickCell(page,pos){
 const actions=page.locator('#hud-actions');if(await actions.count()&&await actions.isVisible()&&await page.locator('#actions-open').isVisible()){await page.locator('#actions-open').click();await readyOn(page);}
 const bag=page.locator('#hud-bag');if(await bag.count()&&await bag.isVisible()){await page.locator('#bag-close').click();await readyOn(page);}
 for(let attempt=0;attempt<4;attempt++){
  const view=await page.evaluate(()=>window.trial.view()),g=view.geometry,v=view.cameraView;
  const camera=await page.evaluate(()=>window.trial.camera()),canvas=page.locator('canvas'),box=await canvas.boundingBox();
  const x=(g.ox+(pos.x-g.minX+.5)*g.cell-camera.x)*box.width/v.width;
  const y=(g.oy+(pos.y-g.minY+.5)*g.cell-camera.y)*box.height/v.height;
  assert.ok(x>=0&&x<box.width&&y>=0&&y<box.height,'the selected map target must be inside the current viewport');
  await page.mouse.move(box.x+x,box.y+y);await page.waitForTimeout(150);
  const after=await canvas.boundingBox(),afterCamera=await page.evaluate(()=>window.trial.camera());
  if(['x','y','width','height'].every(k=>Math.abs(after[k]-box[k])<0.5)&&afterCamera.x===camera.x&&afterCamera.y===camera.y){await page.mouse.click(box.x+x,box.y+y);await readyOn(page);return;}
 }
 assert.fail('the live canvas camera did not settle before the real click');
}
const capture=name=>p.screenshot({path:'.artifacts/trial/title-load-'+name+'.png',fullPage:true});
async function upload(text,accept=true){
 await p.locator('#settings-tab-save').click();
 p.once('dialog',async d=>{assert.match(d.message(),/覆盖当前存档/);await (accept?d.accept():d.dismiss());});
 await p.locator('#save-file').setInputFiles({name:'save.json',mimeType:'application/json',buffer:Buffer.from(text)});
 await p.waitForFunction(()=>!document.querySelector('#settings-close').disabled);
}
async function exported(){
 await p.locator('#settings-tab-save').click();
 const [download]=await Promise.all([p.waitForEvent('download'),p.locator('#save-export').click()]);
 return fs.readFileSync(await download.path(),'utf8');
}
try{
 await p.goto(base);await p.locator('#title-new').waitFor();
 await p.waitForLoadState('networkidle');
 await capture('01-title');
 const backdropUrl=new URL('assets/camp/base.png',p.url()).href;
 assert.ok(backdrops.some(r=>r.url===backdropUrl&&r.status===200&&r.type?.startsWith('image/png')),'the title background loads from the same application path: '+JSON.stringify(backdrops));
 assert.equal(await p.evaluate(()=>performance.getEntriesByType('resource').some(r=>/\/phaser-.*\.js/.test(r.name))),false,'title must not load Phaser');
 assert.equal(scriptRequests.some(url=>/\/game-data-.*\.js/.test(url)),false,'idle title must not request game data');
 assert.ok(scriptRequests.length>0&&scriptRequests.every(url=>/\/index-.*\.js/.test(url)),'idle title requests only the small entry script');
 await p.locator('#title-settings').click();await p.locator('#anim-off').click();
 assert.ok(scriptRequests.some(url=>/\/game-data-.*\.js/.test(url)),'entering settings loads the existing save validator and game data');
 assert.match(await p.locator('#settings-heading').innerText(),/设置/);
 await p.locator('#settings-tab-keys').click();const help=await p.locator('#settings-pane-keys').innerText();for(const text of ['W','A','S','D','斜向移动','F','向前普通攻击','Tab','切换操控','B','背包','等待'])assert.ok(help.includes(text),'key instructions include '+text);
 await p.locator('#settings-close').click();await p.reload();await p.locator('#title-settings').click();
 assert.equal(await p.locator('#anim-toggle').isChecked(),false);await p.locator('#settings-close').click();
 result.checks.push('静止标题只请求入口脚本、不请求 Phaser 或数据块；主动打开设置才加载存档校验；动画偏好重载保留，设置含按键说明');
 await p.locator('#title-new').click();await p.locator('#pick-main-treecko').waitFor();await capture('02-new-game');
 await p.locator('#pick-main-treecko').click();await p.locator('#main-next').click();
 await p.locator('#pick-deputy-mudkip').click();await p.locator('#newgame-start').click();await ready();
 await p.waitForLoadState('networkidle');
 const campBackdropUrl=new URL('assets/camp/base.png',p.url()).href;
 assert.ok(backdrops.some(r=>r.url===campBackdropUrl&&r.status===200&&r.type?.startsWith('image/png')),'the camp painting loads from the same application path: '+JSON.stringify(backdrops));
 await capture('03-camp');
 assert.ok(await p.evaluate(()=>performance.getEntriesByType('resource').some(r=>/\/phaser-.*\.js/.test(r.name))));
 await confirmDeparture(p);await ready();
 await capture('04-departure');
 const before=await raw();
 await clickUI(p,'open-settings');await p.keyboard.press('ArrowRight');assert.equal(await raw(),before,'settings keys must not advance the world');
 await p.screenshot({path:'.artifacts/trial/web-ea-settings.png',fullPage:true});
 await p.locator('#settings-close').click();
 const camp=await p.evaluate(()=>window.trial.profile());await p.keyboard.press('.');await ready();
 assert.equal(await p.evaluate(()=>window.trial.getState().round),1);assert.equal(await raw(),before,'world actions do not write the camp record');
 await capture('05-round-one');
 await p.reload();await p.locator('#title-continue').waitFor();assert.equal(await raw(),before,'refresh returns to the exact pre-departure bytes');
 await capture('06-refresh-title');
 await p.locator('#title-continue').click();await ready();assert.equal(await p.evaluate(()=>window.trial.getState()),null);assert.deepEqual(await p.evaluate(()=>window.trial.profile()),camp);
 await capture('07-continue-camp');
 await confirmDeparture(p);await ready();assert.equal(await raw(),before,'a new departure again leaves the camp record unchanged');
 // New expeditions have no early exit. Refresh discards the in-memory run; camp export/import follows.
 assert.equal(await p.locator('#take-exit').count(),0);
 assert.equal(await p.evaluate(()=>window.trial.getState().points.some(p=>p.kind==='exit'||p.kind==='up')),false);
 await p.reload();await p.locator('#title-continue').click();await ready();
 const original=JSON.parse(await raw());assert.equal(original.format,2);assert.deepEqual(Object.keys(original).sort(),['build','content','format','profile','rules','sequence']);assert.equal(await p.evaluate(()=>window.trial.getState()),null);
 await clickUI(p,'open-settings');const backup=await exported();assert.deepEqual(JSON.parse(backup),original);
 for(const k of ['format','rules','content','build'])assert.ok(Object.hasOwn(original,k));
 const bad=JSON.parse(backup);bad.profile.account=-1;
 await upload(JSON.stringify(bad));assert.match(await p.locator('#transfer-message').innerText(),/损坏/);assert.deepEqual(JSON.parse(await raw()),original);
 assert.equal(await p.evaluate(()=>window.trial.store.error),'');assert.equal(await p.locator('#save .error').count(),0,'bad import must not mark the current save as broken');
 // Oversized files must be rejected before file.text() or the overwrite confirmation.
 await p.evaluate(()=>{window.fileTextReads=0;const text=File.prototype.text;File.prototype.text=function(){window.fileTextReads++;return text.call(this);};});
 const unexpectedDialogs=[];const onDialog=async d=>{unexpectedDialogs.push(d.message());await d.dismiss();};p.on('dialog',onDialog);
 await p.locator('#save-file').setInputFiles({name:'too-large.json',mimeType:'application/json',buffer:Buffer.alloc(5*1024*1024+1,32)});
 await p.waitForFunction(()=>document.querySelector('#transfer-message').textContent.includes('超过 5 MiB'));
 p.off('dialog',onDialog);assert.deepEqual(unexpectedDialogs,[]);assert.equal(await p.evaluate(()=>window.fileTextReads),0);
 assert.deepEqual(JSON.parse(await raw()),original);assert.equal(await p.evaluate(()=>window.trial.store.error),'');
 result.checks.push('超过 5 MiB 的文件在读取和覆盖确认前被拒绝，当前记录及保存错误状态不变');
 await upload(backup,false);assert.match(await p.locator('#transfer-message').innerText(),/已取消/);assert.deepEqual(JSON.parse(await raw()),original);
 await upload(backup);assert.match(await p.locator('#transfer-message').innerText(),/已导入并保存/);assert.deepEqual(JSON.parse(await raw()),original);
 await p.locator('#settings-close').click();await p.reload();await p.locator('#title-continue').click();await ready();assert.deepEqual(JSON.parse(await raw()),original);
 await capture('08-reload-continue');
 result.checks.push('玩家新游戏→基地→出发→中途刷新回基地→再次出发→验证无出口→刷新回营地；导出导入及重载完全一致；非法营地数据拒绝；取消导入不写入；设置内方向键不推进回合');
 // An incompatible save is injected only to exercise the recovery UI.
 const incompatible=JSON.stringify({...original,format:999},null,2);
 await p.evaluate(text=>localStorage.setItem('dungeon-trial.player.v1',text),incompatible);await p.reload();
 await p.locator('#title-settings').click();await p.locator('#settings').waitFor({state:'visible'});assert.match(await p.locator('#transfer-message').innerText(),/版本不兼容/);
 const diagnosis=await p.evaluate(()=>window.trial.store.error);
 await upload(backup);assert.match(await p.locator('#transfer-message').innerText(),/先导出/);
 assert.equal(await p.evaluate(()=>window.trial.store.error),diagnosis);assert.equal(await raw(),incompatible);
 assert.match(await p.locator('#title-screen .error').innerText(),/版本不兼容/);
 assert.doesNotMatch(await p.locator('#title-screen .error').innerText(),/先导出/);
 assert.equal(await exported(),incompatible);await upload(backup);assert.deepEqual(JSON.parse(await raw()),original);
 result.checks.push('不兼容存档有中文原因，可按原字节导出后导入有效记录');
 await p.locator('#settings-close').click();
 // Complete the fixed-map five-round route (7.8: real Geodude E has 8 HP, so two 6-point basic attacks defeat it) using keys, canvas attacks and invitation/exit buttons.
 // Use a separate browser context below, so the player save is not replaced by a developer trial.
 const runContext=await browser.newContext({viewport:{width:1440,height:1100}});
 try{
  await runContext.addInitScript(()=>{window.__trialNoAnim=true;});const q=await runContext.newPage();
  q.on('pageerror',e=>errors.push(e.message));q.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
  await q.goto(base+'?dev=1');await q.locator('#start').click();await readyOn(q);
  await q.evaluate(()=>{window.trial.store.world.noCrit=true;});   // a critical hit would end the fixed five-round route a round early
  await q.keyboard.press('ArrowRight');await readyOn(q);
  const enemy=await q.evaluate(()=>{const s=window.trial.getState();return s.units.E.pos;});
  for(let i=0;i<2;i++)await clickCell(q,enemy);
  await clickUI(q,'reject');await q.keyboard.press('ArrowRight');await readyOn(q);
  await clickUI(q,'take-exit');await clickUI(q,'exit-confirm');
  await q.waitForFunction(()=>window.trial.getState()?.phase==='ended');
  const end=await q.evaluate(()=>window.trial.getState());assert.equal(end.round,5);assert.equal(end.goal,true);assert.equal(end.end.outcome,'normal');
  await q.screenshot({path:'.artifacts/trial/web-ea-completed-run.png',fullPage:true});
  result.checks.push('固定主图五轮：移动、两次普攻、拒绝邀请、完成 G 并正常撤离');
 }finally{await runContext.close();}
 // Presence alone does not promise a valid save; the existing validator runs on entry.
 const corruptContext=await browser.newContext();
 try{
  await corruptContext.addInitScript(()=>localStorage.setItem('dungeon-trial.player.v1','broken-json-record'));
  const q=await corruptContext.newPage();q.setDefaultTimeout(15000);
  q.on('pageerror',e=>errors.push(e.message));
  await q.goto(base);await q.locator('#title-continue').waitFor();
  assert.equal(await q.locator('#title-continue').innerText(),'读取存档');
  assert.equal(await q.locator('#title-save-line').innerText(),'读取存档详情需要加载游戏');
  await q.locator('#title-continue').click();
  await q.getByText(/存档无法载入：/).waitFor();
  assert.equal(await q.locator('#title-continue').count(),0);
  assert.equal(await q.evaluate(()=>localStorage.getItem('dungeon-trial.player.v1')),'broken-json-record');
  result.checks.push('未校验的记录显示中性读取入口；损坏记录进入后提示无法载入且原字节不变');
 }finally{await corruptContext.close();}
 // A failed lazy data request must leave the saved bytes untouched and offer a clear reload action.
 const failureContext=await browser.newContext();
 let releaseData;
 const dataGate=new Promise(resolve=>{releaseData=resolve;});
 try{
  await failureContext.addInitScript(record=>localStorage.setItem('dungeon-trial.player.v1',record),backup);
  const q=await failureContext.newPage();q.setDefaultTimeout(15000);
  await q.route(/\/game-data-.*\.js/,async route=>{await dataGate;await route.abort('failed');});
  await q.goto(base);await q.locator('#title-new').click();
  await q.getByText('正在加载游戏，请稍候…',{exact:true}).waitFor();
  assert.equal(await q.locator('#title-new').isDisabled(),true);
  releaseData();
  await q.getByText('游戏加载失败。请刷新页面后重试；浏览器中的原记录未被清除。',{exact:true}).waitFor();
  assert.equal(await q.evaluate(()=>localStorage.getItem('dungeon-trial.player.v1')),backup);
  assert.equal(await q.locator('#entry-reload').isVisible(),true);
  result.checks.push('按需加载期间显示中文提示并防止重复点击；数据块加载失败可刷新重试，原存档字节保持不变');
 }finally{releaseData();await failureContext.close();}
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 result.status='PASS';console.log(JSON.stringify(result,null,2));
}catch(e){result.status='FAIL';result.error=String(e.stack??e);throw e;}
finally{fs.writeFileSync('.artifacts/trial/web-ea-results.json',JSON.stringify(result,null,2));await context.close();await browser.close();}
