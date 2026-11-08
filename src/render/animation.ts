import {key,plus,same,SKILL_CN,stageOf,STAGE_NAMES,STATUS_NAMES,type StageKey,type StatusId,type Command,type Item,type Pos,type World} from '../core/engine.ts';
import {moveOf} from '../core/moves.ts';
import {typeEffectiveness} from '../core/type-chart.ts';
import {SPECIES} from '../core/roster.ts';
import {damageNumberColor,effectForMove,type EffectStyle} from './effect-spec.ts';
import {adjacentReachable, floorIndex, rayReachable} from './reach.ts';
/**
 * Stage 6.4 presentation: works out what happened in one round from the two saved states and the new log lines.
 * Pure data in, pure data out. It never touches rule code and never changes either state.
 *
 * Why inference: `applyCommand` returns only the final state. What each log line says is reliable (who moved, who was
 * hurt, who used an item); who dealt a hit is not logged, so it is inferred (see `friendAttacker` / `enemyAttacker`).
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
  const lines = newLines(b.log, a.log);
  const ids = Object.keys(a.units).sort((x, y) => y.length - x.length);
  const head = (t:string):{id:string; rest:string}|null => {
    for (const id of ids) if (t.startsWith(id) && t.length > id.length && !/[A-Za-z0-9-]/.test(t[id.length])) return {id, rest:t.slice(id.length)};
    return null;
  };
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
    const trigger=lines.find(line=>line.startsWith(id)&&line.includes('在睡眠中使用梦话，发动'));
    if(!trigger)return null;
    return Object.entries(SKILL_CN).find(([,name])=>trigger.includes(`发动${name}`))?.[0]??null;
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
      (lines.includes(`${id}进入守住状态`)||(a.units[id]?.protect??0)>(b.units[id]?.protect??0)))
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
      const converted = lines.includes(`${id}出生时的睡眠转为招式造成的睡眠状态`), stillAsleep = !!(a.units[id]?.status?.slp || a.units[id]?.status?.nap);
      if (!p || hp[id] <= 0 || used.has(id) || (converted ? stillAsleep : (b.units[id].asleep || b.units[id].wakeSkip))) continue;
      const move=spentMove(id),spec=move?moveOf(move):undefined;
      if(move&&isDamageMove(move)&&canSkillHit(id,target,move))candidates.push({id,move,index:i});
      else if(!spentAnyPp(id)&&adjacentReachable(floorCells,p,t))candidates.push({id,move:null,index:i});
    }
    if(!candidates.length)return null;
    enemyCursor=candidates[0].index;return {id:candidates[0].id,move:candidates[0].move};
  };

  const damageEvents=(a.events??[]).filter((e):e is Extract<NonNullable<World['events']>[number],{type:'damage'}>=>e.type==='damage'),usedDamage=new Set<number>();
  const collisionVictims=new Map<string,{left:number;by:string;cast?:string}>();
  type Cast={by:string;move:string;index:number;positions:Record<string,Pos|null>;health:Record<string,number>;hit:Set<string>;/** a snore or sleep-talk answer: the engine aims it at the attacker without a range check */reaction?:boolean};
  const casts:Cast[]=[];let activeCast:Cast|null=null;
  // A sleeper's snore or sleep-talk answers a hit in the middle of someone else's cast; the answered cast resumes afterwards.
  const reactionStack:Cast[]=[];
  // A confused unit's strike has no target line of its own: the very next damage line is what it hit, whatever the side.
  let pendingStrike:string|null=null;
  const isAreaCast=(c:Cast)=>['room','around'].includes(moveOf(c.move)?.range??'');
  const claims=(c:Cast|null,target:string):c is Cast=>!!c&&isDamageMove(c.move)&&!c.hit.has(target)&&(c.hit.size===0||isAreaCast(c))&&(c.reaction?c.hit.size===0&&b.units[target]?.side!==b.units[c.by]?.side:canSkillHit(c.by,target,c.move,c.positions,c.health));
  /** Every log line that says a unit's own action ended without a hit it could be credited with (engine.ts statusBlock, invalid, confused, miss and wait lines). */
  const spentWithoutHit=/^(?:的普攻没打中|的普通攻击未命中任何目标|冰冻中，无法行动|打盹中，无法行动|睡眠中，无法行动|麻痹中，无法使用招式和普攻|畏缩中，无法使用招式和普攻|动作失效，等待，未扣PP|无路可走，等待|等待|因混乱乱走|因混乱朝.+乱走)|落空，未扣PP$|换位落空/;


  for (let i = 0; i < lines.length; i++) {
    const strike:string|null=pendingStrike;pendingStrike=null;
    const h = head(lines[i]);
    if (!h) continue;
    const {id, rest} = h;
    const unit = a.units[id] ?? b.units[id];
    if (!unit) continue;
    // The thaw line comes before the damage line it belongs to, so it must not drop a confused unit's pending strike.
    if (strike && /^受到火系招式或热水攻击后解冻$/.test(rest)) pendingStrike = strike;
    let m:RegExpMatchArray|null;
    if(rest.startsWith('使用')){
      const move=b.units[id]?.learned.find(move=>rest==='使用'+(SKILL_CN[move]??move));
      const reaction=!!move&&!!activeCast&&id!==activeCast.by&&(move==='snore'||!!lines[i-1]?.startsWith(id+'在睡眠中使用梦话'));
      if(reaction)reactionStack.push(activeCast!);else reactionStack.length=0;
      const answer:boolean=!!move&&(move==='snore'||!!lines[i-1]?.startsWith(id+'在睡眠中使用梦话'));
      activeCast=move?{by:id,move,index:i,positions:Object.fromEntries(Object.entries(pos).map(([id,at])=>[id,at?{...at}:null])),health:{...hp},hit:new Set(),...(answer?{reaction:true}:{})}:null;
      if(activeCast){casts.push(activeCast);castActors.add(id);used.add(id);}
      // A target the move cannot affect (immune) is still hit by the move: the engine says so with an `immune` event, shown as a hit that does nothing (never as a miss).
      if(activeCast&&move)for(const ev of a.events??[]){
        if(ev.type!=='immune'||ev.actor!==id||ev.skill!==move)continue;
        const at=pos[ev.target],from=pos[id],tUnit=a.units[ev.target]??b.units[ev.target];if(!at||!tUnit)continue;
        activeCast.hit.add(ev.target);
        if(tUnit.side!=='friend'&&!vis(at))continue;
        const shown=vis(from)?from:null,effect=shown?styleFor(move,ev.target,0)??undefined:undefined;
        emit({k:'hit',by:id,attacker:shown?id:null,target:ev.target,from:shown,at,fx:shown?fxForMove(move):null,amount:0,dead:false,immune:true,...(effect?{effect}:{})});
      }
    }
    if(activeCast&&id===activeCast.by){
      const prefix='的'+(SKILL_CN[activeCast.move]??activeCast.move)+'没打中';
      if(rest.startsWith(prefix)){const target=rest.slice(prefix.length);if(ids.includes(target))activeCast.hit.add(target);}
    }
    // A unit whose action ended without a credited hit has still used its action, so a later hit on a target is not its work.
    if(spentWithoutHit.test(rest))used.add(id);
    // A status move stopped by a guard writes nothing after this line, so only a damaging action may claim the next damage line.
    if(/^因混乱朝.+出手$/.test(rest)){used.add(id);if(activeCast?.by!==id||isDamageMove(activeCast.move))pendingStrike=id;}
    // The cast is over when the log says so: a confused cast that found nothing, or another unit's own action line starts.
    if(activeCast&&((id===activeCast.by&&rest==='的招式未命中任何目标')||(id!==activeCast.by&&(spentWithoutHit.test(rest)||/^(?:移动到|趋近一步|向.+挥空|与.+换位|对.+使用|因混乱朝)/.test(rest))))){activeCast=null;reactionStack.length=0;}
    if ((m = rest.match(/^移动到(\d+),(\d+)$/))) {
      const from = pos[id], to = {x:Number(m[1]), y:Number(m[2])};
      if (from && (unit.side === 'friend' || (vis(from) && vis(to)))) emit({k:'move', by:id, id, from, to});
      pos[id] = to;
    } else if (rest === '趋近一步') {
      const from = pos[id], to = a.units[id]?.pos ?? null;
      if (from && to && vis(from) && vis(to)) emit({k:'move', by:id, id, from, to});
      if (to) pos[id] = to;
    } else if ((m = rest.match(/^吹飞(.+?)到(-?\d+),(-?\d+)$/))) {
      const t = head(`${m[1]}。`)?.id ?? null;
      const from = t ? pos[t] : null, actorAt = pos[id], to={x:Number(m[2]),y:Number(m[3])};
      if (t && from && actorAt) {
        const move=spentMove(id),spec=move?moveOf(move):undefined;
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
    } else if (/^与.+换位$/.test(rest)) {
      const o = head(`${rest.slice(1, -2)}。`)?.id ?? null;
      if (o && pos[id] && pos[o]) { const pa = pos[id]!, pb = pos[o]!; emit({k:'swap', by:id, a:id, b:o, pa, pb}); used.add(o); pos[id] = pb; pos[o] = pa; }
    } else if ((m = rest.match(/^受到(\d+)伤害，HP (\d+)$/))) {
      // A Reviver Seed answers the same blow in the next line: the unit stays on the map at its restored HP and is not shown as fallen.
      const at = pos[id], revived = Number(m[2])===0 && lines.slice(i+1,i+3).some(l=>l.startsWith(id+'倒下的瞬间，')), dead = Number(m[2])===0 && !revived;
      const remaining=Number(m[2]),amount=remaining>0?Number(m[1]):Math.min(Number(m[1]),Math.max(0,hp[id]??0));
      // A Reviver Seed answers the blow: the HP shown is the restored one.
      const reviveLine=revived?lines.slice(i+1,i+3).find(l=>l.startsWith(id+'倒下的瞬间，')):undefined,hpAfter=reviveLine?Number(/HP恢复到(\d+)/.exec(reviveLine)?.[1]??remaining):remaining;
      // The engine's damage event carries the critical flag: take the first unused one for this target and amount.
      const damageIndex=damageEvents.findIndex((e,n)=>!usedDamage.has(n)&&e.target===id&&e.amount===Number(m![1]));if(damageIndex>=0)usedDamage.add(damageIndex);
      const crit=damageIndex>=0&&!!damageEvents[damageIndex].crit;
      hp[id] = remaining;
      const collision=collisionVictims.get(id);
      if(collision){if(collision.left<=1)collisionVictims.delete(id);else collisionVictims.set(id,{...collision,left:collision.left-1});}
      if (at && (unit.side === 'friend' || vis(at))) {
        if(collision){emit({k:'hit',by:collision.by,attacker:null,target:id,from:null,at,fx:null,amount,dead,hpAfter,collision:true,...(collision.cast?{cast:collision.cast}:{})});if(dead)pos[id]=null;continue;}
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
    } else if ((m = rest.match(/^因.+损失(\d+)HP，HP (\d+)$/))) {
      if(pos[id]&&(unit.side==='friend'||vis(pos[id])))emit({k:'hpchange',by:id,target:id,at:pos[id]!,delta:-Number(m[1]),hpAfter:Number(m[2])});
      hp[id]=Number(m[2]);if(hp[id]===0&&!lines.slice(i+1,i+3).some(l=>l.startsWith(id+'倒下的瞬间，')))pos[id]=null;   // a Reviver Seed answers a recoil or status death too: the unit keeps its place
    } else if ((m = rest.match(/^倒下的瞬间，.+发动，HP恢复到(\d+)$/))) {
      hp[id]=Number(m[1]);
    } else if ((m = rest.match(/^(?:回复HP|吸取生命，HP) (\d+)→(\d+)$/))) {
      if(rest.startsWith('吸取生命')&&pos[id]&&(unit.side==='friend'||vis(pos[id])))emit({k:'hpchange',by:id,target:id,at:pos[id]!,delta:Number(m[2])-Number(m[1]),hpAfter:Number(m[2])});
      hp[id]=Number(m[2]);
    } else if ((m = rest.match(/^对(.+?)使用(橙橙果|PP多项小补剂)，(?:HP (\d+)→(\d+)|每招PP\+(\d+))/))) {
      const t = head(`${m[1]}。`)?.id ?? null, item:Item = m[2] === '橙橙果' ? 'berry' : 'tonic';
      const at = t ? pos[t] : null, actorAt = pos[id];
      if(t&&item==='berry')hp[t]=Number(m[4]);
      if (t && at && actorAt) emit({k:'heal', by:id, target:t, item, amount:item === 'berry' ? Number(m[4]) - Number(m[3]) : Number(m[5]), at, actorAt, ...(item==='berry'?{hpAfter:Number(m[4])}:{})});
    }
  }

  // A non-damage cast is shown only when its own `使用` line is among the new log lines and the lines after it
  // report a visible result on a target in range (stage change, status, heal, guard). PP is not checked here, and a
  // cast line that fell out of the fixed-size log produces no effect.
  for(const cast of casts){
    const {by:id,move}=cast;
    const spec=moveOf(move),baseStyle=effectForMove(move);if(!spec||!baseStyle||isDamageMove(move)||spec.effects.includes('protect'))continue;
    const actor=b.units[id],from=cast.positions[id];
    if(!actor||!from||!vis(from))continue;
    const start=cast.index;
    if(start<0)continue;
    let end=lines.length;
    for(let i=start+1;i<lines.length;i++)if(head(lines[i])?.rest.startsWith('使用')){end=i;break;}
    const castLines=lines.slice(start+1,end),rows=castLines.map(head);
    const targetIds=[...new Set([...b.queue,...b.enemies])];
    const changed=targetIds.flatMap(target=>{
      if(!b.units[target]||!a.units[target]||!canSkillHit(id,target,move,cast.positions,cast.health))return [];
      const at=cast.positions[target];if(!at||!vis(at))return [];
      const targetRows=rows.filter(row=>row?.id===target).map(row=>row!.rest);
      let amount:number|undefined;
      if(baseStyle.template==='heal'){
        const match=targetRows.map(line=>line.match(/^回复HP (\d+)→(\d+)$/)).find(Boolean);
        if(!match)return [];
        amount=Number(match[2])-Number(match[1]);
      }else if(baseStyle.template==='up'||baseStyle.template==='down'){
        if(!targetRows.some(line=>/^.+阶段变为-?\d+$/.test(line)))return [];
      }else if(baseStyle.template==='status'){
        if(!targetRows.some(line=>/陷入.+状态$|持续时间重新计算$|开始打盹$/.test(line)))return [];
      }else if(baseStyle.template==='guard'){
        const direct=targetRows.some(line=>/进入反击状态|受到反射壁保护|受到光墙保护/.test(line));
        const quick=spec.effects.includes('quickguard')&&castLines.some(line=>line.startsWith(id+'为')&&line.includes('开启快速防守'))&&a.quickguard?.units.includes(target);
        if(!direct&&!quick)return [];
      }else return [];
      return [{target,at,amount,...(baseStyle.template==='heal'?{hpAfter:Number(targetRows.map(line=>line.match(/^回复HP (\d+)→(\d+)$/)).find(Boolean)![2])}:{})}];
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
