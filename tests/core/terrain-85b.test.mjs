import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateFloor,
  generateLiquid,
  generateLiquidFeatures,
} from '../../src/core/dungeon.ts';
import {
  applyCommand,
  createExpedition,
  currentlyVisible,
  jumpToFloor,
} from '../../src/core/engine.ts';
import {
  SHAPES,
  TERRAIN_THEMES,
  buildAtlas,
  buildFloorTexture,
  decorationCandidates,
  frameOf,
  maskAt,
  prepareTerrainMap,
  reduceMask,
  selectDecorations,
  terrainVariant,
} from '../../src/render/terrain.ts';
import {enemy, friend, world} from '../acceptance/fixtures.mjs';

const dirs8 = [
  [0, -1, 1], [1, -1, 2], [1, 0, 4], [1, 1, 8],
  [0, 1, 16], [-1, 1, 32], [-1, 0, 64], [-1, -1, 128],
];
const dirs4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const cellKey = (p) => `${p.x},${p.y}`;
const key = (x, y) => `${x},${y}`;
const center = (r) => ({x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2)});
const contains = (r, p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const cellsOf = (r) => Array.from({length: r.h}, (_, dy) =>
  Array.from({length: r.w}, (_, dx) => ({x: r.x + dx, y: r.y + dy}))).flat();
const brushOf = ({x, y}) => [{x, y}, {x: x + 1, y}, {x, y: y + 1}, {x: x + 1, y: y + 1}];

function flood(cells, start) {
  const available = new Set(cells.map(cellKey));
  const visited = new Set([cellKey(start)]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const [dx, dy] of dirs4) {
      const next = {x: queue[i].x + dx, y: queue[i].y + dy};
      const k = cellKey(next);
      if (available.has(k) && !visited.has(k)) {
        visited.add(k);
        queue.push(next);
      }
    }
  }
  return visited;
}

function hasFloor2x2(cell, floor) {
  for (const x of [cell.x - 1, cell.x]) {
    for (const y of [cell.y - 1, cell.y]) {
      if ([key(x, y), key(x + 1, y), key(x, y + 1), key(x + 1, y + 1)].every((k) => floor.has(k))) return true;
    }
  }
  return false;
}

function corridorDeadEnds(g, floor) {
  const roomCells = new Set(g.rooms.flatMap(cellsOf).map(cellKey));
  let count = 0;
  for (let y = 1; y < g.height - 2; y++) {
    for (let x = 1; x < g.width - 2; x++) {
      const block = [{x, y}, {x: x + 1, y}, {x, y: y + 1}, {x: x + 1, y: y + 1}];
      if (!block.every((p) => floor.has(cellKey(p))) || block.some((p) => roomCells.has(cellKey(p)))) continue;
      const exits = [
        [key(x - 1, y), key(x - 1, y + 1)],
        [key(x + 2, y), key(x + 2, y + 1)],
        [key(x, y - 1), key(x + 1, y - 1)],
        [key(x, y + 2), key(x + 1, y + 2)],
      ].filter((side) => side.some((k) => floor.has(k))).length;
      if (exits === 1) count++;
    }
  }
  return count;
}

function shortestNonRoomCorridor(g, floor, allRoomCells, fromIndex, toIndex) {
  const outsideDoors = (room) => {
    const doors = new Map();
    for (const cell of cellsOf(room)) for (const [dx, dy] of dirs4) {
      const next = {x: cell.x + dx, y: cell.y + dy}, k = cellKey(next);
      if (floor.has(k) && !allRoomCells.has(k)) doors.set(k, next);
    }
    return [...doors.values()];
  };
  const starts = outsideDoors(g.rooms[fromIndex]);
  const targets = new Set(outsideDoors(g.rooms[toIndex]).map(cellKey));
  const queue = starts.map((cell) => ({cell, length: 1}));
  const visited = new Set(starts.map(cellKey));
  for (let i = 0; i < queue.length; i++) {
    const {cell, length} = queue[i], at = cellKey(cell);
    if (targets.has(at)) return length;
    for (const [dx, dy] of dirs4) {
      const next = {x: cell.x + dx, y: cell.y + dy}, k = cellKey(next);
      if (floor.has(k) && !allRoomCells.has(k) && !visited.has(k)) {
        visited.add(k);
        queue.push({cell: next, length: length + 1});
      }
    }
  }
  return null;
}

function brushTouchesHallway(p, from, to) {
  const brush = brushOf(p);
  return brush.some((cell) => !contains(from, cell)) && brush.some((cell) => !contains(to, cell));
}

