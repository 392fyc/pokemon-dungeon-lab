import assert from 'node:assert/strict';
import { applyCommand, previewInvitation } from '../../src/core/engine.ts';

// Independent literal fixtures: 7.7a replaces behavior keys with approved move IDs.
// No imports from production scenarios, damage, follow, factory or expected calculators.
export const pos=(x,y=1)=>({x,y});
export const row=(end=9)=>Array.from({length:end+1},(_,x)=>pos(x));
export const open=(n=4)=>Array.from({length:n*n},(_,i)=>pos(i%n+1,Math.floor(i/n)+1));
export const friend=(id,x,y=1,hp=20,pp={},maxHp=20)=>({
 id,side:'friend',level:5,tactic:'together',stages:{atk:0,def:0},protect:0,counter:0,reflect:0,lightscreen:0,lastMove:null,hp,maxHp,pos:hp>0?pos(x,y):null,pp:{...pp},
 maxPp:Object.fromEntries(Object.keys(pp).map(k=>[k,2])),learned:Object.keys(pp)
});
// Independent explicit kits for the three approved developer-fixture mappings.
const enemyKits={melee:{species:'geodude',kit:{tackle:3,harden:3}},ranged:{species:'pidgey',kit:{tackle:3,gust:3}},chase:{species:'growlithe',kit:{ember:2,bite:2}}};
export const enemy=(id,x,y,hp,role,{waitOnly=false}={})=>{
 const {species,kit}=enemyKits[role];
 return {id,side:'enemy',species,entrySpecies:species,level:5,tactic:'gofoes',stages:{atk:0,def:0},protect:0,counter:0,reflect:0,lightscreen:0,lastMove:null,
  hp,maxHp:hp,pos:pos(x,y),pp:{...kit},maxPp:{...kit},learned:Object.keys(kit),...(waitOnly?{waitOnly:true}:{})};
};
export function world(units,{floor=row(),leader='A',queue=['A','B','C'],enemies=[],camp=[],points=[]}={}){
 return {runId:'acceptance',scenario:'independent-fixture',round:0,floor,seen:floor.map(p=>p.x+','+p.y),
 units,queue,enemies,camp,leader,points,goal:false,bag:0,phase:'playing',invitations:[],anchor:null,request:null,end:null,log:[]};
}
export function invite(s,ids=['N']){
 s.phase='invitation';s.anchor=structuredClone(s.units[s.leader].pos);
 s.invitations=ids.map((id,i)=>({id:s.runId+':invite:'+(i+1),unit:friend(id,0,1,10,{tackle:1,roar:1}),status:'pending'}));
 return s;
}
export function doCmd(s,c){
 const before=structuredClone(s),r=applyCommand(s,c);
 assert.deepEqual(s,before,'applyCommand mutated its input');
 assert.equal(r.ok,true,r.error);return r.state;
}
export function reject(s,c){
 const before=structuredClone(s),r=applyCommand(s,c);
 assert.equal(r.ok,false);assert.deepEqual(s,before);assert.deepEqual(r.state,before);return r;
}
export const move=x=>({type:'move',to:pos(x)});
export const wait={type:'wait'};
export const basic=target=>({type:'basic',target});
export const skill=(skill,target)=>({type:'skill',skill,target});
export const interact=exit=>({type:'interact',exit});
export const round=(s,action,actor,action2)=>doCmd(s,{type:'round',action,...(actor?{override:{actor,action:action2}}:{})});
export const switchTo=(s,actor)=>doCmd(s,{type:'switch',actor});
export const refuse=s=>doCmd(s,{type:'invite',choice:'reject'});
export const accept=(s,outgoing)=>doCmd(s,{type:'invite',choice:'accept',outgoing});
export const finish=s=>doCmd(s,{type:'finishExit'});
export const coords=(s,ids=s.queue)=>ids.map(id=>s.units[id].pos);
export const hp=(s,ids=s.queue)=>ids.map(id=>s.units[id].hp);
export const pp=(s,ids=s.queue)=>ids.map(id=>s.units[id].pp);
export function preview(s,outgoing){
 const before=structuredClone(s),r=previewInvitation(s,outgoing);assert.deepEqual(s,before,'preview changed world');return r;
}
export function V(id){
 if(id===3)return world({A:friend('A',3,1,10),B:friend('B',2,1,10),C:friend('C',1,1,10)},{floor:row(4),leader:'C',points:[{pos:pos(0),kind:'exit',used:false}]});
 if(id===4)return world({A:friend('A',3,1,10),B:friend('B',1,1,10),C:friend('C',2,1,10)},{floor:[...row(3),pos(2,2),pos(3,2)]});
 if(id===5||id===6)return world({A:friend('A',2,1,0),B:friend('B',1,1,id===6?3:8),C:friend('C',0,1,8),E:enemy('E',3,1,6,'chase',{waitOnly:id===5})},{floor:row(4),leader:'B',enemies:['E']});
 if(id===7)return world({A:friend('A',2,1,0),B:friend('B',0,1,8),C:friend('C',1,1,8)},{floor:row(4),leader:'B',points:[{pos:pos(0),kind:'exit',used:false}]});
 if(id===8||id===9||id===10){
  const s=world({A:friend('A',2,2,id===10?10:20,{tackle:2}),B:friend('B',id===8?1:2,id===8?2:3,id===10?10:20,{protect:2}),C:friend('C',4,2,id===10?10:0,{tackle:2,quickattack:2})},{floor:open(id===8?5:4)});
  if(id===8)for(const [i,p] of [pos(3,2),pos(2,3),pos(2,1)].entries()){const e=enemy('X'+i,p.x,p.y,20,'melee',{waitOnly:true});s.units[e.id]=e;s.enemies.push(e.id);}
  return invite(s,id===10?['N1','N2']:['N']);
 }
 if(id===11||id===12){
  const s=world({A:friend('A',4,1,id===12?0:20,{tackle:2}),B:friend('B',7,1,1,{tackle:1}),N:friend('N',6,1,id===12?0:10,{tackle:1,roar:1}),C:friend('C',2,1,8,{tackle:2,quickattack:2}),H:enemy('H',8,1,60,'melee')},
   {leader:'B',queue:['A','B','N'],enemies:['H'],camp:['C'],points:[{pos:pos(4),kind:'goal',used:true},{pos:pos(7),kind:'item',used:false}]});
  s.units.C.pos=null;s.round=10;s.goal=true;return s;
 }
 if(id===13){const e=enemy('E',3,1,6,'melee');e.recruit=friend('N',0,1,10,{tackle:1,roar:1});
  return world({A:friend('A',2,1,20,{tackle:2}),B:friend('B',4,1,20,{protect:2}),C:friend('C',5,1,8,{tackle:2,quickattack:2}),E:e},{leader:'B',enemies:['E'],points:[{pos:pos(4),kind:'goal',used:false}]});
 }
 throw Error('unknown V fixture '+id);
}
export function K(d=false){
 const s=world({A:friend('A',2,2,12,{tackle:2}),B:friend('B',1,2,12,{protect:1}),C:friend('C',3,3,10,{tackle:2,quickattack:1}),H:enemy('H',3,2,24,'chase')},{floor:open(),enemies:['H']});
 if(d){s.units.C.pos=null;s.units.D=friend('D',3,3,4,{tackle:1,roar:1},8);s.queue=['A','B','D'];s.camp=['C'];}return s;
}
export function K5(){
 const s=world({A:friend('A',0,1,12,{tackle:2}),B:friend('B',1,1,12,{protect:1}),C:friend('C',2,1,2,{tackle:0,quickattack:1}),R:enemy('R',5,1,6,'ranged')},{floor:row(5),leader:'C',enemies:['R']});
 invite(s,['Q']);s.invitations[0].unit=friend('Q',0,1,10,{tackle:1});return s;
}
