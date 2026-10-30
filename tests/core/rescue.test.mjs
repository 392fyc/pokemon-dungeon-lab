import test from 'node:test';
import {readFileSync} from 'node:fs';
const legacyRecord=name=>JSON.parse(readFileSync(new URL('./fixtures77-regression/'+name+'.json',import.meta.url),'utf8'));
import assert from 'node:assert/strict';
import {createExpedition,applyCommand,closeOut,recruitUnit,previewInvitation,reveal,RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {newGameProfile,initialProfile,squadOf,settleRun,settleSummary,payRescue,purseProblem,profileProblem,migrateProfile} from '../../src/core/base.ts';
import {TrialStore,decode,decodeLegacy,BUILD_ID} from '../../src/core/save.ts';
import {serviceRoll} from '../../src/core/dungeon.ts';

/*
 * Stage 7.2 rule tests: docs/玩法研究/失败回归与服务点.md, section "验收".
 * Expected values are literals taken from that spec, from the roster data (pidgey: tackle strong 3, gust line 3), and from draws of the saved random
 * stream worked out once by hand: with state 7 the first two values are 0.012 and 0.062 (both below 0.5: lost); state 5 gives 0.690 and 0.773 (kept);
 * state 1 gives 0.627 (kept) then 0.003 (lost). Seeds with a shop or exchanger come from serviceRoll: seed 2 has a shop on floor 1 (machine whirlwind,
 * seed 103 has a shop on floor 1 (machine roar) and an exchanger on floor 1; seed 5 has neither.
 */
const memory=()=>{const m=new Map();let writes=0;return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);writes++;},map:m,writes:()=>writes};};
const pidgey=id=>({id,species:'pidgey',learned:[{move:'tackle',pp:3},{move:'gust',pp:3}],carry:['tackle','gust'],protected:false,tactic:'together'});
const zubat=id=>({id,species:'zubat',learned:[{move:'absorb',pp:2},{move:'poisonfang',pp:1}],carry:['absorb','poisonfang'],protected:false,tactic:'together'});
/** P1 chikorita and P2 cyndaquil are protected (new flow); P3 pidgey and P4 zubat are ordinary partners. */
function profile4(over={}){
 const p=newGameProfile('chikorita','cyndaquil').profile;
 p.roster.push(pidgey('P3'),zubat('P4'));p.next=5;p.team=['P1','P2','P3'];p.leader='P1';
 return Object.assign(p,over);
}
const entry=(inst,paid,left)=>({inst,paid,left});
/** A finished expedition: the squad of `p`, hand-set outcome fields, closed with the engine's own end-of-run processing. */
function finished(p,{outcome='normal',seed=5,purse=0,goal=false,tms=[],rng,camp=[],items,bag}={}){
 const s=createExpedition('run-r',seed,2,squadOf(p),purse);
 if(rng!==undefined)s.prog.rng=rng;
 if(goal){s.goal=true;s.prog.exp=2;}
 s.tms=tms.map(([move,source,fate='held'])=>({move,source,fate}));s.bag=bag??s.tms.filter(t=>t.source==='target').length;
 if(items)s.prog.items={...items.items};
 for(const [id,species] of camp){s.units[id]=recruitUnit(id,species,1);s.units[id].pos=null;s.camp.push(id);}
 if(outcome==='wipe')for(const id of s.queue){s.units[id].hp=0;s.units[id].pos=null;}
 s.phase='ended';s.request=null;s.anchor=null;
 s.end=closeOut(s,outcome);
 return s;
}
const roster=p=>p.roster.map(i=>i.id);

