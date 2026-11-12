/** The centre banner shown for a moment after a defeat or an invitation. Pure, so a Node test can check when it appears. */
import type {World} from '../core/engine.ts';
import {unitLabel} from '../core/describe.ts';
export type ResultBanner={text:string;ms:number};
export function resultBanner(before:World,after:World,animated:boolean):ResultBanner|null{
 if(!animated||before.phase!=='playing'||after.phase==='playing')return null;
 const bossDown=before.enemies.some(id=>before.units[id]?.boss&&before.units[id].hp>0)&&!after.enemies.some(id=>after.units[id]?.boss&&after.units[id].hp>0);
 // The boss banner appears once, at the moment of the kill, even when a level-up (learning, evolution) or a choice panel comes first.
 if(bossDown||(after.phase==='ended'&&after.end?.outcome==='won'))return {text:'击败了首领',ms:2000};
 if(after.phase!=='invitation'&&after.phase!=='ended')return null;
 if(after.phase==='ended')return after.end?.outcome==='wipe'?{text:'队伍全灭',ms:2000}:null;
 const pending=after.invitations.find(i=>i.status==='pending');
 return pending?{text:`${unitLabel(pending.unit,pending.unit.id)}想加入队伍`,ms:1200}:null;
}
