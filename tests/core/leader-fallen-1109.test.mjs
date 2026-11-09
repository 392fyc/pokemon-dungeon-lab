/* Round 14, item 6: when the leader falls, the companion who takes over (the engine's pick, or one the player switches to) can use every interaction
 * point. The engine hands the leader role to the next living member at the end of the round the leader fell in; each test below goes through that
 * real fall (an enemy beats the leader down) and then runs the interaction as the new leader. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand} from '../../src/core/engine.ts';
import {enemy,friend,world} from '../acceptance/fixtures.mjs';

const key=p=>`${p.x},${p.y}`;
const cells=r=>Array.from({length:r.h},(_,dy)=>Array.from({length:r.w},(_,dx)=>({x:r.x+dx,y:r.y+dy}))).flat();
const apply=(s,cmd)=>{const r=applyCommand(s,cmd);assert.equal(r.ok,true,r.error);return r.state;};
const act=(s,action)=>apply(s,{type:'round',action});
const CELL={x:5,y:4};

/** A room with a corridor on its west side; A (leader) stands at the west end with 1 HP next to an enemy that attacks. */
function scene({type=null,point=null,roguelike=true}={}){
  const r={x:3,y:2,w:6,h:5},floor=[...cells(r),...Array.from({length:13},(_,x)=>[{x,y:3},{x,y:4}]).flat()];
  const unique=[...new Map(floor.map(p=>[key(p),p])).values()];
  const A=friend('A',1,3,1,{tackle:5},200),B=friend('B',6,5,200,{tackle:5},200),C=friend('C',7,5,200,{tackle:5},200);
  for(const u of [A,B,C])u.tactic='wait';
  const X=enemy('X',2,3,30,'melee');
  const s=world({A,B,C,X},{floor:unique,enemies:['X']});
  s.rooms=[r];s.dungeon={seed:1,width:13,height:9,floors:3,level:1,stored:{},boss:true,roguelike,tmPool:3};
  s.difficulty='normal';s.prog={level:5,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0,bigBerry:0,teamTonic:0}};
  s.purse=0;s.tms=[];s.enemyAiRng=1;s.noCrit=true;
  if(type){
    const room={room:0,type,state:'idle',interaction:{...CELL},doors:[{x:3,y:3},{x:3,y:4},{x:8,y:3},{x:8,y:4}],sealedCells:[],enemyIds:[],reward:null,item:null,rewardItem:null};
    if(type==='item'){room.item='berry';}
    s.adventureRooms=[room];
  }
  if(point){s.points=[{pos:{...CELL},kind:point,used:false}];if(point==='exchange')s.exchange={level:1,used:false,sent:null};}
  return s;
}
/** The leader A falls in an ordinary round; afterwards the enemy is gone, and the named companion stands on the interaction cell as the controlled member. */
function afterFall(s,controller){
  s=act(s,{type:'wait'});
  assert.equal(s.units.A.hp,0,'the leader fell');assert.equal(s.phase,'playing');
  assert.notEqual(s.leader,'A','the engine handed the leader role on in the same round');assert.ok(s.units[s.leader].hp>0,'to a living member');
  s.units.X.hp=0;s.units.X.pos=null;
  if(controller!==s.leader){s=apply(s,{type:'switch',actor:controller});}
  assert.equal(s.leader,controller,'the controlled member is the leader');
  for(const id of s.queue)if(s.units[id].hp>0&&id!==controller)s.units[id].pos={x:6+(id==='B'?0:1),y:6};
  s.units[controller].pos={...CELL};
  return s;
}
const controllers=['B','C'];   // B is the engine's pick; C is a switch by the player

for(const who of controllers){
  test(`after the leader falls, ${who} opens a blessing room`,()=>{
    let s=afterFall(scene({type:'blessing'}),who);s=act(s,{type:'interact',exit:false});
    assert.equal(s.phase,'blessing');assert.equal(s.pendingChoices[0].type,'blessing');
  });
  test(`after the leader falls, ${who} opens a commission room`,()=>{
    let s=afterFall(scene({type:'commission'}),who);s=act(s,{type:'interact',exit:false});
    assert.ok(s.pendingChoices?.some(c=>c.type==='commission'),'a commission is offered');
  });
  test(`after the leader falls, ${who} takes the item of an item room`,()=>{
    let s=afterFall(scene({type:'item'}),who);const before=s.prog.items.berry;s=act(s,{type:'interact',exit:false});
    assert.equal(s.prog.items.berry,before+1);assert.equal(s.adventureRooms[0].state,'done');
  });
  test(`after the leader falls, ${who} starts a challenge stele`,()=>{
    let s=afterFall(scene({type:'challenge'}),who);s=act(s,{type:'interact',exit:false});
    assert.equal(s.adventureRooms[0].state,'sealed','the stele challenge began');
  });
  test(`after the leader falls, ${who} takes the stairs down`,()=>{
    let s=afterFall(scene({point:'down'}),who);s=act(s,{type:'interact',exit:true});
    assert.ok(s.request?.locked||s.phase==='transit','the crossing is requested: '+JSON.stringify({phase:s.phase,request:s.request}));
    assert.equal(s.request.actor,who);
  });
  test(`after the leader falls, ${who} leaves through an exit point`,()=>{
    let s=afterFall(scene({point:'exit',roguelike:false}),who);s=act(s,{type:'interact',exit:true});
    assert.ok(s.request?.locked||s.phase==='exit','the exit is requested: '+JSON.stringify({phase:s.phase,request:s.request}));
  });
  test(`after the leader falls, ${who} runs the exchange machine`,()=>{
    let s=afterFall(scene({point:'exchange'}),who);
    const partner=s.queue.find(id=>id!==who&&s.units[id].hp>0);
    s=act(s,{type:'exchange',target:partner,cargo:[]});
    assert.equal(s.exchange.used,true);assert.ok(!s.queue.includes(partner),'the partner went home');
  });
}
