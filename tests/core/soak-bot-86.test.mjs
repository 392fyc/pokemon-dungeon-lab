import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBotMemo,
  botCommands,
  visibleView,
  challengeShouldStart,
  commissionDecision,
  blessingChoice,
  observeActivity
} from './soak-bot.mjs';
import {applyCommand} from '../../src/core/engine.ts';
import {friend,enemy,world,row,pos} from '../acceptance/fixtures.mjs';

const policies=['naive','tactical','tactical-stand','cautious'];
const roomKinds=['challenge','item','commission','blessing'];
const commissionKinds=['hunter','collector','scout','guardian','speedrun'];
const blessingKinds=['berryBoost','floorHeal','battleSpirit','lullaby','rally','tmChoice','nemesis','headhunter','fullpower','scholar','killheal','regen','thickskin','laststand'];
const samePos=(a,b)=>a?.x===b?.x&&a?.y===b?.y;

function makeWorld({roomType='challenge',roomX=2,downX=25,leaderX=roomX+1,leaderY=1,partyHp=[20,20,20]}={}){
  const endX=Math.max(26,downX,roomX+6);
  const floor=[];
  for(let x=0;x<=endX;x++)for(let y=0;y<=2;y++)floor.push(pos(x,y));
  const units={
    A:friend('A',leaderX,leaderY,partyHp[0],{tackle:2,protect:2},20),
    B:friend('B',1,2,partyHp[1],{tackle:2},20),
    C:friend('C',0,2,partyHp[2],{tackle:2},20)
  };
  const room={room:0,type:roomType,state:'idle',interaction:pos(roomX+1,1),doors:[pos(roomX,1)],
    sealedCells:[],enemyIds:[],reward:null,rewardCurrency:null,rewardItem:null,rewardMove:null,item:'bigBerry'};
  const s=world(units,{floor,leader:'A',queue:['A','B','C'],enemies:[],points:[{pos:pos(downX,1),kind:'down',used:false}]});
  s.dungeon={seed:17,width:36,height:24,floors:3,level:1,stored:{},boss:true,roguelike:true,tmPool:3};
  s.difficulty='normal';
  s.rooms=[{x:roomX,y:0,w:4,h:3}];
  s.adventureRooms=[room];
  s.seen=floor.map(p=>p.x+','+p.y);
  s.seenWalls=[];
  s.prog={level:5,exp:0,rng:19,made:0,kills:[],items:{berry:0,tonic:0,bigBerry:0,teamTonic:0}};
  s.purse=0;s.tms=[];s.commissions=[];s.blessings=[];s.completedCommissions=0;
  return s;
}

function addHiddenRoomZero(s,hiddenType='commission'){
  const target=s.adventureRooms[0],targetRect=s.rooms[0];
  target.room=1;
  s.rooms=[{x:20,y:10,w:3,h:3},targetRect];
  s.adventureRooms=[{room:0,type:hiddenType,state:'done',interaction:pos(21,11),doors:[pos(20,10)],
    sealedCells:[],enemyIds:[]},target];
  return s;
}

function engagedBossWorld({partyHp=[20,20,20]}={}){
  const s=makeWorld({roomType:'challenge',roomX:2,downX:25,leaderX:3,partyHp});
  s.dungeon.level=3;s.dungeon.floors=3;
  const boss=enemy('boss',4,1,80,'melee',{waitOnly:true});boss.boss=true;
  s.units.boss=boss;s.enemies.push('boss');
  return s;
}
function relatedUse(commands,item){
  return commands.find(c=>c.type==='round'&&c.action.type==='use'&&c.action.item===item);
}

function visibleCommission(id,options={}){
  const s=makeWorld({roomType:'commission',...options});
  s.phase='commission';
  s.pendingChoices=[{type:'commission',room:0,commission:id}];
  return s;
}
function addVisibleEnemies(s,count){
  const offset=s.enemies.length;
  for(let i=0;i<count;i++){
    const index=offset+i,id='E'+index,x=8+index;
    const e=enemy(id,x,1,8,'melee',{waitOnly:true});
    e.species='geodude';e.hp=8;e.maxHp=8;e.level=5;
    s.units[id]=e;s.enemies.push(id);
  }
}
function addVisiblePickup(s,x=12){
  s.points.push({pos:pos(x,1),kind:'berry',used:false});
}
function addActiveCommission(s,id,{progress=0,target=3}={}){
  const defaults={hunter:3,collector:1,scout:1,guardian:1,speedrun:20};
  s.commissions=[{id,floor:s.dungeon.level,acceptedRound:0,progress,progressTarget:target??defaults[id],speedLimit:id==='speedrun'?defaults[id]:null}];
}

