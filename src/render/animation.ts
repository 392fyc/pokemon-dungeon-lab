import {key,same,stageOf,STAGE_NAMES,STATUS_NAMES,type StageKey,type StatusId,type Command,type Item,type Pos,type RoundEvent,type World} from '../core/engine.ts';
import {moveOf} from '../core/moves.ts';
import {typeEffectiveness} from '../core/type-chart.ts';
import {SPECIES} from '../core/roster.ts';
import {damageNumberColor,effectForMove,type EffectStyle} from './effect-spec.ts';
import {adjacentReachable, floorIndex, rayReachable} from './reach.ts';
/**
 * Stage 6.4 presentation: works out what happened in one round from the two saved states and the round's structured
 * events (`World.events`, written by the engine in the same order as the log; the log text is never read here).
 * Pure data in, pure data out. It never touches rule code and never changes either state.
 *
 * Why inference: `applyCommand` returns only the final state. What each event says is reliable (who moved, who was
 * hurt, who used an item); who dealt a hit is not recorded, so it is inferred (see `friendAttacker` / `enemyAttacker`).
 * A wrong guess only changes which sprite swings, never the rule result, and the final paint always shows the true state.
 */
export type Fx = 'strong' | 'line' | null;
export type AnimEvent =
  | {k:'move'; by:string; id:string; from:Pos; to:Pos}
  | {k:'airAttack';by:string;actor:string;from:Pos;to:Pos}
  | {k:'swap'; by:string; a:string; b:string; pa:Pos; pb:Pos}
  | {k:'hit'; by:string; attacker:string|null; target:string; from:Pos|null; at:Pos; fx:Fx; amount:number; dead:boolean; effect?:EffectStyle; cast?:string; collision?:true; immune?:true; /** a critical hit, from the engine's note on the line after the damage */ crit?:true; /** the colour of the damage number: the move's type colour, absent for a plain attack */ tint?:string; /** the target's HP once this hit has landed, so the interface can update it at the moment of impact */ hpAfter?:number}
  | {k:'protect'; by:string; target:string; from:Pos; at:Pos; effect?:EffectStyle}
  | {k:'blowaway'; by:string; target:string; actorAt:Pos; from:Pos; to:Pos; effect?:EffectStyle; cast?:string}
  | {k:'heal'; by:string; target:string; item:Item; amount:number; at:Pos; actorAt:Pos; effect?:EffectStyle; hpAfter?:number}
  | {k:'effect'; by:string; from:Pos; at:Pos; target:string; effect:EffectStyle; amount?:number; hpAfter?:number}
  /** HP lost to a status or recoil, or regained by draining: shown (and the HP updated) when it happens, not at the end of the round. */
  | {k:'hpchange'; by:string; target:string; at:Pos; delta:number; hpAfter:number}
  /** Short words over units whose ability stages or statuses changed in this round ("攻击↑", "麻痹", "睡眠×"), all shown together once the round's other steps are done. */
  | {k:'tags'; by:string; items:StageTag[]};
export type StageTag={target:string; at:Pos; text:string; color:string};

/** Colours: a raised stage is warm, a lowered one cool (the arrows of the main games are red and blue); each status keeps its usual colour, and a status that ended is pale. */
export const TAG_COLORS={up:'#ff9a62',down:'#6fb7ff',ended:'#c8d0d0',psn:'#c985f0',tox:'#c985f0',brn:'#ffa24a',par:'#ffe14d',frz:'#8fe6ff',slp:'#cdd6e6',nap:'#cdd6e6',confusion:'#ff85d4',flinch:'#e4e4e4'} as const;
/** What changed on each living, visible unit between the two states: ability-stage steps (one arrow per step, at most three) and statuses that appeared or ended. */
export function stageTags(b:World,a:World,visible:(p:Pos|null)=>boolean):StageTag[] {
  const tags:StageTag[]=[];
  for(const id of [...a.queue,...a.enemies]){
    const was=b.units[id],now=a.units[id];
    if(!was||!now||now.hp<=0||!now.pos||(now.side!=='friend'&&!visible(now.pos)))continue;
    const at={...now.pos},seen=new Set<string>(),add=(text:string,color:string)=>{if(seen.has(text))return;seen.add(text);tags.push({target:id,at,text,color});};
    for(const k of Object.keys(STAGE_NAMES) as StageKey[]){
      const d=stageOf(now,k)-stageOf(was,k);
      if(d!==0)add(STAGE_NAMES[k]+(d>0?'↑':'↓').repeat(Math.min(3,Math.abs(d))),d>0?TAG_COLORS.up:TAG_COLORS.down);
    }
    for(const k of Object.keys(STATUS_NAMES) as StatusId[]){
      const had=!!was.status?.[k],has=!!now.status?.[k];
      if(has&&!had)add(STATUS_NAMES[k],TAG_COLORS[k]);
      else if(had&&!has)add(STATUS_NAMES[k]+'×',TAG_COLORS.ended);
    }
    if(was.asleep&&!now.asleep&&!now.status?.slp&&!now.status?.nap)add('睡眠×',TAG_COLORS.ended);
  }
  return tags;
}

