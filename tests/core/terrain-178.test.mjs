// #178: every generated floor must tile cleanly with 47-shape terrain tiles. Seeds 1-1000 x floors 1-3 (3000 floors), shapes and invariants checked independently of the generator.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateFloor,generateLiquidFeatures,center,roomCells,LIQUID_MAX_SHARE,LIQUID_MIN_CELLS} from '../../src/core/dungeon.ts';

const PARAMS={width:36,height:24,floors:3,boss:true,roguelike:true};
const SEEDS=1000,LEVELS=[1,2,3];
const key=(x,y)=>x+','+y;
const ck=c=>key(c.x,c.y);
const DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
const THEME_BOUNDS={1:{rivers:[0,0],lakes:[0,1]},2:{rivers:[1,2],lakes:[1,2]},3:{rivers:[1,1],lakes:[1,1]}};

const floors=[];
const times=[];
function generateAll() {
  if (floors.length) return floors;
  for (let seed = 1; seed <= SEEDS; seed++) for (const level of LEVELS) {
    const t0 = performance.now();
    const g = generateFloor(seed, level, PARAMS);
    times.push(performance.now() - t0);
    floors.push({seed, level, g});
  }
  return floors;
}
const inRoom = (c, r) => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;
function flood(set, start) {
  const seen = new Set([ck(start)]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const [dx, dy] of DIRS) {
    const n = {x: queue[i].x + dx, y: queue[i].y + dy};
    if (set.has(ck(n)) && !seen.has(ck(n))) { seen.add(ck(n)); queue.push(n); }
  }
  return seen;
}
/** Per-floor tile kinds: 'f' ground, 'l' liquid, 'w' wall; outside the map counts as wall. */
function kinder(g) {
  const F = new Set(g.floor.map(ck)), L = new Set(g.liquid.map(ck));
  return {F, L, kind: (x, y) => x < 0 || y < 0 || x >= g.width || y >= g.height ? 'w' : F.has(key(x, y)) ? 'f' : L.has(key(x, y)) ? 'l' : 'w'};
}

test('T178-1: no bad terrain shape on any of 3000 floors (thin walls, pillars, isolated or 1-wide liquid, diagonal-only ground or liquid)', () => {
  const bad = {thinWallFloor: 0, thinWallLiquid: 0, pillar: 0, liquidIsolated: 0, liquidThin: 0, diagonalFloor: 0, diagonalLiquid: 0};
  for (const {seed, level, g} of generateAll()) {
    const {kind} = kinder(g);
    const where = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const k = kind(x, y), n = kind(x, y - 1), s = kind(x, y + 1), e = kind(x + 1, y), w = kind(x - 1, y);
      if (k === 'w') {
        for (const [a, b] of [[n, s], [e, w]]) if (a !== 'w' && b !== 'w') {
          if (a === 'f' && b === 'f') { bad.thinWallFloor++; where.push('thin wall between ground ' + x + ',' + y); } else { bad.thinWallLiquid++; where.push('thin wall at liquid ' + x + ',' + y); }
        }
        if (n !== 'w' && s !== 'w' && e !== 'w' && w !== 'w') { bad.pillar++; where.push('pillar ' + x + ',' + y); }
      }
      if (k === 'l') {
        if (![n, s, e, w].includes('l')) { bad.liquidIsolated++; where.push('isolated liquid ' + x + ',' + y); }
        else if ((n !== 'l' && s !== 'l') || (e !== 'l' && w !== 'l')) { bad.liquidThin++; where.push('1-wide liquid ' + x + ',' + y); }
      }
      const a = kind(x, y), b = kind(x + 1, y), c = kind(x, y + 1), d = kind(x + 1, y + 1);
      for (const t of ['f', 'l']) if ((a === t && d === t && b !== t && c !== t) || (b === t && c === t && a !== t && d !== t)) {
        bad[t === 'f' ? 'diagonalFloor' : 'diagonalLiquid']++; where.push('diagonal-only ' + t + ' at ' + x + ',' + y);
      }
    }
    assert.ok(where.length === 0, `seed ${seed} floor ${level}: ${where.slice(0, 3).join('; ')}`);
  }
  assert.deepEqual(Object.values(bad).filter(Boolean), [], JSON.stringify(bad));
});

