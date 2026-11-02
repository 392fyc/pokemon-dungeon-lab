import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,estimateAttackDamage,PROG,rngStep,createExpedition} from '../../src/core/engine.ts';
import {generateFloor,BOSS} from '../../src/core/dungeon.ts';
import {friend,enemy,world,row,pos} from '../acceptance/fixtures.mjs';

const kinds=['hunter','collector','scout','guardian','speedrun'];
const blessings=['berryBoost','floorHeal','battleSpirit','lullaby','rally','tmChoice'];
const midpoint={1:5.5,2:9.5,3:16};
const commissionXp={hunter:{1:33,2:57,3:96},collector:{1:11,2:19,3:32},scout:{1:33,2:57},guardian:{1:22,2:38},speedrun:{1:33,2:57}};
const interact=exit=>({type:'interact',exit});
const move=x=>({type:'move',to:pos(x)});
const wait={type:'wait'};
const basic=target=>({type:'basic',target});
const apply=(s,cmd)=>{
  const before=structuredClone(s),r=applyCommand(s,cmd);
  assert.deepEqual(s,before,'applyCommand must not mutate its input');
  assert.equal(r.ok,true,r.error);return r.state;
};
const reject=(s,cmd)=>{
  const before=structuredClone(s),r=applyCommand(s,cmd);
  assert.equal(r.ok,false);assert.deepEqual(s,before);assert.deepEqual(r.state,before);return r;
};
const act=(s,action)=>apply(s,{type:'round',action});
const chooseCommission=(s,choice='accept')=>apply(s,{type:'commissionChoice',choice});
const chooseBlessing=(s,blessing)=>apply(s,{type:'blessingChoice',blessing});
const pending=(s,type)=>s.pendingChoices?.find(c=>c.type===type);
const roomAt=(s,index)=>s.adventureRooms.find(r=>r.room===index);
const commissionXpFor=(id,level)=>commissionXp[id]?.[level]??Math.round(({hunter:3,collector:1,scout:3,guardian:2,speedrun:3}[id])*2*midpoint[level]);