/** Log lines added by the last command. The log keeps only the last 80 lines, so the old and new logs may be shifted. */
export function newLines(before:string[], after:string[]):string[] {
  for (let drop = 0; drop <= before.length; drop++) {
    const keep = before.length - drop;
    if (keep > after.length) continue;
    let ok = true;
    for (let i = 0; i < keep && ok; i++) ok = before[drop + i] === after[i];
    if (ok) return after.slice(keep);
  }
  return [];
}

const ENEMY_ORDER = 1000;
export function inferEvents(b:World, a:World, cmd:Command):AnimEvent[] {
  // Only a normal round on the same floor of the same run is played; every other change is shown as the final state.
  if (cmd.type !== 'round' || a.runId !== b.runId || a.round !== b.round + 1 || a.dungeon?.level !== b.dungeon?.level) return [];
  const airAttacks=(a.events??[]).filter((e):e is Extract<NonNullable<World['events']>[number],{type:'airAttack'}>=>e.type==='airAttack');
  const evs:RoundEvent[]=a.events??[];
  const pos:Record<string, Pos|null> = {}, hp:Record<string, number> = {};
  for (const [id, u] of Object.entries(b.units)) { pos[id] = u.pos ? {...u.pos} : null; hp[id] = u.hp; }
  const seen = new Set(a.seen); // never wider than the final visible set, so nothing hidden is revealed by the animation
  const vis = (p:Pos|null):p is Pos => !!p && seen.has(key(p));
  const order = (id:string) => { const i = b.queue.indexOf(id),enemy=b.enemies.indexOf(id); return i >= 0 ? i : ENEMY_ORDER+(enemy>=0?enemy:b.enemies.length); };
  const explicit = (id:string) => id === b.leader ? cmd.action : cmd.override?.actor === id ? cmd.override.action : null;
  /** One decreased PP slot identifies the move that really ran; ambiguous multi-slot changes stay unattributed. */
  const spentMove = (id:string):string|null => {
    const before=b.units[id],after=a.units[id];if(!before||!after)return null;
    const used=before.learned.filter(move=>(before.pp[move]??0)>(after.pp[move]??0));
    if(used.length!==1)return null;
    if(used[0]!=='sleeptalk')return used[0];
    const trigger=evs.find((e):e is Extract<RoundEvent,{type:'sleeptalk'}>=>e.type==='sleeptalk'&&e.unit===id);
    return trigger?.skill??null;
  };
  const spentAnyPp=(id:string):boolean=>{
    const before=b.units[id],after=a.units[id];
    return !!before&&!!after&&before.learned.some(move=>(before.pp[move]??0)>(after.pp[move]??0));
  };
  const fxForMove = (move:string):'strong'|'line' => {
    const range=moveOf(move)?.range;
    return range==='front2'||range==='line10'?'line':'strong';
  };
  const isDamageMove=(move:string|null)=>!!move&&(moveOf(move)?.effects.includes('damage')||move==='snore');
  const chebyshev=(x:Pos,y:Pos)=>Math.max(Math.abs(x.x-y.x),Math.abs(x.y-y.y));
  const floorCells=floorIndex(b.floor);
  const inRoom=(p:Pos,r:{x:number;y:number;w:number;h:number})=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;
  const canSkillHit=(actorId:string,targetId:string,move:string,positions=pos,health=hp):boolean=>{
    const actor=b.units[actorId],target=b.units[targetId],actorAt=positions[actorId],targetAt=positions[targetId],spec=moveOf(move);
    if(!actor||!target||!actorAt||!targetAt||!spec)return false;
    const allies=actor.side==='friend'?b.queue:b.enemies,opponents=actor.side==='friend'?b.enemies:b.queue;
    const category=spec.target==='enemy'?target.side!==actor.side&&opponents.includes(targetId):
      spec.target==='user'?targetId===actorId:
      spec.target==='teammates'?target.side===actor.side&&targetId!==actorId&&allies.includes(targetId):
      spec.target==='party'?target.side===actor.side&&allies.includes(targetId):
      allies.includes(targetId)||opponents.includes(targetId);
    if(!category)return false;
    switch(spec.range){
      case 'user':return targetId===actorId;
      case 'front':return adjacentReachable(floorCells,actorAt,targetAt);
      case 'around':return targetId!==actorId&&adjacentReachable(floorCells,actorAt,targetAt);
      case 'room':{
        const room=b.rooms?.find(r=>inRoom(actorAt,r));
        return room?inRoom(targetAt,room):chebyshev(actorAt,targetAt)<=2;
      }
      case 'front2':case 'line10':{
        const range=spec.range==='front2'?2:10;
        const occupied=new Set([...b.queue,...b.enemies]
          .filter(id=>id!==actorId&&id!==targetId&&health[id]>0&&positions[id])
          .map(id=>key(positions[id]!)));
        return rayReachable(floorCells,occupied,actorAt,targetAt,range);
      }
    }
  };
  const events:AnimEvent[] = [];
  const used = new Set<string>(airAttacks.map(e=>e.actor));
  let enemyCursor = -1;
  const castActors=new Set<string>();
  const hasCounterState=Object.values(b.units).some(unit=>unit.hp>0&&(unit.counter??0)>0);
  const styleFor=(move:string|null,target:string,actualDamage=0):EffectStyle|null=>{
    const style=effectForMove(move);if(!style||move===null||actualDamage<=0||!isDamageMove(move))return style;
    const species=SPECIES[a.units[target]?.species??b.units[target]?.species??''];
    const effectiveness=typeEffectiveness(move,species?.types??[]);
    return effectiveness>1?{...style,superEffective:true}:effectiveness>0&&effectiveness<1?{...style,resisted:true}:style;
  };

  // Protect's shield log has no position of its own, so place the effect by queue order.
  const protects:{idx:number; ev:AnimEvent}[] = [];
  for (const id of [...b.queue,...b.enemies]) {
    const e = explicit(id), u = b.units[id], move=spentMove(id);
    // A planned action may never run (for example, an earlier blowaway collision knocks this member out).
    // Keep an effect only when the rule log confirms it happened, even if the member falls afterward.
    if (move && moveOf(move)?.effects.includes('protect') && u.hp > 0 &&
      (evs.some(e=>e.type==='guard'&&e.kind==='protect'&&e.unit===id)||(a.units[id]?.protect??0)>(b.units[id]?.protect??0)))
      protects.push({idx:order(id), ev:{k:'protect', by:id, target:e?.type==='skill'?e.target:id, from:{x:0, y:0}, at:{x:0, y:0}, effect:effectForMove(move)??undefined}});
  }
  const flush = (upTo:number) => {
    while (protects.length && protects[0].idx < upTo) {
      const g = protects.shift()!.ev;
      if (g.k !== 'protect') continue;
      const from = pos[g.by], at = pos[g.target];
      used.add(g.by);
      if (from && at && (b.units[g.by]?.side==='friend'||vis(at))) events.push({...g, from, at});
    }
  };
  const emit = (ev:AnimEvent) => { flush(order(ev.by)); used.add(ev.by); events.push(ev); };

  const friendAttacker = (target:string):{id:string; fx:'strong'|'line'; move:string|null}|null => {
    if(hasCounterState)return null;
    const candidates:{id:string;fx:'strong'|'line';move:string|null}[]=[];
    for (const id of b.queue) {
      if (b.units[id].hp <= 0 || !pos[id] || (used.has(id)&&castActors.has(id))) continue;
      const e = explicit(id);
      const move=spentMove(id),spec=move?moveOf(move):undefined;
      if(move&&spec&&isDamageMove(move)){
        const repeatable=spec.range==='around'||spec.range==='room';
        if((!used.has(id)||repeatable)&&canSkillHit(id,target,move)&&(!e||e.type!=='skill'||e.skill===move))candidates.push({id,fx:fxForMove(move),move});
        continue;
      }
      if(spentAnyPp(id))continue;
      if(used.has(id))continue;
      if (e) {
        if (e.type === 'basic' && e.target === target)candidates.push({id,fx:'strong',move:null});
        if(e.type==='basicForward'&&pos[target]&&adjacentReachable(floorCells,pos[id]!,pos[target]!))candidates.push({id,fx:'strong',move:null});
      } else if (pos[target] && adjacentReachable(floorCells,pos[id]!,pos[target]!)) candidates.push({id,fx:'strong',move:null});
    }
    return candidates[0]??null;
  };
  const enemyAttacker = (target:string):{id:string; move:string|null}|null => {
    if(hasCounterState)return null;
    const t = pos[target];
    if (!t) return null;
    // Room and around moves can hit several units; retain the same actual move for each target.
    if(enemyCursor>=0){
      const id=b.enemies[enemyCursor],move=spentMove(id),range=move?moveOf(move)?.range:undefined;
      if(move&&(range==='room'||range==='around')&&canSkillHit(id,target,move))return {id,move};
    }
    const candidates:{id:string;move:string|null;index:number}[]=[];
    for (let i = enemyCursor + 1; i < b.enemies.length; i++) {
      const id = b.enemies[i], p = pos[id];
      // Sleeping and just-woken enemies skip their turn without a log line (engine enemy phase). A born-asleep enemy that a move put to sleep this round has its flags cleared by the engine
      // (`出生时的睡眠转为…`), so a later hit that wakes it leaves it free to act; one still under the sleep status does not.
      const converted = evs.some(e=>e.type==='sleepConverted'&&e.unit===id), stillAsleep = !!(a.units[id]?.status?.slp || a.units[id]?.status?.nap);
      if (!p || hp[id] <= 0 || used.has(id) || (converted ? stillAsleep : (b.units[id].asleep || b.units[id].wakeSkip))) continue;
      const move=spentMove(id),spec=move?moveOf(move):undefined;
      if(move&&isDamageMove(move)&&canSkillHit(id,target,move))candidates.push({id,move,index:i});
      else if(!spentAnyPp(id)&&adjacentReachable(floorCells,p,t))candidates.push({id,move:null,index:i});
    }
    if(!candidates.length)return null;
    enemyCursor=candidates[0].index;return {id:candidates[0].id,move:candidates[0].move};
  };

  const collisionVictims=new Map<string,{left:number;by:string;cast?:string}>();
  type Cast={by:string;move:string;index:number;positions:Record<string, Pos|null>;health:Record<string, number>;hit:Set<string>;/** a snore or sleep-talk answer: the engine aims it at the attacker without a range check */reaction?:boolean};
  const casts:Cast[]=[];let activeCast:Cast|null=null;
  // A sleeper's snore or sleep-talk answers a hit in the middle of someone else's cast; the answered cast resumes afterwards.
  const reactionStack:Cast[]=[];
  // A confused unit's strike has no target event of its own: the very next damage event names the striker (`hpLoss.strike`); this says whether the striker's latest strike may be credited.
  const strikeCredit=new Map<string,boolean>();
  const isAreaCast=(c:Cast)=>['room','around'].includes(moveOf(c.move)?.range??'');
  const claims=(c:Cast|null,target:string):c is Cast=>!!c&&isDamageMove(c.move)&&!c.hit.has(target)&&(c.hit.size===0||isAreaCast(c))&&(c.reaction?c.hit.size===0&&b.units[target]?.side!==b.units[c.by]?.side:canSkillHit(c.by,target,c.move,c.positions,c.health));

  for (let i = 0; i < evs.length; i++) {
    const ev = evs[i];
    // The unit whose own action the event belongs to; events without one (status, damage, pickup) are not played here.
    const id = 'unit' in ev ? ev.unit : ev.type==='miss'||ev.type==='immune'||ev.type==='airAttack' ? ev.actor : null;
    if (id === null) continue;
    const unit = a.units[id] ?? b.units[id];
    if (!unit) continue;
    if (ev.type==='cast') {
      const move=b.units[id]?.learned.includes(ev.skill)?ev.skill:undefined;
      const answer=!!move&&(move==='snore'||!!ev.viaSleeptalk);
      const reaction=answer&&!!activeCast&&id!==activeCast.by;
      if(reaction)reactionStack.push(activeCast!);else reactionStack.length=0;
      activeCast=move?{by:id,move,index:i,positions:Object.fromEntries(Object.entries(pos).map(([id,at])=>[id,at?{...at}:null])),health:{...hp},hit:new Set(),...(answer?{reaction:true}:{})}:null;
      if(activeCast){casts.push(activeCast);castActors.add(id);used.add(id);}
      continue;
    }
    // A target the move cannot affect (immune) is still hit by the move: the engine says so with an `immune` event, shown as a hit that does nothing (never as a miss).
    if (ev.type==='immune') {
      if(!activeCast||activeCast.by!==id||activeCast.move!==ev.skill)continue;
      const move=activeCast.move,at=pos[ev.target],from=pos[id],tUnit=a.units[ev.target]??b.units[ev.target];if(!at||!tUnit)continue;
      activeCast.hit.add(ev.target);
      if(tUnit.side!=='friend'&&!vis(at))continue;
      const shown=vis(from)?from:null,effect=shown?styleFor(move,ev.target,0)??undefined:undefined;
      emit({k:'hit',by:id,attacker:shown?id:null,target:ev.target,from:shown,at,fx:shown?fxForMove(move):null,amount:0,dead:false,immune:true,...(effect?{effect}:{})});
      continue;
    }
    if (ev.type==='miss'&&ev.skill!==null&&activeCast&&id===activeCast.by&&ev.skill===activeCast.move&&b.units[ev.target])activeCast.hit.add(ev.target);
    // A unit whose action ended without a credited hit has still used its action, so a later hit on a target is not its work.
    const spentWithoutHit=ev.type==='fail'||(ev.type==='miss'&&ev.skill===null);
    if (spentWithoutHit) used.add(id);
    // A status move stopped by a guard writes nothing after this event, so only a damaging action may claim the next damage event.
    if (ev.type==='confusedStrike'){used.add(id);strikeCredit.set(id,activeCast?.by!==id||isDamageMove(activeCast.move));}
    // The cast is over when the events say so: a confused cast that found nothing, or another unit's own action starts.
    if (activeCast&&((id===activeCast.by&&ev.type==='castNoTarget')||(id!==activeCast.by&&(spentWithoutHit||ev.type==='move'||ev.type==='airAttack'||ev.type==='swap'||ev.type==='confusedStrike'||(ev.type==='itemUse'&&ev.target!==undefined))))){activeCast=null;reactionStack.length=0;}
    // An item used on the room or the party is the unit's own action: it ends whatever cast was running.
    if (ev.type==='itemUse'&&ev.target===undefined) { activeCast=null; reactionStack.length=0; }
    if (ev.type==='move') {
      const from = pos[id], to = {...ev.to};
      if (from && (unit.side === 'friend' || (vis(from) && vis(to)))) emit({k:'move', by:id, id, from, to});
      pos[id] = to;
    } else if (ev.type==='blowaway') {
      const t = ev.target;
      const from = pos[t], actorAt = pos[id], to={...ev.to};
      if (from && actorAt) {
        const move=spentMove(id);
        const effect=move?styleFor(move,t)??undefined:undefined;
        if (vis(from)) {
          emit({k:'blowaway', by:id, target:t, actorAt:vis(actorAt)?actorAt:from, from, to, ...(effect&&vis(actorAt)?{effect}:{}),...(move?{cast:move}:{})});
        }
        const delta={x:Math.sign(from.x-actorAt.x),y:Math.sign(from.y-actorAt.y)},ahead={x:to.x+delta.x,y:to.y+delta.y};
        if(chebyshev(from,to)<10){
          const collision={left:1,by:id,...(move?{cast:move}:{})};
          if(!floorCells.has(key(ahead))||!adjacentReachable(floorCells,to,ahead))collisionVictims.set(t,collision);
          else for(const other of [...b.queue,...b.enemies])if(other!==t&&pos[other]&&same(pos[other]!,ahead)){
            collisionVictims.set(t,collision);collisionVictims.set(other,collision);break;
          }
        }
        pos[t] = to;
      }
    } else if (ev.type==='swap') {
      const o = ev.mate;
      if (pos[id] && pos[o]) { const pa = pos[id]!, pb = pos[o]!; emit({k:'swap', by:id, a:id, b:o, pa, pb}); used.add(o); pos[id] = pb; pos[o] = pa; }
    } else if (ev.type==='hpLoss' && !ev.cause) {
      // A Reviver Seed answers the same blow: the unit stays on the map at its restored HP and is not shown as fallen.
      const at = pos[id], revived = ev.revive!==undefined, dead = ev.hp===0 && !revived;
      const remaining=ev.hp,amount=remaining>0?ev.amount:Math.min(ev.amount,Math.max(0,hp[id]??0));
      const hpAfter=revived?ev.revive!:remaining;
      const crit=!!ev.crit;
      const strike=ev.strike&&strikeCredit.get(ev.strike)?ev.strike:null;
      hp[id] = remaining;
      const collision=collisionVictims.get(id);
      if(collision){if(collision.left<=1)collisionVictims.delete(id);else collisionVictims.set(id,{...collision,left:collision.left-1});}
      damage: if (at && (unit.side === 'friend' || vis(at))) {
        if(collision){emit({k:'hit',by:collision.by,attacker:null,target:id,from:null,at,fx:null,amount,dead,hpAfter,collision:true,...(collision.cast?{cast:collision.cast}:{})});if(dead)pos[id]=null;break damage;}
        let attacker:string|null = null, from:Pos|null = null, fx:Fx = 'strong', by = '', move:string|null=null;
        if(reactionStack.length&&activeCast&&!claims(activeCast,id)&&claims(reactionStack[reactionStack.length-1],id))activeCast=reactionStack.pop()!;
        const cast=activeCast;
        if(strike){
          const own=cast&&cast.by===strike&&isDamageMove(cast.move)?cast:null,origin=own?own.positions[strike]:pos[strike];
          by=strike;move=own?.move??null;own?.hit.add(id);
          if(vis(origin)){attacker=strike;from=origin;fx=move?fxForMove(move):'strong';}else fx=null;
          if(own)activeCast=null;
        } else if(claims(cast,id)){
          by=cast.by;move=cast.move;cast.hit.add(id);if(vis(cast.positions[by])){attacker=by;from=cast.positions[by];fx=fxForMove(move);}else fx=null;
        } else if (unit.side === 'enemy') { const f = friendAttacker(id); if (f) { attacker = f.id; fx = f.fx; from = pos[f.id]; by = f.id; move=f.move; } }
        else { const f = enemyAttacker(id); if (f) { by = f.id; move=f.move; if (vis(pos[f.id])) { attacker = f.id; from = pos[f.id]; fx = f.move?fxForMove(f.move):'strong'; } else fx = null; } }
        // `by` keeps the playback order when the source cannot be proven; `attacker` and effect stay empty.
        if (!by) by = unit.side === 'enemy' ? (b.queue.find(q => !used.has(q) && b.units[q].hp > 0) ?? b.queue[0]) : b.enemies[0] ?? id;
        if (unit.side === 'friend' && !by) by = id;
        const effect=attacker?styleFor(move,id,amount):null;
        emit({k:'hit', by, attacker, target:id, from, at, fx, amount, dead, hpAfter, ...(effect&&effect.move!==null?{tint:damageNumberColor(effect.type)}:{}),...(crit?{crit:true as const}:{}),...(effect?{effect}:{}),...(effect?.template==='blow'&&move?{cast:move}:{})});
      }
      if (dead) pos[id] = null;
      hp[id] = hpAfter;   // a Reviver Seed's restored HP replaces the zero
    } else if (ev.type==='hpLoss') {
      if(pos[id]&&(unit.side==='friend'||vis(pos[id])))emit({k:'hpchange',by:id,target:id,at:pos[id]!,delta:-ev.amount,hpAfter:ev.hp});
      hp[id]=ev.revive??ev.hp;if(hp[id]===0)pos[id]=null;   // a Reviver Seed answers a recoil or status death too: the unit keeps its place
    } else if (ev.type==='heal') {
      hp[id]=ev.to;
    } else if (ev.type==='drain') {
      if(pos[id]&&(unit.side==='friend'||vis(pos[id])))emit({k:'hpchange',by:id,target:id,at:pos[id]!,delta:ev.to-ev.from,hpAfter:ev.to});
      hp[id]=ev.to;
    } else if (ev.type==='itemUse'&&ev.target!==undefined&&(ev.item==='berry'||ev.item==='tonic')) {
      const t = ev.target, item:Item = ev.item;
      const at = pos[t], actorAt = pos[id];
      if(item==='berry')hp[t]=ev.to!;
      if (at && actorAt) emit({k:'heal', by:id, target:t, item, amount:item === 'berry' ? ev.to! - ev.from! : ev.pp!, at, actorAt, ...(item==='berry'?{hpAfter:ev.to!}:{})});
    }
  }

  // A non-damage cast is shown only when its own `cast` event is among the round's events and the events after it
  // (up to the next cast) report a visible result on a target in range (stage change, status, heal, guard).
  // PP is not checked here.
  for(const cast of casts){
    const {by:id,move}=cast;
    const spec=moveOf(move),baseStyle=effectForMove(move);if(!spec||!baseStyle||isDamageMove(move)||spec.effects.includes('protect'))continue;
    const actor=b.units[id],from=cast.positions[id];
    if(!actor||!from||!vis(from))continue;
    const start=cast.index;
    if(start<0)continue;
    let end=evs.length;
    for(let i=start+1;i<evs.length;i++){const e=evs[i];if(e.type==='cast'||(e.type==='itemUse'&&e.target===undefined)){end=i;break;}}
    const castEvents=evs.slice(start+1,end);
    const rowUnit=(e:RoundEvent):string|null=>'unit' in e?e.unit:e.type==='status'?e.target:null;
    const targetIds=[...new Set([...b.queue,...b.enemies])];
    const changed=targetIds.flatMap(target=>{
      if(!b.units[target]||!a.units[target]||!canSkillHit(id,target,move,cast.positions,cast.health))return [];
      const at=cast.positions[target];if(!at||!vis(at))return [];
      const rows=castEvents.filter(e=>rowUnit(e)===target);
      let amount:number|undefined,hpAfter:number|undefined;
      if(baseStyle.template==='heal'){
        const row=rows.find((e):e is Extract<RoundEvent,{type:'heal'}>=>e.type==='heal');
        if(!row)return [];
        amount=row.to-row.from;hpAfter=row.to;
      }else if(baseStyle.template==='up'||baseStyle.template==='down'){
        if(!rows.some(e=>e.type==='stage'))return [];
      }else if(baseStyle.template==='status'){
        if(!rows.some(e=>(e.type==='status'&&(e.change==='apply'||e.change==='refresh'))||e.type==='rest'))return [];
      }else if(baseStyle.template==='guard'){
        const direct=rows.some(e=>e.type==='guard'&&e.kind!=='protect');
        const quick=spec.effects.includes('quickguard')&&castEvents.some(e=>e.type==='quickguard'&&e.unit===id)&&a.quickguard?.units.includes(target);
        if(!direct&&!quick)return [];
      }else return [];
      return [{target,at,amount,...(hpAfter!==undefined?{hpAfter}:{})}];
    });
    if(!changed.length)continue;
    for(const choice of changed){
      const effect=styleFor(move,choice.target);if(!effect)continue;
      const event:AnimEvent={k:'effect',by:id,from,at:choice.at,target:choice.target,effect,...(choice.amount!==undefined?{amount:choice.amount}:{}),...(choice.hpAfter!==undefined?{hpAfter:choice.hpAfter}:{})};
      const index=events.findIndex(existing=>order(existing.by)>order(id));
      if(index<0)events.push(event);else events.splice(index,0,event);
    }
  }

  flush(Infinity);
  for(const e of airAttacks){if(!vis(e.from))continue;const event:AnimEvent={k:'airAttack',by:e.actor,actor:e.actor,from:e.from,to:e.to};const index=events.findIndex(v=>order(v.by)>order(e.actor));if(index<0)events.push(event);else events.splice(index,0,event);}
  const changes=stageTags(b,a,vis);
  if(changes.length)events.push({k:'tags',by:changes[0].target,items:changes});
  return events;
}

