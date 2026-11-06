import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScenario,scenarioProfile} from '../../src/core/scenarios.ts';

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
  const b=before.queue[1];await p.locator('[data-detail-unit="'+b+'"]').click();
  await p.locator('[data-detail-tactic="wait"]').click();await ready(p);
  await p.waitForFunction(id=>window.trial.getState().units[id].tactic==='wait',b);
  assert.equal((await state(p)).round,before.round,'tactic changes take no round');
  const move=p.locator('[data-detail-skill]').first();await move.focus();
  await p.locator('#detail-tooltip').waitFor({state:'visible'});
  for(const text of ['威力','命中','PP','射程','范围'])assert.ok((await p.locator('#detail-tooltip').innerText()).includes(text));
  await p.screenshot({path:artifact+'panels194-'+width+'-detail-tip.png'});
  await p.locator('[data-detail-unit="boss"]').click();
  assert.equal(await p.locator('.detail-tactics').count(),0,'enemy details cannot change enemy tactics');
  assert.ok((await p.locator('.detail-hp').innerText()).includes('1/'));
  await p.screenshot({path:artifact+'panels194-'+width+'-enemy-detail.png'});
  await p.keyboard.press('Escape');assert.equal(await p.locator('#unit-details-dialog').count(),0);
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
  if(current.phase==='invitation'){await p.locator('#reject').click();await p.locator('#reject-confirm').click();await ready(p);current=await state(p);}
  assert.equal(await p.locator('.settlement-heading').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(44, 31, 22)','result header keeps the design wood background');
  assert.equal(current.phase,'ended');assert.equal(current.end.outcome,'won');assert.equal(current.end.boss,true);
  await p.evaluate(()=>document.fonts.ready);
  const sum=await p.evaluate(()=>window.trial.store.settlementSummary);
  assert.equal(sum.rank.total,18,'only the five actual reward sources count; no mock example bonuses');
  assert.deepEqual([sum.rank.depth,sum.rank.boss,sum.rank.commissions,sum.rank.recruits,sum.rank.tms],[3,6,3,2,4]);
  assert.equal(await p.locator('#rank-breakdown > li').count(),5);
  assert.doesNotMatch(await p.locator('.settlement194').innerText(),/示例/);
  assert.equal(await p.locator('#rank-gain').innerText(),'+18');
  assert.equal(await p.locator('#brought-partners .loot-tile').count(),2,'the harvest lists new partners rather than founding members');
  assert.equal(await p.locator('#tm-list .loot-tile').count(),current.end.tms.length);
  assert.ok((await p.locator('#harvest-rewards h3').nth(1).innerText()).includes(String(current.end.tms.length)));
  await p.locator('#result-settings').click();await p.locator('#settings-tab-save').click();assert.equal(await p.locator('#save-export').isVisible(),true,'terminal result preserves the real settings/export entry');await p.locator('#settings-close').click();
  await p.screenshot({path:artifact+'panels194-'+width+'-settlement.png',fullPage:false});

  if(width>=1000){
   await p.setViewportSize({width,height:520});await p.waitForFunction(()=>document.querySelector('#rank-breakdown').scrollHeight>document.querySelector('#rank-breakdown').clientHeight);
   await p.locator('#rank-more').waitFor({state:'visible'});assert.match(await p.locator('#rank-more').innerText(),/^还有 [1-5] 项$/);
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
   await p.screenshot({path:artifact+'panels194-'+width+'-settlement-overflow.png'});
   report.overflow={actualRows:5,onlyListScrolled:true,summaryFixed:true,lootScrolled:true};
  }else{
   assert.equal(await p.locator('#flow').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'narrow settlement retains vertical scrolling without horizontal page overflow');
   await p.locator('#rank-gain').scrollIntoViewIfNeeded();await p.screenshot({path:artifact+'panels194-'+width+'-settlement-xp.png'});
   await p.locator('#tm-list').scrollIntoViewIfNeeded();await p.screenshot({path:artifact+'panels194-'+width+'-settlement-loot.png'});
   report.narrow={existingSingleColumn:true,verticalScroll:true};
  }
  assert.deepEqual(errors,[]);
  report.rank=sum.rank;report.actualMachines=current.end.tms.length;report.pageErrors=errors;
  report.fonts=await p.evaluate(()=>({body:document.fonts.check('900 16px "Noto Sans SC"'),display:document.fonts.check('400 44px "ZCOOL QingKe HuangYou"')}));
  assert.equal(report.fonts.body,true);assert.equal(report.fonts.display,true);
  fs.writeFileSync(artifact+'panels194-'+width+'-results.json',JSON.stringify(report,null,2));return report;
 }finally{await context.close();}
}