test('T178-2: ground spacing - pieces of ground keep two walls between them except at doors and junctions', () => {
  for (const {seed, level, g} of generateAll()) {
    const F = new Set(g.floor.map(ck));
    const nearRooms = c => g.rooms.map((r, i) => (c.x >= r.x - 2 && c.x < r.x + r.w + 2 && c.y >= r.y - 2 && c.y < r.y + r.h + 2) ? i : -1).filter(i => i >= 0);
    const joined = (from, to) => {
      const seen = new Set([ck(from)]);
      let ring = [from];
      for (let depth = 0; depth < 4; depth++) {
        const next = [];
        for (const c of ring) for (const [dx, dy] of DIRS) {
          const n = {x: c.x + dx, y: c.y + dy};
          if (seen.has(ck(n)) || !F.has(ck(n))) continue;
          if (n.x === to.x && n.y === to.y) return true;
          seen.add(ck(n)); next.push(n);
        }
        ring = next;
      }
      return false;
    };
    for (const c of g.floor) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if ((!dx && !dy) || Math.abs(dx) + Math.abs(dy) === 1) continue;
      const n = {x: c.x + dx, y: c.y + dy};
      if (!F.has(ck(n))) continue;
      const shared = nearRooms(c).some(i => nearRooms(n).includes(i));
      assert.ok(shared || joined(c, n), `seed ${seed} floor ${level}: ground ${ck(c)} and ${ck(n)} are closer than two walls but not joined by a door or junction`);
    }
  }
});

test('T178-3: rooms, routes and the boss room keep their 8.8 distances; the boss room has one entrance', () => {
  for (const {seed, level, g} of generateAll()) {
    const label = `seed ${seed} floor ${level}`;
    // Rooms stay 3 apart (unchanged), the boss room keeps a 2-cell frame from every route that does not end in it.
    for (const route of g.corridors) for (const p of route.path) {
      const brush = [{x: p.x, y: p.y}, {x: p.x + 1, y: p.y}, {x: p.x, y: p.y + 1}, {x: p.x + 1, y: p.y + 1}];
      g.rooms.forEach((r, i) => {
        if (i === route.fromRoom || i === route.toRoom) return;
        assert.ok(brush.every(c => c.x < r.x - 2 || c.x >= r.x + r.w + 2 || c.y < r.y - 2 || c.y >= r.y + r.h + 2), `${label}: route ${route.fromRoom}-${route.toRoom} keeps two walls from room ${i}`);
      });
    }
    if (g.bossRoom !== undefined) {
      const boss = g.rooms[g.bossRoom];
      assert.equal(boss.w, 7); assert.equal(boss.h, 7);
      assert.equal(g.corridors.filter(r => r.fromRoom === g.bossRoom || r.toRoom === g.bossRoom).length, 1, `${label}: exactly one route ends in the boss room`);
      const F = new Set(g.floor.map(ck));
      const ring = [];
      for (let y = boss.y - 2; y < boss.y + boss.h + 2; y++) for (let x = boss.x - 2; x < boss.x + boss.w + 2; x++) {
        if (x >= boss.x && x < boss.x + boss.w && y >= boss.y && y < boss.y + boss.h) continue;
        if (F.has(key(x, y))) ring.push({x, y});
      }
      // The only ground within two cells outside the boss room is the 2-wide door lane: 2 cells at distance 1 and 2 cells at distance 2 (fewer only when it ends there).
      assert.ok(ring.length >= 2 && ring.length <= 4, `${label}: boss door lane has ${ring.length} ground cells`);
      const doorCells = ring.filter(c => DIRS.some(([dx, dy]) => inRoom({x: c.x + dx, y: c.y + dy}, boss)));
      assert.equal(doorCells.length, 2, `${label}: boss room has one 2-wide entrance`);
      assert.equal(Math.abs(doorCells[0].x - doorCells[1].x) + Math.abs(doorCells[0].y - doorCells[1].y), 1, `${label}: the two entrance cells touch`);
    }
  }
});