/** A small, explicit walkable floor. Tests change a unit's position only to set up a command. */
function fixture({seed=1,level=1,roomTypes=['commission'],downX=12,partySize=1,targets=[]}={}){
  const maxX=Math.max(downX,...roomTypes.map((_,i)=>i*4+2));
  const floor=row(maxX),rooms=roomTypes.map((_,i)=>({x:i*4,y:0,w:3,h:3}));
  const units={
    A:friend('A',1,1,100,{tackle:20},100),
    B:friend('B',3,1,100,{tackle:20},100),
    C:friend('C',5,1,100,{tackle:20},100)
  };
  for(const u of Object.values(units)){u.tactic='wait';u.species='mudkip';u.entrySpecies='mudkip';u.level=5;}
  const enemies=[];
  const s=world(units,{floor,leader:'A',queue:partySize===1?['A']:['A','B','C'],enemies,points:level<3?[{pos:pos(downX),kind:'down',used:false}]:[]});
  s.dungeon={seed:seed>>>0,width:36,height:24,floors:3,level,stored:{},boss:true,roguelike:true,tmPool:3};
  s.difficulty='normal';s.rooms=rooms;
  s.adventureRooms=roomTypes.map((type,i)=>({room:i,type,state:'idle',interaction:pos(i*4+1),doors:[],sealedCells:[],enemyIds:[],reward:null,rewardCurrency:null,item:null,rewardItem:null,rewardMove:null}));
  for(const target of targets){
    const u=units[target.id]??enemy(target.id,target.x,target.y,target.hp??1,'melee',{waitOnly:true});
    u.pos=pos(target.x,target.y);u.hp=target.hp??1;u.maxHp=target.hp??1;u.waitOnly=true;
    s.units[target.id]=u;if(!s.enemies.includes(target.id))s.enemies.push(target.id);
  }
  s.prog={level:5,exp:0,rng:seed>>>0,made:0,kills:[],items:{berry:0,tonic:0,bigBerry:0,teamTonic:0}};
  s.purse=37;s.tms=[];s.enemyAiRng=1;
  return s;
}
function startRoom(s,index=0){
  s.units.A.pos=structuredClone(roomAt(s,index).interaction);
  return act(s,interact(false));
}
function findCommission(id,{seed,level=1,roomTypes=['commission'],visitedTarget=false,partySize=1,downX=12}={}){
  assert.ok(Number.isInteger(seed),'each commission test names one fixed seed');
  let s=fixture({seed,level,roomTypes,partySize,downX});
  if(visitedTarget){s=moveLeaderTo(s,roomAt(s,1).interaction.x);s=moveLeaderTo(s,roomAt(s,0).interaction.x);}
  s=startRoom(s);
  assert.equal(s.phase,'commission',`fixed seed ${seed} opens a commission choice`);
  assert.equal(pending(s,'commission')?.commission,id,`fixed seed ${seed} offers ${id}`);
  return {seed,state:s};
}
function findBlessing(id,{seed,level=1,owned=[]}={}){
  assert.ok(Number.isInteger(seed),'each blessing test names one fixed seed');
  const s=fixture({seed,level,roomTypes:['blessing']});s.blessings=[...owned];
  const offered=startRoom(s);
  assert.equal(offered.phase,'blessing',`fixed seed ${seed} opens a blessing choice`);
  assert.ok(pending(offered,'blessing')?.options.includes(id),`fixed seed ${seed} offers ${id}`);
  return {seed,state:offered};
}
function findGuardianWithBlessing(id,{seed}={}){
  assert.ok(Number.isInteger(seed),'each combined offer test names one fixed seed');
  let s=startRoom(fixture({seed,roomTypes:['commission','blessing'],partySize:3}));
  assert.equal(pending(s,'commission')?.commission,'guardian',`fixed seed ${seed} offers guardian first`);
  s=chooseCommission(s);s.units.A.pos=structuredClone(roomAt(s,1).interaction);s=act(s,interact(false));
  assert.equal(s.phase,'blessing',`fixed seed ${seed} opens the following blessing choice`);
  assert.ok(pending(s,'blessing')?.options.includes(id),`fixed seed ${seed} offers ${id}`);
  return {seed,state:s};
}
function findCommissionPair(first,second,{seed,level=1,partySize=1,prepare=s=>s}={}){
  assert.ok(Number.isInteger(seed),'each repeated commission test names one fixed seed');
  let s=startRoom(fixture({seed,level,roomTypes:['commission','commission'],partySize}));
  assert.equal(pending(s,'commission')?.commission,first,`fixed seed ${seed} offers first ${first}`);
  s=chooseCommission(s);s=prepare(s);
  s.units.A.pos=structuredClone(roomAt(s,1).interaction);s=act(s,interact(false));
  assert.equal(s.phase,'commission',`fixed seed ${seed} opens the second commission choice`);
  assert.equal(pending(s,'commission')?.commission,second,`fixed seed ${seed} offers second ${second}`);
  return {seed,state:s};
}
function acceptOffer(id,options={}){
  const found=findCommission(id,options);
  return {...found,state:chooseCommission(found.state)};
}
function getBlessing(id,options={}){
  const found=findBlessing(id,options);
  return {...found,state:chooseBlessing(found.state,id)};
}
function setNoInviteDraws(s,count){
  const fixed={1:1,3:10,4:10}[count];
  assert.notEqual(fixed,undefined,`a fixed no-invitation stream is declared for ${count} draws`);
  s.prog.rng=fixed;
}
function shortestDistance(floor,from,to){
  const key=p=>`${p.x},${p.y}`,walkable=new Set(floor.map(key)),queue=[from],distances=new Map([[key(from),0]]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i],distance=distances.get(key(p));if(key(p)===key(to))return distance;
    for(const d of [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}]){
      const next={x:p.x+d.x,y:p.y+d.y},k=key(next);if(walkable.has(k)&&!distances.has(k)){distances.set(k,distance+1);queue.push(next);}
    }
  }
  return null;
}
function moveLeaderTo(s,x){while(s.units.A.pos.x!==x){const step=s.units.A.pos.x+(x>s.units.A.pos.x?1:-1);s=act(s,move(step));}return s;}
function descend(s){
  const stairs=s.points.find(p=>p.kind==='down');assert.ok(stairs,'fixture has a downstairs point');
  s.units.A.pos=structuredClone(stairs.pos);
  s=act(s,interact(true));assert.equal(s.phase,'transit');
  return apply(s,{type:'finishTransit'});
}
function addEnemy(s,id='E',x=2,y=1,hp=1){
  const e=enemy(id,x,y,hp,'melee',{waitOnly:true});e.hp=hp;e.maxHp=hp;e.level=5;e.species='geodude';
  s.units[id]=e;if(!s.enemies.includes(id))s.enemies.push(id);return e;
}
function killOne(s,id){
  const e=s.units[id];e.pos=pos(s.units.A.pos.x+1,s.units.A.pos.y);e.hp=1;e.maxHp=1;e.waitOnly=true;
  s=act(s,basic(id));
  if(s.phase==='invitation')s=apply(s,{type:'invite',choice:'reject'});
  return s;
}

test('C1/C4: commission room choice respects the three-active limit and floor availability',()=>{
  let s=fixture({roomTypes:['commission','commission','commission','commission'],downX:20});
  for(let i=0;i<3;i++){
    s.units.A.pos=structuredClone(roomAt(s,i).interaction);s=act(s,interact(false));
    assert.equal(s.phase,'commission');assert.ok(pending(s,'commission'));
    const round=s.round;s=chooseCommission(s);assert.equal(s.commissions.length,i+1);assert.equal(s.round,round);
    assert.equal(roomAt(s,i).state,'done');
  }
  s.units.A.pos=structuredClone(roomAt(s,3).interaction);const round=s.round;
  const fourth=reject(s,{type:'round',action:interact(false)});
  assert.match(fourth.error,/同时只能接下3条委托/);assert.equal(fourth.state.round,round);
  assert.equal(roomAt(fourth.state,3).state,'idle');assert.equal(fourth.state.commissions.length,3);
  let refused=startRoom(fixture({seed:47,roomTypes:['commission']}));const refusedRound=refused.round;
  refused=chooseCommission(refused,'reject');assert.equal(roomAt(refused,0).state,'done');assert.equal(refused.commissions?.length??0,0);
  assert.equal(refused.round,refusedRound);

  for(const level of [1,2]){
    const withNoTarget=fixture({level,roomTypes:['commission']});
    const shown=startRoom(withNoTarget);assert.notEqual(pending(shown,'commission')?.commission,'scout');
  }
  const floor3=fixture({level:3,roomTypes:['commission']});
  const floor3Choice=pending(startRoom(floor3),'commission')?.commission;
  assert.ok(['hunter','collector'].includes(floor3Choice),`floor 3 offered ${floor3Choice}`);
  const scout=findCommission('scout',{seed:3,level:1,roomTypes:['commission','blessing']});
  assert.equal(pending(scout.state,'commission').commission,'scout');
});

