/* PR 214 review: the boss-defeat banner appears once, also when a level-up (learning, evolution) or a choice panel comes before the settlement. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {resultBanner} from '../../src/render/result-banner.ts';

const unit=(id,extra={})=>({id,hp:10,maxHp:10,pos:{x:1,y:1},...extra});
const before={phase:'playing',enemies:['B','E'],units:{B:unit('B',{boss:true}),E:unit('E')},invitations:[]};
const after=(phase,extra={})=>({phase,enemies:['B','E'],units:{B:unit('B',{boss:true,hp:0,pos:null}),E:unit('E')},invitations:[],...extra});
test('boss kill followed by a level-up panel shows the boss banner immediately, once',()=>{
 for(const phase of ['learning','evolution','blessing','tmChoice','invitation','ended'])assert.equal(resultBanner(before,after(phase,{end:{outcome:'won'}}),true)?.text,'击败了首领',phase);
 // the command that answers the learning panel starts in phase 'learning', so there is no second banner
 assert.equal(resultBanner({...before,phase:'learning'},after('ended',{end:{outcome:'won'}}),true),null);
});
test('wipe, invitation and animation-off cases',()=>{
 const wipeBefore={...before,units:{B:unit('B',{boss:true}),E:unit('E')}};
 assert.equal(resultBanner(wipeBefore,{phase:'ended',enemies:['B'],units:{B:unit('B',{boss:true})},invitations:[],end:{outcome:'wipe'}},true)?.text,'队伍全灭');
 const inv=resultBanner({...before,enemies:['E'],units:{E:unit('E')}},{phase:'invitation',enemies:['E'],units:{E:unit('E',{hp:0})},invitations:[{status:'pending',unit:{id:'N',species:'oddish',hp:5,maxHp:5}}]},true);
 assert.match(inv?.text??'',/想加入队伍$/);assert.equal(inv.ms,1200);
 assert.equal(resultBanner(before,after('ended',{end:{outcome:'won'}}),false),null,'no banner when animation is off');
 assert.equal(resultBanner(before,{...before,phase:'playing'},true),null);
});