function routeTurns(path, from, to) {
  let turns = 0;
  let previous = null;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    assert.equal(Math.abs(dx) + Math.abs(dy), 1, 'corridor brush positions move one cardinal cell at a time');
    const direction = `${dx},${dy}`;
    if (previous !== null && previous !== direction
      && brushTouchesHallway(path[i - 1], from, to) && brushTouchesHallway(path[i], from, to)) turns++;
    previous = direction;
  }
  return turns;
}

function assertTerrainGeneration(g, seed, level) {
  const floor = new Set(g.floor.map(cellKey));
  assert.equal(floor.size, g.floor.length, `seed ${seed} floor ${level}: no duplicate ground cells`);
  assert.ok(g.rooms.length >= 9 && g.rooms.length <= 12, `seed ${seed} floor ${level}: ${g.rooms.length} rooms`);
  for (let i = 0; i < g.rooms.length; i++) {
    for (const c of g.rooms.slice(i + 1)) {
      const a = g.rooms[i], b = c;
      const separatedByThreeWalls = a.x + a.w + 3 <= b.x || b.x + b.w + 3 <= a.x
        || a.y + a.h + 3 <= b.y || b.y + b.h + 3 <= a.y;
      assert.ok(separatedByThreeWalls, `seed ${seed} floor ${level}: rooms keep three wall cells between them`);
    }
  }
  assert.equal(flood(g.floor, g.floor[0]).size, floor.size, `seed ${seed} floor ${level}: all ground connects`);
  for (const cell of g.floor) {
    if (g.rooms.some((r) => contains(r, cell))) continue;
    assert.ok(hasFloor2x2(cell, floor), `seed ${seed} floor ${level}: corridor cell ${cellKey(cell)} belongs to a 2x2 ground block`);
  }
  assert.equal(corridorDeadEnds(g, floor), 0, `seed ${seed} floor ${level}: no one-exit 2x2 corridor blocks`);

  assert.ok(Array.isArray(g.corridors), `seed ${seed} floor ${level}: generator reports accepted room routes`);
  assert.ok(g.corridors.length >= g.rooms.length - 1, `seed ${seed} floor ${level}: route records connect the room graph`);
  const allRoomCells = new Set(g.rooms.flatMap(cellsOf).map(cellKey));
  const directlyConnected = new Set();
  for (let a = 0; a < g.rooms.length; a++) for (let b = a + 1; b < g.rooms.length; b++) {
    const length = shortestNonRoomCorridor(g, floor, allRoomCells, a, b);
    if (length === null) continue;
    directlyConnected.add(`${a}:${b}`);
    assert.ok(length >= 3,
      `seed ${seed} floor ${level}: shortest outside-door corridor ${a}:${b} has ${length} ground cells, require at least 3`);
  }
  assert.ok(directlyConnected.size >= g.rooms.length - 1,
    `seed ${seed} floor ${level}: outside-door corridors directly connect all rooms`);
  let turned = 0;
  for (const route of g.corridors) {
    const from = g.rooms[route.fromRoom], to = g.rooms[route.toRoom];
    assert.ok(from && to && route.fromRoom !== route.toRoom, `seed ${seed} floor ${level}: route has two distinct room endpoints`);
    assert.ok(contains(from, route.path[0]), `seed ${seed} floor ${level}: route starts in room ${route.fromRoom}`);
    assert.ok(contains(to, route.path.at(-1)), `seed ${seed} floor ${level}: route ends in room ${route.toRoom}`);
    for (const p of route.path) {
      assert.ok(brushOf(p).every((c) => floor.has(cellKey(c))), `seed ${seed} floor ${level}: route brush remains on ground`);
      for (let i = 0; i < g.rooms.length; i++) {
        if (i === route.fromRoom || i === route.toRoom) continue;
        const room = g.rooms[i];
        assert.ok(brushOf(p).every((c) => c.x < room.x - 2 || c.x >= room.x + room.w + 2
          || c.y < room.y - 2 || c.y >= room.y + room.h + 2),
        `seed ${seed} floor ${level}: route avoids unrelated room ${i} and its two-cell border (8.8: was one cell)`);
      }
      if (g.bossRoom !== undefined && route.fromRoom !== g.bossRoom && route.toRoom !== g.bossRoom) {
        const boss = g.rooms[g.bossRoom];
        const bossBox = {x: boss.x - 2, y: boss.y - 2, w: boss.w + 4, h: boss.h + 4};
        assert.ok(brushOf(p).every((c) => !contains(bossBox, c)),
          `seed ${seed} floor ${level}: non-boss route stays outside the boss room frame`);
      }
    }
    const pair = route.fromRoom < route.toRoom ? `${route.fromRoom}:${route.toRoom}` : `${route.toRoom}:${route.fromRoom}`;
    assert.ok(directlyConnected.has(pair), `seed ${seed} floor ${level}: diagnostic route ${pair} has a real non-room floor path`);
    if (routeTurns(route.path, from, to) > 0) turned++;
  }
  assert.ok(turned * 2 >= g.corridors.length, `seed ${seed} floor ${level}: at least half of ${g.corridors.length} corridors turn`);

  const reachable = flood(g.floor, g.arrival);
  const reachableCell = (p, label) => assert.ok(reachable.has(cellKey(p)), `seed ${seed} floor ${level}: ${label} is reachable`);
  for (const [i, room] of g.rooms.entries()) reachableCell(center(room), `room ${i}`);
  if (g.bossRoom !== undefined) reachableCell(center(g.rooms[g.bossRoom]), 'boss room');
  if (g.down) reachableCell(g.down, 'down stairs');
  for (const point of [...g.points, ...g.pickups, ...g.services, ...(g.rest ? [g.rest] : [])]) reachableCell(point.pos, point.kind);
  for (const room of g.adventureRooms ?? []) {
    reachableCell(room.interaction, `adventure room ${room.room} interaction`);
    for (const door of room.doors) reachableCell(door, `adventure room ${room.room} door`);
  }
}