test('C2/C3: hunter counts three post-acceptance defeats, pays the floor reward, and releases defense reduction',()=>{
  const found=acceptOffer('hunter',{seed:107});let active=found.state;
  assert.equal(active.commissions.length,1);assert.equal(active.commissions[0].progressTarget,3);
  let control=structuredClone(active);control.commissions=[];
  const enemyUnit=addEnemy(active,'probe',2,1,20);addEnemy(control,'probe',2,1,20);
  const withPenalty=estimateAttackDamage(active,'probe','A','tackle');
  const withoutPenalty=estimateAttackDamage(control,'probe','A','tackle');
  assert.equal(withPenalty,withoutPenalty+1,'hunter lowers the whole party defense by one stage');
  setNoInviteDraws(active,3);setNoInviteDraws(control,3);
  for(let i=0;i<3;i++){
    const id=`H${i}`;addEnemy(active,id,2,1,1);addEnemy(control,id,2,1,1);
    active=killOne(active,id);control=killOne(control,id);
  }
  assert.equal(active.commissions.length,0);assert.equal(active.prog.exp-control.prog.exp,commissionXp.hunter[1]);
  assert.equal(active.prog.exp-control.prog.exp,33);
  assert.equal(estimateAttackDamage(active,'probe','A','tackle'),withoutPenalty,'the penalty ends as soon as the commission completes');
  assert.equal(enemyUnit.hp,20);
});

test('main176: repeated hunters progress independently and share one defense reduction until the last one finishes',()=>{
  const found=findCommissionPair('hunter','hunter',{seed:1332,prepare:s=>{
    setNoInviteDraws(s,4);addEnemy(s,'before-second',2,1,1);return killOne(s,'before-second');
  }});
  let s=chooseCommission(found.state);
  assert.equal(s.commissions.length,2);assert.ok(s.commissions[0].acceptedRound<s.commissions[1].acceptedRound);
  assert.deepEqual(s.commissions.map(c=>c.progress),[1,0]);
  let control=structuredClone(s);control.commissions=[];
  const probe=enemy('damage-probe',20,1,20,'melee',{waitOnly:true});s.units[probe.id]=structuredClone(probe);control.units[probe.id]=structuredClone(probe);
  const baseline=estimateAttackDamage(control,'damage-probe','A','tackle');
  assert.equal(estimateAttackDamage(s,'damage-probe','A','tackle'),baseline+1,'two identical penalties still lower defense by one stage');
  for(const id of ['second-kill','third-kill']){
    addEnemy(s,id,2,1,1);addEnemy(control,id,2,1,1);s=killOne(s,id);control=killOne(control,id);
  }
  assert.equal(s.commissions.length,1);assert.equal(s.commissions[0].progress,2);
  assert.equal(s.prog.exp-control.prog.exp,commissionXp.hunter[1]);
  assert.equal(estimateAttackDamage(s,'damage-probe','A','tackle'),baseline+1,'the remaining hunter keeps the single reduction');
  addEnemy(s,'fourth-kill',2,1,1);addEnemy(control,'fourth-kill',2,1,1);s=killOne(s,'fourth-kill');control=killOne(control,'fourth-kill');
  assert.equal(s.commissions?.length??0,0);assert.equal(s.prog.exp-control.prog.exp,2*commissionXp.hunter[1]);
  assert.equal(estimateAttackDamage(s,'damage-probe','A','tackle'),baseline,'the penalty ends when the last hunter finishes');
});

test('C2: collector counts a picked item once, ignores a shop purchase, and awards 11 XP on floor 1',()=>{
  const found=acceptOffer('collector',{seed:211});let s=found.state;
  assert.equal(s.commissions[0].progressTarget,1);
  s.points=[{pos:structuredClone(s.units.A.pos),kind:'shop',used:false}];
  s.shop={level:1,stock:{berry:1,tonic:0,tm:'protect'},trades:[]};s.purse=60;
  s=apply(s,{type:'buy',item:'berry'});assert.equal(s.prog.items.berry,1);assert.equal(s.commissions[0].progress,0);
  s.units.A.pos=pos(3);s.points=[{pos:pos(3),kind:'berry',used:false}];
  s=act(s,interact(false));assert.equal(s.prog.items.berry,2);
  assert.equal(s.commissions.length,0);assert.equal(s.prog.exp,commissionXp.collector[1]);assert.equal(s.prog.exp,11);
});

