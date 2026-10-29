// Hand-built two-floor expedition used by the rule and save tests. All coordinates are literals.
import {friend,enemy,world,pos,row} from '../acceptance/fixtures.mjs';
/**
 * Floor 1: row x0..9 (y=1), goal G(8,1) already taken, down stairs (5,1), enemy E(9,1) 5 HP.
 * Floor 2 (stored): same row, up stairs (3,1), item T(8,1), wild w2a at (7,1) with 9/16 HP; only cells 2,3 revealed.
 */
export function expedition({a=pos(2),b=pos(4),c=pos(5),enemies=[enemy('E',9,1,5,'melee',4)],stored2={}}={}){
 const s=world({A:friend('A',a.x,a.y,20,{strong:2}),B:friend('B',b.x,b.y,20,{guard:2}),C:friend('C',c.x,c.y,20,{strong:2,line:2}),...Object.fromEntries(enemies.map(e=>[e.id,e]))},
  {floor:row(9),leader:'C',enemies:enemies.map(e=>e.id),points:[{pos:pos(8),kind:'goal',used:true},{pos:pos(5),kind:'down',used:false}]});
 s.scenario='expedition';s.goal=true;
 const x=enemy('w2a',7,1,9,'melee',4);x.maxHp=16;x.species='rattata';
 s.dungeon={seed:1,width:10,height:8,floors:2,level:1,stored:{'2':{floor:row(9),seen:['2,1','3,1'],enemies:['w2a'],units:{w2a:x},
  points:[{pos:pos(3),kind:'up',used:false},{pos:pos(8),kind:'item',used:false}],...stored2}}};
 return s;
}