function preparedMap({width = 7, height = 7, floor = [], liquid = [], seen = [], seenWalls = []} = {}) {
  return prepareTerrainMap({width, height, floor, liquid, seen, seenWalls});
}

function colorAt(image, x, y) {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

function tileRowEqual(a, b, y) {
  for (let x = 0; x < 24; x++) {
    if (colorAt(a, x, y).some((channel, i) => channel !== colorAt(b, x, y)[i])) return false;
  }
  return true;
}

function averageRgbDelta(image, pairs) {
  let total = 0, count = 0;
  for (const [x1, y1, x2, y2] of pairs) {
    const a = colorAt(image, x1, y1), b = colorAt(image, x2, y2);
    for (let c = 0; c < 3; c++) { total += Math.abs(a[c] - b[c]); count++; }
  }
  return total / count;
}

function flattenedPalette(theme) {
  const avg = [0, 1, 2].map((channel) => theme.floor.reduce((sum, color) => sum + color[channel], 0) / theme.floor.length);
  const keep = 1 - theme.floorNoise.flatten;
  const base = theme.floor.map((color) => color.map((channel, i) => Math.round(avg[i] + (channel - avg[i]) * keep)));
  const levels = theme.floorNoise.levels ?? base.map((_, i) => i);
  const available = [...new Set(levels)].map((i) => base[i]);
  const scaled = (color, factor) => color.map((channel) => Math.max(0, Math.min(255, Math.round(channel * factor))));
  return {
    bright: new Set(available.map((color) => scaled(color, 1.25).join(','))),
    dark: new Set(available.map((color) => scaled(color, 0.75).join(','))),
  };
}

function stoneMask(image, theme) {
  const colors = flattenedPalette(theme), mask = new Uint8Array(image.width * image.height);
  let bright = 0, dark = 0;
  for (let i = 0; i < mask.length; i++) {
    const at = i * 4, rgb = `${image.data[at]},${image.data[at + 1]},${image.data[at + 2]}`;
    if (colors.bright.has(rgb)) { mask[i] = 1; bright++; }
    else if (colors.dark.has(rgb)) { mask[i] = 1; dark++; }
  }
  return {mask, bright, dark};
}

function maxDiagonalAutocorrelation(mask, width, height, maxLag = 20) {
  let best = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    for (const dy of [lag, -lag]) {
      let n = 0, aOnes = 0, bOnes = 0, both = 0;
      for (let y = Math.max(0, -dy); y < height - Math.max(0, dy); y++) {
        for (let x = 0; x < width - lag; x++) {
          const a = mask[y * width + x], b = mask[(y + dy) * width + x + lag];
          n++; aOnes += a; bOnes += b; both += a & b;
        }
      }
      const pA = aOnes / n, pB = bOnes / n;
      const denominator = Math.sqrt(pA * (1 - pA) * pB * (1 - pB));
      if (denominator > 0) best = Math.max(best, Math.abs((both / n - pA * pB) / denominator));
    }
  }
  return best;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crcLowBitStoneMask(width, height) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // The 10 low CRC bits are linear for fixed-width coordinate bytes. The first 5% stands in for one stone shade.
      const value = crc32([
        (x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255,
        (y >>> 24) & 255, (y >>> 16) & 255, (y >>> 8) & 255, y & 255,
      ]) & 0x3ff;
      mask[y * width + x] = value < 51 ? 1 : 0;
    }
  }
  return mask;
}

