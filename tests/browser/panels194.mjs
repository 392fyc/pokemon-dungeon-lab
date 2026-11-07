import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScenario,scenarioProfile} from '../../src/core/scenarios.ts';
import {TrialStore} from '../../src/core/save.ts';

const visibleRect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
export async function panels194Checks({setup,startMemory,state,ready,cell,artifact,width,height}){
 const {context,page:p,errors}=await setup('BOSSWIN','pass',false,'dtef',width<600?{hasTouch:true,isMobile:true}:{});
 const report={width,height,fixtureBoundary:'Boss scenario with controlled prior recruitment, acquired TMs, completed commissions and camp experience. Real detail/settings controls and final map attack; no natural-route or balance claim.'};
 try{
  await p.setViewportSize({width,height});
  const profile=scenarioProfile('BOSSWIN');profile.rankExp=5;
  const w=createScenario('BOSSWIN','panels194-'+width);w.completedCommissions=3;
  for(const [id,species] of [['N1','pidgey'],['N2','rattata']]){
   const u=structuredClone(w.units[w.queue[0]]);Object.assign(u,{id,species,entrySpecies:species,protected:false,pos:null});delete u.inst;
   w.units[id]=u;w.camp.push(id);
  }
  w.tms=['protect','thunderwave','roar','toxic','swordsdance'].map(move=>({move,source:'target',fate:'held'}));
  await startMemory(p,w,profile);await p.evaluate(()=>document.fonts.ready);
  const before=await state(p);
  await p.locator('[data-hud-details]').first().click();
  await p.locator('#unit-details-dialog').waitFor({state:'visible'});
  assert.equal(await p.locator('#unit-details-dialog').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(240, 228, 198)','details retain the approved opaque paper background');
  assert.equal(await p.locator('[data-detail-tactic]').count(),6);
  assert.equal(await p.locator('.detail-moves > *').count(),4);
  assert.equal(await p.locator('.detail-stat-chart').count(),1);
  assert.deepEqual(await state(p),before,'opening details is read-only');
  for(const key of ['ArrowRight','.','f','1','b','Tab'])await p.keyboard.press(key);
  assert.deepEqual(await state(p),before,'detail dialog keys never reach game commands');
  const b=before.queue[1];await p.locator('[data-detail-unit="'+b+'"]').click();
  await p.locator('[data-detail-tactic="wait"]').focus();await p.keyboard.press('Enter');await ready(p);
  await p.waitForFunction(id=>window.trial.getState().units[id].tactic==='wait',b);
  assert.equal((await state(p)).round,before.round,'tactic changes take no round');
  assert.equal(await p.evaluate(()=>document.activeElement?.id),'detail-tactic-wait','keyboard tactic changes restore the same control after renders');
  const move=p.locator('[data-detail-skill]').first();await move.focus();
  await p.locator('#detail-tooltip').waitFor({state:'visible'});
  for(const text of ['威力','命中','PP','射程','范围'])assert.ok((await p.locator('#detail-tooltip').innerText()).includes(text));
  await p.screenshot({path:artifact+'panels194-'+width+'-detail-tip.png'});
  await p.locator('[data-detail-unit="boss"]').click();
  assert.equal(await p.locator('.detail-tactics').count(),0,'enemy details cannot change enemy tactics');
  assert.ok((await p.locator('.detail-hp').innerText()).includes('1/'));
  await p.screenshot({path:artifact+'panels194-'+width+'-enemy-detail.png'});
  await p.keyboard.press('Escape');assert.equal(await p.locator('#unit-details-dialog').count(),0);
  assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('data-hud-details')),before.queue[0],'Escape returns focus to the original member button');
  await p.locator('[data-hud-details]').first().click();await p.screenshot({path:artifact+'panels194-'+width+'-detail.png'});
  await p.locator('#unit-detail-close').click();

  const beforeSettings=await state(p);await p.locator('#hud-settings').click();
  await p.screenshot({path:artifact+'panels194-'+width+'-settings-display.png'});
  await p.locator('#settings-tab-keys').click();assert.equal(await p.locator('#settings-tab-keys').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(107, 67, 38)','selected setting remains legible while hovered');const keys=await p.locator('#settings-pane-keys').innerText();
  for(const text of ['W','A','S','D','F','向前普通攻击','Tab','切换操控','B','背包','等待'])assert.ok(keys.includes(text));
  await p.keyboard.press('ArrowRight');assert.deepEqual(await state(p),beforeSettings,'settings input cannot advance the game');
  await p.screenshot({path:artifact+'panels194-'+width+'-settings-keys.png'});
  await p.locator('#settings-tab-save').click();assert.ok((await p.locator('#settings-profile').innerText()).includes('伙伴'));
  assert.equal(await p.locator('#save-export').isVisible(),true);
  assert.equal(await p.locator('#camp-title').isVisible(),false,'return to title is not offered in a live dungeon');
  await p.screenshot({path:artifact+'panels194-'+width+'-settings-save.png'});
  await p.locator('#settings-close').click();
  const bossPos=(await state(p)).units.boss.pos;await cell(p,bossPos.x,bossPos.y);await ready(p); // the one-HP adjacent boss is defeated by a real map attack
  let current=await state(p);
  for(let i=0;i<30&&current.phase==='learning';i++){await p.locator('#learn-skip').click();await ready(p);current=await state(p);}
  if(current.phase==='invitation'){await p.locator('#reject').click();await ready(p);current=await state(p);}
  assert.equal(await p.locator('.settlement-heading').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(44, 31, 22)','result header keeps the design wood background');
  assert.equal(current.phase,'ended');assert.equal(current.end.outcome,'won');assert.equal(current.end.boss,true);
  await p.evaluate(()=>document.fonts.ready);
  const sum=await p.evaluate(()=>window.trial.store.settlementSummary);
  assert.equal(sum.rank.total,18,'only the five actual reward sources count; no mock example bonuses');
  assert.deepEqual([sum.rank.depth,sum.rank.boss,sum.rank.commissions,sum.rank.recruits,sum.rank.tms],[3,6,3,2,4]);
  assert.equal(await p.locator('#rank-breakdown > li').count(),5);
  assert.equal(await p.locator('#rank-breakdown > li').nth(3).locator('span').innerText(),'新伙伴经验');assert.equal(await p.locator('#rank-breakdown > li').nth(4).locator('span').innerText(),'招式机经验','capped XP never pretends to be the actual machine count');
  assert.doesNotMatch(await p.locator('.settlement194').innerText(),/示例/);
  assert.equal(await p.locator('#rank-gain').innerText(),'+18');
  assert.equal(await p.locator('#brought-partners .loot-tile').count(),2,'the harvest lists new partners rather than founding members');
  assert.equal(await p.locator('#tm-list .loot-tile').count(),current.end.tms.length);
  assert.ok((await p.locator('#harvest-rewards h3').nth(1).innerText()).includes(String(current.end.tms.length)));
  await p.locator('#result-settings').click();await p.locator('#settings-tab-save').click();assert.equal(await p.locator('#save-export').isVisible(),true,'terminal result preserves the real settings/export entry');await p.locator('#settings-close').click();
  const foot=await p.locator('.settlement-foot').boundingBox(),loot=await p.locator('.settlement-loot').boundingBox(),action=await p.locator('.settlement-foot .paper-button').boundingBox();
  assert.ok(foot.x>=0&&foot.x+foot.width<=width+1&&action.x>=foot.x&&action.x+action.width<=foot.x+foot.width+1,'footer and action stay inside the viewport and their grid column');if(width>=761)assert.ok(foot.x>=loot.x-1&&foot.x+foot.width<=loot.x+loot.width+1,'footer follows the actual loot column');
  await p.screenshot({path:artifact+'panels194-'+width+'-settlement.png',fullPage:false});

  if(width>=761){
   await p.setViewportSize({width,height:520});await p.waitForFunction(()=>document.querySelector('#rank-breakdown').scrollHeight>document.querySelector('#rank-breakdown').clientHeight);
   await p.locator('#rank-more').waitFor({state:'visible'});assert.equal(await p.locator('#rank-more').innerText(),'还有 1 项');
   const halfway=await p.locator('#rank-breakdown').evaluate(el=>new Promise(resolve=>{const max=el.scrollHeight-el.clientHeight,half=Math.floor(max/2);el.addEventListener('scroll',()=>requestAnimationFrame(()=>resolve({max,half,actual:el.scrollTop})),{once:true});el.scrollTop=half;}));
   assert.ok(halfway.half>0&&halfway.half<halfway.max);assert.equal(halfway.actual,halfway.half);
   assert.equal(await p.locator('#rank-more').innerText(),'还有 1 项','at exactly half the scroll range the fifth row still counts as one remaining item');
   const fixedBefore=await p.locator('#rank-gain,.settlement-level,.settlement-levelup').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
   const unchanged=await state(p);
   await p.locator('#rank-breakdown').hover();await p.mouse.wheel(0,700);
   await p.waitForFunction(()=>document.querySelector('#rank-breakdown').scrollTop>0);
   await p.locator('#rank-more').waitFor({state:'hidden'});
   assert.deepEqual(await p.locator('#rank-gain,.settlement-level,.settlement-levelup').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];})),fixedBefore,'only the detail list scrolls; totals, level and upgrade stay fixed');
   assert.deepEqual(await state(p),unchanged);
   await p.locator('#rank-breakdown').hover();await p.mouse.wheel(0,-700);await p.locator('#rank-more').waitFor({state:'visible'});
   assert.equal(await p.locator('#tm-list').evaluate(el=>el.scrollWidth>el.clientWidth),true,'actual acquired machines overflow horizontally');
   await p.locator('#tm-list').hover();await p.mouse.wheel(900,0);await p.waitForFunction(()=>document.querySelector('#tm-list').scrollLeft>0);
   const machineGeometry=await p.locator('#tm-list').evaluate(row=>{
    const bounds=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
    const rowBox=bounds(row);
    return {row:rowBox,tiles:[...row.querySelectorAll('.loot-tile')].map(tile=>{
     const disc=tile.querySelector(':scope > .tm-disc'),name=disc?.nextElementSibling,source=name?.nextElementSibling;
     return {tile:bounds(tile),disc:disc?bounds(disc):null,name:name?bounds(name):null,source:source?bounds(source):null,
      nameText:name?.textContent??'',sourceText:source?.textContent??''};
    })};
   });
   assert.equal(machineGeometry.tiles.length,current.end.tms.length,'every earned TM has one visible tile');
   assert.ok(machineGeometry.tiles.length>0,'the layout fixture contains real earned machines');
   for(const [index,item] of machineGeometry.tiles.entries()){
    assert.ok(item.disc&&item.name&&item.source,'each machine tile contains its disc, move name and source');
    for(const [part,box] of [['tile',item.tile],['disc',item.disc],['name',item.name],['source',item.source]]){
     assert.ok(box.top>=machineGeometry.row.top-1&&box.bottom<=machineGeometry.row.bottom+1,
      `900x520 TM ${index} ${part} stays inside the harvest scroll row: ${JSON.stringify({row:machineGeometry.row,item})}`);
    }
    assert.ok(item.name.top>=item.disc.bottom-1,'move text starts after the TM disc');
    assert.ok(item.source.top>=item.name.bottom-1,'source text starts after the move name');
    assert.ok(item.nameText.trim().length>0&&item.sourceText.trim().length>0,'move name and source remain readable');
   }
   const savedScroll=await p.locator('#rank-breakdown,#partner-loot-scroll,#tm-list').evaluateAll(els=>els.map(el=>({id:el.id,top:el.scrollTop,left:el.scrollLeft})));
   await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.keyboard.press('Escape');
   assert.deepEqual(await p.locator('#rank-breakdown,#partner-loot-scroll,#tm-list').evaluateAll(els=>els.map(el=>({id:el.id,top:el.scrollTop,left:el.scrollLeft}))),savedScroll,'blur and Escape preserve XP and loot scroll positions');
   await p.screenshot({path:artifact+'panels194-'+width+'-settlement-overflow.png'});
   report.overflow={actualRows:5,halfway,halfwayCue:"还有 1 项",onlyListScrolled:true,summaryFixed:true,lootScrolled:true,machineGeometry};
  }else{
   assert.equal(await p.locator('#flow').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'narrow settlement retains vertical scrolling without horizontal page overflow');
   await p.locator('#rank-gain').scrollIntoViewIfNeeded();await p.screenshot({path:artifact+'panels194-'+width+'-settlement-xp.png'});
   await p.locator('#tm-list').scrollIntoViewIfNeeded();await p.screenshot({path:artifact+'panels194-'+width+'-settlement-loot.png'});
   report.narrow={existingSingleColumn:true,verticalScroll:true};
  }
  let importBytes=null;const importStore=new TrialStore({getItem:()=>null,setItem:(_key,value)=>{importBytes=value;}});
  assert.equal(await importStore.beginNewGame(profile,true),true);const snapshot=importStore.exportRaw();assert.ok(snapshot&&importBytes===snapshot,'valid camp import fixture comes from the real save writer');
  await p.locator('#result-settings').click();await p.locator('#settings-tab-save').click();
  p.once('dialog',d=>d.accept());await p.locator('#save-file').setInputFiles({name:'terminal-import.json',mimeType:'application/json',buffer:Buffer.from(snapshot)});
  await p.waitForFunction(()=>document.querySelector('#transfer-message').textContent.includes('已导入并保存'));
  assert.deepEqual(JSON.parse(await p.evaluate(()=>window.trial.store.exportRaw())),JSON.parse(snapshot),'terminal settings import preserves the exact camp envelope');
  await p.locator('#settings-close').click();
  assert.deepEqual(errors,[]);
  report.rank=sum.rank;report.actualMachines=current.end.tms.length;report.pageErrors=errors;
  report.fonts=await p.evaluate(()=>({body:document.fonts.check('900 16px "Noto Sans SC"'),display:document.fonts.check('400 44px "ZCOOL QingKe HuangYou"')}));
  assert.equal(report.fonts.body,true);assert.equal(report.fonts.display,true);
  fs.writeFileSync(artifact+'panels194-'+width+'-results.json',JSON.stringify(report,null,2));return report;
 }finally{await context.close();}
}