test('B1: 隐藏房型、挑战敌人和预抽奖励变化不改变四种打法的下一命令',()=>{
  const original=makeWorld({roomType:'challenge',roomX:20,leaderX:3,downX:25});
  original.seen=original.seen.filter(cell=>Number(cell.split(',')[0])<=8);
  const variants=[];
  const changedType=structuredClone(original);changedType.adventureRooms[0].type='item';changedType.adventureRooms[0].item='teamTonic';variants.push(changedType);
  const changedEnemies=structuredClone(original);
  changedEnemies.adventureRooms[0].enemyIds=['unseen-challenge-enemy'];
  changedEnemies.units['unseen-challenge-enemy']=enemy('unseen-challenge-enemy',22,1,9,'melee',{waitOnly:true});
  changedEnemies.enemies.push('unseen-challenge-enemy');variants.push(changedEnemies);
  const changedReward=structuredClone(original);
  changedReward.adventureRooms[0].reward='invite';changedReward.adventureRooms[0].rewardCurrency=40;
  changedReward.adventureRooms[0].rewardItem='bigBerry';changedReward.adventureRooms[0].rewardMove='protect';variants.push(changedReward);

  for(const policy of policies)for(const [index,variant] of variants.entries()){
    assert.deepEqual(visibleView(variant),visibleView(original),policy+': hidden variant '+index+' leaked through visibleView');
    assert.deepEqual(botCommands(variant,createBotMemo(policy)),botCommands(original,createBotMemo(policy)),
      policy+': hidden variant '+index+' redirected the next command');
  }
});

test('B1: 已揭示挑战房的预抽奖励仍不可见',()=>{
  const revealed=makeWorld({roomType:'challenge'});
  revealed.units.A.pos=structuredClone(revealed.adventureRooms[0].interaction);
  const changedPreDraw=structuredClone(revealed);
  changedPreDraw.adventureRooms[0].reward='item';
  changedPreDraw.adventureRooms[0].rewardCurrency=null;
  changedPreDraw.adventureRooms[0].rewardItem='teamTonic';
  changedPreDraw.adventureRooms[0].rewardMove='reflect';
  for(const policy of policies){
    assert.deepEqual(visibleView(changedPreDraw),visibleView(revealed),policy+': known challenge revealed its pre-drawn reward');
    assert.deepEqual(botCommands(changedPreDraw,createBotMemo(policy)),botCommands(revealed,createBotMemo(policy)),
      policy+': a visible challenge reward changed the command before the room was cleared');
  }
});


test('B1: 隐藏room0房型变化不会影响已揭示room1的视图和命令',()=>{
  const original=addHiddenRoomZero(makeWorld({roomType:'challenge',roomX:2,leaderX:8,downX:25}),'item');
  const changed=structuredClone(original);
  changed.adventureRooms[0].type='blessing';
  for(const policy of policies){
    const view=visibleView(original);
    const room1=view.adventureRooms.find(room=>room.room===1);
    assert.equal(view.rooms.length,1,'the unseen room0 rectangle is omitted');
    assert.equal(view.adventureRooms.some(room=>room.room===0),false,'the unseen room0 is omitted');
    assert.deepEqual(room1?.rect,original.rooms[1],'the visible room1 keeps its matching rectangle after projection');
    assert.deepEqual(visibleView(changed),view,policy+': changing the hidden room type changes no visible data');
    assert.deepEqual(botCommands(changed,createBotMemo(policy)),botCommands(original,createBotMemo(policy)),
      policy+': changing the hidden room type does not redirect the command');
  }
});

test('B2: 挑战门槛、路过规则和绕路边界',()=>{
  const good=makeWorld({roomType:'challenge'});
  const goodView=visibleView(good);
  assert.equal(challengeShouldStart(goodView,createBotMemo('tactical')),true,'tactical starts a known challenge with healthy partners');
  assert.equal(challengeShouldStart(goodView,createBotMemo('naive')),true,'naive challenges a room on its current route');
  assert.equal(challengeShouldStart(goodView,createBotMemo('cautious')),false,'cautious never starts a challenge');
  assert.equal(challengeShouldStart(goodView,createBotMemo('tactical-stand')),false,'stand does not start a challenge');

  const lowTeam=makeWorld({roomType:'challenge',partyHp:[18,11,12]});
  assert.equal(challengeShouldStart(visibleView(lowTeam),createBotMemo('tactical')),false,
    'the lead is healthy, but the team average is below 70 percent');
  const lowLeader=makeWorld({roomType:'challenge',partyHp:[11,20,20]});
  assert.equal(challengeShouldStart(visibleView(lowLeader),createBotMemo('tactical')),false,
    'a healthy team average does not override the 60 percent leader minimum');

  const branch=makeWorld({roomType:'challenge',roomX:4,leaderX:5,downX:10});
  branch.floor=[...row(10),pos(5,2),pos(5,3),pos(4,2),pos(4,3),pos(6,2),pos(6,3)];
  branch.seen=branch.floor.map(p=>p.x+','+p.y);
  branch.rooms=[{x:4,y:2,w:3,h:2}];
  branch.adventureRooms[0].interaction=pos(5,3);
  branch.adventureRooms[0].doors=[pos(5,1)];
  const firstMove=(state,policy,memo={})=>botCommands(state,createBotMemo(policy,memo)).find(c=>c.type==='round'&&c.action.type==='move')?.action.to;
  assert.deepEqual(firstMove(branch,'tactical',{detourLimit:2}),pos(5,2),'the room is two known steps away' );
  assert.deepEqual(firstMove(branch,'tactical',{detourLimit:1}),pos(6,1),'the room is skipped when it is outside the one-step test limit');

});