test('T1: 256 masks reduce to the specified 47 sorted frames', () => {
  const expected = [
    0, 1, 4, 5, 7, 16, 17, 20, 21, 23, 28, 29, 31,
    64, 65, 68, 69, 71, 80, 81, 84, 85, 87, 92, 93, 95,
    112, 113, 116, 117, 119, 124, 125, 127,
    193, 197, 199, 209, 213, 215, 221, 223, 241, 245, 247, 253, 255,
  ];
  const reduced = Array.from({length: 256}, (_, mask) => reduceMask(mask));
  assert.equal(new Set(reduced).size, 47);
  assert.deepEqual(SHAPES, expected);
  assert.deepEqual([...new Set(reduced)].sort((a, b) => a - b), expected);
  for (let mask = 0; mask < 256; mask++) assert.equal(frameOf(mask), expected.indexOf(reduceMask(mask)), `mask ${mask}`);
  assert.equal(frameOf(255), 46);
  assert.equal(frameOf(124), 31);
  assert.equal(frameOf(0), 0);
});

test('T2/T10: visibility uses known walls; room sight marks its border; unknown cells do not leak', () => {
  const wall = {x: 3, y: 3}, hiddenFloor = {x: 3, y: 2};
  const wallBehind = preparedMap({seenWalls: [cellKey(wall)]});
  const hiddenWallMap = preparedMap({
    floor: [hiddenFloor], seenWalls: [cellKey(wall)],
  });
  assert.equal(frameOf(maskAt(wallBehind, wall.x, wall.y, 'wall')), 46);
  assert.equal(frameOf(maskAt(hiddenWallMap, wall.x, wall.y, 'wall')), 46,
    'changing an unrevealed cell cannot change the visible wall frame');
  const revealedBehindWall = preparedMap({
    floor: [hiddenFloor], seen: [cellKey(hiddenFloor)], seenWalls: [cellKey(wall)],
  });
  assert.notEqual(frameOf(maskAt(revealedBehindWall, wall.x, wall.y, 'wall')), 46,
    'revealing the floor behind the wall changes its frame');

  const room = {x: 2, y: 2, w: 3, h: 3};
  const floor = cellsOf(room);
  const roomSight = preparedMap({width: 7, height: 7, floor, seen: floor.map(cellKey)});
  const borderWall = {x: 2, y: 1};
  assert.equal(frameOf(maskAt(roomSight, borderWall.x, borderWall.y, 'wall')), 36,
    'the north room wall sees the known floor to its east and south');
  assert.equal(frameOf(maskAt(roomSight, 2, 2, 'edge')), 10,
    'the room corner floor keeps the two known wall sides');

  const doorCorner = {x: 3, y: 3};
  const neighbors = dirs8.map(([dx, dy]) => ({x: doorCorner.x + dx, y: doorCorner.y + dy}));
  const cornerWall = {x: doorCorner.x + 1, y: doorCorner.y - 1};
  const doorMap = preparedMap({
    floor: [doorCorner, ...neighbors.filter((p) => cellKey(p) !== cellKey(cornerWall))],
    seen: [cellKey(doorCorner), ...neighbors.filter((p) => cellKey(p) !== cellKey(cornerWall)).map(cellKey)],
    seenWalls: [cellKey(cornerWall)],
  });
  assert.equal(frameOf(maskAt(doorMap, doorCorner.x, doorCorner.y, 'edge')), 45,
    'the single northeast wall corner remains in the reduced edge mask');

  const unknownGround = {x: 3, y: 3};
  const unknownEdge = preparedMap({floor: [unknownGround, {x: 2, y: 3}], seen: []});
  assert.equal(frameOf(maskAt(unknownEdge, unknownGround.x, unknownGround.y, 'edge')), 46,
    'an unrevealed neighboring wall counts as non-wall for the edge layer');
  assert.equal(frameOf(maskAt(unknownEdge, 4, 3, 'wall')), 46,
    'an unrevealed neighboring floor counts as wall for the wall layer');
  const emptyEdge = buildAtlas('moss', 'edge');
  const x = (46 % 8) * 24, y = Math.floor(46 / 8) * 24;
  for (let py = y; py < y + 24; py++) for (let px = x; px < x + 24; px++) {
    assert.equal(emptyEdge.data[(py * emptyEdge.width + px) * 4 + 3], 0, 'edge frame 46 is fully transparent');
  }
});

