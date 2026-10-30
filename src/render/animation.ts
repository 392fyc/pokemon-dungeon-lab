import {distance,key,plus,same,type Command,type Item,type Pos,type World} from '../core/engine.ts';
import {moveOf} from '../core/moves.ts';
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
  | {k:'swap'; by:string; a:string; b:string; pa:Pos; pb:Pos}
  | {k:'hit'; by:string; attacker:string|null; target:string; from:Pos|null; at:Pos; fx:Fx; amount:number; dead:boolean}
  | {k:'protect'; by:string; target:string; from:Pos; at:Pos}
  | {k:'blowaway'; by:string; target:string; actorAt:Pos; from:Pos; to:Pos}
  | {k:'heal'; by:string; target:string; item:Item; amount:number; at:Pos; actorAt:Pos};

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
  const lines = newLines(b.log, a.log);
  if (!lines.length) return [];
  const ids = Object.keys(a.units).sort((x, y) => y.length - x.length);
  const head = (t:string):{id:string; rest:string}|null => {
    for (const id of ids) if (t.startsWith(id) && t.length > id.length && !/[A-Za-z0-9-]/.test(t[id.length])) return {id, rest:t.slice(id.length)};
    return null;
  };
  const pos:Record<string, Pos|null> = {}, hp:Record<string, number> = {};
  for (const [id, u] of Object.entries(b.units)) { pos[id] = u.pos ? {...u.pos} : null; hp[id] = u.hp; }
  const seen = new Set(a.seen); // never wider than the final visible set, so nothing hidden is revealed by the animation
  const vis = (p:Pos|null):p is Pos => !!p && seen.has(key(p));
  const order = (id:string) => { const i = b.queue.indexOf(id); return i >= 0 ? i : ENEMY_ORDER; };
  const explicit = (id:string) => id === b.leader ? cmd.action : cmd.override?.actor === id ? cmd.override.action : null;
  /** A PP decrease identifies the move that really ran, including a partner's default move. */
  const spentMove = (id:string):string|null => {
    const before=b.units[id],after=a.units[id];if(!before||!after)return null;
    return before.learned.find(move=>(before.pp[move]??0)>(after.pp[move]??0))??null;
  };
  const fxForMove = (move:string):'strong'|'line' => {
    const range=moveOf(move)?.range;
    return range==='front2'||range==='line10'?'line':'strong';
  };
  const chebyshev=(x:Pos,y:Pos)=>Math.max(Math.abs(x.x-y.x),Math.abs(x.y-y.y));
  const floorCells=new Set(b.floor.map(key));
  const inRoom=(p:Pos,r:{x:number;y:number;w:number;h:number})=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;
  const canSkillHit=(actorId:string,targetId:string,move:string):boolean=>{
    const actor=b.units[actorId],target=b.units[targetId],actorAt=pos[actorId],targetAt=pos[targetId],spec=moveOf(move);
    if(!actor||!target||!actorAt||!targetAt||!spec?.effects.includes('damage'))return false;
    const allies=actor.side==='friend'?b.queue:b.enemies,opponents=actor.side==='friend'?b.enemies:b.queue;
    const category=spec.target==='enemy'?target.side!==actor.side&&opponents.includes(targetId):
      spec.target==='user'?targetId===actorId:
      spec.target==='teammates'?target.side===actor.side&&targetId!==actorId&&allies.includes(targetId):
      spec.target==='party'?target.side===actor.side&&allies.includes(targetId):
      allies.includes(targetId)||opponents.includes(targetId);
    if(!category)return false;
    switch(spec.range){
      case 'user':return targetId===actorId;
      case 'front':return distance(actorAt,targetAt)===1;
      case 'around':return targetId!==actorId&&chebyshev(actorAt,targetAt)===1;
      case 'room':{
        const room=b.rooms?.find(r=>inRoom(actorAt,r));
        return room?inRoom(targetAt,room):chebyshev(actorAt,targetAt)<=2;
      }
      case 'front2':case 'line10':{
        const range=spec.range==='front2'?2:10;
        if(actorAt.x!==targetAt.x&&actorAt.y!==targetAt.y)return false;
        const d=distance(actorAt,targetAt);if(d<1||d>range)return false;
        const step={x:Math.sign(targetAt.x-actorAt.x),y:Math.sign(targetAt.y-actorAt.y)};let p=plus(actorAt,step);
        while(!same(p,targetAt)){
          if(!floorCells.has(key(p))||[...b.queue,...b.enemies].some(id=>id!==actorId&&id!==targetId&&hp[id]>0&&same(pos[id],p)))return false;
          p=plus(p,step);
        }
        return true;
      }
    }
  };
  const events:AnimEvent[] = [];
  const used = new Set<string>();
  let enemyCursor = -1;

  // Protect's shield log has no position of its own, so place the effect by queue order.
  const protects:{idx:number; ev:AnimEvent}[] = [];
  for (const id of b.queue) {
    const e = explicit(id), u = b.units[id];
    // A planned action may never run (for example, an earlier blowaway collision knocks this member out).
    // Keep an effect only when the rule log confirms it happened, even if the member falls afterward.
    if (e?.type === 'skill' && moveOf(e.skill)?.effects.includes('protect') && u.hp > 0 && lines.includes(`${id}进入守住状态`)) protects.push({idx:b.queue.indexOf(id), ev:{k:'protect', by:id, target:e.target, from:{x:0, y:0}, at:{x:0, y:0}}});
  }
  const flush = (upTo:number) => {
    while (protects.length && protects[0].idx < upTo) {
      const g = protects.shift()!.ev;
      if (g.k !== 'protect') continue;
      const from = pos[g.by], at = pos[g.target];
      used.add(g.by);
      if (from && at) events.push({...g, from, at});
    }
  };
  const emit = (ev:AnimEvent) => { flush(order(ev.by)); used.add(ev.by); events.push(ev); };

  const friendAttacker = (target:string):{id:string; fx:'strong'|'line'}|null => {
    for (const id of b.queue) {
      if (b.units[id].hp <= 0 || !pos[id]) continue;
      const e = explicit(id);
      const move=spentMove(id),spec=move?moveOf(move):undefined;
      if(move&&spec?.effects.includes('damage')){
        const repeatable=spec.range==='around'||spec.range==='room';
        if((!used.has(id)||repeatable)&&canSkillHit(id,target,move)&&(!e||e.type!=='skill'||e.skill===move))return {id,fx:fxForMove(move)};
        continue;
      }
      if(used.has(id))continue;
      if (e) {
        if (e.type === 'basic' && e.target === target)return {id,fx:'strong'};
      } else if (pos[target] && distance(pos[id]!, pos[target]!) === 1) return {id, fx:'strong'};
    }
    return null;
  };
  const enemyAttacker = (target:string):{id:string; move:string|null}|null => {
    const t = pos[target];
    if (!t) return null;
    // Room and around moves can hit several units; retain the same actual move for each target.
    if(enemyCursor>=0){
      const id=b.enemies[enemyCursor],move=spentMove(id),range=move?moveOf(move)?.range:undefined;
      if(move&&(range==='room'||range==='around')&&canSkillHit(id,target,move))return {id,move};
    }
    for (let i = enemyCursor + 1; i < b.enemies.length; i++) {
      const id = b.enemies[i], p = pos[id];
      if (!p || hp[id] <= 0) continue;
      const move=spentMove(id),spec=move?moveOf(move):undefined;
      if(move&&spec?.effects.includes('damage')&&canSkillHit(id,target,move)){enemyCursor=i;return {id,move};}
      if(!move&&distance(p,t)===1){enemyCursor=i;return {id,move:null};}
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const h = head(lines[i]);
    if (!h) continue;
    const {id, rest} = h;
    const unit = a.units[id] ?? b.units[id];
    if (!unit) continue;
    let m:RegExpMatchArray|null;
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
        if (unit.side === 'friend' && (a.units[t]?.side === 'friend' || vis(from))) emit({k:'blowaway', by:id, target:t, actorAt, from, to});
        pos[t] = to;
      }
    } else if (/^与.+换位$/.test(rest)) {
      const o = head(`${rest.slice(1, -2)}。`)?.id ?? null;
      if (o && pos[id] && pos[o]) { const pa = pos[id]!, pb = pos[o]!; emit({k:'swap', by:id, a:id, b:o, pa, pb}); used.add(o); pos[id] = pb; pos[o] = pa; }
    } else if ((m = rest.match(/^受到(\d+)伤害，HP (\d+)$/))) {
      const at = pos[id], dead = lines[i + 1] === `${id}倒下退图`;
      hp[id] = Number(m[2]);
      if (at && (unit.side === 'friend' || vis(at))) {
        let attacker:string|null = null, from:Pos|null = null, fx:Fx = 'strong', by = '';
        if (unit.side === 'enemy') { const f = friendAttacker(id); if (f) { attacker = f.id; fx = f.fx; from = pos[f.id]; by = f.id; } }
        else { const f = enemyAttacker(id); if (f) { by = f.id; if (vis(pos[f.id])) { attacker = f.id; from = pos[f.id]; fx = f.move?fxForMove(f.move):'strong'; } else fx = null; } }
        // An unknown friendly attacker still ranks by the earliest unused queue slot; an unknown enemy goes after all friends.
        if (!by) by = unit.side === 'enemy' ? (b.queue.find(q => !used.has(q) && b.units[q].hp > 0) ?? b.queue[0]) : b.enemies[0] ?? id;
        if (unit.side === 'friend' && !by) by = id;
        emit({k:'hit', by, attacker, target:id, from, at, fx, amount:Number(m[1]), dead});
      }
      if (dead) pos[id] = null;
    } else if ((m = rest.match(/^对(.+?)使用(橙橙果|PP补剂)，(?:HP (\d+)→(\d+)|每招PP\+(\d+))/))) {
      const t = head(`${m[1]}。`)?.id ?? null, item:Item = m[2] === '橙橙果' ? 'berry' : 'tonic';
      const at = t ? pos[t] : null, actorAt = pos[id];
      if (t && at && actorAt) emit({k:'heal', by:id, target:t, item, amount:item === 'berry' ? Number(m[4]) - Number(m[3]) : Number(m[5]), at, actorAt});
    }
  }
  flush(Infinity);
  return events;
}

/** Base duration of each step in ms; the whole round is scaled down together if it would exceed the cap. */
export const BASE_MS:Record<AnimEvent['k'], number> = {move:180, swap:200, hit:320, protect:240, blowaway:220, heal:260};
export const ROUND_CAP_MS = 1500;
/** Below this speed-up the round is not played at all, which keeps pathological rounds from being unreadably fast. */
export const MIN_SCALE = 0.3;
export function plan(events:AnimEvent[]):{scale:number; total:number}|null {
  const total = events.reduce((n, e) => n + BASE_MS[e.k], 0);
  if (!total) return null;
  const scale = Math.min(1, ROUND_CAP_MS / total);
  return scale < MIN_SCALE ? null : {scale, total:total * scale};
}