test('B2: 20 步 tactical、12 步 cautious 与 naive 路过上限在边界生效',()=>{
  const detourWorld=(depth,roomType='challenge')=>{
    const s=makeWorld({roomType,roomX:24,leaderX:25,leaderY:0,downX:50});
    const floor=[];for(let x=0;x<=50;x++)floor.push(pos(x,0));
    for(let y=1;y<=depth;y++)floor.push(pos(25,y));
    for(const x of [24,26])for(let y=Math.max(0,depth-1);y<=depth;y++)floor.push(pos(x,y));
    s.floor=floor;s.seen=floor.map(p=>p.x+','+p.y);s.points[0].pos=pos(50,0);
    s.units.B.pos=pos(22,0);s.units.C.pos=pos(23,0);
    s.rooms=[{x:24,y:Math.max(0,depth-1),w:3,h:2}];
    s.adventureRooms[0].interaction=pos(25,depth);
    s.adventureRooms[0].doors=[pos(25,Math.max(0,depth-2))];
    return s;
  };
  const first=(s,policy)=>botCommands(s,createBotMemo(policy)).find(c=>c.type==='round'&&c.action.type==='move')?.action.to;
  assert.deepEqual(first(detourWorld(20),'tactical'),pos(25,1),'tactical takes a 20-step route to the room at its limit');
  assert.deepEqual(first(detourWorld(21),'tactical'),pos(26,0),'tactical skips a room 21 steps away');
  assert.deepEqual(first(detourWorld(12,'blessing'),'cautious'),pos(25,1),'cautious takes a 12-step route to the room at its limit');
  assert.deepEqual(first(detourWorld(13,'blessing'),'cautious'),pos(26,0),'cautious skips a room 13 steps away');
  assert.deepEqual(first(detourWorld(1),'naive'),pos(25,1),'naive handles a room two steps off its route');
  assert.deepEqual(first(detourWorld(2),'naive'),pos(26,0),'naive skips a room four steps off its route');
});

test('B2: tactical 与 naive 站在房间交互格时执行房间命令',()=>{
  for(const policy of ['tactical','naive'])for(const kind of roomKinds){
    const s=makeWorld({roomType:kind});
    s.units.A.pos=structuredClone(s.adventureRooms[0].interaction);
    const commands=botCommands(s,createBotMemo(policy));
    const firstRound=commands.find(c=>c.type==='round');
    assert.deepEqual(firstRound,{type:'round',action:{type:'interact',exit:false}},
      policy+' should interact with a current '+kind+' room before moving or fighting');
    const applied=applyCommand(s,firstRound);
    assert.equal(applied.ok,true,applied.error);
  }
});

test('B2: 三条委托已满或祝福已全有时不反复交互无效房间',()=>{
  for(const policy of ['tactical','naive']){
    const full=makeWorld({roomType:'commission'});
    full.units.A.pos=structuredClone(full.adventureRooms[0].interaction);
    full.commissions=Array.from({length:3},(_,i)=>({id:'hunter',floor:1,acceptedRound:i,progress:0,progressTarget:3,speedLimit:null}));
    const refused=applyCommand(full,{type:'round',action:{type:'interact',exit:false}});
    assert.equal(refused.ok,false,'the engine refuses a fourth active commission');
    const fullMemo=createBotMemo(policy);
    for(let attempt=0;attempt<2;attempt++)assert.equal(botCommands(full,fullMemo).some(c=>c.type==='round'&&c.action.type==='interact'),false,
      policy+' repeated a commission-room interaction with three contracts already active');

    const spent=makeWorld({roomType:'blessing'});
    spent.units.A.pos=structuredClone(spent.adventureRooms[0].interaction);
    spent.blessings=[...blessingKinds];
    const noBlessing=applyCommand(spent,{type:'round',action:{type:'interact',exit:false}});
    assert.equal(noBlessing.ok,false,'the engine refuses a blessing room when no blessing remains available');
    const spentMemo=createBotMemo(policy);
    for(let attempt=0;attempt<2;attempt++)assert.equal(botCommands(spent,spentMemo).some(c=>c.type==='round'&&c.action.type==='interact'),false,
      policy+' repeated a blessing-room interaction when every blessing is owned');
  }
});

test('B2: tactical-stand 路过四类房间都不交互',()=>{
  for(const kind of roomKinds){
    const s=makeWorld({roomType:kind});
    s.units.A.pos=structuredClone(s.adventureRooms[0].interaction);
    const commands=botCommands(s,createBotMemo('tactical-stand'));
    assert.equal(commands.some(c=>c.type==='round'&&c.action.type==='interact'),false,
      'stand issued an interaction in a '+kind+' room');
  }
});

