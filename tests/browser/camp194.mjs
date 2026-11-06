import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openCampPanel} from './camp-ui.mjs';
import {ALL_TM_MOVES, SPECIES, learnableMove} from '../../src/core/roster.ts';
import {moveCategory} from '../../src/core/moves.ts';
import {NAME_TABLE, speciesZh} from '../../src/core/names.ts';
import {TACTICS} from '../../src/core/tactics.ts';

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
  profile.next=5;profile.team=['P1','P2','P3'];profile.leader='P2';
  profile.expeditions=17;profile.rankExp=237;
  profile.vault=Object.fromEntries(ALL_TM_MOVES.map(move=>[move,1]));
  profile.vault[learnMove]=2;
  profile.shards={rattata:9,pidgey:5};
  profile.difficulty='normal';
  const cannotLearn=ALL_TM_MOVES.find(move=>!learnableMove(p1.species,move));
  assert.ok(cannotLearn,'the fixture includes a real move outside the selected starter learnset');
  return {profile,overflowMove,learnMove,cannotLearn};
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
      const {newGameProfile}=await import('../../src/core/base.ts');
      const generated=newGameProfile('bulbasaur','charmander');
      assert.equal(generated.ok,true);
      const fixture=campProfile(generated);
      assert.equal(await p.evaluate(profile=>window.trial.store.beginNewGame(profile,true),fixture.profile),true,'the profile is written by the real save controller');
      await p.reload();await ready(p);await p.locator('#base').waitFor();
      const expectedTeam=['P1','P2','P3'];
      const before=await savedProfile(p);
      assert.deepEqual(before.team,expectedTeam);assert.equal(before.leader,'P2');
      assert.equal(await p.locator('#difficulty-picker').count(),0,'difficulty is not selectable on the camp map');
      assert.equal(await p.locator('#difficulty-easy,#difficulty-normal,#difficulty-hard').count(),0,'difficulty controls exist only in the departure dialog');
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
      assert.equal(await p.locator('#carry-P1-'+fixture.overflowMove).isDisabled(),true,'the fifth learned move cannot exceed the four-move carry limit');
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

      const learnBefore=await savedProfile(p),inventoryBefore=learnBefore.vault[fixture.learnMove];
      await p.locator('#tm-'+fixture.learnMove).click();
      await p.locator('[data-vault-learner="P1"]').click();
      await p.locator('#learn-P1').waitFor();
      assert.equal(await p.locator('#learn-P1').isDisabled(),false,'a compatible partner can confirm learning');
      await p.locator('#learn-P1').click();await ready(p);
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
      await p.screenshot({path:artifact+`camp194-${width}x${height}-departure.png`});
      await p.locator('#difficulty-hard').click();await ready(p);
      await p.locator('#depart-cancel').click();await p.locator('#camp-departure[open]').waitFor({state:'detached'});
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
        const terminal=await p.evaluate(async()=>{
          const store=window.trial.store;let actions=0,lastError='';
          for(;actions<120&&store.state?.phase!=='ended';actions++){
            const world=store.state;let command;
            if(world.phase==='playing')command={type:'round',action:{type:'wait'}};
            else if(world.phase==='learning')command={type:'learnMove',replace:null};
            else if(world.phase==='evolution')command={type:'evolve',species:null};
            else if(world.phase==='invitation')command={type:'invite',choice:'reject'};
            else if(world.phase==='commissionChoice')command={type:'commissionChoice',choice:'reject'};
            else if(world.phase==='blessingChoice')command={type:'blessingChoice',blessing:null};
            else if(world.phase==='tmChoice')command={type:'tmChoice',move:world.pending?.options?.[0]??world.pendingTm?.options?.[0]};
            else if(world.phase==='transit')command={type:'finishTransit'};
            else if(world.phase==='exit')command={type:'finishExit'};
            else {lastError='unexpected phase '+world.phase;break;}
            const result=await store.dispatch(command);if(!result.ok){lastError=result.error;break;}
          }
          window.dispatchEvent(new Event('blur'));
          return {phase:store.state?.phase,outcome:store.state?.end?.outcome,actions,lastError};
        });
        assert.equal(terminal.phase,'ended','the fixed real run reaches a terminal result within the 120-action cap: '+JSON.stringify(terminal));
        assert.equal(terminal.outcome,'wipe','the fixed high-difficulty wait route records a real wipe');
        await p.locator('#to-base').waitFor();await p.screenshot({path:artifact+'camp194-1280x720-settlement.png'});
        await p.locator('#to-base').click();await ready(p);await p.locator('#base').waitFor();
        const afterRun=await savedProfile(p);assert.equal(afterRun.expeditions,readyToDepart.expeditions+1);
        await openCampPanel(p,'records');recordText=await p.locator('#camp-dialog').innerText();
        assert.match(recordText,/全队倒下/,'the current page shows its actual latest run');
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
        dialog:records,departureCanceled:true,...(width===1280?{confirmedDifficulty:'hard',actualRunReport:true,refreshHidesLastRun:true}:{})});
    }finally{await context.close();}
  }
  return reports;
}