test('C2/C3/C9/C15: uncompleted hunter and collector both fail at the same-floor downstairs request without a payout or leftover penalty',()=>{
  const both=findCommissionPair('hunter','collector',{seed:4,partySize:3});let s=chooseCommission(both.state);
  assert.equal(s.commissions.length,2);assert.deepEqual(s.commissions.map(c=>c.id),['hunter','collector']);
  s.prog.items={berry:2,tonic:1,bigBerry:1,teamTonic:1};s.purse=123;
  s.tms=[{move:'protect',source:'shop',fate:'held'}];
  const probe=enemy('damage-probe',20,1,20,'melee',{waitOnly:true});s.units[probe.id]=probe;
  const noPenalty=structuredClone(s);noPenalty.commissions=[];
  const baseline=estimateAttackDamage(noPenalty,'damage-probe','A','tackle');
  assert.equal(estimateAttackDamage(s,'damage-probe','A','tackle'),baseline+1,'hunter penalty remains active before the request');
  const before={exp:s.prog.exp,purse:s.purse,items:structuredClone(s.prog.items),tms:structuredClone(s.tms),queue:[...s.queue],camp:[...s.camp]};

  s.units.A.pos=structuredClone(s.points.find(p=>p.kind==='down').pos);s=act(s,interact(true));
  assert.equal(s.phase,'transit');assert.equal(s.dungeon.level,1);assert.deepEqual(s.commissions,[]);
  assert.equal(s.prog.exp,before.exp,'neither unfinished mission grants XP');
  assert.equal(s.purse,before.purse);assert.deepEqual(s.prog.items,before.items);assert.deepEqual(s.tms,before.tms);
  assert.deepEqual(s.queue,before.queue);assert.deepEqual(s.camp,before.camp);
  assert.equal(estimateAttackDamage(s,'damage-probe','A','tackle'),baseline,'hunter defense loss ends as soon as the request fails the mission');

  s=apply(s,{type:'finishTransit'});
  assert.equal(s.dungeon.level,2);assert.deepEqual(s.commissions??[],[]);
  assert.equal(s.prog.exp,before.exp);assert.equal(s.purse,before.purse);assert.deepEqual(s.prog.items,before.items);
  assert.deepEqual(s.tms,before.tms);assert.deepEqual(s.queue,before.queue);assert.deepEqual(s.camp,before.camp);
  assert.equal(estimateAttackDamage(s,'damage-probe','A','tackle'),baseline,'the failed hunter has no effect on the next floor');
});

test('C2/C4/C9: scout must enter a different blessing or item room after acceptance and fails at the stairs otherwise',()=>{
  const found=findCommission('scout',{seed:315,roomTypes:['commission','blessing']});let s=chooseCommission(found.state);
  assert.equal(s.commissions[0].progress,0);
  s=moveLeaderTo(s,5);assert.equal(s.commissions[0].progress,1,'entering the target room after accepting scout marks it explored');
  s=descend(s);assert.equal(s.dungeon.level,2);assert.equal(s.commissions.length,0);assert.equal(s.prog.exp,commissionXp.scout[1]);

  const failure=findCommission('scout',{seed:315,roomTypes:['commission','blessing'],visitedTarget:true});
  let failed=chooseCommission(failure.state);assert.equal(failed.commissions[0].progress,0);
  const preserved={exp:failed.prog.exp,purse:failed.purse,queue:[...failed.queue],camp:[...failed.camp],items:structuredClone(failed.prog.items),tms:structuredClone(failed.tms)};
  failed=descend(failed);
  assert.equal(failed.commissions.length,0);assert.equal(failed.prog.exp,preserved.exp);assert.equal(failed.purse,preserved.purse);
  assert.deepEqual(failed.queue,preserved.queue);assert.deepEqual(failed.camp,preserved.camp);assert.deepEqual(failed.prog.items,preserved.items);assert.deepEqual(failed.tms,preserved.tms);
  const noScout=fixture({seed:312,roomTypes:['commission']});assert.notEqual(pending(startRoom(noScout),'commission')?.commission,'scout');
});

test('C2/C9/C15: guardian completes at a valid downstairs request, fails when any member is down, and clears berry penalty',()=>{
  const success=acceptOffer('guardian',{seed:426,partySize:3});let s=success.state;
  assert.equal(s.commissions[0].id,'guardian');s=descend(s);
  assert.equal(s.commissions.length,0);assert.equal(s.prog.exp,commissionXp.guardian[1]);

  let failed=acceptOffer('guardian',{seed:426,partySize:3}).state;
  failed.units.B.hp=0;failed.units.B.pos=null;failed.prog.items.berry=1;failed.units.A.hp=50;
  failed.units.A.pos=pos(12);
  const old={exp:failed.prog.exp,purse:failed.purse,queue:[...failed.queue],camp:[...failed.camp],items:structuredClone(failed.prog.items),tms:structuredClone(failed.tms)};
  failed=act(failed,interact(true));assert.equal(failed.phase,'transit');assert.equal(failed.commissions.length,0);
  assert.equal(failed.prog.exp,old.exp);assert.equal(failed.purse,old.purse);assert.deepEqual(failed.queue,old.queue);
  assert.deepEqual(failed.camp,old.camp);assert.deepEqual(failed.prog.items,old.items);assert.deepEqual(failed.tms,old.tms);
  failed=apply(failed,{type:'finishTransit'});failed=act(failed,{type:'use',item:'berry',target:'A'});
  assert.equal(failed.units.A.hp,58,'ordinary berry healing is restored immediately after failure');

  const both=findCommissionPair('guardian','hunter',{seed:449,partySize:3});let combined=chooseCommission(both.state);
  assert.deepEqual(combined.commissions.map(c=>c.id).sort(),['guardian','hunter']);
  combined=descend(combined);
  assert.equal(combined.commissions.length,0);assert.equal(combined.prog.exp,commissionXp.guardian[1]);
});

test('main176: two active guardian commissions still halve berry recovery once',()=>{
  const found=findCommissionPair('guardian','guardian',{seed:1424,partySize:3});
  let s=chooseCommission(found.state);assert.equal(s.commissions.length,2);
  s.prog.items.berry=1;s.units.A.hp=50;s=act(s,{type:'use',item:'berry',target:'A'});
  assert.equal(s.units.A.hp,54,'two matching penalties do not quarter the normal eight-point heal');
  assert.equal(s.commissions.length,2);
});