test('B2: tactical-stand 与 tactical 在无房间交互的普通战斗中选择相同命令',()=>{
  const s=makeWorld({roomType:'challenge'});
  s.adventureRooms[0].state='done';
  const foe=enemy('battle-target',4,1,12,'melee',{waitOnly:true});
  s.units[foe.id]=foe;s.enemies.push(foe.id);
  const tactical=botCommands(s,createBotMemo('tactical'));
  const stand=botCommands(s,createBotMemo('tactical-stand'));
  assert.ok(tactical.some(c=>c.type==='round'&&['basic','skill'].includes(c.action.type)),
    'the fixture puts an enemy in visible attack range');
  assert.deepEqual(stand,tactical,'stand keeps tactical combat choices when no room interaction is available');
});

test('B3: 四种打法按可见条件决定五种委托',()=>{
  const wellSupplied={downX:22};
  const expected={
    naive:{hunter:true,collector:true,scout:true,guardian:true,speedrun:true},
    tactical:{hunter:true,collector:true,scout:true,guardian:true,speedrun:true},
    'tactical-stand':{hunter:false,collector:false,scout:false,guardian:false,speedrun:false},
    cautious:{hunter:false,collector:true,scout:true,guardian:false,speedrun:true}
  };
  for(const policy of policies){
    for(const id of commissionKinds){
      const s=visibleCommission(id,wellSupplied);
      addVisiblePickup(s);
      addVisibleEnemies(s,3);
      const actual=commissionDecision(visibleView(s),createBotMemo(policy),id);
      assert.equal(actual,expected[policy][id],policy+' decision for '+id);
    }
  }

  const shortHunter=visibleCommission('hunter',{downX:22});
  addVisibleEnemies(shortHunter,2);
  assert.equal(commissionDecision(visibleView(shortHunter),createBotMemo('tactical'),'hunter'),false,
    'tactical refuses hunter when only two eligible enemies are visible');
  addVisibleEnemies(shortHunter,1);
  assert.equal(commissionDecision(visibleView(shortHunter),createBotMemo('tactical'),'hunter'),true,
    'tactical accepts hunter once three eligible enemies are visible');

  const hiddenPickup=visibleCommission('collector',{downX:22});
  addVisiblePickup(hiddenPickup);
  hiddenPickup.seen=hiddenPickup.seen.filter(cell=>cell!=='12,1');
  assert.equal(commissionDecision(visibleView(hiddenPickup),createBotMemo('tactical'),'collector'),false,
    'an unseen pickup cannot satisfy the collection estimate');
  hiddenPickup.seen.push('12,1');
  assert.equal(commissionDecision(visibleView(hiddenPickup),createBotMemo('tactical'),'collector'),true,
    'the same pickup is usable once it is visible');

  const cautiousHidden=visibleCommission('collector',{downX:22});
  addVisiblePickup(cautiousHidden);cautiousHidden.seen=cautiousHidden.seen.filter(cell=>cell!=='12,1');
  assert.equal(commissionDecision(visibleView(cautiousHidden),createBotMemo('cautious'),'collector'),false,
    'cautious does not count a hidden item');
  cautiousHidden.seen.push('12,1');
  assert.equal(commissionDecision(visibleView(cautiousHidden),createBotMemo('cautious'),'collector'),true,
    'cautious accepts when one required floor item is visible');

  const tmOnly=visibleCommission('collector',{downX:22});
  tmOnly.points.push({pos:pos(12,1),kind:'item',used:false});
  assert.equal(commissionDecision(visibleView(tmOnly),createBotMemo('tactical'),'collector'),false,
    'the T technique machine is not one of the collectible G3.11 item types');
  assert.equal(commissionDecision(visibleView(tmOnly),createBotMemo('cautious'),'collector'),false,
    'cautious applies the same visible item definition');

  const averageEdge=visibleCommission('guardian',{downX:22,partyHp:[15,14,13]});
  assert.equal(commissionDecision(visibleView(averageEdge),createBotMemo('tactical'),'guardian'),true,
    'the 70 percent team average boundary is inclusive');
  averageEdge.units.C.hp=12;
  assert.equal(commissionDecision(visibleView(averageEdge),createBotMemo('tactical'),'guardian'),false,
    'a team average below 70 percent fails the guardian gate');
  const leaderEdge=visibleCommission('guardian',{downX:22,partyHp:[12,20,20]});
  assert.equal(commissionDecision(visibleView(leaderEdge),createBotMemo('tactical'),'guardian'),true,
    'guardian uses the whole-team average; its rule has no separate lead minimum');

  const noStairs=visibleCommission('speedrun',{downX:22});
  noStairs.seen=noStairs.seen.filter(cell=>cell!=='22,1');
  assert.equal(commissionDecision(visibleView(noStairs),createBotMemo('tactical'),'speedrun'),false,
    'the robot does not infer an unseen staircase');
  const atLimit=visibleCommission('speedrun',{downX:23});
  assert.equal(commissionDecision(visibleView(atLimit),createBotMemo('cautious'),'speedrun'),true,
    'cautious accepts at exactly 20 visible steps');
  const overLimit=visibleCommission('speedrun',{downX:24});
  assert.equal(commissionDecision(visibleView(overLimit),createBotMemo('cautious'),'speedrun'),false,
    'cautious refuses when the known route exceeds 20 steps');

  for(const policy of policies){
    const full=visibleCommission('collector',{downX:22});
    full.commissions=[{id:'hunter'},{id:'hunter'},{id:'hunter'}];
    addVisiblePickup(full);
    assert.equal(commissionDecision(visibleView(full),createBotMemo(policy),'collector'),false,
      policy+': no fourth commission is accepted while three are active');
  }
});

