import {createMain,friend,enemy,newcomer,reveal,clone,key,applyCommand,type World,type Pos} from './engine.ts';
export const SCENARIOS=['main-invite','main-none','V1','V3','V4','V5','V6','V7','V8','V9','V10','V11','V12','V13','K1','K2','K3','K4','K5'] as const;
export type ScenarioId=typeof SCENARIOS[number];
const row=(a:number,b:number):Pos[]=>Array.from({length:b-a+1},(_,i)=>({x:a+i,y:1}));
const rect=(n:number):Pos[]=>Array.from({length:n*n},(_,i)=>({x:i%n+1,y:Math.floor(i/n)+1}));
function fixture(runId:string,id:string,floor:Pos[],leader='A'):World{
  const s=createMain(runId,false);Object.assign(s,{scenario:id,floor,units:{},queue:['A','B','C'],enemies:[],camp:[],leader,points:[],seen:floor.map(key)});return s;
}
function waiting(s:World,ids=['N']):World {s.phase='invitation';s.anchor=clone(s.units[s.leader].pos);s.invitations=ids.map((id,i)=>({id:`${s.runId}:invite:${i+1}`,unit:newcomer(id),status:'pending'}));return s;}
export function createScenario(id:ScenarioId,runId:string):World {
  if(id==='main-invite'||id==='main-none')return createMain(runId,id==='main-invite');
  if(id==='V1'){
    let s=createMain(runId,false);for(const action of [{type:'move',to:{x:3,y:1}},{type:'basic',target:'E'},{type:'basic',target:'E'},{type:'basic',target:'E'},{type:'move',to:{x:4,y:1}},{type:'interact',exit:false},{type:'move',to:{x:5,y:1}}] as const){const r=applyCommand(s,{type:'round',action});if(!r.ok)throw Error(r.error);s=r.state;}s.scenario=id;return s;
  }
  const open=['V8','V9','V10','K1','K2','K3'].includes(id);
  const s=fixture(runId,id,open?rect(id==='V8'?5:4):row(0,id.startsWith('K')?5:9));
  if(id==='V3') {s.floor=row(0,4);s.units={A:friend('A',3,1,10),B:friend('B',2,1,10),C:friend('C',1,1,10)};s.leader='C';s.points=[{pos:{x:0,y:1},kind:'exit',used:false}];}
  if(id==='V4'){s.floor=[...row(0,3),{x:2,y:2},{x:3,y:2}];s.units={A:friend('A',3,1,10),B:friend('B',1,1,10),C:friend('C',2,1,10)};}
  if(id==='V5'||id==='V6'){s.floor=row(0,4);s.units={A:friend('A',2,1,0),B:friend('B',1,1,id==='V6'?3:8),C:friend('C',0,1,8),E:enemy('E',3,1,6,'chase',3)};s.enemies=['E'];s.leader='B';}
  if(id==='V7'){s.floor=row(0,4);s.units={A:friend('A',2,1,0),B:friend('B',0,1,8),C:friend('C',1,1,8)};s.leader='B';s.points=[{pos:{x:0,y:1},kind:'exit',used:false}];}
  if(id==='V8'||id==='V9'||id==='V10'){
    s.units={A:friend('A',2,2,id==='V10'?10:20,{strong:2}),B:friend('B',id==='V8'?1:2,id==='V8'?2:3,id==='V10'?10:20,{guard:2}),C:friend('C',4,2,id==='V10'?10:0,{strong:2,line:2})};
    if(id==='V8'){for(const [i,p] of [{x:3,y:2},{x:2,y:3},{x:2,y:1}].entries()){const e=enemy('block'+i,p.x,p.y,20,'melee',0);s.units[e.id]=e;s.enemies.push(e.id);}}
    waiting(s,id==='V10'?['N1','N2']:['N']);
  }
  if(id==='V11'||id==='V12'){
    const t=createMain(runId,false);t.scenario=id;t.round=10;t.goal=true;t.points[0].used=true;t.units.E.hp=0;t.units.E.pos=null;
    t.units.A.pos=id==='V12'?null:{x:4,y:1};t.units.A.hp=id==='V12'?0:20;t.units.B.pos={x:7,y:1};t.units.B.hp=2;
    t.units.C.hp=8;t.units.C.pos=null;t.camp=['C'];t.units.N=newcomer();t.units.N.hp=id==='V12'?0:10;t.units.N.pos=id==='V12'?null:{x:6,y:1};t.queue=['A','B','N'];t.leader='B';t.seen=t.floor.map(key);return t;
  }
  if(id==='V13'){
    s.units={A:friend('A',2,1,20,{strong:2}),B:friend('B',4,1,20,{guard:2}),C:friend('C',5,1,8,{strong:2,line:2}),E:enemy('E',3,1,6,'melee',4)};
    s.units.E.recruit=newcomer();s.enemies=['E'];s.leader='B';s.points=[{pos:{x:4,y:1},kind:'goal',used:false}];
  }
  if(id==='K1'||id==='K2'||id==='K3'){
    s.units={A:friend('A',2,2,12,{strong:2}),B:friend('B',1,2,12,{guard:1}),C:friend('C',3,3,10,{strong:2,line:1}),H:enemy('H',3,2,24,'chase',8)};s.enemies=['H'];
    if(id!=='K1'){s.units.D=friend('D',3,3,4,{strong:1,push:1});s.units.D.maxHp=8;s.units.C.pos=null;s.camp=['C'];s.queue=['A','B','D'];}
    if(id==='K3')s.floor=s.floor.filter(p=>p.x!==3||p.y!==1);
  }
  if(id==='K4'){s.units={A:friend('A',2,1,20,{line:1}),B:friend('B',3,1,20),C:friend('C',0,1,0),R:enemy('R',5,1,6,'ranged',6,3)};s.enemies=['R'];}
  if(id==='K5'){
    s.units={A:friend('A',0,1,12,{strong:2}),B:friend('B',1,1,12,{guard:1}),C:friend('C',2,1,2,{strong:0,line:1}),R:enemy('R',5,1,6,'ranged',6,4)};s.leader='C';s.enemies=['R'];waiting(s,['Q']);s.invitations[0].unit=friend('Q',0,1,10,{strong:1});
  }
  s.seen=s.floor.map(key);reveal(s);return s;
}