/* ---------- effective expedition and reward ---------- */
test('R1 G completed then wipe: the reward is owed, the run is effective for reason goal',()=>{
 const s=finished(profile4(),{outcome:'wipe',goal:true,rng:5});
 assert.equal(s.end.reward,100);assert.equal(s.end.effective,true);assert.deepEqual(s.end.reasons,['goal']);
 const p=settleRun(profile4(),s);assert.equal(p.account,100);assert.equal(p.expeditions,1);
});
test('R2 no G but a new partner kept: effective, reason recruit, no reward',()=>{
 const s=finished(profile4(),{camp:[['N1','pidgey']]});
 assert.equal(s.end.effective,true);assert.deepEqual(s.end.reasons,['recruit']);assert.equal(s.end.reward,0);
 assert.equal(settleRun(profile4(),s).account,0);
 // a recruit in the wipe counts too, whether or not it goes missing
 const w=createExpedition('run-w',11,2,squadOf(profile4()));w.units.N1=recruitUnit('N1','zubat',1);w.units.N1.pos=null;
 w.camp.push('N1');for(const id of w.queue){w.units[id].hp=0;w.units[id].pos=null;}w.phase='ended';w.request=null;w.anchor=null;w.end=closeOut(w,'wipe');
 assert.deepEqual(w.end.reasons,['recruit']);
});
test('R3 an empty-handed exit, or only berries and tonics, is not effective and moves no counter',()=>{
 const p=profile4({rescue:[entry(pidgey('P5'),false,3),entry(zubat('P6'),true,1)],next:7});
 const s=finished(p,{items:{items:{berry:2,tonic:1}}});
 assert.equal(s.end.effective,false);assert.deepEqual(s.end.reasons,[]);assert.equal(s.end.reward,0);
 const after=settleRun(p,s);
 assert.deepEqual(after.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P5',false,3],['P6',true,1]]);
 const wipe=settleRun(p,finished(p,{outcome:'wipe',rng:5,tms:[['protect','target']]}));
 assert.deepEqual(wipe.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P5',false,3],['P6',true,1]],'a machine that was not brought out is no result');
});
test('R4 a machine brought home (from T or the shop) makes the run effective; one lost in a wipe does not',()=>{
 for(const source of ['target','shop']){
  const s=finished(profile4(),{tms:[['roar',source]]});
  assert.equal(s.end.effective,true);assert.deepEqual(s.end.reasons,['tm']);assert.deepEqual(s.end.tms,[{move:'roar',source,fate:'brought'}]);
 }
 const lost=finished(profile4(),{outcome:'wipe',rng:5,tms:[['roar','shop']]});
 assert.equal(lost.end.effective,false);assert.deepEqual(lost.end.tms,[{move:'roar',source:'shop',fate:'lost'}]);
});

/* ---------- going missing ---------- */
test('R5 protected members never go missing; the others draw from the saved state',()=>{
 // A=P1 and B=P2 protected, C=P3 not: only C draws. State 7: 0.012 -> lost. State 5: 0.690 -> kept.
 assert.deepEqual(finished(profile4(),{outcome:'wipe',rng:7}).end.lost,['C']);
 assert.deepEqual(finished(profile4(),{outcome:'wipe',rng:5}).end.lost,[]);
 // team P1 (protected), P3, P4 with state 1: B draws 0.627 (kept), C draws 0.003 (lost)
 const p=profile4({team:['P1','P3','P4']});
 assert.deepEqual(finished(p,{outcome:'wipe',rng:1}).end.lost,['C']);
 // a normal exit never draws
 assert.deepEqual(finished(p,{rng:7}).end.lost,[]);
 // an old profile's three starters are all protected, even with state 7
 const old=finished(initialProfile(),{outcome:'wipe',rng:7});assert.deepEqual(old.end.lost,[]);assert.equal(old.prog.rng,7,'no protected member draws');
});
test('R6 the terminal stores the lost-partner draw; settlement puts the same member in rescue',()=>{
 const s=finished(profile4(),{outcome:'wipe',rng:7});
 assert.deepEqual(s.end.lost,['C']);assert.equal(s.prog.rng,1831565820,'the end stores the stream after the one loss draw');
 const settled=settleRun(profile4(),s);assert.deepEqual(settled.rescue.map(r=>r.inst.id),['P3']);
});

/* ---------- rescue ---------- */
test('R7 paying: C = 60 from the account; short accounts are refused with the missing amount and nothing changes',async()=>{
 const p=profile4({account:70,rescue:[entry(pidgey('P5'),false,2)],next:6});
 const ok=payRescue(p,'P5');assert.equal(ok.ok,true);
 assert.equal(ok.profile.account,10);assert.deepEqual(ok.profile.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P5',true,1]]);
 assert.equal(p.account,70,'input untouched');
 const poor=profile4({account:50,rescue:[entry(pidgey('P5'),false,2)],next:6});
 const no=payRescue(poor,'P5');assert.equal(no.ok,false);assert.equal(no.error,'账户余额50，救援费60，还差10；没有付款');
 assert.equal(payRescue(ok.profile,'P5').ok,false,'already paid');assert.equal(payRescue(p,'P9').ok,false,'not in the pool');
 const port=memory(),store=new TrialStore(port);await store.beginNewGame(poor,false);
 const raw=port.getItem(store.key);const r=await store.baseAction({type:'rescue',inst:'P5'});assert.equal(r.ok,false);assert.equal(port.getItem(store.key),raw);
});
test('R8 paid partners return at the end of the wait with their own moves; unpaid ones are lost for good',()=>{
 const personal=pidgey('P5');personal.learned.push({move:'protect',pp:1});personal.carry=['tackle','protect'];
 const p=profile4({account:0,rescue:[entry(personal,true,1),entry(zubat('P6'),false,1),entry(pidgey('P7'),false,4)],next:8});
 const after=settleRun(p,finished(p,{goal:true}));
 assert.deepEqual(roster(after),['P1','P2','P3','P4','P5']);
 assert.deepEqual(after.roster[4],personal,'back with the same moves and carry');
 assert.deepEqual(after.lost,[{id:'P6',species:'zubat',expedition:1}]);
 assert.deepEqual(after.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P7',false,3]]);
});
test('R9 L = 1: paying at the base avoids the loss; not paying loses it after the next effective run',()=>{
 const p=profile4({account:60,rescue:[entry(zubat('P5'),false,1)],next:6});
 const saved=payRescue(p,'P5').profile;
 const a=settleRun(saved,finished(saved,{goal:true}));assert.deepEqual(roster(a).includes('P5'),true);assert.deepEqual(a.lost,[]);
 const b=settleRun(p,finished(p,{goal:true}));assert.deepEqual(roster(b).includes('P5'),false);assert.equal(b.lost.length,1);
 // an ineffective run does not take it away
 const c=settleRun(p,finished(p));assert.deepEqual(c.rescue.map(r=>r.left),[1]);assert.deepEqual(c.lost,[]);
});
test('R10 a wipe does not change the pool entries already there; new missing partners enter with L = 4 and are not counted in the same run',()=>{
 const p=profile4({rescue:[entry(zubat('P5'),false,3),entry(pidgey('P6'),true,1)],next:7});
 // wipe with no effective reason: both entries exactly as before
 const same=settleRun(p,finished(p,{outcome:'wipe',rng:5}));assert.deepEqual(same.rescue,p.rescue);
 // wipe with G done and C going missing (state 7): the old entries advance by one (the paid one returns), P3 enters at 4
 const after=settleRun(p,finished(p,{outcome:'wipe',goal:true,rng:7}));
 assert.deepEqual(after.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P5',false,2],['P3',false,4]]);
 assert.deepEqual(roster(after),['P1','P2','P4','P6']);
});
test('R11 several partners go missing and are handled one by one',()=>{
 const p=profile4({team:['P1','P3','P4']});
 const after=settleRun(p,finished(p,{outcome:'wipe',rng:7}));
 assert.deepEqual(after.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P3',false,4],['P4',false,4]]);
 assert.deepEqual(roster(after),['P1','P2']);
});

/* ---------- squad after settlement ---------- */
test('R12 leader missing: the first remaining squad member takes over; an empty squad is refilled with the protected founders led by origin',()=>{
 const p=profile4({team:['P3','P1','P2'],leader:'P3'});
 const a=settleRun(p,finished(p,{outcome:'wipe',rng:7}));
 assert.deepEqual(a.team,['P1','P2']);assert.equal(a.leader,'P1');
 const q=profile4({team:['P3','P4'],leader:'P4'});
 const b=settleRun(q,finished(q,{outcome:'wipe',rng:7}));
 assert.deepEqual(b.team,['P1','P2']);assert.equal(b.leader,'P1');assert.equal(b.origin,'P1');
 assert.equal(profileProblem(b),null);
 // old profile: refill with all three, led by P3
 const old=initialProfile();old.roster.push(pidgey('P4'));old.next=5;old.team=['P4'];old.leader='P4';
 const lost=finished(old,{outcome:'wipe',rng:7});assert.deepEqual(lost.end.lost,['A']);
 const c=settleRun(old,lost);assert.deepEqual(c.team,['P1','P2','P3']);assert.equal(c.leader,'P3');
});

/* ---------- purse ---------- */
test('R13 purse: returned after a normal exit, lost in a wipe; refused when the account cannot cover it',async()=>{
 const p=profile4({account:150});
 assert.equal(purseProblem(p,160),'账户余额只有150，不能往钱袋里装160');assert.equal(purseProblem(p,150)?.includes('20'),true);assert.equal(purseProblem(p,140),null);
 assert.notEqual(purseProblem(p,-20),null);assert.equal(purseProblem(profile4({account:500}),220),'钱袋最多装200');
 const normal=finished(p,{purse:100,goal:true});assert.equal(normal.end.refund,100);
 assert.equal(settleRun(p,normal).account,150+100+100);
 const wipe=finished(p,{purse:100,goal:true,outcome:'wipe',rng:5});assert.equal(wipe.end.refund,0);assert.equal(wipe.end.purse,100);
 assert.equal(settleRun(p,wipe).account,150+100);
 const port=memory(),store=new TrialStore(port);await store.beginNewGame(p,false);
 const raw=port.getItem(store.key);assert.equal(await store.depart('d1',5,160),false);assert.equal(port.getItem(store.key),raw);assert.equal(await store.depart('d1',5,30),false);
 assert.equal(await store.depart('d1',5,100),true);
 assert.equal(store.profile.account,50);assert.equal(store.state.purse,100);
 assert.equal(new TrialStore(port).profile.account,150,'the camp record keeps the pre-departure account');
});

/* ---------- shop ---------- */
function shopRun(){
 const p=profile4();const s=createExpedition('shop-run',2,2,squadOf(p),100);
 s.units.A.pos={...s.points.find(p=>p.kind==='shop').pos};return s;
}
const buy=(s,item)=>applyCommand(s,{type:'buy',item});
test('R14 shop: stock and prices stay fixed; purchases use the purse and remain in the live World',async()=>{
 const s=shopRun();assert.deepEqual(s.shop,{level:1,stock:{berry:2,tonic:1,tm:'whirlwind'},trades:[]});
 assert.equal(serviceRoll(2,2).shop.level,1);
 let r=buy(s,'berry');assert.equal(r.ok,true);
 assert.equal(r.state.purse,80);assert.equal(r.state.prog.items.berry,1);assert.equal(r.state.shop.stock.berry,1);assert.equal(r.state.round,0);
 assert.deepEqual(r.state.shop.trades,[{item:'berry',price:20}]);
 r=buy(r.state,'tonic');assert.equal(r.state.purse,50);assert.equal(r.state.prog.items.tonic,1);
 assert.equal(buy(r.state,'tonic').ok,false);assert.match(buy(r.state,'tonic').error,/售罄/);
 const t=buy(r.state,'tm');assert.equal(t.ok,false,'80 needed, 50 in the purse');assert.equal(t.error,'钱袋不足：需要80，还差30；没有购买');
 const rich=shopRun();rich.purse=200;
 const bought=buy(rich,'tm').state;assert.equal(bought.purse,120);assert.deepEqual(bought.tms,[{move:'whirlwind',source:'shop',fate:'held'}]);assert.equal(bought.shop.stock.tm,null);
 assert.equal(buy(bought,'tm').ok,false);
 const port=memory(),live=new TrialStore(port);assert.equal(await live.start(s),true);
 const writes=port.writes();assert.equal((await live.dispatch({type:'buy',item:'berry'})).ok,true);assert.equal(port.writes(),writes);
 assert.deepEqual(live.state.shop,{level:1,stock:{berry:1,tonic:1,tm:'whirlwind'},trades:[{item:'berry',price:20}]});assert.equal(live.state.purse,80);
 assert.equal((await live.dispatch({type:'buy',item:'tonic'})).ok,true);assert.equal(port.writes(),writes);
 assert.equal((await live.dispatch({type:'buy',item:'tonic'})).ok,false);assert.equal(port.writes(),writes,'a refusal writes nothing');
 assert.equal(new TrialStore(port).status,'empty');
});
test('R15 shop: only on the shop cell, never as an interact, and no shop in a run without one',()=>{
 const s=shopRun();s.units.A.pos={x:10,y:11};
 assert.match(buy(s,'berry').error,/商店格/);
 const on=shopRun();const r=applyCommand(on,{type:'round',action:{type:'interact',exit:false}});assert.equal(r.ok,false);
 const none=createExpedition('none',5,2,squadOf(profile4()),100);assert.equal(none.shop,undefined);assert.match(buy(none,'berry').error,/没有商店/);
 const old=createExpedition('old',2,2);assert.equal(old.shop,undefined);assert.equal(old.dungeon.services,undefined,'a run without a base never gets services');
});

/* ---------- exchanger ---------- */
function exchangeRun(){
 const p=profile4();const s=createExpedition('ex-run',103,2,squadOf(p),0);
 s.units.A.pos={...s.points.find(p=>p.kind==='exchange').pos};
 s.tms=[{move:'protect',source:'target',fate:'held'},{move:'roar',source:'shop',fate:'held'},{move:'whirlwind',source:'target',fate:'held'}];s.bag=2;
 s.shop.trades=[{item:'tm',price:80}];s.shop.stock.tm=null;
 return s;
}
const ex=(target,cargo)=>({type:'round',action:{type:'exchange',target,cargo}});
test('R16 exchanger: one use; the leader cannot be sent; the companion leaves for good; cargo is limited to two held machines',()=>{
 const s=exchangeRun();
 for(const id of s.enemies)s.units[id].waitOnly=true; // generated floor-2 enemies could reach A on this seed and hurt it; this test is about the exchanger not healing
  assert.match(applyCommand(s,ex('A',[])).error,/主控以外/);
 assert.match(applyCommand(s,ex('C',[0,1,2])).error,/最多运送2份/);
 assert.match(applyCommand(s,ex('C',[0,0])).error,/最多运送2份不同/);
 assert.match(applyCommand(s,ex('C',[5])).error,/仍持有/);
 assert.match(applyCommand(s,ex('Z',[])).error,/主控以外/);
 const down=exchangeRun();down.units.C.hp=0;down.units.C.pos=null;assert.match(applyCommand(down,ex('C',[])).error,/仍存活/);
 const away=exchangeRun();away.units.A.pos={x:10,y:11};assert.match(applyCommand(away,ex('C',[])).error,/交换机格/);
 const r=applyCommand(s,ex('C',[0,2]));assert.equal(r.ok,true,r.error);
 const t=r.state;
 assert.deepEqual(t.queue,['A','B']);assert.deepEqual(t.exchange,{level:1,used:true,sent:'C'});
 assert.deepEqual(t.tms.map(m=>m.fate),['sent','held','sent']);assert.equal(t.round,1,'it takes the leader\'s action');
 assert.equal(t.units.B.hp>0,true);assert.equal(t.units.A.hp,s.units.A.hp,'the exchanger does not heal');
 assert.match(applyCommand(t,ex('B',[])).error,/只能用一次/);
});
test('R17 a companion sent home is never lost; a sent machine survives a wipe; a normal exit stores each machine once',()=>{
 const wiped=applyCommand(exchangeRun(),ex('C',[0])).state;
 for(const id of wiped.queue){wiped.units[id].hp=0;wiped.units[id].pos=null;}
 wiped.phase='ended';wiped.end=closeOut(wiped,'wipe');
 assert.deepEqual(wiped.end.tms.map(m=>m.fate),['sent','lost','lost']);assert.equal(wiped.end.effective,true);assert.deepEqual(wiped.end.reasons,['tm']);
 const p=profile4({team:['P1','P2','P3'],leader:'P1'});
 const after=settleRun(p,wiped);assert.deepEqual(after.vault,{protect:1});assert.deepEqual(roster(after),['P1','P2','P3','P4']);
 // normal exit: sent protect + brought roar + brought whirlwind -> one each
 const s=applyCommand(exchangeRun(),ex('C',[0])).state;
 s.phase='ended';s.end=closeOut(s,'normal');
 assert.deepEqual(s.end.tms.map(m=>m.fate),['sent','brought','brought']);
 assert.deepEqual(settleRun(p,s).vault,{protect:1,roar:1,whirlwind:1});
 assert.deepEqual(roster(settleRun(p,s)),['P1','P2','P3','P4'],'the one sent home returns as a roster member');
});
test('R18 the empty seat can only be filled by an invitation in the run',()=>{
 const s=applyCommand(exchangeRun(),ex('C',[])).state;
 assert.equal(s.queue.length,2);
 assert.equal(applyCommand(s,{type:'invite',choice:'accept'}).ok,false,'nothing to answer outside an invitation');
 const inv=structuredClone(s);inv.units.N1=recruitUnit('N1','zubat',1);inv.units.N1.pos=null;
 inv.phase='invitation';inv.anchor={...inv.units.A.pos};inv.invitations=[{id:'ex-run:invite:1',unit:inv.units.N1,status:'pending'}];delete inv.units.N1;reveal(inv);
 assert.equal(previewInvitation(inv).ok,true);
 const joined=applyCommand(inv,{type:'invite',choice:'accept'});assert.equal(joined.ok,true,joined.error);assert.deepEqual(joined.state.queue,['A','B','N1']);
});
test('R19 the exchanger state stays in memory and cannot be used twice or carried twice',async()=>{
 const s=applyCommand(exchangeRun(),ex('C',[0,1])).state;
 const port=memory(),store=new TrialStore(port);assert.equal(await store.start(s),true);
 assert.deepEqual(store.state.exchange,{level:1,used:true,sent:'C'});assert.deepEqual(store.state.tms.map(m=>m.fate),['sent','sent','held']);
 const r=await store.dispatch(ex('B',[2]));assert.equal(r.ok,false);assert.equal(port.writes(),0);
 assert.equal(new TrialStore(port).state,null);
});

/* ---------- migration ---------- */
const stripped=p=>{const q=structuredClone(p);delete q.account;delete q.rescue;delete q.lost;delete q.origin;for(const i of q.roster)delete i.protected;return q;};
test('R20 old profiles are read by content: a starter P3 means the old flow; otherwise only P1 and P2 are protected',()=>{
 const old=migrateProfile(stripped(initialProfile()));
 assert.deepEqual(old.roster.map(i=>[i.id,i.protected]),[['P1',true],['P2',true],['P3',true]]);assert.equal(old.origin,'P3');assert.equal(old.account,0);assert.deepEqual(old.rescue,[]);assert.deepEqual(old.lost,[]);
 assert.equal(profileProblem(old),null);
 const fresh=newGameProfile('chikorita','cyndaquil').profile;
 const nf=migrateProfile(stripped(fresh));assert.deepEqual(nf.roster.map(i=>[i.id,i.protected]),[['P1',true],['P2',true]]);assert.equal(nf.origin,'P1');
 const recruit=stripped(fresh);recruit.roster.push(pidgey('P3'));delete recruit.roster[2].protected;recruit.next=4;
 const rm=migrateProfile(recruit);assert.deepEqual(rm.roster.map(i=>[i.id,i.protected]),[['P1',true],['P2',true],['P3',false]]);assert.equal(rm.origin,'P1');
 // a profile that already has the new fields is left alone
 assert.deepEqual(migrateProfile(fresh),fresh);
 // old profile migration uses the explicit legacy reader
 const raw=JSON.stringify(legacyRecord('base-before72'));
 assert.equal(decodeLegacy(raw).profile.origin,'P3');
});
test('R21 an old mid-run record is discarded while its valid camp remains',async()=>{
 const raw=JSON.stringify(legacyRecord('run-before72'));
 const port=memory();port.setItem('dungeon-trial.player.v1',raw);
 const beforeWrites=port.writes();
 const store=new TrialStore(port);assert.equal(await store.whenReady,true,store.error);
 assert.equal(store.status,'ready',store.error);assert.equal(store.state,null);
 assert.equal(store.envelope.format,2);assert.equal(store.envelope.profile.expeditions,0);
 assert.equal(port.writes(),beforeWrites+1);assert.deepEqual(new TrialStore(port).profile.vault,{});
});
test('R22 an old ended run is validated and settled once during migration',async()=>{
 const raw=JSON.stringify(legacyRecord('ended-before72'));
 const old=decodeLegacy(raw),expected=settleRun(old.profile,old.current),port=memory();port.setItem('dungeon-trial.player.v1',raw);const beforeWrites=port.writes(),store=new TrialStore(port);
 assert.equal(await store.whenReady,true,store.error);assert.equal(store.status,'ready');assert.equal(store.state,null);
 assert.deepEqual(store.profile,expected);assert.equal(store.profile.expeditions,old.profile.expeditions+1);
 assert.equal(store.profile.account,100);assert.equal(port.writes(),beforeWrites+1);assert.equal(Object.hasOwn(store.envelope,'current'),false);
 assert.equal(new TrialStore(port).profile.expeditions,old.profile.expeditions+1);
});
test('R23 a run from before the base existed: A, B and C are protected and never go missing',()=>{
 const w=createExpedition('legacy',3);w.prog.rng=7;
 for(const id of w.queue){w.units[id].hp=0;w.units[id].pos=null;}
 w.phase='ended';w.end=closeOut(w,'wipe');
 assert.deepEqual(w.end.lost,[]);assert.equal(w.prog.rng,7);
 const after=settleRun(null,w);assert.deepEqual(after.roster.map(i=>i.species),['charmander','squirtle','bulbasaur']);assert.deepEqual(after.rescue,[]);
 // a recruit of that run is not protected
 const v=createExpedition('legacy2',3);v.prog.rng=7;v.units.N1=recruitUnit('N1','zubat',1);v.units.N1.pos=null;v.camp.push('N1');
 const q=structuredClone(v);for(const id of q.queue){q.units[id].hp=0;q.units[id].pos=null;}q.phase='ended';q.end=closeOut(q,'wipe');
 assert.deepEqual(q.end.lost,[],'camp members are safe');
});

/* ---------- terminal migration and camp-only records ---------- */
test('R24 an old ended World settles the purse, rescue pool, squad and machines once',async()=>{
 const frozen=JSON.parse(readFileSync(new URL('./fixtures78/legacy-worlds.json',import.meta.url),'utf8'));
 const p=structuredClone(frozen.profile);p.account=20;p.rescue=[entry(zubat('P4'),true,1),entry(pidgey('P5'),false,1)];p.next=6;
 // The frozen founders are all protected, which would hide the wipe draw. P2 (squirtle, unit B; the origin P3 must stay protected) is made an ordinary partner so the old terminal world can lose it:
 // with state 7 the first draw is 0.012 (< 0.5), the same hand-worked value R5 and R10 rely on, and only unprotected members draw.
 p.roster.find(i=>i.id==='P2').protected=false;
 const s=structuredClone(frozen.floor3);s.prog.exp=2;s.prog.rng=7;delete s.units.B.protected;s.goal=true;s.purse=40;s.tms=[{move:'roar',source:'shop',fate:'held'}];s.bag=0;
 for(const id of s.queue){s.units[id].hp=0;s.units[id].pos=null;}
 s.phase='ended';s.request=null;s.anchor=null;s.end=closeOut(s,'wipe');
 const raw=JSON.stringify({format:1,rules:'trial-rules-2',content:'trial-content-2',build:BUILD_ID,sequence:9,current:s,recent:null,profile:p});
 const expected=settleRun(p,s),port=memory();port.setItem('dungeon-trial.player.v1',raw);const beforeWrites=port.writes(),live=new TrialStore(port);
 assert.equal(await live.whenReady,true,live.error);assert.equal(live.status,'ready',live.error);assert.equal(port.writes(),beforeWrites+1);
 const q=live.profile;
 // The frozen rules-2 World has a terminal goal and wipe: reward is paid, purse and held machine are lost, the paid rescue returns, the unpaid one is lost,
 // and unprotected P2 goes missing (L = 4) and leaves the squad; leader P3 stays.
 assert.deepEqual(s.end.lost,['B'],'the wipe draw loses the unprotected B');
 assert.equal(q.account,120);assert.deepEqual(roster(q),['P1','P3','P4']);
 assert.deepEqual(q.lost,[{id:'P5',species:'pidgey',expedition:1}]);assert.deepEqual(q.rescue.map(r=>[r.inst.id,r.paid,r.left]),[['P2',false,4]]);
 assert.deepEqual(q.vault,{});assert.deepEqual(q.team,['P1','P3']);assert.equal(q.leader,'P3');
 const summary=settleSummary(p,s);assert.deepEqual(summary.returned,[{id:'P4',species:'zubat'}]);assert.deepEqual(summary.gone,[{id:'P5',species:'pidgey'}]);assert.deepEqual(summary.missing,[{id:'P2',species:'squirtle'}]);
 assert.deepEqual(q,expected);assert.equal(Object.hasOwn(live.envelope,'current'),false);
 assert.deepEqual(new TrialStore(port).profile,q,'reopening cannot settle the result twice');
});
function record(profile){return {format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:3,profile};}
test('R25 the current save round-trips camp-only state and refuses invalid camp data',async()=>{
 const rich=profile4({account:80,rescue:[entry(zubat('P5'),false,2)],lost:[{id:'P6',species:'pidgey',expedition:2}],next:7});
 const valid=record(rich);assert.deepEqual(decode(JSON.stringify(valid)),valid);
 const tampered=[
  ['negative account',r=>{r.profile.account=-1;}],
  ['fractional account',r=>{r.profile.account=1.5;}],
  ['pool entry with zero left',r=>{r.profile.rescue[0].left=0;}],
  ['paid entry waiting two',r=>{r.profile.rescue[0].paid=true;r.profile.rescue[0].left=2;}],
  ['unpaid entry waiting five',r=>{r.profile.rescue[0].left=5;}],
  ['pool instance marked protected',r=>{r.profile.rescue[0].inst.protected=true;}],
  ['lost record repeats a roster id',r=>{r.profile.lost[0].id='P1';}],
  ['id counter behind the pool',r=>{r.profile.next=6;}],
  ['origin not protected',r=>{r.profile.origin='P3';}],
  ['origin missing',r=>{r.profile.origin='P9';}],
  ['instance without the mark',r=>{delete r.profile.roster[0].protected;}],
 ];
 for(const [name,edit] of tampered){const candidate=structuredClone(valid);edit(candidate);assert.throws(()=>decode(JSON.stringify(candidate)),/损坏|不兼容/,name);}
 const shop=shopRun(),port=memory(),store=new TrialStore(port);assert.equal(await store.start(shop),true);
 assert.equal((await store.dispatch({type:'buy',item:'tm'})).ok,true);assert.equal(port.writes(),0);
 assert.equal(store.exportRecord(),null);assert.equal(new TrialStore(port).status,'empty');
});

test('R26 an old, already settled recent run is history: no wipe draw is run on it, whatever the saved random state',()=>{
 for(const rng of [1,7,123]){
  const legacy=legacyRecord('recent-before72');legacy.recent.prog.rng=rng;
  const raw=JSON.stringify(legacy);
  const e=decodeLegacy(raw);
  assert.deepEqual(e.recent.end.lost,[],`state ${rng}`);assert.equal(e.recent.prog.rng,rng,'the random state is untouched');
  assert.deepEqual(e.recent.end.reasons,[]);assert.equal(e.recent.end.effective,false);
 }
});