test('B3: 机器人先完成可见且顺路的收集委托；看不到完成目标时下楼并判失败',()=>{
  const reachable=makeWorld({roomType:'commission',roomX:2,downX:25,leaderX:12});
  reachable.adventureRooms[0].state='done';
  reachable.points.push({pos:pos(12,1),kind:'berry',used:false});
  addActiveCommission(reachable,'collector',{progress:0,target:1});
  const completeCommands=botCommands(reachable,createBotMemo('tactical'));
  const pickup=completeCommands.find(c=>c.type==='round'&&c.action.type==='interact'&&!c.action.exit);
  assert.ok(pickup,'the bot should interact with the visible pickup before descending');
  const completed=applyCommand(reachable,pickup);
  assert.equal(completed.ok,true,completed.error);
  assert.equal(completed.state.commissions.length,0);
  assert.equal(completed.state.completedCommissions,1);
  assert.ok(completed.state.prog.exp>0,'the completed commission pays its stated experience');

  const unreachable=makeWorld({roomType:'commission',roomX:2,downX:25,leaderX:25});
  addActiveCommission(unreachable,'hunter',{progress:0,target:3});
  const beforeExp=unreachable.prog.exp;
  const descend=botCommands(unreachable,createBotMemo('tactical')).find(c=>
    c.type==='round'&&c.action.type==='interact'&&c.action.exit);
  assert.ok(descend,'the bot descends when no eligible enemy is visible on the layer');
  const failed=applyCommand(unreachable,descend);
  assert.equal(failed.ok,true,failed.error);
  assert.equal(failed.state.phase,'transit');
  const crossed=applyCommand(failed.state,{type:'finishTransit'});
  assert.equal(crossed.ok,true,crossed.error);
  assert.equal(crossed.state.dungeon.level,2);
  assert.equal(crossed.state.commissions.length,0,'an uncompleted same-floor commission fails at the stairs');
  assert.equal(crossed.state.prog.exp,beforeExp,'a failed commission grants no experience');
});

test('8.6 §3.1.3: scout 会先进入可见的已完成目标房，并且不重复交互',()=>{
  for(const [policy,kind] of [['tactical','item'],['cautious','blessing']]){
    const initial=addHiddenRoomZero(makeWorld({roomType:kind,roomX:2,downX:9,leaderX:8}),'commission');
    initial.adventureRooms[1].state='done';
    addActiveCommission(initial,'scout',{progress:0,target:1});
    const memo=createBotMemo(policy);
    const known=visibleView(initial).adventureRooms.find(room=>room.room===1);
    assert.equal(known?.type,kind,policy+': the scout target must be visible');
    assert.equal(known?.state,'done',policy+': this test must use an already completed room');
    assert.deepEqual(known?.rect,initial.rooms[1],policy+': the target room keeps its original rectangle index');

    const first=botCommands(initial,memo).find(command=>command.type==='round');
    assert.deepEqual(first?.action,{type:'move',to:pos(7,1)},
      policy+': with the stairs east and the completed scout room west, the next move heads to the room');

    let state=initial,entered=false;
    const inRect=(point,rect)=>point.x>=rect.x&&point.x<rect.x+rect.w&&point.y>=rect.y&&point.y<rect.y+rect.h;
    for(let step=0;step<6&&state.commissions?.find(c=>c.id==='scout')?.progress===0;step++){
      const commands=botCommands(state,memo);
      assert.equal(commands.some(command=>command.type==='round'&&command.action.type==='interact'),false,
        policy+': a done room is approached for scout progress, not interacted with');
      const round=commands.find(command=>command.type==='round');
      assert.equal(round?.action.type,'move',policy+': the bot keeps moving toward the known room');
      const from=Object.fromEntries(state.queue.map(id=>[id,state.units[id]?.pos&&{...state.units[id].pos}]));
      const applied=applyCommand(state,round);
      assert.equal(applied.ok,true,applied.error);
      state=applied.state;
      const rect=state.rooms[1];
      for(const id of state.queue)if(from[id]&&!inRect(from[id],rect)&&inRect(state.units[id]?.pos,rect))entered=true;
    }
    assert.equal(entered,true,policy+': an accepted real move crossed into the room rectangle');
    assert.equal(state.commissions?.find(c=>c.id==='scout')?.progress,1,
      policy+': crossing into the already done item/blessing room advances the scout commission');
    assert.equal(state.adventureRooms[1].state,'done');
    assert.equal(botCommands(state,memo).some(command=>command.type==='round'&&command.action.type==='interact'),false,
      policy+': after progress, the done room is never interacted with');
  }
});

