import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExpedition,PROG,reveal,key} from '../../src/core/engine.ts';
import {SPECIES,STARTER_IDS} from '../../src/core/roster.ts';
import {moveOf} from '../../src/core/moves.ts';
import {speciesZh,moveZh} from '../../src/core/names.ts';

function worldFor(run,species,carry){
 const w=createExpedition(run,193,3,{members:[
  {inst:'P1',species,carry,tactic:'wait'},
  {inst:'P2',species:'chikorita',carry:SPECIES.chikorita.kit,tactic:'wait'}],leader:0},0,true,5);
 const room=w.rooms.find(r=>w.units.A.pos.x>=r.x&&w.units.A.pos.x<r.x+r.w&&w.units.A.pos.y>=r.y&&w.units.A.pos.y<r.y+r.h);
 assert.ok(room&&room.w>=3&&room.h>=3);const at={x:room.x+1,y:room.y+1};
 w.units.A.pos={...at};w.units.B.pos={x:at.x,y:at.y+1};w.units.A.facing={x:1,y:0};
 for(const id of w.enemies){w.units[id].waitOnly=true;w.units[id].asleep=false;w.units[id].wakeSkip=false;}
 w.seen=w.floor.map(key);
 return w;
}
function putEnemy(w,id,pos,hp,species){
 const u=w.units[id];u.pos={...pos};u.hp=u.maxHp=hp;if(species)u.species=species;u.waitOnly=true;u.asleep=false;u.wakeSkip=false;
}
export async function step193Checks({setup,startMemory,state,ready,cell,artifact,width,height}){
 const {context,page:p,errors}=await setup(undefined,'pass',false,'dtef',width<600?{hasTouch:true,isMobile:true}:{}),report={width,height,fixtureBoundary:'Generated map with controlled party/enemy positions, HP, experience and status; real keyboard, canvas and choice buttons. No natural-route or balance claim.'};
 try{
  await p.setViewportSize({width,height});
  const options=STARTER_IDS.flatMap(id=>(SPECIES[id].levelUp??[]).filter(row=>row.level>5&&row.level<=15&&!['snore','sleeptalk','rest'].includes(row.move)&&moveOf(row.move)?.effects.includes('damage')&&(SPECIES[id].levelUp??[]).filter(q=>q.level===row.level).length===1).map(row=>({id,row})));
  assert.ok(options.length,'an admitted starter damage move supplies a real level-up choice');
  const {id:species,row}=options[0],sp=SPECIES[species],carry=[...sp.kit,...sp.learnable].filter((m,i,a)=>m.move!==row.move&&moveOf(m.move)&&!['snore','sleeptalk'].includes(m.move)&&a.findIndex(x=>x.move===m.move)===i).slice(0,4);
  assert.equal(carry.length,4);
  const w=worldFor('step193-learn-'+width,species,carry),at=w.units.A.pos,[first,target]=w.enemies;
  assert.ok(first&&target);w.enemies=[first,target];putEnemy(w,first,{x:at.x+1,y:at.y},1);putEnemy(w,target,{x:at.x+1,y:at.y+1},200,'pidgey');
  w.units.A.stages.acc=3;w.prog.level=row.level-1;w.prog.exp=PROG.thresholds[row.level]-1;reveal(w);
  await startMemory(p,w);const before=await state(p);await p.keyboard.press('f');
  await p.waitForFunction(()=>window.trial.getState()?.phase==='learning');await ready(p);
  const learning=await state(p),pending=learning.pendingLearnMoves[0];assert.equal(pending.actor,'A');assert.equal(pending.move,row.move);
  assert.equal(learning.round,before.round+1);assert.equal(await p.locator('.c195-old .c195-move').count(),4);
  assert.equal(await p.locator('#learning-choice').isVisible(),true);assert.ok((await p.locator('#learning-heading').innerText()).includes('想学会'));
  const panelText=await p.locator('#learning-choice').innerText();for(const label of ['威力','命中','PP'])assert.ok(panelText.includes(label),'every move card shows '+label+' without hovering');assert.ok(!panelText.includes('范围')&&!panelText.includes('相邻'),'no default-range wording on a card');
  assert.ok(panelText.includes(pending.pp+'/'+pending.pp),'the new move card shows its PP');
  assert.equal(await p.locator('#learn-confirm').isDisabled(),true,'nothing is forgotten before a card is chosen');
  const dialog=await p.locator('#learning-choice').boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=width+1);
  assert.ok(dialog.y>=0&&dialog.y+dialog.height<=height+1,'the complete learning choice remains inside the viewport');
  const choiceBoxes=await p.locator('.c195-old .c195-move').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {top:Math.round(r.top),width:r.width,height:r.height,right:r.right,bottom:r.bottom};}));
  assert.ok(choiceBoxes.every(r=>Math.abs(r.width-choiceBoxes[0].width)<=1&&r.right<=width+1),'all four replacement cards use equal widths and stay inside the viewport');
  for(const top of new Set(choiceBoxes.map(r=>r.top)))assert.equal(new Set(choiceBoxes.filter(r=>r.top===top).map(r=>Math.round(r.height))).size,1,'replacement cards in one row share one height (equivalent of the old equal-size check)');
  await p.screenshot({path:artifact+'step193-'+width+'-learning.png'});
  assert.equal(await p.locator('#hud-tooltip').isVisible(),false,'the global pointer-transparent card is not used for learning');
  const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  const beforeInspect=await state(p);
  report.learningInspection={choiceBoxes,noHoverNeeded:true};
  const replaced=carry[3].move,replaceButton=p.locator('#learn-replace-'+replaced);
  await replaceButton.scrollIntoViewIfNeeded();if(width<600){const b=await replaceButton.boundingBox();await p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}else await replaceButton.click();assert.deepEqual(await state(p),beforeInspect,'choosing a card only selects it');await p.locator('#learn-confirm').scrollIntoViewIfNeeded();await p.locator('#learn-confirm').click();await ready(p);
  let prompts=0;while((await state(p)).phase==='learning'){assert.ok(++prompts<=30);await p.locator('#learn-skip').click();await ready(p);}
  if((await state(p)).phase==='invitation'){await p.locator('#reject').click();await ready(p);}
  const learned=await state(p);assert.equal(learned.phase,'playing');assert.equal(learned.round,learning.round,'choice buttons consume no round');
  assert.equal(learned.units.A.learned.length,4);assert.ok(learned.units.A.learned.includes(pending.move));assert.ok(!learned.units.A.learned.includes(replaced));
  assert.equal(learned.units.A.pp[pending.move],pending.pp);assert.equal(await p.locator('[data-hud-skill]').count(),4);
  const learningMessages=await p.locator('#recent-events,#message').allTextContents();
  assert.ok(learningMessages.some(t=>t.includes(speciesZh(species)+'用'+moveZh(pending.move)+'替换了')),'learning logs identify the member by its visible name');
  assert.ok(learningMessages.every(t=>!t.includes('有同行学会')));report.learningMessages=learningMessages;
  const newSlot=learned.units.A.learned.indexOf(pending.move);await p.keyboard.press(String(newSlot+1));
  if((await state(p)).units.A.pp[pending.move]===pending.pp){const pos=(await state(p)).units[target].pos;await cell(p,pos.x,pos.y);}
  await ready(p);const used=await state(p);assert.equal(used.units.A.pp[pending.move],pending.pp-1,'the actual numbered move slot casts the learned move');
  const hud=await p.locator('#hud-bottom').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));assert.ok(hud.scrollWidth<=hud.width+1);
  await p.screenshot({path:artifact+'step193-'+width+'-four-moves.png'});
  report.learning={species,level:row.level,newMove:pending.move,replaced,roundBefore:before.round,roundAfterChoice:learned.round,slot:newSlot+1,ppBefore:pending.pp,ppAfter:used.units.A.pp[pending.move],hud};

  const declined=structuredClone(w);declined.runId+='-skip';
  await p.reload();await p.locator('#start').waitFor();await startMemory(p,declined);await p.keyboard.press('f');
  await p.waitForFunction(()=>window.trial.getState()?.phase==='learning');await ready(p);const skipRound=(await state(p)).round;
  await p.keyboard.press('Escape');await ready(p);let skippedChoices=0;
  while((await state(p)).phase==='learning'){assert.ok(++skippedChoices<=30);await p.locator('#learn-skip').click();await ready(p);}
  if((await state(p)).phase==='invitation'){await p.locator('#reject').click();await ready(p);}
  assert.ok(!(await state(p)).units.A.learned.includes(row.move));assert.equal((await state(p)).round,skipRound);
  await p.keyboard.press('.');await ready(p);assert.equal((await state(p)).phase,'playing','Esc discards the choice without asking again on a later wait');
  report.declined={move:row.move,choiceRound:skipRound,afterWait:(await state(p)).round};

  const typed=worldFor('step193-type-'+width,'squirtle',SPECIES.squirtle.kit),typeAt=typed.units.A.pos,foe=typed.enemies[0];
  typed.enemies=[foe];putEnemy(typed,foe,{x:typeAt.x+1,y:typeAt.y},200,'charmander');typed.units.A.stages.acc=3;reveal(typed);
  await p.reload();await p.locator('#start').waitFor();await startMemory(p,typed);
  await p.keyboard.press(String(typed.units.A.learned.indexOf('watergun')+1));await cell(p,typeAt.x+1,typeAt.y);await ready(p);
  const typeAfter=await state(p),messages=await p.locator('#recent-events,#history,#message').allTextContents();assert.ok(messages.some(t=>t.includes('效果绝佳')));assert.ok(messages.every(t=>!/\bw\d+[a-f]\b|\bc\d+[a-d]\b/.test(t)));
  assert.equal(typeAfter.units.A.pp.watergun,typed.units.A.pp.watergun-1);assert.ok(typeAfter.units[foe].hp<typed.units[foe].hp);
  await p.screenshot({path:artifact+'step193-'+width+'-type-effect.png'});report.type={messages,hpBefore:typed.units[foe].hp,hpAfter:typeAfter.units[foe].hp};

  const cure=worldFor('step193-cure-'+width,'squirtle',SPECIES.squirtle.kit);cure.enemies=[];cure.units.A.status={slp:{left:5}};cure.prog.items.chestoBerry=1;
  await p.reload();await p.locator('#start').waitFor();await startMemory(p,cure);
  assert.equal((await state(p)).runId,cure.runId);assert.equal((await state(p)).prog.items.chestoBerry,1);
  await p.keyboard.press('.');await ready(p);const cured=await state(p);
  assert.equal(cured.round,cure.round+1);assert.equal(cured.prog.items.chestoBerry,0);assert.equal(cured.units.A.status?.slp,undefined);
  const cureShown=await p.locator('#recent-events,#history,#message').allTextContents();assert.ok(cureShown.some(t=>t.includes('零余果')));
  await p.screenshot({path:artifact+'step193-'+width+'-cured.png'});report.cure={round:cured.round,itemBefore:1,itemAfter:cured.prog.items.chestoBerry,status:cured.units.A.status??{},messages:cureShown};

  const asleep=worldFor('step193-sleep-'+width,'squirtle',SPECIES.squirtle.kit);asleep.enemies=[];asleep.units.A.status={slp:{left:5}};(asleep.log.push('A陷入睡眠状态'),(asleep.entries??=[]).push({n:(asleep.logSeq=(asleep.logSeq??0)+1),parts:['A陷入睡眠状态']}));
  await p.reload();await p.locator('#start').waitFor();await startMemory(p,asleep);
  await p.clock.install();await p.clock.pauseAt(await p.evaluate(()=>Date.now()+1000));await p.evaluate(()=>window.trial.autoSleep(true));
  assert.equal(await p.locator('#hud-sleep-status').innerText(),'睡眠中');
  const noticeBox=await p.locator('#hud-sleep-status').boundingBox(),messageBox=await p.locator('#recent-events').boundingBox(),bottomBox=await p.locator('#hud-bottom').boundingBox();
  assert.ok((await p.locator('#recent-events').innerText()).includes('睡眠'),'sleep layout is checked with an actual nonempty visible message');
  assert.ok(!overlaps(noticeBox,messageBox),'sleep status does not cover the latest event area');
  const skillsBox=await p.locator('#hud-bottom .hud-skills').boundingBox();assert.ok(!overlaps(noticeBox,skillsBox),'sleep status also stays clear of the move slots');
  assert.ok(noticeBox.y>=bottomBox.y&&noticeBox.y+noticeBox.height<=bottomBox.y+bottomBox.height+1,'sleep status stays inside the bottom HUD');
  const refreshKeys=await p.evaluate(()=>['F5','r'].map(key=>{const e=new KeyboardEvent('keydown',{key,ctrlKey:key==='r',bubbles:true,cancelable:true});document.body.dispatchEvent(e);return {key,cancelled:e.defaultPrevented};}));
  assert.ok(refreshKeys.every(k=>!k.cancelled),'sleeping preserves F5 and Ctrl+R browser refresh defaults');
  report.sleepLayout={noticeBox,messageBox,bottomBox,refreshKeys};
  await p.screenshot({path:artifact+'step193-'+width+'-sleep.png'});
  await p.clock.runFor(599);assert.equal((await state(p)).round,asleep.round);
  await p.clock.runFor(1);await ready(p);assert.equal((await state(p)).round,asleep.round+1,'sleep waits exactly 600ms before advancing');
  await p.locator('#hud-settings').click();const settingsRound=(await state(p)).round;
  await p.clock.runFor(600);assert.equal((await state(p)).round,settingsRound,'settings pause automatic turns');
  await p.locator('#settings-close').click();await p.clock.runFor(599);assert.equal((await state(p)).round,settingsRound);
  await p.clock.runFor(1);await ready(p);assert.equal((await state(p)).round,settingsRound+1,'closing settings resumes the 600ms sleep timer');
  await p.keyboard.press('Tab');await ready(p);const switched=await state(p);assert.equal(switched.leader,'B');
  await p.clock.runFor(1200);assert.equal((await state(p)).round,switched.round,'switching to an awake member stops automatic turns');assert.equal(await p.locator('#hud-sleep-status').count(),0);
  await p.screenshot({path:artifact+'step193-'+width+'-switched.png'});report.autoSleep={beforeRound:asleep.round,after600ms:asleep.round+1,settingsRound,afterSettingsClose:switched.round,afterSwitch:(await state(p)).round,leader:switched.leader};

  assert.deepEqual(errors,[]);report.pageErrors=errors;fs.writeFileSync(artifact+'step193-'+width+'-results.json',JSON.stringify(report,null,2));return report;
 }finally{await context.close();}
}