test('C14: speedrun records ceil(2.5 × shortest path), keeps its limit, succeeds on the Nth accepted round and fails afterward',()=>{
  const {seed,state:offer}=findCommission('speedrun',{seed:515,downX:4});let s=chooseCommission(offer);
  const active=s.commissions.find(c=>c.id==='speedrun'),room=roomAt(s,0),stairs=s.points.find(p=>p.kind==='down').pos;
  const d=shortestDistance(s.floor,room.interaction,stairs),n=Math.ceil(2.5*d);
  assert.equal(active.speedLimit,n);assert.equal(active.speedLimit,8);
  const acceptedRound=active.acceptedRound;
  s=moveLeaderTo(s,stairs.x);assert.equal(s.commissions.find(c=>c.id==='speedrun').speedLimit,n);
  while(s.round<acceptedRound+n-2)s=act(s,wait);
  s=descend(s);assert.equal(s.round-acceptedRound+1,n,'the stair request lands on the Nth counted round');
  assert.equal(s.commissions.length,0);assert.equal(s.prog.exp,commissionXp.speedrun[1]);

  let late=chooseCommission(findCommission('speedrun',{seed:515,downX:4}).state);
  const lateMission=late.commissions.find(c=>c.id==='speedrun'),start=lateMission.acceptedRound,limit=lateMission.speedLimit;
  for(let i=0;i<limit+1&&late.commissions.some(c=>c.id==='speedrun');i++)late=act(late,wait);
  assert.equal(late.commissions.some(c=>c.id==='speedrun'),false,'speedrun is removed after its deadline');
  assert.equal(late.prog.exp,0);assert.equal(late.round-start+1,limit+1,'the commission fails exactly on round N+1');
});

test('C9/C15: failing guardian or speedrun at the three-active limit releases a slot for a fourth room',()=>{
  const acceptAt=(s,index,id)=>{
    s.units.A.pos=structuredClone(roomAt(s,index).interaction);s=act(s,interact(false));
    assert.equal(s.phase,'commission');assert.equal(pending(s,'commission')?.commission,id,`room ${index} has its fixed offer`);
    return chooseCommission(s);
  };
  let guardian=fixture({seed:2,roomTypes:['commission','commission','commission','commission'],downX:20,partySize:3});
  for(const [i,id] of ['guardian','speedrun','speedrun'].entries())guardian=acceptAt(guardian,i,id);
  assert.equal(guardian.commissions.length,3);
  guardian.units.B.hp=1;guardian.prog.items.berry=1;
  const enemyNearB=enemy('guardian-failure',2,1,50,'melee');guardian.units[enemyNearB.id]=enemyNearB;guardian.enemies=[enemyNearB.id];
  const before={exp:guardian.prog.exp,purse:guardian.purse,items:structuredClone(guardian.prog.items),tms:structuredClone(guardian.tms),queue:[...guardian.queue],camp:[...guardian.camp]};
  guardian=act(guardian,wait);
  assert.equal(guardian.units.B.hp,0,'the adjacent enemy downs B during the real round');
  assert.deepEqual(guardian.commissions.map(c=>c.id),['speedrun','speedrun'],'guardian is removed immediately when a teammate falls');
  assert.equal(guardian.prog.exp,before.exp);assert.equal(guardian.purse,before.purse);assert.deepEqual(guardian.prog.items,before.items);
  assert.deepEqual(guardian.tms,before.tms);assert.deepEqual(guardian.queue,before.queue);assert.deepEqual(guardian.camp,before.camp);
  guardian.enemies=[];guardian.units.A.hp=50;guardian=act(guardian,{type:'use',item:'berry',target:'A'});
  assert.equal(guardian.units.A.hp,58,'the guardian berry penalty is gone on the failure round');
  guardian= startRoom(guardian,3);
  assert.equal(pending(guardian,'commission')?.commission,'collector');
  guardian=chooseCommission(guardian);assert.equal(guardian.commissions.length,3,'the unprocessed fourth room can refill the freed slot');

  let speedrun=fixture({seed:1,roomTypes:['commission','commission','commission','commission'],downX:20,partySize:3});
  for(const [i,id] of ['speedrun','hunter','speedrun'].entries())speedrun=acceptAt(speedrun,i,id);
  assert.equal(speedrun.commissions.length,3);
  const beforeTimeout={exp:speedrun.prog.exp,purse:speedrun.purse,items:structuredClone(speedrun.prog.items),tms:structuredClone(speedrun.tms),queue:[...speedrun.queue],camp:[...speedrun.camp]};
  while(speedrun.commissions.filter(c=>c.id==='speedrun').length===2)speedrun=act(speedrun,wait);
  assert.deepEqual(speedrun.commissions.map(c=>c.id),['speedrun','hunter'],'the nearer deadline fails without removing the other missions');
  assert.equal(speedrun.prog.exp,beforeTimeout.exp);assert.equal(speedrun.purse,beforeTimeout.purse);assert.deepEqual(speedrun.prog.items,beforeTimeout.items);
  assert.deepEqual(speedrun.tms,beforeTimeout.tms);assert.deepEqual(speedrun.queue,beforeTimeout.queue);assert.deepEqual(speedrun.camp,beforeTimeout.camp);
  speedrun=startRoom(speedrun,3);
  assert.equal(pending(speedrun,'commission')?.commission,'speedrun');
  speedrun=chooseCommission(speedrun);assert.equal(speedrun.commissions.length,3,'the expired speedrun no longer occupies a slot');
});