test('T3: coordinate variants stay stable, weighted 2:1:1:1, and do not use Math.random', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('terrain variants must not use Math.random'); };
  try {
    assert.equal(terrainVariant(14, 9, 'wall', 177, 2), terrainVariant(14, 9, 'wall', 177, 2));
    const counts = [0, 0, 0, 0];
    for (let seed = 0; seed < 200; seed++) {
      for (let y = 0; y < 24; y++) for (let x = 0; x < 36; x++) {
        const variant = terrainVariant(x, y, 'wall', seed, 2);
        assert.ok(variant >= 0 && variant < 4, `seed ${seed} at ${x},${y}: variant ${variant} is in range`);
        counts[variant]++;
      }
    }
    const expectedRates = [0.4, 0.2, 0.2, 0.2];
    const samples = counts.reduce((sum, count) => sum + count, 0);
    for (let variant = 0; variant < 4; variant++) {
      const rate = counts[variant] / samples;
      assert.ok(Math.abs(rate - expectedRates[variant]) <= 0.02,
        `variant ${variant} rate ${(rate * 100).toFixed(2)}% is within two percentage points of ${(expectedRates[variant] * 100).toFixed(0)}%`);
    }
  } finally {
    Math.random = original;
  }
});

test('T4: 200 seeds on all three floors satisfy room, corridor, reachability, and width rules', t => {
  const params = {width: 36, height: 24, floors: 3, boss: true, roguelike: true};
  let redraws = 0;
  for (let seed = 0; seed < 200; seed++) {
    for (let level = 1; level <= 3; level++) {
      let generated;
      assert.doesNotThrow(() => { generated = generateFloor(seed, level, params); }, `seed ${seed} floor ${level}: a floor fits`);
      assertTerrainGeneration(generated, seed, level);
      // 8.8 (#178): the ground spacing rules make layout redraws normal (8.5b had no connection-failure redraw in this sample, and a 16 limit); measured maximum is 16, so 32 leaves headroom.
      assert.ok(generated.generationStats.layoutAttempts >= 1 && generated.generationStats.layoutAttempts <= 32);
      redraws += generated.generationStats.layoutAttempts - 1;
    }
  }
  t.diagnostic(`600层：布局重画共${redraws}次（含房间数不足的重画；8.8 起通道约束使连接失败的重画不再为 0，8.5b 为 0），所有楼层在32次内完成（实测最大16）。`);
});

test('T5: second-terrain features stay off the floor, preserve input bytes, and follow theme counts', () => {
  const params = {width: 36, height: 24, floors: 3, boss: true, roguelike: true};
  const bounds = {
    moss: {rivers: [0, 0], lakes: [0, 1]},
    wet: {rivers: [1, 2], lakes: [1, 2]},
    ash: {rivers: [1, 1], lakes: [1, 1]},
  };
  for (let level = 1; level <= 3; level++) {
    const theme = ['moss', 'wet', 'ash'][level - 1];
    for (let seed = 0; seed < 20; seed++) {
      const g = generateFloor(seed, level, params);
      const floorBytes = JSON.stringify(g.floor), roomBytes = JSON.stringify(g.rooms);
      const features = generateLiquidFeatures(seed, level, params, g.floor, g.rooms);
      const featuresAgain = generateLiquidFeatures(seed, level, params, g.floor, g.rooms);
      assert.equal(JSON.stringify(g.floor), floorBytes, `seed ${seed} floor ${level}: liquid generation leaves ground bytes unchanged`);
      assert.equal(JSON.stringify(g.rooms), roomBytes, `seed ${seed} floor ${level}: liquid generation leaves rooms unchanged`);
      assert.equal(JSON.stringify(featuresAgain), JSON.stringify(features), `seed ${seed} floor ${level}: features are stable`);
      assert.ok(features.rivers.length >= bounds[theme].rivers[0] && features.rivers.length <= bounds[theme].rivers[1],
        `seed ${seed} ${theme}: ${features.rivers.length} rivers within configured range`);
      assert.ok(features.lakes.length >= bounds[theme].lakes[0] && features.lakes.length <= bounds[theme].lakes[1],
        `seed ${seed} ${theme}: ${features.lakes.length} lakes within configured range`);
      const expected = [...new Map([...features.rivers, ...features.lakes].flat().map((p) => [cellKey(p), p])).values()]
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const liquid = generateLiquid(seed, level, params, g.floor, g.rooms);
      const liquidAgain = generateLiquid(seed, level, params, g.floor, g.rooms);
      assert.deepEqual(liquidAgain, liquid, `seed ${seed} floor ${level}: liquid cells are byte-stable`);
      assert.deepEqual(liquid, expected,
        `seed ${seed} floor ${level}: pure liquid output is the sorted feature union`);
      assert.deepEqual(g.liquid, liquid, `seed ${seed} floor ${level}: generated floor carries the same liquid cells`);
      assert.equal(JSON.stringify(g.floor), floorBytes, `seed ${seed} floor ${level}: liquid generation leaves ground bytes unchanged`);
      assert.equal(JSON.stringify(g.rooms), roomBytes, `seed ${seed} floor ${level}: liquid generation leaves rooms unchanged`);
      const floorSet = new Set(g.floor.map(cellKey));
      const liquidSet = new Set(g.liquid.map(cellKey));
      assert.equal(liquidSet.size, g.liquid.length, `seed ${seed} floor ${level}: no duplicate liquid cells`);
      for (const p of g.liquid) {
        assert.ok(p.x >= 0 && p.y >= 0 && p.x < g.width && p.y < g.height, `seed ${seed} floor ${level}: liquid is in bounds`);
        assert.ok(!floorSet.has(cellKey(p)), `seed ${seed} floor ${level}: liquid does not overlap ground at ${cellKey(p)}`);
      }
    }
  }
});

