import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openCampPanel} from './camp-ui.mjs';
import {ALL_TM_MOVES, SPECIES, learnableMove} from '../../src/core/roster.ts';
import {moveCategory} from '../../src/core/moves.ts';
import {NAME_TABLE, speciesZh} from '../../src/core/names.ts';
import {TACTICS} from '../../src/core/tactics.ts';
import {speciesUnit} from '../../src/core/engine.ts';

const MOVE_TYPES=JSON.parse(fs.readFileSync('src/data/move-types.json','utf8')).types;
const labelsByType=Object.fromEntries(Object.entries(NAME_TABLE.types).map(([id,label])=>[id.toLowerCase(),label]));

function campProfile(made){
  assert.ok(made?.ok,'the fixture uses the shared new-game profile constructor');
  const profile=made.profile;
  const p1=profile.roster.find(member=>member.id==='P1');
  const newMoves=ALL_TM_MOVES.filter(move=>learnableMove(p1.species,move)&&!p1.learned.some(learned=>learned.move===move));
  assert.ok(newMoves.length>=6,'the selected starter has enough official TM moves for carry and learning checks');
  p1.learned.push(...newMoves.slice(0,5).map(move=>learnableMove(p1.species,move)));
  p1.carry=p1.learned.slice(0,4).map(learned=>learned.move);
  const overflowMove=p1.learned[4].move,learnMove=newMoves[5];
  const addSpecies=(id,species)=>{
    const learned=SPECIES[species].kit.map(move=>({...move}));
    profile.roster.push({id,species,learned,carry:learned.map(move=>move.move),protected:false,tactic:'together'});
  };
  addSpecies('P3','pidgey');addSpecies('P4','rattata');
  let next=5;for(let extra=0;extra<32;extra++)addSpecies('P'+next++,'bulbasaur');
  profile.next=next;profile.team=['P1','P2','P3'];profile.leader='P2';
  profile.expeditions=17;profile.rankExp=237;
  profile.vault=Object.fromEntries(ALL_TM_MOVES.map(move=>[move,1]));
  profile.vault[learnMove]=3;
  profile.shards={rattata:9,pidgey:5};
  profile.difficulty='normal';
  const cannotLearn=ALL_TM_MOVES.find(move=>!learnableMove(p1.species,move));
  assert.ok(cannotLearn,'the fixture includes a real move outside the selected starter learnset');
  return {profile,overflowMove,learnMove,cannotLearn,scrollLearnerId:profile.roster.at(-1).id};
}

function typeFilterMatches(filter,move){
  const type=MOVE_TYPES[move]??'';
  return filter.toLowerCase()===type.toLowerCase()||filter===labelsByType[type.toLowerCase()];
}
function categoryFilterMatches(filter,move){
  const value=filter.toLowerCase(),category=moveCategory(move);
  const names={physical:'Physical','物理':'Physical',special:'Special','特殊':'Special',status:'Status','变化':'Status','状态':'Status'};
  return names[value]===category;
}
async function visibleMachineIds(page){
  return page.locator('#camp-dialog button[id^="tm-"]').evaluateAll(nodes=>nodes.map(node=>node.id.slice(3)));
}
async function assertDialogInViewport(page,selector,width,height){
  const box=await page.locator(selector).evaluate(element=>{
    const rect=element.getBoundingClientRect();
    return {x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height,
      viewportWidth:innerWidth,viewportHeight:innerHeight};
  });
  assert.ok(box.width>0&&box.height>0,selector+' is visible at '+width+'×'+height);
  assert.ok(box.x>=-1&&box.right<=box.viewportWidth+1,selector+' stays inside the horizontal viewport: '+JSON.stringify(box));
  assert.ok(box.y>=-1&&box.bottom<=box.viewportHeight+1,selector+' stays inside the vertical viewport: '+JSON.stringify(box));
  if(selector.includes('camp-departure')){
    // The scroll box clips anything above its padding edge; the whole title plaque, including its 3px outline, must sit inside it.
    const plaque=await page.locator(selector).evaluate(element=>{
      const dialog=element.getBoundingClientRect(),title=element.querySelector('.camp194-plaque').getBoundingClientRect();
      return {plaqueTop:title.top-3,plaqueLeft:title.left-3,paddingTop:dialog.top+element.clientTop,paddingLeft:dialog.left+element.clientLeft,scrollTop:element.scrollTop};
    });
    assert.ok(plaque.plaqueTop>=plaque.paddingTop-.5&&plaque.plaqueLeft>=plaque.paddingLeft-.5,'the departure plaque is not clipped at '+width+'×'+height+': '+JSON.stringify(plaque));
  }
  return box;
}
async function selectMember(page,id){
  const member=page.locator('[data-camp-member="'+id+'"]').first();
  await member.waitFor();
  if(await member.getAttribute('aria-pressed')!=='true')await member.click();
}
async function closePanel(page){
  await page.locator('#camp-close').click();
  await page.locator('#camp-dialog[open]').waitFor({state:'detached'});
}
async function savedProfile(page){return page.evaluate(()=>window.trial.profile());}

