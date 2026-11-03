import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readPng} from '../../tools/png-read.mjs';
import {
  DTEF_CONFIG, DTEF_REMAP_RULES, DTEF_SLOT_OF_MASK, DTEF_SHEET, FLOOR, LIQUID, WALL, animationFrame, chooseDtefTile, dtefFiles,
  dtefMaskAt, dtefSlot, planDtefTerrain, tileId, tileRect, toDmaMask,
} from '../../src/render/dtef.ts';
import {SHAPES, prepareTerrainMap, reduceMask} from '../../src/render/terrain.ts';

const dir = new URL('../../public/assets/tiles/dtef/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('../../public/assets/manifest.json', import.meta.url), 'utf8'));

test('D1 all 256 masks map to one of the 47 filled slots, and every filled slot is used', () => {
  assert.equal(DTEF_REMAP_RULES.length, 48);
  assert.equal(DTEF_REMAP_RULES.filter((r) => r !== null).length, 47);
  assert.equal(DTEF_REMAP_RULES.indexOf(null), 17, 'empty slot is column 5, row 2');
  const used = new Set();
  for (let mask = 0; mask < 256; mask++) {
    const slot = dtefSlot(mask);
    assert.ok(slot >= 0 && slot < 48 && slot !== 17, `mask ${mask}`);
    used.add(slot);
  }
  assert.equal(used.size, 47);
  assert.equal(DTEF_SLOT_OF_MASK.length, 256);
});
test('D2 the 47 existing shapes land on 47 different slots and agree with reduceMask', () => {
  assert.equal(new Set(SHAPES.map(dtefSlot)).size, 47);
  for (let mask = 0; mask < 256; mask++) assert.equal(dtefSlot(mask), dtefSlot(reduceMask(mask)), `mask ${mask}`);
});
test('D3 hand-checked masks (our bit order north=1 ... north-west=128)', () => {
  const at = (slot) => [slot % 6, Math.floor(slot / 6)];
  assert.deepEqual(at(dtefSlot(0)), [4, 1], 'isolated tile');
  assert.deepEqual(at(dtefSlot(255)), [1, 1], 'all 8 neighbours the same: centre tile');
  assert.deepEqual(at(dtefSlot(1)), [4, 4], 'only north is the same class: bottom end of a vertical bar');
  assert.deepEqual(at(dtefSlot(16)), [4, 2], 'only south is the same class: top end of a vertical bar');
  assert.deepEqual(at(dtefSlot(4 | 64)), [4, 0], 'east and west: horizontal bar');
  assert.deepEqual(at(dtefSlot(1 | 16)), [3, 1], 'north and south: vertical bar');
  assert.equal(toDmaMask(1), 16, 'our north is the DMA north bit');
  assert.equal(toDmaMask(16), 1, 'our south is the DMA south bit');
});
test('D4 each theme: sheet sizes, empty-tile lists, the empty slot, and animation frames match the real PNGs', () => {
  for (const theme of Object.values(DTEF_CONFIG.themes)) {
    theme.variants.forEach((v, i) => {
      const img = readPng(new URL(`${theme.set}/${v.file}`, dir));
      assert.deepEqual([img.width, img.height], [DTEF_SHEET.width, DTEF_SHEET.height], `${theme.set} ${v.file}`);
      assert.equal(v.file, `tileset_${i}.png`);
      const empty = [];
      for (let id = 0; id < 144; id++) {
        const r = tileRect(id); let any = false;
        for (let y = 0; y < 24 && !any; y++) for (let x = 0; x < 24; x++) if (img.data[((r.y + y) * img.width + r.x + x) * 4 + 3] > 0) { any = true; break; }
        if (!any) empty.push(id);
      }
      assert.deepEqual(empty, [...v.empty], `${theme.set} variant ${i} empty tiles`);
      if (i === 0) for (const seg of [WALL, LIQUID, FLOOR]) {
        const missing = empty.filter((id) => Math.floor(id / 48) === seg);
        assert.deepEqual(missing, [tileId(seg, 17)], `${theme.set} variant 0 segment ${seg} has only the empty slot empty`);
      }
    });
    for (const a of theme.animations) {
      assert.ok(a.frames.length > 0 && a.ticks > 0 && a.tiles.length > 0);
      for (const f of a.frames) { const img = readPng(new URL(`${theme.set}/${f}`, dir)); assert.deepEqual([img.width, img.height], [432, 192], f); }
    }
  }
  assert.deepEqual(Object.values(DTEF_CONFIG.themes).map((t) => t.set), ['TinyWoods', 'WaterfallCave', 'MagmaCavern2']);
});
test('D5 an empty tile reuses the previous variant, variant 0 takes about 95%, and second terrain stays animated', () => {
  for (const theme of Object.values(DTEF_CONFIG.themes)) {
    const counts = [0, 0, 0]; let n = 0;
    for (let x = 0; x < 100; x++) for (let y = 0; y < 100; y++) for (const kind of [WALL, LIQUID, FLOOR]) {
      const slot = [10, 7, 0, 21][(x + y) % 4];
      const c = chooseDtefTile(theme, kind, slot, x, y, 5, 2);
      assert.ok(!theme.variants[c.variant].empty.includes(c.id), `${theme.set} ${c.id} variant ${c.variant}`);
      if (kind === FLOOR) { counts[c.variant]++; n++; }
    }
    if (theme.set === 'TinyWoods') assert.ok(counts[0] / n > 0.92 && counts[0] / n < 0.99, String(counts));
    const liquid = chooseDtefTile(theme, LIQUID, 7, 3, 4, 1, 2);
    assert.ok(liquid.overlays.length > 0, `${theme.set} second terrain is animated`);
  }
});
test('D6 animation frame follows 1/60 s ticks and loops', () => {
  const a = {ticks: 9, frames: ['a', 'b', 'c']};
  assert.equal(animationFrame(a, 0), 0); assert.equal(animationFrame(a, 149), 0); assert.equal(animationFrame(a, 150), 1);
  assert.equal(animationFrame(a, 450), 0);
});
test('D7 unrevealed neighbours count as the same class; outside the map only walls match', () => {
  const floor = []; for (let x = 2; x <= 4; x++) for (let y = 2; y <= 4; y++) floor.push({x, y});
  const map = prepareTerrainMap({width: 7, height: 7, floor, liquid: [], seen: ['3,3']});
  assert.equal(dtefMaskAt(map, 3, 3, FLOOR), 255, 'unrevealed floor around a seen floor cell draws no false edge');
  const all = floor.map((c) => `${c.x},${c.y}`);
  const full = prepareTerrainMap({width: 7, height: 7, floor, liquid: [], seen: all});
  assert.equal(dtefMaskAt(full, 0, 3, WALL) & (32 | 64 | 128), 32 | 64 | 128, 'outside the map is wall');
  assert.equal(dtefMaskAt(full, 0, 3, FLOOR) & (32 | 64 | 128), 0, 'outside the map is not floor');
  assert.equal(dtefMaskAt(full, 2, 2, FLOOR) & 1, 0, 'a revealed wall above a revealed floor cell is a different class');
  const cells = planDtefTerrain(full, 'moss', 1, 1);
  assert.ok(cells.every((c) => c.slot >= 0 && c.slot < 48 && c.slot !== 17));
  assert.equal(cells.filter((c) => c.kind === FLOOR).length, 9);
  assert.equal(cells.length, 25, '9 floor cells plus the ring of 16 walls');
});
test('D8 every DTEF file is in the manifest with true size and sha256, source commit and a private-build licence', () => {
  for (const theme of Object.values(DTEF_CONFIG.themes)) {
    const listed = fs.readdirSync(new URL(theme.set + '/', dir)).sort();
    for (const f of dtefFiles(theme)) assert.ok(listed.includes(f), `${theme.set}/${f} exists`);
    for (const f of listed) {
      const m = manifest.files[`tiles/dtef/${theme.set}/${f}`];
      assert.ok(m, f);
      const data = fs.readFileSync(new URL(`${theme.set}/${f}`, dir));
      assert.equal(m.bytes, data.length); assert.equal(m.sha256, createHash('sha256').update(data).digest('hex'));
      assert.equal(m.commit, '03c80dad937911572f8fb19903771a47956fc696');
      assert.equal(m.sourceUrl, `https://github.com/PMDCollab/RawAsset/tree/${m.commit}/TileDtef/${theme.set}`);
      assert.match(m.licence, /Private build only/);
    }
  }
});