test('T6: liquid is a wall for movement, blow-away, sight, and in-memory floor storage', () => {
  const movement = world({A: friend('A', 1, 1, 20, {tackle: 1})}, {
    floor: [{x: 1, y: 1}, {x: 3, y: 1}], queue: ['A'],
  });
  movement.liquid = ['2,1'];
  const blocked = applyCommand(movement, {type: 'round', action: {type: 'move', to: {x: 2, y: 1}}});
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /墙|水面|岩浆/);
  assert.deepEqual(movement.units.A.pos, {x: 1, y: 1}, 'a refused move leaves the unit at its start');

  const blowawayFloor = Array.from({length: 7}, (_, x) => x === 4 ? null : ({x, y: 1})).filter(Boolean);
  const pushWorld = world({
    A: friend('A', 1, 1, 20, {roar: 2}),
    E: enemy('E', 2, 1, 20, 'melee', {waitOnly: true}),
  }, {floor: blowawayFloor, queue: ['A'], enemies: ['E']});
  pushWorld.liquid = ['4,1'];
  const pushed = applyCommand(pushWorld, {type: 'round', action: {type: 'skill', skill: 'roar', target: 'E'}});
  assert.equal(pushed.ok, true, pushed.error);
  assert.deepEqual(pushed.state.units.E.pos, {x: 3, y: 1}, 'the target stops on the last ground cell before liquid');
  assert.equal(pushed.state.units.E.hp, 15, 'the blocked push applies the usual five-point wall collision');

  const sightWorld = world({A: friend('A', 1, 1)}, {floor: [{x: 1, y: 1}, {x: 2, y: 1}, {x: 3, y: 1}], queue: ['A']});
  const clearSight = currentlyVisible(sightWorld, {x: 1, y: 1}, {x: 3, y: 1});
  sightWorld.floor = [{x: 1, y: 1}, {x: 3, y: 1}];
  sightWorld.liquid = ['2,1'];
  assert.equal(clearSight, true, 'the straight corridor is visible when its middle cell is ground');
  assert.equal(currentlyVisible(sightWorld, {x: 1, y: 1}, {x: 3, y: 1}), false,
    'the same sight ray stops at a liquid cell');

  const run = createExpedition('terrain-memory', 85, 3);
  assert.ok(Array.isArray(run.liquid) && run.liquid.every((cell) => typeof cell === 'string'),
    'the current world carries comma-separated liquid keys');
  const floorOne = [...run.liquid];
  const floorTwo = jumpToFloor(run, 2);
  assert.deepEqual(floorTwo.dungeon.stored['1'].liquid, floorOne,
    'leaving floor 1 stores its liquid layer with the other floor state');
  assert.ok(Array.isArray(floorTwo.liquid) && floorTwo.liquid.every((cell) => typeof cell === 'string'),
    'the newly loaded world also carries comma-separated liquid keys');
});