test('C5/C12: blessing choices are unique, omit owned or unavailable effects, and decline without spending a round',()=>{
  const found=findBlessing('berryBoost',{seed:611,owned:['battleSpirit']});let s=found.state;
  const offers=pending(s,'blessing').options;
  assert.equal(offers.length,3);assert.equal(new Set(offers).size,offers.length);assert.ok(!offers.includes('battleSpirit'));
  assert.ok(offers.every(id=>blessings.includes(id)));
  const round=s.round;s=chooseBlessing(s,null);assert.equal(s.round,round);assert.equal(roomAt(s,0).state,'done');assert.deepEqual(s.blessings,['battleSpirit']);

  const floor3=fixture({seed:612,level:3,roomTypes:['blessing']});
  floor3.blessings=['berryBoost','battleSpirit','rally'];
  const available=startRoom(floor3);assert.equal(available.phase,'blessing');
  assert.deepEqual(pending(available,'blessing').options,['tmChoice']);
  const noChoice=fixture({seed:613,roomTypes:['blessing']});noChoice.blessings=[...blessings];
  const before=noChoice.round,refusal=reject(noChoice,{type:'round',action:interact(false)});
  assert.match(refusal.error,/祝福/);assert.equal(refusal.state.round,before);assert.equal(roomAt(refusal.state,0).state,'idle');
});

test('C10: berry boost and guardian penalty apply in order, battle spirit clears on crossing, and floor heal repeats per new floor',()=>{
  let s=getBlessing('berryBoost',{seed:712}).state;s.prog.items.berry=1;s.units.A.hp=50;
  s=act(s,{type:'use',item:'berry',target:'A'});assert.equal(s.units.A.hp,62);

  let guarded=findGuardianWithBlessing('berryBoost',{seed:719}).state;
  assert.equal(guarded.commissions[0].id,'guardian');
  assert.ok(pending(guarded,'blessing').options.includes('berryBoost'));
  guarded=chooseBlessing(guarded,'berryBoost');guarded.prog.items.berry=1;guarded.units.A.hp=50;
  guarded=act(guarded,{type:'use',item:'berry',target:'A'});assert.equal(guarded.units.A.hp,56);
  guarded.prog.items.bigBerry=1;guarded.units.A.hp=50;
  guarded=act(guarded,{type:'use',item:'bigBerry',target:'A'});assert.equal(guarded.units.A.hp,100);

  let battle=getBlessing('battleSpirit',{seed:713}).state;
  assert.deepEqual(battle.queue.map(id=>battle.units[id].stages.atk),[1]);
  battle=descend(battle);assert.deepEqual(battle.queue.map(id=>battle.units[id].stages.atk),[0]);

  let heal=getBlessing('floorHeal',{seed:714}).state;
  heal.queue=['A','B','C'];heal.units.B.pos=pos(2);heal.units.C.pos=pos(3);
  heal.units.A.hp=50;heal.units.B.hp=99;heal.units.C.hp=100;
  const before=[50,99,100];assert.deepEqual(heal.queue.map(id=>heal.units[id].hp),before);
  heal=descend(heal);assert.deepEqual(heal.queue.map(id=>heal.units[id].hp),[53,100,100]);
  heal.enemies=[];heal.units.A.hp=53;heal=act(heal,wait);assert.equal(heal.units.A.hp,53,'the blessing does not heal again during an ordinary round on the same floor');
  heal.units.A.hp=10;heal.units.B.hp=99;heal.units.C.hp=100;
  heal=descend(heal);assert.deepEqual(heal.queue.map(id=>heal.units[id].hp),[13,100,100],'the same blessing heals again on the next floor transition');
});

test('C6/C8: lullaby changes only the next floor sleep threshold; seeded generation remains deterministic',()=>{
  const found=getBlessing('lullaby',{seed:812}),seed=found.seed,params={width:36,height:24,floors:3,boss:true,roguelike:true,difficulty:'normal'};
  const normal=generateFloor(seed,2,params),normalAgain=generateFloor(seed,2,params);
  assert.deepEqual(normalAgain,normal);
  const withLullaby=generateFloor(seed,2,{...params,enemySleepChance:0.5});
  assert.deepEqual(withLullaby.floor,normal.floor);assert.deepEqual(withLullaby.rooms,normal.rooms);
  assert.deepEqual(withLullaby.points,normal.points);assert.deepEqual(withLullaby.pickups,normal.pickups);assert.deepEqual(withLullaby.services,normal.services);
  assert.deepEqual(withLullaby.enemies.map(({asleep,...e})=>e),normal.enemies.map(({asleep,...e})=>e));
  assert.ok(withLullaby.enemies.some((e,i)=>e.asleep&&!normal.enemies[i].asleep),'fixed seed has a roll between 0.25 and 0.5');
  assert.equal(withLullaby.enemyAiRng,normal.enemyAiRng);

  let s=found.state;assert.equal(s.lullabyPending,true);
  s=descend(s);assert.deepEqual(s.floor,withLullaby.floor);assert.deepEqual(s.enemies.map(id=>s.units[id].asleep),withLullaby.enemies.map(e=>e.asleep));
  assert.notEqual(s.lullabyPending,true,'lullaby is consumed after generating one floor');
});

test('C10: rally changes only the invite threshold, while preserving the recruit random sequence',()=>{
  const targeted=14,draw=rngStep(targeted).value;
  assert.ok(draw>=0.30&&draw<0.45,`fixed RNG state ${targeted} draws ${draw} in the rally-only range`);
  let withRally=getBlessing('rally',{seed:912}).state;
  let withoutRally=structuredClone(withRally);withoutRally.blessings=[];withoutRally.tmChoiceReady=false;
  for(const s of [withRally,withoutRally]){s.prog.rng=targeted;s.units.A.pos=pos(1);addEnemy(s,'recruit-test',2,1,1);}
  withRally=act(withRally,basic('recruit-test'));withoutRally=act(withoutRally,basic('recruit-test'));
  assert.equal(withRally.phase,'invitation');assert.notEqual(withoutRally.phase,'invitation');
  assert.equal(withRally.prog.rng,withoutRally.prog.rng,'the chance changes without consuming a different random draw');
});