test('8.6 B6回归：全图已揭示的挑战房内有远处睡眠敌人时机器人主动接近',()=>{
  const sealedWorld=(hiddenPos,hiddenType)=>{
    const s=addHiddenRoomZero(makeWorld({roomType:'challenge',roomX:2,downX:25,leaderX:5}),hiddenType);
    s.adventureRooms[1].state='sealed';
    s.adventureRooms[1].enemyIds=[];
    const sleeping=enemy('visible-sleeper',2,1,14,'melee',{waitOnly:true});
    sleeping.asleep=true;sleeping.hp=14;sleeping.maxHp=14;
    s.units[sleeping.id]=sleeping;s.enemies.push(sleeping.id);
    const hidden=enemy('hidden-far-enemy',hiddenPos.x,hiddenPos.y,8,'melee',{waitOnly:true});
    s.units[hidden.id]=hidden;s.enemies.push(hidden.id);
    return s;
  };

  for(const policy of ['naive','tactical']){
    const original=sealedWorld(pos(30,20),'item'),changed=sealedWorld(pos(31,20),'blessing');
    const view=visibleView(original);
    assert.equal(view.adventureRooms.find(room=>room.room===1)?.state,'sealed');
    assert.equal(view.rooms.length,1,'the unseen room0 rectangle is omitted');
    assert.equal(view.adventureRooms.some(room=>room.room===0),false,'the unseen room0 is omitted');
    assert.deepEqual(view.adventureRooms.find(room=>room.room===1)?.rect,original.rooms[1],
      'the visible sealed room1 keeps its matching rectangle after projection');
    assert.ok(view.enemies.includes('visible-sleeper'),'the sleeping enemy is visible inside the sealed room');
    assert.equal(view.enemies.includes('hidden-far-enemy'),false,'the distant unrevealed enemy is absent from the player view');
    assert.equal(view.seen.length,original.floor.length,'the fixture has no unrevealed floor frontier');

    const commands=botCommands(original,createBotMemo(policy));
    assert.deepEqual(botCommands(changed,createBotMemo(policy)),commands,
      policy+': moving an unrevealed enemy cannot change the next command');
    const round=commands.find(command=>command.type==='round');
    assert.ok(round,policy+': no round command was produced');
    assert.equal(round.action.type,'move',policy+': the bot must not wait while a reachable room enemy remains');
    const distance=p=>Math.abs(p.x-view.units[view.leader].pos.x)+Math.abs(p.y-view.units[view.leader].pos.y);
    assert.ok(distance(round.action.to)<distance(view.units['visible-sleeper'].pos),
      policy+': the accepted movement step must bring the leader closer to the visible sleeper');
    const applied=applyCommand(original,round);
    assert.equal(applied.ok,true,applied.error);
  }
});

test('S81 forced-wipe: 队友不再挡路，记忆中的敌人路线照常前进',()=>{
  const makeWorldState=(hiddenPos)=>{
    const floor=[];
    const add=(x,y)=>floor.push(pos(x,y));
    for(let x=23;x<=29;x++)add(x,6);
    add(23,5); // unknown frontier beyond the current four-step reveal
    add(28,7);add(28,8);
    for(let y=7;y<=14;y++)add(29,y);
    for(let x=24;x<=28;x++)add(x,14);
    add(hiddenPos.x,hiddenPos.y);
    const s=world({
      A:friend('A',28,7,20,{tackle:2},20),
      C:friend('C',29,6,20,{tackle:2},20)
    },{floor,leader:'C',queue:['A','C'],enemies:[],points:[]});
    s.phase='playing';
    s.dungeon={seed:214813,width:36,height:24,floors:3,level:2,stored:{},roguelike:true};
    s.rooms=[];s.adventureRooms=[];s.points=[];s.seenWalls=[];
    s.seen=floor.filter(p=>(p.x!==23||p.y!==5)&&(p.x!==hiddenPos.x||p.y!==hiddenPos.y)).map(p=>p.x+','+p.y);
    s.prog={level:5,exp:0,rng:19,made:0,kills:[],items:{berry:0,tonic:0,bigBerry:0,teamTonic:0}};
    s.commissions=[];s.blessings=[];s.purse=0;s.tms=[];
    s.units.H=enemy('H',hiddenPos.x,hiddenPos.y,8,'melee',{waitOnly:true});
    s.enemies=['H'];
    return s;
  };

  const snapshots=[];
  for(const hidden of [pos(34,20),pos(33,20)]){
    const s=makeWorldState(hidden);
    const view=visibleView(s);
    assert.equal(view.enemies.length,0,'no enemy is visible to guide the recovery');
    assert.ok(view.seen.includes('24,14'),'the remembered foe cell was visible before it disappeared');
    const memo=createBotMemo('naive',{doomed:true,suicidal:true,lastFoe:pos(24,14)});
    const initial=botCommands(s,memo);
    const blocked=initial.find(command=>command.type==='round');
    assert.deepEqual(blocked?.action,{type:'move',to:pos(29,7)},
      'the forced-wipe memory first aims at the move that the real team will reject');
    // 8.8 (4.1, 4.2): A no longer steps into (29,7) first (it is already diagonally next to C), and walking into a teammate swaps places,
    // so the forced-wipe memory's first move is simply accepted and no teammate-blocked rejection (or stale-memory clearing) happens.
    const accepted=applyCommand(s,blocked);
    assert.equal(accepted.ok,true,accepted.error);
    assert.deepEqual(accepted.state.units.C.pos,pos(29,7));
    assert.deepEqual(accepted.state.units.A.pos,pos(28,7));
    assert.deepEqual(memo.lastFoe,pos(24,14),'the forced-foe memory is kept: nothing was rejected');
    const fallback=botCommands(accepted.state,memo).find(command=>command.type==='round');
    assert.deepEqual(fallback?.action,{type:'move',to:pos(29,8)},
      'the bot keeps walking the remembered foe route down the corridor');
    const moved=applyCommand(accepted.state,fallback);
    assert.equal(moved.ok,true,moved.error);
    assert.deepEqual(moved.state.units.C.pos,pos(29,8));
    const next=botCommands(moved.state,memo).find(command=>command.type==='round');
    assert.deepEqual(next?.action,{type:'move',to:pos(29,9)},
      'the following step continues down the corridor');
    snapshots.push({initial:blocked,recovered:fallback,next});
  }
  assert.deepEqual(snapshots[1],snapshots[0],
    'changing the position of an unrevealed enemy does not affect either step');
});
test('8.6 §3.1.4: 大树果照回复门槛治疗主控或相邻同行',()=>{
  const leaderHurt=engagedBossWorld({partyHp:[10,20,20]});
  leaderHurt.prog.items.bigBerry=1;
  const leaderUse=relatedUse(botCommands(leaderHurt,createBotMemo('tactical')),'bigBerry');
  assert.ok(leaderUse,'boss-engaged strategy must still use an eligible big berry');
  assert.equal(leaderUse.action.target,'A','the hurt leader is in reach at the tactical 50 percent threshold');

  const adjacentHurt=engagedBossWorld({partyHp:[20,10,20]});
  adjacentHurt.units.B.pos=pos(3,2);
  adjacentHurt.prog.items.bigBerry=1;
  const adjacentUse=relatedUse(botCommands(adjacentHurt,createBotMemo('tactical')),'bigBerry');
  assert.ok(adjacentUse,'the 50 percent adjacent partner is eligible');
  assert.equal(adjacentUse.action.target,'B');
});