/** Base duration of each step in ms; the whole round is scaled down together if it would exceed the cap. */
export const BASE_MS:Record<AnimEvent['k'], number> = {airAttack:260, move:180, swap:200, hit:320, protect:240, blowaway:220, heal:260, effect:320, hpchange:240, tags:560};
export const ROUND_CAP_MS = 1500;
/** Below this speed-up the round is not played at all, which keeps pathological rounds from being unreadably fast. */
export const MIN_SCALE = 0.3;

const isMovementEvent = (event:AnimEvent) => event.k === 'move' || event.k === 'swap';
/** Groups every ordinary move and swap at the position of the round's first one; other events keep their order. */
export function animationBatches(events:AnimEvent[]):AnimEvent[][] {
  const movement = events.filter(isMovementEvent);
  const batches:AnimEvent[][] = [];
  let placedMovement = false;
  const castMove=(event:AnimEvent):string|undefined=>{
    if('cast' in event&&event.cast)return event.cast;
    const effect='effect' in event?event.effect:undefined;
    return effect?.move&&['room','around'].includes(moveOf(effect.move)?.range??'')?effect.move:undefined;
  };
  const isAreaCast=(event:AnimEvent)=>!!castMove(event);
  const sameAreaCast=(a:AnimEvent,b:AnimEvent)=>a.by===b.by&&!!castMove(a)&&castMove(a)===castMove(b);
  for (let i=0;i<events.length;i++) {
    const event=events[i];
    if (isMovementEvent(event)) {
      if (!placedMovement) { batches.push(movement); placedMovement = true; }
    } else if(isAreaCast(event)){
      const cast:AnimEvent[]=[event];
      while(i+1<events.length&&sameAreaCast(cast[0],events[i+1]))cast.push(events[++i]);
      batches.push(cast);
    } else batches.push([event]);
  }
  return batches;
}