test('T178-4: connectivity, corridor width, dead ends, loops, room layout, and every point on reachable ground', () => {
  for (const {seed, level, g} of generateAll()) {
    const label = `seed ${seed} floor ${level}`;
    const F = new Set(g.floor.map(ck));
    assert.equal(F.size, g.floor.length, `${label}: no duplicate ground`);
    assert.ok(g.floor.every(c => c.x >= 1 && c.y >= 1 && c.x <= g.width - 2 && c.y <= g.height - 2), `${label}: ground stays inside the outer wall ring`);
    const reach = flood(F, g.arrival);
    assert.equal(reach.size, F.size, `${label}: all ground is one region`);
    // Rooms
    assert.ok(g.rooms.length >= 9 && g.rooms.length <= 12, `${label}: ${g.rooms.length} rooms`);
    for (let i = 0; i < g.rooms.length; i++) for (let j = i + 1; j < g.rooms.length; j++) {
      const a = g.rooms[i], b = g.rooms[j];
      assert.ok(a.x + a.w + 3 <= b.x || b.x + b.w + 3 <= a.x || a.y + a.h + 3 <= b.y || b.y + b.h + 3 <= a.y, `${label}: rooms ${i}/${j} keep three walls between them`);
    }
    const ordinary = g.rooms.map((r, i) => i).filter(i => i !== g.bossRoom);
    for (const n of [1, 2]) { const r = g.rooms[ordinary[n]]; assert.ok(r.w >= 7 && r.w <= 8 && r.h >= 5 && r.h <= 6, `${label}: ordinary room ${n + 1} is a 7-8 x 5-6 large room`); }
    if (level === 3) assert.ok(g.bossRoom !== undefined);
    else assert.equal(g.bossRoom, undefined);
    // Corridors: every non-room ground cell lies in a 2x2 ground block; no 2x2 block with a single exit; two loops on top of the tree.
    const roomSet = new Set(g.rooms.flatMap(roomCells).map(ck));
    const block = (x, y) => [key(x, y), key(x + 1, y), key(x, y + 1), key(x + 1, y + 1)];
    for (const c of g.floor) {
      if (roomSet.has(ck(c))) continue;
      const ok = [[-1, -1], [0, -1], [-1, 0], [0, 0]].some(([dx, dy]) => block(c.x + dx, c.y + dy).every(k => F.has(k)));
      assert.ok(ok, `${label}: corridor cell ${ck(c)} is part of a 2x2 block`);
    }
    for (let y = 1; y < g.height - 2; y++) for (let x = 1; x < g.width - 2; x++) {
      const cells = block(x, y);
      if (!cells.every(k => F.has(k)) || cells.some(k => roomSet.has(k))) continue;
      const exits = [[key(x - 1, y), key(x - 1, y + 1)], [key(x + 2, y), key(x + 2, y + 1)], [key(x, y - 1), key(x + 1, y - 1)], [key(x, y + 2), key(x + 1, y + 2)]]
        .filter(side => side.some(k => F.has(k))).length;
      assert.notEqual(exits, 1, `${label}: dead-end corridor block at ${x},${y}`);
    }
    assert.equal(g.corridors.length, g.rooms.length + 1, `${label}: room tree plus two loops (${g.rooms.length} rooms, ${g.corridors.length} routes)`);
    const roomGraph = new Map(g.rooms.map((r, i) => [i, new Set()]));
    for (const r of g.corridors) { roomGraph.get(r.fromRoom).add(r.toRoom); roomGraph.get(r.toRoom).add(r.fromRoom); }
    const roomSeen = new Set([0]), roomQueue = [0];
    for (let i = 0; i < roomQueue.length; i++) for (const n of roomGraph.get(roomQueue[i])) if (!roomSeen.has(n)) { roomSeen.add(n); roomQueue.push(n); }
    assert.equal(roomSeen.size, g.rooms.length, `${label}: route records connect every room`);
    // Arrival, stairs, points, enemies, adventure rooms
    const reachable = (p, what) => assert.ok(F.has(ck(p)) && reach.has(ck(p)), `${label}: ${what} at ${ck(p)} is reachable ground`);
    reachable(g.arrival, 'arrival');
    assert.deepEqual(g.arrival, center(g.rooms[g.arrivalRoom]));
    assert.equal(g.up, null);
    if (level < 3) { assert.ok(g.down); reachable(g.down, 'down stairs'); } else assert.equal(g.down, null);
    for (const p of [...g.points, ...g.pickups, ...g.services, ...(g.rest ? [g.rest] : [])]) reachable(p.pos, p.kind);
    for (const e of g.enemies) { reachable(e.pos, 'enemy ' + e.id); if (e.post) reachable(e.post, 'post of ' + e.id); }
    for (const room of g.adventureRooms) { reachable(room.interaction, 'adventure interaction'); for (const d of room.doors) reachable(d, 'adventure door'); }
  }
});

