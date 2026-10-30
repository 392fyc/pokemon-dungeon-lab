import {createMain,createExpedition,jumpToFloor,friend,enemy,newcomer,reveal,clone,key,applyCommand,type World,type Pos} from './engine.ts';
import {newGameProfile,learnTm,setCarry,squadOf,type Profile} from './base.ts';
export const SCENARIOS=['main-invite','main-none','V1','V3','V4','V5','V6','V7','V8','V9','V10','V11','V12','V13','K1','K2','K3','K4','K5','BOSS','BOSSX'] as const;
/** Developer menu names for the scenarios that have one (the others show their id). */
export const SCENARIO_LABEL:Partial<Record<string,string>>={BOSS:'首领层（紧邻首领）',BOSSX:'首领层·前庭撤离'};
/** Scenarios that stand in for a base run need the profile their units come from. */
/** The boss scenes' profile: cyndaquil (leader, carries tackle and roar, so boss blowaway rejection can be tried) and mudkip. */
function bossProfile():Profile {
  const made=newGameProfile('cyndaquil','mudkip');if(!made.ok)throw Error(made.error);let p=made.profile;p={...p,vault:{...p.vault,roar:1}};
  const learned=learnTm(p,'P1','roar');if(!learned.ok)throw Error(learned.error);
  const carried=setCarry(learned.profile,'P1',['tackle','roar']);if(!carried.ok)throw Error(carried.error);
  return carried.profile;
}
export const scenarioProfile=(id:ScenarioId):Profile|undefined=>id==='BOSS'||id==='BOSSX'?bossProfile():undefined;
export type ScenarioId=typeof SCENARIOS[number];
const row=(a:number,b:number):Pos[]=>Array.from({length:b-a+1},(_,i)=>({x:a+i,y:1}));
const rect=(n:number):Pos[]=>Array.from({length:n*n},(_,i)=>({x:i%n+1,y:Math.floor(i/n)+1}));
/** A developer-scenario enemy: the roster species for its role, with the scenario's own explicit HP (the plain `enemy()` ignores the HP argument). */
function foe(id:string,x:number,y:number,hp:number,role:Parameters<typeof enemy>[4],damage:number,range=1){const e=enemy(id,x,y,hp,role,damage,range);e.hp=hp;e.maxHp=hp;return e;}
function fixture(runId:string,id:string,floor:Pos[],leader='A'):World{
  const s=createMain(runId,false);Object.assign(s,{scenario:id,floor,units:{},queue:['A','B','C'],enemies:[],camp:[],leader,points:[],seen:floor.map(key)});return s;
}
function waiting(s:World,ids=['N']):World {s.phase='invitation';s.anchor=clone(s.units[s.leader].pos);s.invitations=ids.map((id,i)=>({id:`${s.runId}:invite:${i+1}`,unit:newcomer(id),status:'pending'}));return s;}
export function createScenario(id:ScenarioId,runId:string):World {
  if(id==='main-invite'||id==='main-none')return createMain(runId,id==='main-invite');
  if(id==='V1'){
    let s=createMain(runId,false);for(const action of [{type:'move',to:{x:3,y:1}},{type:'basic',target:'E'},{type:'basic',target:'E'},{type:'basic',target:'E'},{type:'move',to:{x:4,y:1}},{type:'interact',exit:false},{type:'move',to:{x:5,y:1}}] as const){const r=applyCommand(s,{type:'round',action});if(!r.ok)throw Error(r.error);s=r.state;}s.scenario=id;return s;
  }
  if(id==='BOSS'||id==='BOSSX'){
    // 7.3 developer scene: the last floor of a boss-marked 3 floor run. BOSS: the whole floor revealed, the team beside the boss. BOSSX: the team standing on the lobby exit.
    let w=jumpToFloor(createExpedition(runId,7,3,squadOf(bossProfile()),0),3);w.scenario='expedition';
    const ids=w.queue,boss=w.units.boss;
    if(id==='BOSS'){
      const spots=[{x:boss.pos!.x-1,y:boss.pos!.y},{x:boss.pos!.x+1,y:boss.pos!.y},{x:boss.pos!.x,y:boss.pos!.y-1}];
      ids.forEach((u,i)=>{w.units[u].pos=spots[i];});w.leader=ids[0];w.seen=w.floor.map(key);
    }else{
      const exit=w.points.find(p=>p.kind==='exit')!.pos;w.units[w.leader].pos=clone(exit);
      const near=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}].map(d=>({x:exit.x+d.x,y:exit.y+d.y})).find(c=>w.floor.some(f=>f.x===c.x&&f.y===c.y)&&!ids.some(u=>w.units[u].pos&&w.units[u].pos!.x===c.x&&w.units[u].pos!.y===c.y));
      ids.filter(u=>u!==w.leader).forEach(u=>{w.units[u].pos=near??null;});reveal(w);
    }
    return w;
  }
  const open=['V8','V9','V10','K1','K2','K3'].includes(id);
  const s=fixture(runId,id,open?rect(id==='V8'?5:4):row(0,id.startsWith('K')?5:9));
  if(id==='V3') {s.floor=row(0,4);s.units={A:friend('A',3,1,10),B:friend('B',2,1,10),C:friend('C',1,1,10)};s.leader='C';s.points=[{pos:{x:0,y:1},kind:'exit',used:false}];}
  if(id==='V4'){s.floor=[...row(0,3),{x:2,y:2},{x:3,y:2}];s.units={A:friend('A',3,1,10),B:friend('B',1,1,10),C:friend('C',2,1,10)};}
  if(id==='V5'||id==='V6'){s.floor=row(0,4);s.units={A:friend('A',2,1,0),B:friend('B',1,1,id==='V6'?3:8),C:friend('C',0,1,8),E:foe('E',3,1,6,'chase',id==='V5'?0:3)};s.enemies=['E'];s.leader='B';}
  if(id==='V7'){s.floor=row(0,4);s.units={A:friend('A',2,1,0),B:friend('B',0,1,8),C:friend('C',1,1,8)};s.leader='B';s.points=[{pos:{x:0,y:1},kind:'exit',used:false}];}
  if(id==='V8'||id==='V9'||id==='V10'){
    s.units={A:friend('A',2,2,id==='V10'?10:20,{tackle:2}),B:friend('B',id==='V8'?1:2,id==='V8'?2:3,id==='V10'?10:20,{protect:2}),C:friend('C',4,2,id==='V10'?10:0,{tackle:2,quickattack:2})};
    if(id==='V8'){for(const [i,p] of [{x:3,y:2},{x:2,y:3},{x:2,y:1}].entries()){const e=foe('block'+i,p.x,p.y,20,'melee',0);s.units[e.id]=e;s.enemies.push(e.id);}}
    waiting(s,id==='V10'?['N1','N2']:['N']);
  }
  if(id==='V11'||id==='V12'){
    const t=createMain(runId,false);t.scenario=id;t.round=10;t.goal=true;t.points[0].used=true;t.units.E.hp=0;t.units.E.pos=null;
    t.units.A.pos=id==='V12'?null:{x:4,y:1};t.units.A.hp=id==='V12'?0:20;t.units.B.pos={x:7,y:1};t.units.B.hp=1;t.units.B.pp={tackle:1};t.units.B.maxPp={tackle:2};t.units.B.learned=['tackle'];delete t.units.R;t.units.H=foe('H',8,1,60,'melee',4);t.enemies=['E','H'];
    t.units.C.hp=8;t.units.C.pos=null;t.camp=['C'];t.units.N=newcomer();t.units.N.hp=id==='V12'?0:10;t.units.N.pos=id==='V12'?null:{x:6,y:1};t.queue=['A','B','N'];t.leader='B';t.seen=t.floor.map(key);return t;
  }
  if(id==='V13'){
    s.units={A:friend('A',2,1,20,{tackle:2}),B:friend('B',4,1,20,{protect:2}),C:friend('C',5,1,8,{tackle:2,quickattack:2}),E:foe('E',3,1,6,'melee',4)};
    s.units.E.recruit=newcomer();s.enemies=['E'];s.leader='B';s.points=[{pos:{x:4,y:1},kind:'goal',used:false}];
  }
  if(id==='K1'||id==='K2'||id==='K3'){
    s.units={A:friend('A',2,2,12,{tackle:2}),B:friend('B',1,2,12,{protect:1}),C:friend('C',3,3,10,{tackle:2,quickattack:1}),H:foe('H',3,2,24,'chase',8)};s.enemies=['H'];
    if(id!=='K1'){s.units.D=friend('D',3,3,4,{tackle:1,roar:1});s.units.D.maxHp=8;s.units.C.pos=null;s.camp=['C'];s.queue=['A','B','D'];}
    if(id==='K3')s.floor=s.floor.filter(p=>p.x!==3||p.y!==1);
  }
  if(id==='K4'){s.units={A:friend('A',2,1,20,{quickattack:1}),B:friend('B',3,1,20),C:friend('C',0,1,0),R:foe('R',5,1,6,'ranged',6,3)};s.enemies=['R'];}
  if(id==='K5'){
    s.units={A:friend('A',0,1,12,{tackle:2}),B:friend('B',1,1,12,{protect:1}),C:friend('C',2,1,2,{tackle:0,quickattack:1}),R:foe('R',5,1,6,'ranged',6,4)};s.leader='C';s.enemies=['R'];waiting(s,['Q']);s.invitations[0].unit=friend('Q',0,1,10,{tackle:1});
  }
  s.seen=s.floor.map(key);reveal(s);return s;
}