export async function panels194SleepChecks({setup,startMemory,state,ready,artifact}){
 const {context,page:p,errors}=await setup('K1');
 try{
  const w=createScenario('K1','panels194-dialog-sleep');w.enemies=[];w.units[w.leader].status={slp:{left:5}};
  await startMemory(p,w);await p.clock.install();await p.clock.pauseAt(await p.evaluate(()=>Date.now()+1000));
  await p.evaluate(()=>window.trial.autoSleep(true));await p.locator('[data-hud-details]').first().click();
  const before=await state(p);await p.clock.runFor(1800);assert.deepEqual(await state(p),before,'detail dialog pauses automatic sleep turns');
  for(const key of ['ArrowRight','.','f','1','Tab'])await p.keyboard.press(key);assert.deepEqual(await state(p),before,'sleeping detail keys do not reach the game');
  await p.screenshot({path:artifact+'panels194-detail-sleep.png'});await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('data-hud-details')),w.leader);
  await p.clock.runFor(599);assert.equal((await state(p)).round,before.round);await p.clock.runFor(1);await ready(p);
  assert.equal((await state(p)).round,before.round+1,'closing details resumes the 600ms sleep timer');assert.deepEqual(errors,[]);
  return {pausedForMs:1800,resumedAtMs:600,keysBlocked:true,focusRestored:true};
 }finally{await context.close();}
}