/** PR #198 review (#194 wrap-up): at 320px wide with a three-digit HP the sleep label may wrap under the HP value; measure it against the move row, the event area and the HUD. */
export async function sleepLabelChecks({setup,startMemory,artifact,width=320,height=640,hp=300}){
 const {context,page:p,errors}=await setup(undefined,'pass',false,'dtef',{hasTouch:true,isMobile:true});
 try{
  await p.setViewportSize({width,height});
  const w=worldFor('sleep-label-'+width,'squirtle',SPECIES.squirtle.kit);w.enemies=[];
  w.units.A.hp=w.units.A.maxHp=hp;w.units.A.status={slp:{left:5}};(w.log.push('A陷入睡眠状态'),(w.entries??=[]).push({n:(w.logSeq=(w.logSeq??0)+1),parts:['A陷入睡眠状态']}));
  await startMemory(p,w);
  await p.clock.install();await p.clock.pauseAt(await p.evaluate(()=>Date.now()+1000));await p.evaluate(()=>window.trial.autoSleep(true));
  assert.equal(await p.locator('#hud-sleep-status').innerText(),'睡眠中');
  assert.ok((await p.locator('.hud-current-hp-value').innerText()).includes('HP '+hp+'/'+hp),'the HP value shows three digits');
  const box=async sel=>p.locator(sel).first().boundingBox();
  const label=await box('#hud-sleep-status'),hpValue=await box('.hud-current-hp-value'),skills=await box('#hud-bottom .hud-skills'),bottom=await box('#hud-bottom'),events=await box('#recent-events');
  const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  const slots=await p.locator('#hud-bottom .hud-skills > *').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
  assert.ok(slots.length>0);await p.screenshot({path:artifact+'sleep-label-'+width+'-hp'+hp+'.png'});
  const wrapped=label.y>=hpValue.y+hpValue.height-1;
  assert.ok(!overlaps(label,skills),'sleep label does not overlap the move row container: '+JSON.stringify({label,skills}));
  for(const slot of slots)assert.ok(!overlaps(label,slot),'sleep label does not overlap a move slot: '+JSON.stringify({label,slot}));
  assert.ok(!overlaps(label,events),'sleep label does not overlap the event area: '+JSON.stringify({label,events}));
  assert.ok(label.x>=0&&label.x+label.width<=width+1,'sleep label stays inside the viewport width');
  assert.ok(label.y>=bottom.y&&label.y+label.height<=bottom.y+bottom.height+1,'sleep label stays inside the bottom HUD');
  const scroll=await p.locator('#hud-bottom').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));assert.ok(scroll.scrollWidth<=scroll.width+1);
  assert.deepEqual(errors,[]);
  return {width,hp,wrapped,gapToMoveRow:skills.y-(label.y+label.height),label,hpValue,skills,events,bottom};
 }finally{await context.close();}
}
