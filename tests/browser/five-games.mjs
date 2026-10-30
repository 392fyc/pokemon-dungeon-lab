import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

fs.mkdirSync('.artifacts/trial',{recursive:true});
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TRIAL_URL;
if(!base)throw Error('Set TRIAL_URL.');
const routes=JSON.parse(fs.readFileSync(new URL('./five-game-routes.json',import.meta.url),'utf8'));
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const report={platform:process.platform,browser:await browser.version(),url:base,games:[],status:'FAIL'};
const deadline=setTimeout(()=>void browser.close(),8*60*1000);
const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
await context.addInitScript(()=>{window.__trialNoAnim=true;});
const page=await context.newPage(),errors=[];
page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',r=>errors.push(r.url()));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const ready=()=>page.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
const state=()=>page.evaluate(()=>window.trial.getState());
const envelope=()=>page.evaluate(()=>window.trial.store.envelope);
const click=async id=>{await page.locator('#'+id).click();await ready();};
async function cell(pos){
 const camera=await page.evaluate(()=>window.trial.camera()),box=await page.locator('canvas').boundingBox();
 const x=(pos.x*40+20-camera.x)*box.width/680,y=(pos.y*40+20-camera.y)*box.height/350;
 assert.ok(x>=0&&x<box.width&&y>=0&&y<box.height,'target must be visible on canvas');
 await page.mouse.click(box.x+x,box.y+y);await ready();
}
// Replays actual UI input. Never dispatches a command or edits a save through evaluate.
async function command(c){
 const s=await state();
 if(c.type==='finishExit'){assert.equal(s.phase,'ended');return;}
 if(c.type==='finishTransit'){assert.equal(s.phase,'playing');return;}
 if(c.type==='invite'){
  assert.equal(s.phase,'invitation');
  if(c.choice==='accept'){
   const pending=s.invitations.find(i=>i.status==='pending');assert.ok(pending);
   if(c.outgoing)await click('out-'+s.queue.indexOf(c.outgoing));else await click('out-none');
   await click('accept');
   const after=await state();
   assert.equal(after.invitations.find(i=>i.id===pending.id).status,'accepted');
   assert.ok(after.queue.includes(pending.unit.id),'accepted recruit must actually join the party');
  }else{await click('reject');await click('reject-confirm');}
  return;
 }
 if(c.type==='switch'){await click('leader-'+s.queue.indexOf(c.actor));return;}
 if(c.type==='buy'){await click('buy-'+c.item);return;}
 assert.equal(c.type,'round');assert.equal(c.override,undefined,'route uses single-character input');
 const a=c.action;
 if(a.type==='move'){
  const from=s.units[s.leader].pos,dx=a.to.x-from.x,dy=a.to.y-from.y;
  assert.equal(Math.abs(dx)+Math.abs(dy),1);
  await page.keyboard.press(dx===1?'ArrowRight':dx===-1?'ArrowLeft':dy===1?'ArrowDown':'ArrowUp');await ready();
 }else if(a.type==='basic')await cell(s.units[a.target].pos);
 else if(a.type==='skill'){await click('skill-'+a.skill);await cell(s.units[a.target].pos);}
 else if(a.type==='wait')await click('wait');
 else if(a.type==='swap'){await click('swap');await click('partner-'+a.target);await click('submit');}
 else if(a.type==='use'){await click('use-'+a.item);await click('item-target-'+a.target);}
 else if(a.type==='rest')await click('rest');
 else if(a.type==='interact'){
  if(a.exit){await click('take-exit');await click('exit-confirm');}else await click('take');
 }else throw Error('Unsupported route action '+JSON.stringify(a));
 assert.ok((await state()).round>s.round,'UI action must advance a complete round');
}
async function roundTrip(label){
 const before=await envelope();
 await click('open-settings');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-export').click()]);
 const bytes=fs.readFileSync(await download.path(),'utf8');
 assert.deepEqual(JSON.parse(bytes),before,label+' export');
 page.once('dialog',async d=>{assert.match(d.message(),/覆盖当前存档/);await d.accept();});
 await page.locator('#save-file').setInputFiles({name:'five-games.json',mimeType:'application/json',buffer:Buffer.from(bytes)});
 await page.waitForFunction(()=>document.querySelector('#transfer-message').textContent.includes('已导入并保存'));
 assert.deepEqual(await envelope(),before,label+' import');
 await click('settings-close');await page.reload();await ready();
 assert.deepEqual(await envelope(),before,label+' reload');
}
try{
 await page.goto(base);await page.locator('#title-new').waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('dungeon-trial.player.v1')),null);
 await page.locator('#title-new').click();await page.locator('#pick-main-'+routes.main).click();
 await page.locator('#main-next').click();await page.locator('#pick-deputy-'+routes.deputy).click();
 await page.locator('#newgame-start').click();await ready();
 assert.equal((await envelope()).profile.expeditions,0);
 const runIds=new Set();let accepted=0,learned=false,carriedIntoRun=false;
 assert.equal(routes.games.length,5);
 for(const [index,route] of routes.games.entries()){
  // The developer URL only fixes generation seed; it keeps the same freshly-created player save.
  const before=await envelope();await page.goto(base+'?dev=1&seed='+route.seed);await ready();
  assert.deepEqual(await envelope(),before,'selecting a seed must not replace the player save');
  assert.equal(before.profile.expeditions,index);assert.equal(before.current,null);
  for(let n=0;n<route.purse/20;n++)await click('purse-up');
  assert.equal(Number(await page.locator('#purse-value').innerText()),route.purse);
  assert.equal(await page.locator('#depart').isEnabled(),true);await click('depart');
  let s=await state();assert.equal(s.dungeon.seed,route.seed);assert.ok(!runIds.has(s.runId));runIds.add(s.runId);
  if(learned){const u=Object.values(s.units).find(u=>u.inst===routes.training.inst);assert.ok(u.learned.includes(routes.training.move));carriedIntoRun=true;}
  for(const [commandIndex,c] of route.commands.entries()){
   try{await command(c);if(c.type==='invite'&&c.choice==='accept')accepted++;}
   catch(error){throw new Error(`第 ${index+1} 局第 ${commandIndex+1} 条指令 ${JSON.stringify(c)}：${error instanceof Error?error.message:String(error)}`,{cause:error});}
  }
  s=await state();assert.equal(s.phase,'ended');assert.equal(s.end.outcome,'normal');assert.equal(s.end.effective,true);
  await roundTrip(`game ${index+1} terminal`);
  await click('to-base');assert.equal((await envelope()).profile.expeditions,index+1);
  if(routes.training.afterGame===index+1){
   const t=routes.training,p=(await envelope()).profile;
   assert.ok(p.vault[t.move]>0);assert.ok(!p.roster.find(u=>u.id===t.inst).learned.some(k=>k.move===t.move));
   await click('tm-'+t.move);await click('learn-'+t.inst);
   await click(`carry-${t.inst}-${t.removeMove}`);await click(`carry-${t.inst}-${t.move}`);
   assert.ok((await envelope()).profile.roster.find(u=>u.id===t.inst).carry.includes(t.move));learned=true;
  }
  await roundTrip(`game ${index+1} base`);
  assert.equal((await envelope()).current,null);assert.equal(await page.locator('#depart').isEnabled(),true);
  report.games.push({game:index+1,seed:route.seed,runId:s.runId,rounds:s.round,outcome:s.end.outcome,effective:s.end.effective,terminalAndBaseRoundTrip:true,readyToDepart:true});
  console.log('PASS fresh-save game',index+1,JSON.stringify(report.games.at(-1)));
 }
 assert.ok(accepted>=1);assert.ok(learned);assert.ok(carriedIntoRun);assert.equal(runIds.size,5);assert.deepEqual(errors,[]);
 await page.screenshot({path:'.artifacts/trial/five-games-base.png',fullPage:true});
 Object.assign(report,{accepted,learned,carriedIntoRun,pageErrors:errors,status:'PASS'});
}catch(e){report.error=String(e.stack??e);throw e;}
finally{clearTimeout(deadline);fs.writeFileSync('.artifacts/trial/five-games-results.json',JSON.stringify(report,null,2));await context.close();await browser.close();}
