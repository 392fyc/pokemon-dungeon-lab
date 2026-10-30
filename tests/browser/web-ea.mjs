import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.TRIAL_URL;
if(!base)throw Error('Set TRIAL_URL.');
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const result={platform:process.platform,url:base,browser:await browser.version(),checks:[]};
const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
const p=await context.newPage(),errors=[],failed=[];
p.on('pageerror',e=>errors.push(e.message));
p.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
p.on('requestfailed',r=>failed.push(r.url()));
p.setDefaultTimeout(15000);
const raw=()=>p.evaluate(()=>localStorage.getItem('dungeon-trial.player.v1'));
const ready=()=>p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
async function upload(text,accept=true){
 p.once('dialog',async d=>{assert.match(d.message(),/覆盖当前存档/);await (accept?d.accept():d.dismiss());});
 await p.locator('#save-file').setInputFiles({name:'save.json',mimeType:'application/json',buffer:Buffer.from(text)});
 await p.waitForFunction(()=>!document.querySelector('#settings-close').disabled);
}
async function exported(){
 const [download]=await Promise.all([p.waitForEvent('download'),p.locator('#save-export').click()]);
 return fs.readFileSync(await download.path(),'utf8');
}
try{
 await p.goto(base);await p.locator('#title-new').waitFor();
 assert.equal(await p.evaluate(()=>performance.getEntriesByType('resource').some(r=>/\/phaser-.*\.js/.test(r.name))),false,'title must not load Phaser');
 await p.locator('#title-settings').click();await p.locator('#anim-toggle').uncheck();
 assert.match(await p.locator('#settings').innerText(),/设置与存档/);
 await p.locator('#settings summary').click();assert.match(await p.locator('#settings').innerText(),/方向键移动/);
 await p.locator('#settings-close').click();await p.reload();await p.locator('#title-settings').click();
 assert.equal(await p.locator('#anim-toggle').isChecked(),false);await p.locator('#settings-close').click();
 result.checks.push('标题不请求 Phaser；动画偏好重载保留，设置含按键说明');
 await p.locator('#title-new').click();await p.locator('#pick-main-treecko').click();await p.locator('#main-next').click();
 await p.locator('#pick-deputy-mudkip').click();await p.locator('#newgame-start').click();await ready();
 assert.ok(await p.evaluate(()=>performance.getEntriesByType('resource').some(r=>/\/phaser-.*\.js/.test(r.name))));
 await p.locator('#depart').click();await ready();
 const before=await raw();
 await p.locator('#open-settings').click();await p.keyboard.press('ArrowRight');assert.equal(await raw(),before,'settings keys must not advance the world');
 await p.screenshot({path:'.artifacts/trial/web-ea-settings.png',fullPage:true});
 await p.locator('#settings-close').click();
 // The first-floor entrance is an ordinary exit. This is a real one-round expedition,
 // not an effective expedition or a three-floor clear; the fixed-map full route below is separate.
 await p.locator('#take-exit').click();await p.locator('#exit-confirm').click();
 await p.waitForFunction(()=>window.trial.getState()?.phase==='ended');
 assert.equal(await p.evaluate(()=>window.trial.getState().end.outcome),'normal');
 await p.locator('#to-base').click();await ready();
 const original=JSON.parse(await raw());assert.equal(original.current,null);assert.equal(original.recent.phase,'ended');
 await p.locator('#open-settings').click();const backup=await exported();assert.deepEqual(JSON.parse(backup),original);
 for(const k of ['format','rules','content','build'])assert.ok(Object.hasOwn(original,k));
 const bad=JSON.parse(backup);bad.recent.round=-1;
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
 result.checks.push('玩家新游戏→基地→出发→入口撤离→结算回基地；导出导入及重载完全一致；非法篡改拒绝；取消导入不写入；设置内方向键不推进回合');
 // An incompatible save is injected only to exercise the recovery UI.
 const incompatible=JSON.stringify({...original,format:999},null,2);
 await p.evaluate(text=>localStorage.setItem('dungeon-trial.player.v1',text),incompatible);await p.reload();
 await p.locator('#title-settings').click();assert.match(await p.locator('#transfer-message').innerText(),/版本不兼容/);
 const diagnosis=await p.evaluate(()=>window.trial.store.error);
 await upload(backup);assert.match(await p.locator('#transfer-message').innerText(),/先导出/);
 assert.equal(await p.evaluate(()=>window.trial.store.error),diagnosis);assert.equal(await raw(),incompatible);
 assert.match(await p.locator('#title-screen .error').innerText(),/版本不兼容/);
 assert.doesNotMatch(await p.locator('#title-screen .error').innerText(),/先导出/);
 assert.equal(await exported(),incompatible);await upload(backup);assert.deepEqual(JSON.parse(await raw()),original);
 result.checks.push('不兼容存档有中文原因，可按原字节导出后导入有效记录');
 await p.locator('#settings-close').click();
 // Complete the fixed-map six-round route using keys, canvas attacks and invitation/exit buttons.
 // Use a separate browser context below, so the player save is not replaced by a developer trial.
 const runContext=await browser.newContext({viewport:{width:1440,height:1100}});
 try{
  await runContext.addInitScript(()=>{window.__trialNoAnim=true;});const q=await runContext.newPage();
  q.on('pageerror',e=>errors.push(e.message));q.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
  await q.goto(base+'?dev=1');await q.locator('#start').click();await q.waitForFunction(()=>window.trial?.view());
  await q.keyboard.press('ArrowRight');
  const b=await q.locator('canvas').boundingBox();
  for(let i=0;i<3;i++)await q.mouse.click(b.x+310*b.width/680,b.y+175*b.height/350);
  await q.locator('#reject').click();await q.locator('#reject-confirm').click();await q.keyboard.press('ArrowRight');
  await q.locator('#take-exit').click();await q.locator('#exit-confirm').click();
  await q.waitForFunction(()=>window.trial.getState()?.phase==='ended');
  const end=await q.evaluate(()=>window.trial.getState());assert.equal(end.round,6);assert.equal(end.goal,true);assert.equal(end.end.outcome,'normal');
  await q.screenshot({path:'.artifacts/trial/web-ea-completed-run.png',fullPage:true});
  result.checks.push('固定主图六轮：移动、三次普攻、拒绝邀请、完成 G 并正常撤离');
 }finally{await runContext.close();}
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 result.status='PASS';console.log(JSON.stringify(result,null,2));
}catch(e){result.status='FAIL';result.error=String(e.stack??e);throw e;}
finally{fs.writeFileSync('.artifacts/trial/web-ea-results.json',JSON.stringify(result,null,2));await context.close();await browser.close();}