export async function camp194Checks({setup,ready,emptyReady,state,artifact}){
  const viewportCases=[[1280,720],[900,520],[390,780]],reports=[];
  for(const [width,height] of viewportCases){
    const {context,page:p,errors}=await setup();
    p.setDefaultTimeout(10000);
    try{
      const seededUrl=new URL(p.url());seededUrl.searchParams.set('seed','19');
      await p.goto(seededUrl.href);await p.locator('#start').waitFor();
      await p.setViewportSize({width,height});await emptyReady(p);
      const {newGameProfile,rankLevel,rankThreshold,availableTalentPoints}=await import('../../src/core/base.ts');
      const generated=newGameProfile('bulbasaur','charmander');
      assert.equal(generated.ok,true);
      const zeroPointProfile=structuredClone(generated.profile);
      const fixture=campProfile(generated);
      if(width===1280){
        assert.equal(await p.evaluate(profile=>window.trial.store.beginNewGame(profile,true),zeroPointProfile),true,'the zero-point profile is written by the real save controller');
        await p.reload();await ready(p);await p.locator('#base').waitFor();
        assert.equal(await p.locator('#camp-open-talents .camp-alert').count(),0,'the talent stone has no alert when no points are available');
        const fullTalentProfile=structuredClone(fixture.profile);
        fullTalentProfile.rankExp=rankThreshold(17);fullTalentProfile.talents={vitality:5,offense:5,supplies:5};
        assert.equal(rankLevel(fullTalentProfile.rankExp),17,'the fixture has enough actual rank experience for one leftover point');
        assert.equal(availableTalentPoints(fullTalentProfile),1,'all three full branches leave one unspent point in the profile');
        assert.equal(await p.evaluate(profile=>window.trial.store.beginNewGame(profile,true),fullTalentProfile),true,'the full-branch profile is written by the real save controller');
        await p.reload();await ready(p);await p.locator('#base').waitFor();
        assert.equal(await p.locator('#camp-open-talents .camp-alert').count(),0,'the talent stone stays quiet when every branch is full');
      }
      assert.equal(await p.evaluate(profile=>window.trial.store.beginNewGame(profile,true),fixture.profile),true,'the profile is written by the real save controller');
      await p.reload();await ready(p);await p.locator('#base').waitFor();
      const expectedTeam=['P1','P2','P3'];
      const before=await savedProfile(p);
      assert.deepEqual(before.team,expectedTeam);assert.equal(before.leader,'P2');
      const rank=rankLevel(before.rankExp),rankStart=rankThreshold(rank),rankNext=rankThreshold(rank+1);
      const badgeText=await p.locator('#base .camp-badge').innerText();
      assert.ok(badgeText.includes('Lv'+rank),'the camp badge shows the profile-backed expedition level');
      assert.ok(badgeText.includes('远征 '+before.expeditions+' 次'),'the camp badge shows the saved expedition count');
      const rankBar=p.locator('#base .camp-rank-progress');
      assert.equal(await rankBar.getAttribute('role'),'progressbar','the experience display exposes a progress bar');
      assert.equal(await rankBar.getAttribute('aria-label'),'探险队经验');
      assert.equal(await rankBar.getAttribute('aria-valuenow'),String(before.rankExp-rankStart),'progress uses the current level start from the saved rank experience');
      assert.equal(await rankBar.getAttribute('aria-valuemax'),String(rankNext-rankStart),'progress uses the next real rank threshold');
      assert.ok((await p.locator('#base .camp-rank-count').innerText()).includes((before.rankExp-rankStart)+'/'+(rankNext-rankStart)),'the visible count matches the same saved progress');
      const talentEntry=p.locator('#camp-open-talents'),talentAlert=talentEntry.locator('.camp-alert');
      assert.equal(await talentAlert.count(),1,'unspent points add the talent marker');
      assert.match(await talentEntry.getAttribute('aria-label'),/未使用天赋点/,'the talent button accessible name explains the marker');
      const alertBox=await talentAlert.evaluate(el=>{const r=el.getBoundingClientRect(),sign=el.closest('.camp-spot-label').getBoundingClientRect(),style=getComputedStyle(el);return {text:el.textContent.trim(),left:r.left,top:r.top,right:r.right,bottom:r.bottom,signLeft:sign.left,signTop:sign.top,signRight:sign.right,signBottom:sign.bottom,color:style.color,background:style.backgroundColor};});
      assert.equal(alertBox.text,'!','the marker is an exclamation point');
      assert.ok(alertBox.left>alertBox.signLeft+((alertBox.signRight-alertBox.signLeft)*0.55)&&alertBox.top<alertBox.signTop+((alertBox.signBottom-alertBox.signTop)*0.45),'the exclamation sits in the sign upper-right corner: '+JSON.stringify(alertBox));
      const rgb=value=>{const parts=value.match(/[0-9.]+/g);return parts?parts.slice(0,3).map(Number):[];};
      const red=([r,g,b])=>Number.isFinite(b)&&r>=160&&r>g*1.3&&r>b*1.3;
      assert.ok([rgb(alertBox.color),rgb(alertBox.background)].some(red),'the exclamation marker is red: '+JSON.stringify(alertBox));
      assert.equal(await p.locator('#difficulty-picker').count(),0,'difficulty is not selectable on the camp map');
      assert.equal(await p.locator('#difficulty-easy,#difficulty-normal,#difficulty-hard').count(),0,'difficulty controls exist only in the departure dialog');
      let signGeometry=null;
      if(width===1280){
        signGeometry=await p.evaluate(()=>{
          const map=document.querySelector('.camp-map').getBoundingClientRect();
          const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
          return {map:{left:map.left,top:map.top,width:map.width,height:map.height,scale:map.width/1280},party:rect('#camp-open-party .camp-spot-label'),vault:rect('#camp-open-vault .camp-spot-label'),talents:rect('#camp-open-talents .camp-spot-label'),
            hotspots:{party:rect('#camp-open-party'),vault:rect('#camp-open-vault')},
            keepers:['party','vault'].map(id=>({label:rect('#camp-open-'+id+' .camp-spot-label'),keeper:rect('#camp-open-'+id+' .camp-keeper')}))};
        });
        for(const [id,top] of [['party',318],['vault',318],['talents',636]])
          assert.equal(Math.round(signGeometry[id].top-signGeometry.map.top),top,'the '+id+' sign follows the fixed mock top coordinate');
        assert.ok(signGeometry.keepers.every(({label,keeper})=>label.top>=keeper.bottom),'the moved building labels do not cover Chansey or Snorlax');
      }
      await p.screenshot({path:artifact+`camp194-${width}x${height}-camp.png`});

      await openCampPanel(p,'records');
      let records=await assertDialogInViewport(p,'#camp-dialog[open]',width,height);
      let recordText=await p.locator('#camp-dialog').innerText();
      for(const value of [String(before.expeditions),String(before.rankExp),String(before.roster.length),String(Object.values(before.shards).reduce((sum,count)=>sum+count,0))])
        assert.ok(recordText.includes(value),'records show profile-backed archive data '+value);
      assert.doesNotMatch(recordText,/全队倒下|击败首领/,'a new page has no previous expedition report');
      await p.screenshot({path:artifact+`camp194-${width}x${height}-records-first-open.png`});
      await closePanel(p);

      await openCampPanel(p,'party');
      records=await assertDialogInViewport(p,'#camp-dialog[open]',width,height);
      const listedMembers=await p.locator('#camp-dialog [data-camp-member]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.campMember))]);
      assert.deepEqual(listedMembers.sort(),before.roster.map(member=>member.id).sort(),'the hut lists each real roster member');
      await selectMember(p,'P1');
      assert.equal(await p.locator('#team-P1').count(),1);assert.equal(await p.locator('#lead-P1').count(),1);
      assert.equal(await p.locator('#carry-P1-'+fixture.overflowMove).count(),1);
      assert.equal(await p.locator('#team-P2,#lead-P2,#carry-P2-tackle').count(),0,'member-specific controls belong only to the selected member');
      const memberHeader=await p.evaluate(()=>{
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
        return {paddingRight:getComputedStyle(document.querySelector('.camp194-member-heading')).paddingRight,team:rect('#team-P1'),close:rect('#camp-close')};
      });
      if(width>=761)assert.equal(memberHeader.paddingRight,'52px','the desktop member heading reserves space for the corner close button');
      const teamCloseOverlap=memberHeader.team.left<memberHeader.close.right&&memberHeader.team.right>memberHeader.close.left&&memberHeader.team.top<memberHeader.close.bottom&&memberHeader.team.bottom>memberHeader.close.top;
      assert.equal(teamCloseOverlap,false,'the selected member control stays clear of the dialog close button: '+JSON.stringify(memberHeader));
      // The fifth learned move stays enabled so it can be dragged onto a carried move to replace it; clicking it is refused by the engine (checked in the camp-learn and drag tests).
      assert.equal(await p.locator('#carry-P1-'+fixture.overflowMove).count(),1,'the fifth learned move is listed among the learned moves, not the carried four');
      assert.equal(await p.locator('#camp-party-carry .camp194-move-tile').count(),4,'the carried list holds four');
      await selectMember(p,'P4');
      assert.equal(await p.locator('#team-P4').isDisabled(),true,'a full three-member team cannot take a fourth member');
      assert.equal(await p.locator('#lead-P4').isDisabled(),true,'a member outside the team cannot become its lead');
      assert.equal(await p.locator('#team-P1,#lead-P1,#carry-P1-'+fixture.overflowMove).count(),0,'selecting another member replaces the right-side controls');
      await selectMember(p,'P1');await p.locator('#team-P1').click();await ready(p);
      assert.deepEqual((await savedProfile(p)).team,['P2','P3'],'removing a member keeps the remaining order');
      await selectMember(p,'P4');await p.locator('#team-P4').click();await ready(p);
      assert.deepEqual((await savedProfile(p)).team,['P2','P3','P4'],'a free slot appends the selected partner');
      const tactic=TACTICS.find(value=>value!=='together');assert.ok(tactic);
      const tacticControl=p.locator('[data-camp-tactic="'+tactic+'"]'),tacticFocusId=await tacticControl.getAttribute('id');assert.ok(tacticFocusId);
      const rosterScroll=await p.locator('#camp-party-roster').evaluate(el=>{const max=el.scrollHeight-el.clientHeight;el.scrollTop=Math.floor(max/3);return {max,top:el.scrollTop};});
      assert.ok(rosterScroll.max>0&&rosterScroll.top>0,'the roster fixture creates genuine overflow and a nonzero scroll position');
      await tacticControl.focus();await tacticControl.click();await ready(p);await p.evaluate(()=>new Promise(requestAnimationFrame));
      assert.equal(await p.evaluate(()=>document.activeElement.id),tacticFocusId,'saving and re-rendering a tactic retains keyboard focus on the original control');
      assert.equal(await p.locator('#camp-party-roster').evaluate(el=>el.scrollTop),rosterScroll.top,'saving a tactic preserves the actual roster-list scroll');
      assert.equal((await savedProfile(p)).roster.find(member=>member.id==='P4').tactic,tactic,'camp tactic buttons store the original tactic value');
      if(width===1280){
        const pendingTactic=TACTICS.find(value=>value!==tactic&&value!=='together');assert.ok(pendingTactic);
        await p.evaluate(()=>{window.__fault.mode='pending';});
        await p.locator('[data-camp-tactic="'+pendingTactic+'"]').click();
        await p.waitForFunction(()=>window.trial.store.status==='saving');
        await p.locator('#camp-close').click();await openCampPanel(p,'party');
        const reopenedFocus=await p.evaluate(()=>document.activeElement.id);assert.equal(reopenedFocus,'camp-close');
        await p.evaluate(()=>{window.__fault.mode='pass';for(const pending of window.__fault.pending.splice(0))pending.release();});
        await ready(p);await p.evaluate(()=>new Promise(requestAnimationFrame));
        assert.equal(await p.evaluate(()=>document.activeElement.id),reopenedFocus,'a completed save cannot steal focus from a newly reopened panel');
        assert.equal((await savedProfile(p)).roster.find(member=>member.id==='P4').tactic,pendingTactic);
        await p.locator('[data-camp-tactic="'+tactic+'"]').click();await ready(p);
      }
      await p.locator('#lead-P4').click();await ready(p);
      const prepared=await savedProfile(p);
      assert.deepEqual(prepared.team,['P2','P3','P4']);assert.equal(prepared.leader,'P4');
      await p.screenshot({path:artifact+`camp194-${width}x${height}-party.png`});
      await closePanel(p);

      await openCampPanel(p,'vault');
      records=await assertDialogInViewport(p,'#camp-dialog[open]',width,height);
      await p.locator('[data-vault-by="type"]').click();
      let filters=await p.locator('[data-vault-filter]').evaluateAll(nodes=>nodes.map(node=>node.dataset.vaultFilter));
      assert.ok(filters.includes('all'),'the machine warehouse has a complete filter');
      const typeFilter=filters.find(value=>value!=='all'&&ALL_TM_MOVES.some(move=>typeFilterMatches(value,move)));
      assert.ok(typeFilter,'the type filter has at least one real machine to show');
      await p.locator('[data-vault-filter="'+typeFilter+'"]').click();
      await ready(p);
      let shown=await visibleMachineIds(p),expected=ALL_TM_MOVES.filter(move=>typeFilterMatches(typeFilter,move));
      assert.deepEqual([...shown].sort(),[...expected].sort(),'type filtering matches the fixed move-type data');
      const categorySwitch=p.locator('[data-vault-by="category"]');await categorySwitch.click();await ready(p);
      filters=await p.locator('[data-vault-filter]').evaluateAll(nodes=>nodes.map(node=>node.dataset.vaultFilter));
      const categoryFilter=filters.find(value=>value!=='all'&&ALL_TM_MOVES.some(move=>categoryFilterMatches(value,move)));
      assert.ok(categoryFilter,'the category filter has at least one real machine to show');
      await p.locator('[data-vault-filter="'+categoryFilter+'"]').click();await ready(p);
      shown=await visibleMachineIds(p);expected=ALL_TM_MOVES.filter(move=>categoryFilterMatches(categoryFilter,move));
      assert.deepEqual([...shown].sort(),[...expected].sort(),'physical, special and status filtering matches the shared move categories');
      await p.screenshot({path:artifact+`camp194-${width}x${height}-vault-category.png`});

      await p.locator('[data-vault-by="type"]').click();await ready(p);
      await p.locator('[data-vault-filter="all"]').click();await ready(p);
      const invalidBefore=await savedProfile(p),invalidCount=invalidBefore.vault[fixture.cannotLearn];
      await p.locator('#tm-'+fixture.cannotLearn).click();
      const invalidObject=p.locator('[data-vault-learner="P1"]');
      assert.equal(await invalidObject.count(),1,'the incompatible roster member remains visible in the learning list');
      assert.equal(await invalidObject.isDisabled(),true,'the incompatible member cannot be chosen for learning');
      await invalidObject.evaluate(element=>element.click());
      assert.deepEqual(await savedProfile(p),invalidBefore,'a disabled incompatible choice leaves the complete saved profile unchanged');
      assert.equal((await savedProfile(p)).vault[fixture.cannotLearn],invalidCount,'an incompatible selection consumes no machine');

      const scrollLearnBefore=await savedProfile(p),scrollInventoryBefore=scrollLearnBefore.vault[fixture.learnMove];
      await p.locator('#tm-'+fixture.learnMove).click();
      const learningList=p.locator('#camp-vault-learners');
      const learningScroll=await learningList.evaluate(el=>{const max=el.scrollHeight-el.clientHeight;el.scrollTop=max;return {max,top:el.scrollTop};});
      assert.ok(learningScroll.max>0&&learningScroll.top>0,'the multi-partner fixture makes the learning-target list genuinely scrollable at '+width+'x'+height+': '+JSON.stringify(learningScroll));
      const scrollLearner=p.locator('[data-vault-learner="'+fixture.scrollLearnerId+'"]');
      assert.equal(await scrollLearner.count(),1,'the last real partner appears in the learning-target list');
      assert.equal(await scrollLearner.isDisabled(),false,'the last real partner can learn the chosen move');
      await scrollLearner.click();await p.evaluate(()=>new Promise(requestAnimationFrame));
      assert.equal(await learningList.evaluate(el=>el.scrollTop),learningScroll.top,'choosing a visible target redraws without losing the learning-list scroll');
      await p.locator('#learn-'+fixture.scrollLearnerId).click();await ready(p);await p.evaluate(()=>new Promise(requestAnimationFrame));
      assert.equal(await learningList.evaluate(el=>el.scrollTop),learningScroll.top,'saving a learned move redraws without losing the learning-list scroll');
      const scrollLearned=await savedProfile(p);
      assert.equal(scrollLearned.vault[fixture.learnMove],scrollInventoryBefore-1,'the scrolled target consumes one real machine');
      assert.ok(scrollLearned.roster.find(member=>member.id===fixture.scrollLearnerId).learned.some(move=>move.move===fixture.learnMove),'the scrolled target is really added to the saved profile');

      const learnBefore=await savedProfile(p),inventoryBefore=learnBefore.vault[fixture.learnMove];
      await p.locator('#tm-'+fixture.learnMove).click();
      await p.locator('[data-vault-learner="P1"]').click();
      await p.locator('#learn-P1').waitFor();
      assert.equal(await p.locator('#learn-P1').isDisabled(),false,'a compatible partner can confirm learning');
      await p.locator('#learn-P1').click();
      // P1 already carries four moves, so the window asks; "only learn" keeps the carried list as it was.
      await p.locator('#learn-carry-dialog[open]').waitFor();await p.locator('#carry-only-learn').click();await ready(p);
      const learned=await savedProfile(p),learnedP1=learned.roster.find(member=>member.id==='P1');
      assert.equal(learned.vault[fixture.learnMove],inventoryBefore-1,'learning consumes exactly one machine');
      assert.ok(learnedP1.learned.some(move=>move.move===fixture.learnMove),'the learned move is added to the real profile');
      assert.deepEqual(learnedP1.carry,learnBefore.roster.find(member=>member.id==='P1').carry,'learning does not silently change carried moves');
      await p.locator('[data-vault-tab="shards"]').click();await ready(p);
      const shardRows=await p.locator('[data-vault-shard]').evaluateAll(nodes=>nodes.map(node=>({species:node.dataset.vaultShard,text:node.innerText})));
      assert.deepEqual(shardRows.map(row=>row.species).sort(),Object.keys(learned.shards).sort(),'the shard page contains the profile inventory only');
      for(const [species,count] of Object.entries(learned.shards)){
        const row=shardRows.find(item=>item.species===species);
        assert.ok(row&&row.text.includes(String(count)),'the shard page shows the saved count for '+speciesZh(species));
      }
      await p.screenshot({path:artifact+`camp194-${width}x${height}-vault-shards.png`});
      await closePanel(p);

      await p.locator('#depart').click();await p.locator('#camp-departure[open]').waitFor();
      records=await assertDialogInViewport(p,'#camp-departure[open]',width,height);
      assert.equal(await p.locator('#difficulty-easy').count(),1);assert.equal(await p.locator('#difficulty-normal').count(),1);assert.equal(await p.locator('#difficulty-hard').count(),1);
      const departureText=await p.locator('#camp-departure').innerText();
      for(const id of prepared.team){const member=prepared.roster.find(candidate=>candidate.id===id);assert.ok(departureText.includes(speciesZh(member.species)),'departure confirmation previews '+speciesZh(member.species));}
      for(const [id,description] of [['easy','敌人较弱'],['normal','标准'],['hard','敌人较强']])
        assert.equal(await p.locator('#difficulty-'+id+' small').innerText(),description,'departure explains the '+id+' difficulty in plain words');
      const departureGeometry=await p.evaluate(()=>{
        const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
        const close=document.querySelector('#camp-departure .camp194-close');
        const third=document.querySelectorAll('#camp-departure .camp194-depart-member')[2];
        const lead=third?.querySelector('.camp194-depart-lead');
        return {close:close?rect(close):null,thirdLead:lead?rect(lead):null};
      });
      assert.ok(departureGeometry.close?.width>0&&departureGeometry.thirdLead?.width>0,'the close button and third member 操控 marker are visible');
      const closeLeadOverlap=departureGeometry.close.left<departureGeometry.thirdLead.right&&departureGeometry.close.right>departureGeometry.thirdLead.left&&departureGeometry.close.top<departureGeometry.thirdLead.bottom&&departureGeometry.close.bottom>departureGeometry.thirdLead.top;
      assert.equal(closeLeadOverlap,false,'the departure close button does not overlap the third member 操控 marker at '+width+'px: '+JSON.stringify(departureGeometry));
      await p.screenshot({path:artifact+`camp194-${width}x${height}-departure.png`});
      await p.keyboard.press('Escape');await p.locator('#camp-departure[open]').waitFor({state:'detached'});
      assert.equal(await p.evaluate(()=>document.activeElement.id),'depart','Escape closes departure and returns focus to its entry button');
      assert.equal(await state(p),null,'Escape leaves the player at the camp');
      await p.locator('#depart').click();await p.locator('#camp-departure[open]').waitFor();
      if(width===1280){
        const writesBeforeReject=await p.evaluate(()=>window.__fault.writes.length);
        await p.evaluate(()=>{window.__fault.mode='pending';});
        await p.locator('#difficulty-hard').click();
        await p.waitForFunction(()=>window.trial.store.status==='saving'&&window.__fault.pending.length>0);
        assert.equal(await p.locator('#depart-confirm').isDisabled(),true,'entering the maze is disabled while the real storage write is pending');
        await p.locator('#depart-confirm').evaluate(element=>element.click());
        assert.equal(await state(p),null,'a click during a pending save cannot start the expedition');
        assert.equal(await p.evaluate(()=>window.__fault.writes.length),writesBeforeReject+1,'the failure scenario attempted one real profile storage write');
        await p.evaluate(()=>window.__fault.pending.at(-1).reject());
        await p.waitForFunction(()=>window.trial.store.status==='failed'&&document.querySelector('.camp-feedback')?.textContent.includes('重试保存'));
        assert.match(await p.locator('.camp-feedback').innerText(),/尚未保存.*重试保存/,'the rejected write gives visible, actionable feedback');
        assert.equal(await p.locator('#camp-retry').isVisible(),true,'the departure dialog exposes the bound save retry');
        const failureGeometry=await p.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {feedback:rect('#camp-departure .camp-feedback'),confirm:rect('#depart-confirm'),retry:rect('#camp-retry')};});
        const failureOverlap=failureGeometry.feedback.left<failureGeometry.confirm.right&&failureGeometry.feedback.right>failureGeometry.confirm.left&&failureGeometry.feedback.top<failureGeometry.confirm.bottom&&failureGeometry.feedback.bottom>failureGeometry.confirm.top;
        assert.equal(failureOverlap,false,'the save failure message and retry occupy their own space clear of departure: '+JSON.stringify(failureGeometry));
        assert.ok(failureGeometry.retry.left>=failureGeometry.feedback.left&&failureGeometry.retry.right<=failureGeometry.feedback.right&&failureGeometry.retry.top>=failureGeometry.feedback.top&&failureGeometry.retry.bottom<=failureGeometry.feedback.bottom,'the visible retry is fully inside its failure message');
        assert.equal(await p.locator('#depart-confirm').isDisabled(),true,'departure stays disabled after the write is rejected');
        await p.evaluate(()=>{window.__fault.mode='pass';});
        await p.locator('#camp-retry').click();await ready(p);
        assert.equal(await p.locator('#camp-departure[open]').count(),1,'retry success keeps the departure dialog open');
        assert.equal(await p.locator('#camp-departure .camp-feedback').count(),0,'successful retry clears the failure feedback');
        assert.equal(await p.locator('#depart-confirm').isEnabled(),true,'successful retry restores departure controls');
        assert.equal((await savedProfile(p)).difficulty,'hard','the retried difficulty change is now in the saved profile');
        assert.equal(await state(p),null,'retrying the save does not itself enter the maze');
      }else{
        await p.locator('#difficulty-hard').click();await ready(p);
      }
      await p.locator('#camp-departure .camp194-close').click();await p.locator('#camp-departure[open]').waitFor({state:'detached'});
      assert.equal(await state(p),null,'canceling the departure dialog does not enter a dungeon');
      await p.locator('#depart').click();await p.locator('#camp-departure[open]').waitFor();
      await p.locator('#difficulty-hard').click();await ready(p);

      if(width===1280){
        const readyToDepart=await savedProfile(p);
        assert.equal(await p.locator('#difficulty-hard').getAttribute('aria-pressed'),'true');
        await p.locator('#depart-confirm').click();await ready(p);
        const run=await state(p);
        assert.ok(run,'confirmed departure creates a real expedition');
        assert.deepEqual(run.queue.map(id=>run.units[id].inst),readyToDepart.team,'the run uses the confirmed profile roster order');
        assert.equal(run.units[run.leader].inst,readyToDepart.leader,'the run uses the selected leader');
        assert.equal(run.difficulty,'hard','the run uses the confirmed difficulty');
        assert.equal(run.dungeon.seed,19,'the confirmed run uses the deterministic seed without replacing later Phaser randomness');
        assert.equal(await p.evaluate(()=>window.trial.profile().difficulty),'hard');
        // A controlled invitation isolates the record-board new-partner branch;
        // acceptance, terminal settlement, saving and return all use the real controller.
        const terminal=await p.evaluate(async recruit=>{
          const store=window.trial.store,world=store.state;
          if(!Object.hasOwn(store,'world')||world.phase!=='playing')throw Error('the UI fixture requires the existing in-memory World slot');
          if(store.profile.roster.some(member=>member.species===recruit.species))throw Error('the controlled recruit must be a new species');
          const envelopeBefore=JSON.stringify(store.envelope);
          world.phase='invitation';world.anchor={...world.units[world.leader].pos};
          world.invitations.push({id:world.runId+':camp194-record-invite',unit:recruit,status:'pending'});
          store.world=world;
          const accepted=await store.dispatch({type:'invite',choice:'camp'});
          if(!accepted.ok)throw Error(accepted.error);
          if(JSON.stringify(store.envelope)!==envelopeBefore)throw Error('an active-run invitation must not write the camp profile');
          let actions=0,lastError='',campedPartnerIds=[recruit.id];
          for(;actions<120&&store.state?.phase!=='ended';actions++){
            const world=store.state;let command;
            if(world.phase==='playing')command={type:'round',action:{type:'wait'}};
            else if(world.phase==='learning')command={type:'learnMove',replace:null};
            else if(world.phase==='evolution')command={type:'evolve',species:null};
            else if(world.phase==='invitation'){
              const pending=world.invitations.find(invite=>invite.status==='pending');
              const isNewSpecies=pending&&!store.profile.roster.some(member=>member.species===(pending.unit.entrySpecies??pending.unit.species));
              const choice=isNewSpecies&&!campedPartnerIds.length?'camp':'reject';
              if(choice==='camp')campedPartnerIds.push(pending.unit.id);
              command={type:'invite',choice};
            }
            else if(world.phase==='commissionChoice')command={type:'commissionChoice',choice:'reject'};
            else if(world.phase==='blessingChoice')command={type:'blessingChoice',blessing:null};
            else if(world.phase==='tmChoice')command={type:'tmChoice',move:world.pending?.options?.[0]??world.pendingTm?.options?.[0]};
            else if(world.phase==='transit')command={type:'finishTransit'};
            else if(world.phase==='exit')command={type:'finishExit'};
            else {lastError='unexpected phase '+world.phase;break;}
            const result=await store.dispatch(command);if(!result.ok){lastError=result.error;break;}
          }
          window.dispatchEvent(new Event('blur'));
          return {phase:store.state?.phase,outcome:store.state?.end?.outcome,actions,lastError,campedPartnerIds,status:store.status,storeError:store.error};
        },speciesUnit('N900194','weedle',5));
        assert.equal(terminal.phase,'ended','the fixed real run reaches a terminal result within the 120-action cap: '+JSON.stringify(terminal));
        assert.equal(terminal.status,'ready','terminal settlement must save successfully: '+JSON.stringify(terminal));
        assert.equal(terminal.outcome,'wipe','the fixed high-difficulty wait route records a real wipe');
        assert.ok(terminal.campedPartnerIds.length>0,'the controlled invitation was accepted through the real camp command');
        await p.locator('#to-base').waitFor();await p.screenshot({path:artifact+'camp194-1280x720-settlement.png'});
        await p.locator('#to-base').click();await ready(p);await p.locator('#base').waitFor();
        const afterRun=await savedProfile(p);assert.equal(afterRun.expeditions,readyToDepart.expeditions+1);
        const departedIds=new Set(readyToDepart.roster.map(member=>member.id));
        const newPartners=afterRun.roster.filter(member=>!departedIds.has(member.id));
        assert.ok(newPartners.length>0,'settling the real expedition adds the camped recruit to the saved roster');
        await openCampPanel(p,'records');recordText=await p.locator('#camp-dialog').innerText();
        assert.match(recordText,/全队倒下/,'the current page shows its actual latest run');
        const partnerRows=p.locator('#camp-record-loot .camp194-loot-tile').filter({hasText:'新伙伴'});
        assert.ok(await partnerRows.count()>0,'the record board contains a real new-partner reward row');
        for(const member of newPartners)
          assert.equal(await partnerRows.filter({hasText:speciesZh(member.species)}).count(),1,'the record board names the new roster partner '+speciesZh(member.species));
        for(const value of [String(afterRun.expeditions),String(afterRun.rankExp),String(afterRun.roster.length),String(Object.values(afterRun.shards).reduce((sum,count)=>sum+count,0))])
          assert.ok(recordText.includes(value),'the records panel updates from the settled profile '+value);
        await p.screenshot({path:artifact+'camp194-1280x720-records-after-run.png'});
        await p.reload();await ready(p);await p.locator('#base').waitFor();
        const refreshed=await savedProfile(p);assert.equal(refreshed.expeditions,afterRun.expeditions,'cumulative profile data survives refresh');
        await openCampPanel(p,'records');recordText=await p.locator('#camp-dialog').innerText();
        assert.doesNotMatch(recordText,/全队倒下/,'refresh hides the previous-run report because it is page-only');
        assert.ok(recordText.includes(String(refreshed.rankExp)),'cumulative profile data still appears after refresh');
        await p.screenshot({path:artifact+'camp194-1280x720-records-after-refresh.png'});
      }
      assert.deepEqual(errors,[]);
      reports.push({viewport:{width,height},initialProfile:{expeditions:before.expeditions,rankExp:before.rankExp,roster:before.roster.length,shards:Object.values(before.shards).reduce((sum,count)=>sum+count,0)},
        team:prepared.team,leader:prepared.leader,tactic:prepared.roster.find(member=>member.id==='P4').tactic,
        carryLimit:4,typeFilter,categoryFilter,learnedMove:fixture.learnMove,invalidMove:fixture.cannotLearn,
        ...(signGeometry?{signGeometry}:{}),
        dialog:records,departureCanceled:true,...(width===1280?{confirmedDifficulty:'hard',actualRunReport:true,acceptedNewPartner:true,recruitFixture:'one controlled weedle invitation; real camp acceptance, terminal settlement and record UI',refreshHidesLastRun:true}:{})});
    }finally{await context.close();}
  }
  {
    const width=844,height=390;
    const {context,page:p,errors}=await setup();
    p.setDefaultTimeout(10000);
    try{
      const seededUrl=new URL(p.url());seededUrl.searchParams.set('seed','19');
      await p.goto(seededUrl.href);await p.locator('#start').waitFor();
      await p.setViewportSize({width,height});await emptyReady(p);
      const {newGameProfile}=await import('../../src/core/base.ts');
      const fixture=campProfile(newGameProfile('bulbasaur','charmander'));
      assert.equal(await p.evaluate(profile=>window.trial.store.beginNewGame(profile,true),fixture.profile),true,'the short-screen save fixture uses the real profile writer');
      await p.reload();await ready(p);await p.locator('#base').waitFor();
      const shortMapGeometry=await p.evaluate(()=>{
        const map=document.querySelector('.camp-map').getBoundingClientRect();
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.left-map.left,y:r.top-map.top,width:r.width,height:r.height,bottom:r.bottom-map.top};};
        return {map:{width:map.width,height:map.height,scale:map.width/1280},party:{hotspot:rect('#camp-open-party'),label:rect('#camp-open-party .camp-spot-label'),keeper:rect('#camp-open-party .camp-keeper')},vault:{hotspot:rect('#camp-open-vault'),label:rect('#camp-open-vault .camp-spot-label'),keeper:rect('#camp-open-vault .camp-keeper')}};
      });
      await p.locator('#depart').click();await p.locator('#camp-departure[open]').waitFor();
      await p.evaluate(()=>{window.__fault.mode='pending';});
      await p.locator('#difficulty-hard').click();
      await p.waitForFunction(()=>window.trial.store.status==='saving'&&window.__fault.pending.length>0);
      await p.evaluate(()=>window.__fault.pending.at(-1).reject());
      await p.waitForFunction(()=>window.trial.store.status==='failed'&&document.querySelector('#camp-departure .camp-feedback')?.textContent.includes('重试保存'));
      await assertDialogInViewport(p,'#camp-departure[open]',width,height);
      const initialScroll=await p.locator('#camp-departure').evaluate(el=>({scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollTop:el.scrollTop,overflowY:getComputedStyle(el).overflowY}));
      assert.equal(initialScroll.overflowY,'auto','the short departure window scrolls internally');
      assert.ok(initialScroll.scrollHeight>initialScroll.clientHeight,'the failed-save retry row remains in scrollable dialog content');
      const scrolled=await p.locator('#camp-departure').evaluate(el=>{
        el.scrollTop=el.scrollHeight;
        const button=el.querySelector('#camp-retry').getBoundingClientRect(),windowRect=el.getBoundingClientRect();
        const visibleTop=windowRect.top+el.clientTop,visibleBottom=visibleTop+el.clientHeight;
        return {scrollTop:el.scrollTop,max:el.scrollHeight-el.clientHeight,retryTop:button.top,retryBottom:button.bottom,visibleTop,visibleBottom};
      });
      assert.ok(scrolled.max>0&&scrolled.scrollTop>0,'the failure row is reachable by scrolling the departure window');
      assert.ok(scrolled.retryTop>=scrolled.visibleTop&&scrolled.retryBottom<=scrolled.visibleBottom,'scrolling places the retry button inside the window viewport: '+JSON.stringify(scrolled));
      await p.screenshot({path:artifact+'camp194-844x390-departure-failure-retry.png'});
      await p.evaluate(()=>{window.__fault.mode='pass';});
      await p.locator('#camp-retry').click();await ready(p);
      assert.equal(await p.locator('#camp-departure[open]').count(),1,'short-screen retry keeps departure open');
      assert.equal(await p.locator('#camp-departure .camp-feedback').count(),0,'short-screen retry clears the failure row');
      assert.equal(await p.locator('#depart-confirm').isEnabled(),true,'short-screen retry restores departure controls');
      assert.equal((await savedProfile(p)).difficulty,'hard','short-screen retry saves the selected difficulty');
      await p.evaluate(()=>{window.__fault.mode='pending';});
      await p.locator('#difficulty-easy').click();
      await p.waitForFunction(()=>window.trial.store.status==='saving'&&window.__fault.pending.length>0);
      await p.evaluate(()=>window.__fault.pending.at(-1).reject());
      await p.waitForFunction(()=>window.trial.store.status==='failed');
      await p.keyboard.press('Escape');await p.locator('#camp-departure[open]').waitFor({state:'detached'});
      assert.match(await p.locator('#base .camp-feedback').innerText(),/保存失败.*重试保存/,'closing the failed departure shows the retry prompt at camp');
      assert.equal(await p.locator('#camp-retry').isVisible(),true,'the camp retry is visible after Escape closes departure');
      assert.equal(await p.evaluate(()=>document.activeElement?.id),'camp-retry','Escape returns focus to the available camp retry');
      const campRetryGeometry=await p.evaluate(()=>{
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
        return {viewport:{width:innerWidth,height:innerHeight},feedback:rect('#base .camp-feedback'),retry:rect('#camp-retry'),focus:document.activeElement?.id};
      });
      await p.screenshot({path:artifact+'camp194-844x390-camp-retry-after-escape.png'});
      await p.evaluate(()=>{window.__fault.mode='pass';});
      await p.locator('#camp-retry').click();await ready(p);
      assert.equal(await p.locator('#base .camp-feedback').count(),0,'the camp prompt clears after a successful retry');
      assert.equal(await p.evaluate(()=>document.activeElement?.id),'depart','after a successful camp retry the focus moves to the departure gate instead of being lost');
      assert.equal((await savedProfile(p)).difficulty,'easy','retrying from camp saves the pending difficulty change');
      assert.equal(await state(p),null,'retrying from camp does not start the expedition');
      assert.deepEqual(errors,[]);
      reports.push({viewport:{width,height},mapGeometry:shortMapGeometry,initialScroll,scrolled,campRetryGeometry,departureFailureScroll:true,campRetryAfterEscape:true});
    }finally{await context.close();}
  }
  return reports;
}
