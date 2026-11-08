/* Round 9 (G3.12): blessing rarity tiers, the weighted draw and the refresh. Real applyCommand where state is involved. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createExpedition,BLESSINGS,BLESSING_RARITY,INITIAL_BLESSING_REFRESHES,drawBlessings} from '../../src/core/engine.ts';
import {initialProfile,squadOf} from '../../src/core/base.ts';

const TIERS={
  common:['berryBoost','rally','scholar','regen','lullaby','battleSpirit'],
  rare:['nemesis','headhunter','fullpower','thickskin','killheal'],
  epic:['floorHeal','tmChoice','laststand'],
};
const ALL=Object.keys(BLESSINGS);
const lcg=seed=>{let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};};
const tierOf=id=>BLESSINGS[id].rarity;

test('the tier is data in blessings.json: all 14 blessings carry one, exactly as the rule lists them; weights are 60/30/10',()=>{
  assert.equal(ALL.length,14);
  for(const id of ALL)assert.ok(['common','rare','epic'].includes(BLESSINGS[id].rarity),id+' has a tier');
  for(const [tier,ids] of Object.entries(TIERS)){assert.deepEqual(ALL.filter(id=>tierOf(id)===tier).sort(),[...ids].sort(),tier+' tier');}
  assert.deepEqual(BLESSING_RARITY.weights,{common:60,rare:30,epic:10});
  assert.deepEqual(BLESSING_RARITY.names,{common:'普通',rare:'稀有',epic:'史诗'});
});

test('the tier of a slot follows 60/30/10 over 3000 draws (within 3 points) and a draw never repeats a blessing',()=>{
  const first={common:0,rare:0,epic:0},any={common:0,rare:0,epic:0},random=lcg(12345);
  for(let i=0;i<3000;i++){const offer=drawBlessings(ALL,random);assert.equal(offer.length,3);assert.equal(new Set(offer).size,3,'no repeat inside one draw');first[tierOf(offer[0])]++;for(const id of offer)any[tierOf(id)]++;}
  for(const [tier,share] of [['common',.6],['rare',.3],['epic',.1]])assert.ok(Math.abs(first[tier]/3000-share)<=.03,`first slot ${tier}: ${(first[tier]/30).toFixed(1)}% vs ${share*100}%`);
  assert.ok(any.common>any.rare&&any.rare>any.epic,'over all slots the rarer tiers come up less often');
});

test('a tier with nothing left drops out and the others keep their weights; fewer than three picks gives as many as exist',()=>{
  const noCommon=ALL.filter(id=>tierOf(id)!=='common'),random=lcg(777),first={rare:0,epic:0};
  for(let i=0;i<3000;i++){const offer=drawBlessings(noCommon,random);assert.equal(offer.length,3);for(const id of offer)assert.notEqual(tierOf(id),'common');first[tierOf(offer[0])]++;}
  assert.ok(Math.abs(first.rare/3000-.75)<=.03&&Math.abs(first.epic/3000-.25)<=.03,`rare:epic re-weighted to 30:10, got ${first.rare}:${first.epic}`);
  // a single epic among commons: it can be drawn, and once drawn the rest come from the commons
  const mixed=[...TIERS.common,'laststand'];let epics=0;for(let i=0;i<500;i++){const offer=drawBlessings(mixed,random);assert.equal(offer.length,3);assert.ok(offer.filter(id=>tierOf(id)==='epic').length<=1);epics+=offer.includes('laststand')?1:0;}
  assert.ok(epics>0,'the lone epic does get drawn sometimes');
  assert.deepEqual(drawBlessings(['laststand','scholar'],random).sort(),['laststand','scholar'],'two picks, two offered');
  assert.deepEqual(drawBlessings([],random),[]);assert.equal(drawBlessings(['regen'],random).length,1);
});

test('the same seed gives the same draw (reproducible)',()=>{
  assert.deepEqual(drawBlessings(ALL,lcg(9)),drawBlessings(ALL,lcg(9)));
  const a=createExpedition('r9',5,3,squadOf(initialProfile()),0,true,3),b=createExpedition('r9',5,3,squadOf(initialProfile()),0,true,3);
  const open=s=>{const w=structuredClone(s),room=w.adventureRooms.find(r=>r.type==='blessing');w.units[w.leader].pos={...room.interaction};for(const id of w.enemies)w.units[id].waitOnly=true;const r=applyCommand(w,{type:'round',action:{type:'interact',exit:false}});assert.equal(r.ok,true,r.error);return r.state;};
  assert.deepEqual(open(a).pendingChoices[0].options,open(b).pendingChoices[0].options);
});

function inChoice(source='room'){
  const s=createExpedition('r9-refresh',5,3,squadOf(initialProfile()),0,true,3);
  for(const id of s.enemies)s.units[id].waitOnly=true;
  if(source==='room'){const room=s.adventureRooms.find(r=>r.type==='blessing');s.units[s.leader].pos={...room.interaction};const r=applyCommand(s,{type:'round',action:{type:'interact',exit:false}});assert.equal(r.ok,true,r.error);return r.state;}
  // a challenge reward reaches the same choice through the same queue
  const w=structuredClone(s);w.pendingChoices=[{type:'blessing',source:'challenge',room:null,options:drawBlessings(ALL,lcg(3))}];w.phase='blessing';return w;
}

test('refresh: one per run at the start, redraws all three, costs no round, then is refused at zero with nothing changed',()=>{
  for(const source of ['room','challenge']){
    const s=inChoice(source);assert.equal(INITIAL_BLESSING_REFRESHES,1);assert.equal(s.blessingRefreshes,1,'each run starts with one refresh');
    const before=structuredClone(s),r=applyCommand(s,{type:'blessingRefresh'});assert.equal(r.ok,true,r.error);
    assert.deepEqual(s,before,'applyCommand does not mutate its input');
    const t=r.state;assert.equal(t.blessingRefreshes,0);assert.equal(t.round,s.round,'no round passes');assert.equal(t.phase,'blessing');
    assert.equal(t.pendingChoices.length,1);assert.equal(t.pendingChoices[0].options.length,3);assert.equal(new Set(t.pendingChoices[0].options).size,3);
    assert.equal(t.pendingChoices[0].source,source);
    assert.notDeepEqual(t.pendingChoices[0].options,s.pendingChoices[0].options,source+': the three cards changed (checked for this fixed seed)');
    const refused=applyCommand(t,{type:'blessingRefresh'});assert.equal(refused.ok,false);assert.match(refused.error,/刷新/);
    // reproducible: the same run and the same operation give the same cards
    assert.deepEqual(applyCommand(structuredClone(s),{type:'blessingRefresh'}).state.pendingChoices[0].options,t.pendingChoices[0].options);
    // the refreshed offer is still a valid choice
    const pick=applyCommand(t,{type:'blessingChoice',blessing:t.pendingChoices[0].options[0]});assert.equal(pick.ok,true,pick.error);assert.equal(pick.state.phase,'playing');assert.ok(pick.state.blessings.includes(t.pendingChoices[0].options[0]));
    // a pick from the old offer that is not in the new one is refused
    const gone=s.pendingChoices[0].options.find(id=>!t.pendingChoices[0].options.includes(id));if(gone)assert.equal(applyCommand(t,{type:'blessingChoice',blessing:gone}).ok,false);
  }
});

test('refresh is only for a pending blessing choice, and extra refreshes (a plain number field) are spent one at a time with fresh salts',()=>{
  const s=createExpedition('r9-x',5,3,squadOf(initialProfile()),0,true,3);
  assert.equal(applyCommand(s,{type:'blessingRefresh'}).ok,false,'not in a choice');
  const c=inChoice('room');c.blessingRefreshes=3;
  const seen=[];let cur=c;for(let i=0;i<3;i++){const r=applyCommand(cur,{type:'blessingRefresh'});assert.equal(r.ok,true,r.error);cur=r.state;assert.equal(cur.blessingRefreshes,2-i);seen.push(cur.pendingChoices[0].options.join());}
  assert.ok(new Set(seen).size>=2,'successive refreshes use new salts and give new cards: '+seen.join(' | '));
  assert.equal(applyCommand(cur,{type:'blessingRefresh'}).ok,false);
});