test('T7: decorations use eligible cells, honor exclusions and spacing, obey density, visibility, and absent atlases', () => {
  const width = 64, height = 64;
  const floor = [];
  for (let y = 2; y <= 30; y++) for (let x = 2; x <= 60; x++) floor.push({x, y});
  const seen = floor.map(cellKey), floorSet = new Set(seen), seenWalls = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!floorSet.has(key(x, y))) seenWalls.push(key(x, y));
  const map = prepareTerrainMap({width, height, floor, seen, seenWalls});
  const input = {map, theme: TERRAIN_THEMES.moss, seed: 81, level: 2};
  const eligibleFloor = floor.filter((p) => dirs8.every(([dx, dy]) => {
    const x = p.x + dx, y = p.y + dy;
    return x >= 0 && y >= 0 && x < width && y < height && floorSet.has(key(x, y));
  })).length;
  const eligibleWallTop = Array.from({length: height}, (_, y) => Array.from({length: width}, (_, x) => ({x, y})))
    .flat().filter((p) => !floorSet.has(cellKey(p))
      && !floorSet.has(key(p.x, p.y - 1)) && !floorSet.has(key(p.x, p.y + 1))).length;
  let floorCount = 0, wallTopCount = 0;
  for (let seed = 0; seed < 200; seed++) {
    const candidates = decorationCandidates({...input, seed});
    floorCount += candidates.filter((candidate) => candidate.kind === 'floor').length;
    wallTopCount += candidates.filter((candidate) => candidate.kind === 'wallTop').length;
  }
  const floorRate = floorCount / (eligibleFloor * 200);
  const wallTopRate = wallTopCount / (eligibleWallTop * 200);
  assert.ok(Math.abs(floorRate - TERRAIN_THEMES.moss.decoDensity.floor) <= 0.02, `floor decoration rate ${floorRate}`);
  assert.ok(Math.abs(wallTopRate - TERRAIN_THEMES.moss.decoDensity.wallTop) <= 0.02, `wall-top decoration rate ${wallTopRate}`);

  const atlas = {frames: ['floor-rocks', 'floor-pebbles', 'wall-moss', 'wall-rocks']};
  const full = selectDecorations({...input, seed: 81, atlas});
  assert.ok(full.length > 0, 'the fixture map receives decorations');
  for (let i = 0; i < full.length; i++) {
    const d = full[i];
    assert.ok(atlas.frames.includes(d.frame), `decoration ${cellKey(d)} uses a substitute atlas frame`);
    if (d.kind === 'floor') {
      assert.ok(d.frame.startsWith('floor-'), `ground decoration ${cellKey(d)} uses a ground frame`);
      assert.ok(floorSet.has(cellKey(d)), `floor decoration ${cellKey(d)} is on ground`);
      assert.ok(d.x > 2 && d.x < 60 && d.y > 2 && d.y < 30, `floor decoration ${cellKey(d)} has no wall neighbor`);
    } else {
      assert.ok(d.frame.startsWith('wall-'), `wall-top decoration ${cellKey(d)} uses a wall frame`);
      assert.ok(!floorSet.has(cellKey(d)), `wall-top decoration ${cellKey(d)} is on a wall`);
      assert.ok(!floorSet.has(key(d.x, d.y - 1)) && !floorSet.has(key(d.x, d.y + 1)),
        `wall-top decoration ${cellKey(d)} has wall north and south`);
    }
    for (const other of full.slice(i + 1)) {
      assert.ok(Math.max(Math.abs(d.x - other.x), Math.abs(d.y - other.y)) >= 2,
        `decorations ${cellKey(d)} and ${cellKey(other)} keep Chebyshev distance two`);
    }
  }

  const candidates = decorationCandidates({...input, seed: 81});
  const selected = full[0];
  assert.ok(selected, 'the placement pass returns a deterministic decoration');
  const excluded = decorationCandidates({...input, seed: 81, excluded: [cellKey(selected)]});
  assert.ok(!excluded.some((candidate) => cellKey(candidate) === cellKey(selected)), 'excluded cells are never selected');
  const afterExclusion = selectDecorations({...input, seed: 81, atlas, excluded: [cellKey(selected)]});
  assert.ok(!afterExclusion.some((decoration) => cellKey(decoration) === cellKey(selected)), 'excluded cells never receive a displayed decoration');

  const floorOnlyAtlas = {frames: ['floor-rocks']};
  const floorOnly = selectDecorations({...input, seed: 81, atlas: floorOnlyAtlas});
  assert.ok(floorOnly.length > 0 && floorOnly.every((d) => d.kind === 'floor' && d.frame.startsWith('floor-')),
    'a missing wall frame hides wall-top candidates without changing the floor placements');
  assert.deepEqual(floorOnly.map(({x, y, kind}) => ({x, y, kind})),
    full.filter((d) => d.kind === 'floor').map(({x, y, kind}) => ({x, y, kind})),
    'wall-top candidates still go through the shared spacing pass when their kind has no atlas frames');

  const partialMap = prepareTerrainMap({width, height, floor, seen: [floor[300] ? cellKey(floor[300]) : ''], seenWalls: []});
  const partial = selectDecorations({...input, map: partialMap, seed: 81, atlas});
  const known = new Set(partialMap.known);
  assert.ok(partial.every((d) => known.has(cellKey(d))), 'unrevealed decoration cells are not returned');
  assert.deepEqual(selectDecorations({...input, seed: 81}), [], 'an absent decoration atlas produces an empty layer');
  assert.deepEqual(selectDecorations({...input, seed: 81, atlas: null}), [], 'missing decoration assets produce an empty layer');
});