test('T178-5: second terrain - floors 2 and 3 always have it, counts follow G3.13, cell count within the limits', () => {
  const seen = {1: 0, 2: 0, 3: 0};
  for (const {seed, level, g} of generateAll()) {
    const label = `seed ${seed} floor ${level}`;
    const F = new Set(g.floor.map(ck)), L = new Set(g.liquid.map(ck));
    assert.equal(L.size, g.liquid.length, `${label}: no duplicate liquid`);
    for (const c of g.liquid) {
      assert.ok(c.x >= 0 && c.y >= 0 && c.x < g.width && c.y < g.height, `${label}: liquid in bounds`);
      assert.ok(!F.has(ck(c)), `${label}: liquid never covers ground`);
    }
    const walls = g.width * g.height - F.size;
    assert.ok(L.size <= Math.floor(walls * LIQUID_MAX_SHARE), `${label}: liquid ${L.size} of ${walls} non-ground cells`);
    if (level > 1) assert.ok(L.size >= LIQUID_MIN_CELLS, `${label}: only ${L.size} liquid cells`);
    seen[level] += L.size;
    // Feature counts, by generation source: every generated river / lake survives shaping with at least one 2x2 block.
    const features = generateLiquidFeatures(seed, level, PARAMS, g.floor, g.rooms);
    const bounds = THEME_BOUNDS[level];
    assert.ok(features.rivers.length >= bounds.rivers[0] && features.rivers.length <= bounds.rivers[1], `${label}: ${features.rivers.length} rivers`);
    assert.ok(features.lakes.length >= bounds.lakes[0] && features.lakes.length <= bounds.lakes[1], `${label}: ${features.lakes.length} lakes`);
    for (const f of [...features.rivers, ...features.lakes]) assert.ok(f.length >= 4, `${label}: a feature keeps a 2x2 block`);
    const union = new Set([...features.rivers, ...features.lakes].flat().map(ck));
    assert.deepEqual([...union].sort(), [...L].sort(), `${label}: floor liquid equals the union of its features`);
    if (level === 3 || level === 2) assert.ok(features.rivers.length >= 1 && features.lakes.length >= 1, `${label}: river and lake`);
    // River minimum width 2: every river cell sits in a 2x2 block of that river's liquid.
    for (const river of features.rivers) {
      const R = new Set(river.map(ck));
      for (const c of river) assert.ok([[-1, -1], [0, -1], [-1, 0], [0, 0]].some(([dx, dy]) =>
        [key(c.x + dx, c.y + dy), key(c.x + dx + 1, c.y + dy), key(c.x + dx, c.y + dy + 1), key(c.x + dx + 1, c.y + dy + 1)].every(k => L.has(k))), `${label}: river cell ${ck(c)} is at least 2 wide`);
      assert.ok(R.size >= 4);
    }
  }
  assert.ok(seen[2] > 0 && seen[3] > 0);
});

test('T178-6: same seed and level give the same floor, whatever was generated in between', () => {
  for (let seed = 1; seed <= 150; seed++) for (const level of [3, 1, 2]) {
    const first = floors.length ? floors[(seed - 1) * 3 + level - 1].g : generateFloor(seed, level, PARAMS);
    generateFloor(seed + 7, 4 - level, PARAMS);
    assert.equal(JSON.stringify(generateFloor(seed, level, PARAMS)), JSON.stringify(first), `seed ${seed} floor ${level}`);
  }
});

test('T178-7: generation time and retry rates (diagnostic limits)', t => {
  generateAll();
  const sorted = times.slice().sort((a, b) => a - b), avg = times.reduce((a, b) => a + b, 0) / times.length;
  const sum = {layoutAttempts: 0, connectionRetries: 0, shapeRetries: 0, liquidRetries: 0, liquidLayoutRetries: 0}, max = {...sum};
  for (const {g} of floors) for (const key of Object.keys(sum)) { sum[key] += g.generationStats[key]; max[key] = Math.max(max[key], g.generationStats[key]); }
  t.diagnostic(`3000 floors: avg ${avg.toFixed(1)} ms, p99 ${sorted[Math.floor(sorted.length * 0.99)].toFixed(1)} ms, max ${sorted.at(-1).toFixed(1)} ms; per floor ${JSON.stringify(Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, +(v / floors.length).toFixed(3)])))}; max ${JSON.stringify(max)}`);
  // No time limit existed before #178 (it measured avg 6.6 ms, max 24 ms per floor); these bounds only guard against a generator that stalls.
  assert.ok(sorted.at(-1) < 2000, `slowest floor took ${sorted.at(-1).toFixed(0)} ms`);
  assert.ok(avg < 100, `average ${avg.toFixed(1)} ms`);
  assert.ok(sum.layoutAttempts / floors.length < 3, 'average layout attempts per floor stays under 3');
  assert.ok(max.layoutAttempts <= 64);
});