test('8.6 §3.1.4: 大树果不会指定非相邻同行',()=>{
  const distantHurt=engagedBossWorld({partyHp:[20,8,20]});
  distantHurt.units.B.pos=pos(8,2);
  distantHurt.prog.items.bigBerry=1;
  const commands=botCommands(distantHurt,createBotMemo('tactical'));
  assert.equal(relatedUse(commands,'bigBerry'),undefined,'an out-of-reach low-HP partner cannot consume the held berry');
});

test('8.6 §3.1.4: 全员 PP 补剂要求空招且总 PP 严格低于一半',()=>{
  const base=()=>{
    const s=engagedBossWorld();s.queue=['A','B'];s.units.B.pos=pos(3,2);
    s.prog.items.teamTonic=1;s.prog.items.bigBerry=0;s.prog.items.berry=0;s.prog.items.tonic=0;
    return s;
  };
  const belowHalf=base();
  belowHalf.units.A.pp={tackle:1,protect:1};
  belowHalf.units.A.maxPp={tackle:2,protect:2};
  belowHalf.units.B.pp={tackle:0};belowHalf.units.B.maxPp={tackle:2};
  const use=relatedUse(botCommands(belowHalf,createBotMemo('tactical')),'teamTonic');
  assert.ok(use,'a partner with an empty move and team PP below half triggers the refill during the boss fight');
  assert.equal(use.action.target,'A');

  const exactlyHalf=base();
  exactlyHalf.units.A.pp={tackle:1,protect:2};
  exactlyHalf.units.A.maxPp={tackle:2,protect:2};
  exactlyHalf.units.B.pp={tackle:0};exactlyHalf.units.B.maxPp={tackle:2};
  assert.equal(exactlyHalf.units.A.pp.tackle+exactlyHalf.units.A.pp.protect+exactlyHalf.units.B.pp.tackle,3);
  assert.equal(relatedUse(botCommands(exactlyHalf,createBotMemo('tactical')),'teamTonic'),undefined,
    'exactly half the team capacity does not trigger a refill');

  const noEmptyMove=base();
  noEmptyMove.units.A.pp={tackle:1,protect:1};
  noEmptyMove.units.A.maxPp={tackle:8,protect:8};
  noEmptyMove.units.B.pp={tackle:1};noEmptyMove.units.B.maxPp={tackle:8};
  assert.ok(1+1+1<(8+8+8)/2,'the test has low team PP without an empty move');
  assert.equal(relatedUse(botCommands(noEmptyMove,createBotMemo('tactical')),'teamTonic'),undefined,
    'low total PP alone is insufficient when every move still has PP');
});