/** Actual duration of the concurrent move/swap batch, including the round plan's speed scale. */
export function movementDuration(events:AnimEvent[], scale=1):number {
  const base = events.reduce((longest,event) => isMovementEvent(event) ? Math.max(longest,BASE_MS[event.k]) : longest,0);
  return base ? base * scale : 0;
}

/** A 500ms charge covers impact feedback and blowaway collisions without changing legacy timings. */
export function animationDuration(event:AnimEvent):number {
 if(('cast' in event&&event.cast)||(event.k==='hit'&&event.effect))return 500;
 // A fatal plain hit fades out for 140ms after 220ms, so it really lasts 360ms; a non-fatal one keeps the legacy 320ms.
 if(event.k==='hit')return event.dead?360:BASE_MS.hit;
 // The words of one unit start 110 ms apart after a 30 ms lead (playback.ts), so the step lasts until the unit with the most words has shown its last one. The round plan scales every delay with the step, which keeps the whole round under its cap.
 if(event.k==='tags'){const count=new Map<string,number>();let most=1;for(const item of event.items){const n=(count.get(item.target)??0)+1;count.set(item.target,n);if(n>most)most=n;}return BASE_MS.tags+30+(most-1)*110;}
 return BASE_MS[event.k];
}

export function plan(events:AnimEvent[]):{scale:number; total:number}|null {
  const total = animationBatches(events).reduce((sum,batch) =>
    sum + batch.reduce((longest,event) => Math.max(longest,animationDuration(event)),0),0);
  if (!total) return null;
  const scale = Math.min(1, ROUND_CAP_MS / total);
  return scale < MIN_SCALE ? null : {scale, total:total * scale};
}