test('C7/C13: a challenge TM opens a three-choice panel; a blessing reward opens its own panel without +40 coins',()=>{
  let s=getBlessing('tmChoice',{seed:1013}).state;
  let shop=structuredClone(s);shop.points=[{pos:structuredClone(shop.units.A.pos),kind:'shop',used:false}];
  shop.shop={level:1,stock:{berry:0,tonic:0,tm:'protect'},trades:[]};shop.purse=100;
  shop=apply(shop,{type:'buy',item:'tm'});
  assert.deepEqual(shop.tms,[{move:'protect',source:'shop',fate:'held'}]);assert.equal(shop.tmChoiceReady,true,'a shop purchase does not consume the next non-shop choice');
  s.adventureRooms[0].type='challenge';s.adventureRooms[0].state='sealed';s.adventureRooms[0].enemyIds=['c1a'];
  s.adventureRooms[0].reward='tm';s.adventureRooms[0].rewardCurrency=null;s.adventureRooms[0].rewardMove='protect';
  s.units.c1a=enemy('c1a',2,1,1,'melee',{waitOnly:true});s.units.c1a.species='geodude';s.units.c1a.hp=s.units.c1a.maxHp=1;s.enemies=['c1a'];
  setNoInviteDraws(s,1);s=killOne(s,'c1a');
  assert.equal(s.phase,'tmChoice');assert.equal(pending(s,'tmChoice').source,'challenge');
  assert.equal(pending(s,'tmChoice').options.length,3);assert.equal(new Set(pending(s,'tmChoice').options).size,3);
  const picked=pending(s,'tmChoice').options[0];s=apply(s,{type:'tmChoice',move:picked});
  assert.equal(s.tms.length,1);assert.deepEqual(s.tms[0],{move:picked,source:'challenge',fate:'held'});assert.notEqual(s.tmChoiceReady,true);
  s.rooms.push({x:4,y:0,w:3,h:3});
  s.adventureRooms.push({room:1,type:'challenge',state:'sealed',interaction:pos(5),doors:[],sealedCells:[],enemyIds:['c1b'],reward:'tm',rewardCurrency:null,item:null,rewardItem:null,rewardMove:'protect'});
  s.units.c1b=enemy('c1b',2,1,1,'melee',{waitOnly:true});s.units.c1b.hp=s.units.c1b.maxHp=1;s.enemies=['c1b'];
  setNoInviteDraws(s,1);s=act(s,basic('c1b'));
  assert.notEqual(s.phase,'tmChoice');assert.equal(s.tms.length,2);assert.deepEqual(s.tms[1],{move:'protect',source:'challenge',fate:'held'});

  let blessing=getBlessing('berryBoost',{seed:1012}).state;
  blessing.adventureRooms[0].type='challenge';blessing.adventureRooms[0].state='sealed';blessing.adventureRooms[0].enemyIds=['c1a'];
  blessing.adventureRooms[0].reward='blessing';blessing.adventureRooms[0].rewardCurrency=40;
  blessing.units.c1a=enemy('c1a',2,1,1,'melee',{waitOnly:true});blessing.units.c1a.species='geodude';blessing.units.c1a.hp=blessing.units.c1a.maxHp=1;blessing.enemies=['c1a'];
  const purse=blessing.purse;setNoInviteDraws(blessing,1);blessing=killOne(blessing,'c1a');
  assert.equal(blessing.phase,'blessing');assert.equal(pending(blessing,'blessing').source,'challenge');
  assert.equal(pending(blessing,'blessing').options.length,3);assert.equal(blessing.purse,purse+5,'the defeated enemy still gives its ordinary five coins, without the temporary blessing bonus');
  const rewardOptions=[...pending(blessing,'blessing').options],selected=rewardOptions[0];
  blessing=chooseBlessing(blessing,selected);
  assert.equal(blessing.purse,purse+5);assert.equal(blessing.blessings.at(-1),selected);
});