test('B4: 三选一遵循四种打法的祝福优先级及第三层规则',()=>{
  const offers=['berryBoost','rally','battleSpirit'];
  const expected={
    naive:{1:'berryBoost',3:'berryBoost'},
    tactical:{1:'rally',3:'battleSpirit'},
    'tactical-stand':{1:null,3:null},
    cautious:{1:'berryBoost',3:'berryBoost'}
  };
  for(const policy of policies){
    for(const level of [1,3]){
      const s=makeWorld({roomType:'blessing'});
      s.dungeon.level=level;
      s.phase='blessing';
      s.pendingChoices=[{type:'blessing',source:'room',room:0,options:[...offers]}];
      const chosen=blessingChoice(visibleView(s),createBotMemo(policy));
      assert.equal(chosen,expected[policy][level],policy+' layer '+level);
    }
  }
  for(const policy of ['naive','tactical','cautious']){
    const s=makeWorld({roomType:'blessing'});
    s.phase='blessing';s.pendingChoices=[{type:'blessing',source:'room',room:0,options:[...blessingKinds]}];
    const choice=blessingChoice(visibleView(s),createBotMemo(policy));
    assert.ok(blessingKinds.includes(choice),policy+' selected an option outside the offer');
  }
});
test('统计回归：两个guardian实例在同一全灭中各计一次',()=>{
  const state=makeWorld({roomType:'challenge',roomX:2,downX:25,leaderX:3,partyHp:[1,20,20]});
  state.queue=['A'];state.leader='A';delete state.units.B;delete state.units.C;
  state.rooms=[];state.adventureRooms=[];state.points=[];
  state.round=8;
  state.units.E=enemy('E',4,1,8,'melee');state.enemies=['E'];
  state.commissions=[
    {id:'guardian',floor:1,acceptedRound:4,progress:0,progressTarget:1,speedLimit:null},
    {id:'guardian',floor:1,acceptedRound:6,progress:0,progressTarget:1,speedLimit:null}
  ];

  const memo=createBotMemo('naive'),x={};
  observeActivity(state,state,{type:'observe'},x,memo);
  x.activity.commissions.byType.guardian.accepted=2;
  x.activity.commissions.byFloor[1].guardian.accepted=2;

  const command={type:'round',action:{type:'wait'}};
  const result=applyCommand(state,command);
  assert.equal(result.ok,true,result.error);
  const after=result.state;
  assert.equal(after.phase,'ended','the only teammate is knocked out');
  assert.equal(after.end?.outcome,'wipe');
  assert.equal(after.log.filter(line=>line.includes('委托失败（同行倒下）')).length,2,
    'the engine emits one real failure log for each guardian instance');

  observeActivity(state,after,command,x,memo);
  const byType=x.activity.commissions.byType.guardian;
  const byFloor=x.activity.commissions.byFloor[1].guardian;
  assert.equal(byType.accepted,2);
  assert.equal(byType.failed,2,'both failed instances are counted once');
  assert.equal(byType.completed,0);
  assert.equal(byType.failures['同行倒下'],2);
  assert.equal(byType.failures['本局结束作废']??0,0,'terminal handling does not count the same two instances again');
  assert.equal(x.activity.commissions.guardianFailures,2);
  assert.equal(byFloor.accepted,2);
  assert.equal(byFloor.failed,2);
  assert.equal(byFloor.failures['同行倒下'],2);
});

test('统计回归：两条speedrun按各自acceptedRound核算余时和经验',()=>{
  const state=makeWorld({roomType:'challenge',roomX:2,downX:25,leaderX:3});
  state.queue=['A'];state.leader='A';delete state.units.B;delete state.units.C;
  state.rooms=[];state.adventureRooms=[];
  state.points=[{pos:pos(3,1),kind:'down',used:false}];
  state.round=8;
  state.commissions=[4,6].map(acceptedRound=>({
    id:'speedrun',floor:1,acceptedRound,progress:state.round-acceptedRound+1,
    progressTarget:20,speedLimit:20
  }));

  const memo=createBotMemo('naive'),x={};
  observeActivity(state,state,{type:'observe'},x,memo);
  x.activity.commissions.byType.speedrun.accepted=2;
  x.activity.commissions.byFloor[1].speedrun.accepted=2;
  const beforeExp=state.prog.exp;
  const command={type:'round',action:{type:'interact',exit:true}};
  const result=applyCommand(state,command);
  assert.equal(result.ok,true,result.error);
  const after=result.state;
  assert.equal(after.completedCommissions,2,'the real staircase interaction completes both active commissions');
  assert.equal(after.commissions.length,0);

  observeActivity(state,after,command,x,memo);
  const byType=x.activity.commissions.byType.speedrun;
  const byFloor=x.activity.commissions.byFloor[1].speedrun;
  assert.equal(byType.accepted,2);
  assert.equal(byType.completed,2);
  assert.equal(byType.failed,0);
  assert.equal(byFloor.accepted,2);
  assert.equal(byFloor.completed,2);
  assert.equal(byType.rewardExp,after.prog.exp-beforeExp,'observed reward matches the engine experience change');
  assert.equal(byFloor.rewardExp,after.prog.exp-beforeExp);
  const expected=[20-(after.round-4+1),20-(after.round-6+1)];
  assert.deepEqual(x.activity.commissions.speedRemaining,expected);
  assert.notEqual(expected[0],expected[1],'the two acceptance rounds imply different remaining time');
});