test('T10: the edge atlas keeps diagonal door corners and leaves the fully open frame transparent', () => {
  const corner = {x: 3, y: 3};
  const floor = [corner];
  const seenWalls = [];
  for (const [dx, dy, bit] of dirs8) {
    const p = {x: corner.x + dx, y: corner.y + dy};
    if (bit !== 2) floor.push(p);
    else seenWalls.push(cellKey(p));
  }
  const map = preparedMap({floor, seen: floor.map(cellKey), seenWalls});
  assert.equal(frameOf(maskAt(map, corner.x, corner.y, 'edge')), 45,
    'the northeast diagonal wall at a doorway is retained in the 47-shape mask');
  const edge = buildAtlas('moss', 'edge');
  const openX = (46 % 8) * 24, openY = Math.floor(46 / 8) * 24;
  for (let y = openY; y < openY + 24; y++) for (let x = openX; x < openX + 24; x++) {
    assert.equal(edge.data[(y * edge.width + x) * 4 + 3], 0, 'open ground has a transparent edge tile');
  }
});

test('T11: facade height defaults to 16 and changes only the lower wall face', () => {
  const base = TERRAIN_THEMES.moss;
  const missing = structuredClone(base);
  delete missing.facadeHeight;
  const noSetting = buildAtlas(missing, 'wall');
  const defaultSixteen = buildAtlas({...base, facadeHeight: 16}, 'wall');
  assert.deepEqual(noSetting.data, defaultSixteen.data, 'missing facadeHeight uses the default 16-pixel face');

  const short = buildAtlas({...base, facadeHeight: 10}, 'wall');
  const tall = buildAtlas({...base, facadeHeight: 20}, 'wall');
  const topLight = base.wall[2].map((channel) => Math.round(channel * 0.9));
  assert.deepEqual(colorAt(tall, 12, 0).slice(0, 3), topLight, 'the wall top remains visible above a 20-pixel face');
  for (let y = 0; y < 4; y++) assert.ok(tileRowEqual(short, tall, y), `wall-top row ${y} stays uncovered by the face`);
  for (let y = 4; y < 14; y++) {
    assert.ok(!tileRowEqual(short, tall, y), `face height changes pixels in lower wall row ${y}`);
  }
});

test('T12: floor texture repeats deterministically, wraps smoothly, has balanced stones, and rejects CRC diagonal stripes', () => {
  let mossAgain;
  for (const themeName of ['moss', 'wet', 'ash']) {
    const theme = TERRAIN_THEMES[themeName];
    const image = buildFloorTexture(theme);
    assert.equal(image.width, 384);
    assert.equal(image.height, 384);
    if (themeName === 'moss') mossAgain = buildFloorTexture(theme);

    const {bright, dark} = stoneMask(image, theme);
    const total = image.width * image.height;
    const brightRate = bright / total, darkRate = dark / total;
    assert.ok(Math.abs(brightRate - 0.05) <= 0.01, `${themeName} bright stones ${(brightRate * 100).toFixed(2)}%`);
    assert.ok(Math.abs(darkRate - 0.05) <= 0.01, `${themeName} dark stones ${(darkRate * 100).toFixed(2)}%`);

    const horizontalSeam = [], horizontalInside = [], verticalSeam = [], verticalInside = [];
    for (let i = 0; i < image.width; i++) {
      horizontalSeam.push([0, i, image.width - 1, i]);
      horizontalInside.push([0, i, 1, i]);
      verticalSeam.push([i, 0, i, image.height - 1]);
      verticalInside.push([i, 0, i, 1]);
    }
    const seam = (averageRgbDelta(image, horizontalSeam) + averageRgbDelta(image, verticalSeam)) / 2;
    const inside = (averageRgbDelta(image, horizontalInside) + averageRgbDelta(image, verticalInside)) / 2;
    assert.ok(seam >= inside * 0.4 && seam <= inside * 2.5 + 2,
      `${themeName} wrap delta ${seam.toFixed(2)} is on the scale of interior delta ${inside.toFixed(2)}`);

    const autocorrelation = maxDiagonalAutocorrelation(stoneMask(image, theme).mask, image.width, image.height);
    assert.ok(autocorrelation < 0.06, `${themeName} diagonal stone correlation ${autocorrelation.toFixed(3)} has no stripe`);
  }
  assert.deepEqual(mossAgain.data, buildFloorTexture('moss').data, 'same theme produces identical pixels on repeat');

  const crcMask = crcLowBitStoneMask(384, 384);
  const crcRate = crcMask.reduce((sum, stone) => sum + stone, 0) / crcMask.length;
  assert.ok(Math.abs(crcRate - 0.05) <= 0.01, `CRC negative case has the same roughly 5% stone density (${(crcRate * 100).toFixed(2)}%)`);
  const crcCorrelation = maxDiagonalAutocorrelation(crcMask, 384, 384);
  assert.ok(crcCorrelation >= 0.06,
    `the same diagonal-correlation check rejects a CRC32 low-bit pattern (${crcCorrelation.toFixed(3)})`);
});