test('C11: terminal win and wipe discard the run-only contract state without adding unfinished-commission XP',()=>{
  let win=fixture({level:3,roomTypes:[]});win.enemies=[BOSS.id];
  const boss=enemy(BOSS.id,2,1,1,'melee',{waitOnly:true});boss.boss=true;boss.species=BOSS.species;boss.hp=boss.maxHp=1;boss.level=22;
  win.units[BOSS.id]=boss;win.queue=['A'];win.units.A.pos=pos(1);
  win.commissions=[{id:'hunter',floor:3,acceptedRound:0,progress:0,progressTarget:3,speedLimit:null}];win.blessings=['battleSpirit'];
  const winControl=structuredClone(win);winControl.commissions=[];
  win=killOne(win,BOSS.id);const controlEnd=killOne(winControl,BOSS.id);
  assert.equal(win.phase,'ended');assert.equal(win.end.outcome,'won');assert.equal(win.prog.exp,controlEnd.prog.exp,'an unfinished mission adds no experience to the ordinary boss award');
  const next=createExpedition('fresh-after-win',991,3,{members:[{inst:'P1',species:'mudkip',carry:[{move:'tackle',pp:20}]}],leader:0},0,true,3);
  assert.deepEqual(next.commissions??[],[]);assert.deepEqual(next.blessings??[],[]);assert.notEqual(next.lullabyPending,true);assert.notEqual(next.tmChoiceReady,true);

  let wipe=fixture({roomTypes:[],downX:8,partySize:3});wipe.queue=['A','B','C'];
  wipe.units.A.hp=1;wipe.units.B.hp=wipe.units.C.hp=0;wipe.units.B.pos=wipe.units.C.pos=null;
  const w=enemy('W1',2,1,100,'melee');w.learned=['tackle'];w.pp={tackle:50};w.maxPp={tackle:50};w.waitOnly=false;wipe.units.W1=w;wipe.enemies=['W1'];
  wipe.commissions=[{id:'collector',floor:1,acceptedRound:0,progress:0,progressTarget:1,speedLimit:null}];wipe.blessings=['rally'];wipe.prog.items.berry=2;
  const wipeControl=structuredClone(wipe);wipeControl.commissions=[];
  wipe=act(wipe,wait);const wipeControlEnd=act(wipeControl,wait);
  assert.equal(wipe.phase,'ended');assert.equal(wipe.end.outcome,'wipe');assert.deepEqual(wipe.end,wipeControlEnd.end,'unfinished run-only commissions do not alter wipe settlement');
  assert.equal(wipe.prog.exp,wipeControlEnd.prog.exp);assert.equal(wipe.prog.items.berry,2);assert.equal(wipe.purse,0);
});

test('C11: a room choice followed by a same-round wipe ends immediately and clears the unprocessed offer',()=>{
  for(const [type,seed,logText] of [['commission',107,'委托房提出'],['blessing',712,'祝福房提供']]){
    let s=fixture({seed,roomTypes:[type],partySize:3});
    s.units.B.hp=s.units.C.hp=0;s.units.B.pos=s.units.C.pos=null;s.units.A.hp=1;
    const attacker=enemy('wipe-attacker',2,1,50,'melee');attacker.pp.tackle=50;attacker.maxPp.tackle=50;s.units[attacker.id]=attacker;s.enemies=[attacker.id];
    s=startRoom(s);
    assert.equal(s.phase,'ended');assert.equal(s.end.outcome,'wipe');
    assert.ok(s.log.some(line=>line.includes(logText)),`the interaction reached the ${type} offer before the enemy phase`);
    assert.equal(s.pendingChoices,undefined,'the team cannot be left waiting on a choice after a wipe');
    assert.equal(s.commissions,undefined);assert.equal(s.blessings,undefined);assert.equal(s.prog.exp,0);
  }

  let win=fixture({seed:1711,level:3,roomTypes:[],partySize:1});
  win.queue=['A'];win.units.A.pos=pos(1);win.units.A.hp=1;
  win.blessings=['tmChoice'];win.tmChoiceReady=true;
  win.enemies=[BOSS.id,'wipe-attacker'];
  const boss=enemy(BOSS.id,2,1,1,'melee',{waitOnly:true});boss.boss=true;boss.species=BOSS.species;boss.hp=boss.maxHp=1;boss.level=22;
  const attacker=enemy('wipe-attacker',0,1,50,'melee');attacker.pp.tackle=50;attacker.maxPp.tackle=50;
  win.units[BOSS.id]=boss;win.units[attacker.id]=attacker;
  win=act(win,basic(BOSS.id));
  assert.equal(win.phase,'tmChoice');assert.equal(win.pendingEnd,'won');assert.equal(win.end,null);
  assert.equal(pending(win,'tmChoice').source,'boss');assert.equal(pending(win,'tmChoice').options.length,3);
  win=apply(win,{type:'tmChoice',move:pending(win,'tmChoice').options[0]});
  assert.equal(win.phase,'ended');assert.equal(win.end.outcome,'won');assert.equal(win.pendingChoices,undefined);
  assert.equal(win.tms.length,1);assert.equal(win.tms[0].source,'boss');assert.equal(win.tms[0].fate,'brought');
});

test('C15: on the same downstairs request, satisfied stair commissions finish before other same-floor missions fail',()=>{
  const both=findCommissionPair('guardian','hunter',{seed:1235,partySize:3});let s=chooseCommission(both.state);
  assert.equal(s.commissions.length,2);s=descend(s);
  assert.deepEqual(s.commissions,[]);assert.equal(s.prog.exp,commissionXp.guardian[1]);
});

test('C15: a same-round downstairs completion levels the team before the resulting invitation snapshot',()=>{
  let s=acceptOffer('guardian',{seed:1511,partySize:3}).state;
  s.units.A.pos=pos(12);s.units.B.pos=pos(7);addEnemy(s,'same-round-kill',8,1,1);
  const inviteState=7;assert.equal(rngStep(inviteState).value,0.011704753153026104);
  s.prog.exp=0;s.prog.level=5;s.prog.rng=inviteState;
  const result=applyCommand(s,{type:'round',action:interact(true),override:{actor:'B',action:basic('same-round-kill')}});
  assert.equal(result.ok,true,result.error);s=result.state;
  assert.equal(s.request.locked,true);assert.equal(s.phase,'invitation');assert.equal(s.commissions.length,0);
  assert.equal(s.prog.exp,32);assert.equal(s.prog.level,9);
  const invite=s.invitations.find(i=>i.status==='pending');assert.ok(invite);
  assert.equal(invite.unit.level,s.prog.level,'the invite snapshot uses the level after the stair commission reward');
});
