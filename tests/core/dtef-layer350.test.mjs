
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DTEF_CONFIG, DTEF_TILE, WALL, dtefSlot, tileId, planDtefTerrain,
} from '../../src/render/dtef.ts';
import {DtefTerrainLayer} from '../../src/render/dtef-scene.ts';

function mockScene() {
  const textures = new Map();
  const images = [];
  const tileSprites = [];
  function textureFor(key) {
    let texture = textures.get(key);
    if (texture) return texture;
    const frames = new Map();
    texture = {
      key,
      add(name, sourceIndex, x, y, width, height) {
        const frame = {name, sourceIndex, cutX: x, cutY: y, cutWidth: width, cutHeight: height, width, height};
        frames.set(String(name), frame);
        return frame;
      },
      get(name) {
        const frame = frames.get(String(name));
        if (!frame) throw new Error('Missing fake frame ' + name + ' on ' + key);
        return frame;
      },
      getSourceImage() { return {fakeSource: key}; },
    };
    textures.set(key, texture);
    return texture;
  }
  class FakeImage {
    constructor(x, y, textureKey, frameKey) {
      this.x = x; this.y = y; this.textureKey = textureKey; this.frameKey = frameKey;
      this.active = true; this.scale = 1; this.depth = 0; this.textureChanges = 0;
      images.push(this);
    }
    setScale(value) { this.scale = value; return this; }
    setDepth(value) { this.depth = value; return this; }
    setPosition(x, y) { this.x = x; this.y = y; return this; }
    setTexture(textureKey, frameKey) { this.textureKey = textureKey; this.frameKey = frameKey; this.textureChanges++; return this; }
    destroy() { this.active = false; }
  }
  class FakeTileSprite {
    constructor(x, y, width, height, textureKey, frameKey) {
      this.x = x; this.y = y; this.width = width; this.height = height; this.active = true;
      this.texture = textureFor(textureKey); this.frame = this.texture.get(frameKey);
      this.tileScaleX = 1; this.tileScaleY = 1; this.depth = 0;
      tileSprites.push(this);
    }
    setDepth(value) { this.depth = value; return this; }
    setPosition(x, y) { this.x = x; this.y = y; return this; }
    setSize(width, height) { this.width = width; this.height = height; return this; }
    setTileScale(x, y = x) { this.tileScaleX = x; this.tileScaleY = y; return this; }
    setTexture(textureKey, frameKey) { this.texture = textureFor(textureKey); this.frame = this.texture.get(frameKey); return this; }
    destroy() { this.active = false; }
  }
  return {
    scene: {
      textures: {get: textureFor, exists: key => textures.has(key)},
      add: {
        image: (x, y, textureKey, frameKey) => new FakeImage(x, y, textureKey, frameKey),
        tileSprite: (x, y, width, height, textureKey, frameKey) => new FakeTileSprite(x, y, width, height, textureKey, frameKey),
      },
    },
    images, tileSprites, textures,
  };
}

function argsFor(map, changes = {}) {
  const scale = changes.scale ?? 1;
  return {
    map, theme: changes.theme ?? 'moss', seed: 23, level: 2, scale, frozen: changes.frozen ?? false,
    center: p => ({x: 10 + (p.x + 0.5) * DTEF_TILE * scale, y: 20 + (p.y + 0.5) * DTEF_TILE * scale}),
  };
}

function withFakeCanvas(run) {
  const previous = globalThis.document;
  let creates = 0, draw = null;
  const visible = new Uint8ClampedArray(DTEF_TILE * DTEF_TILE * 4);
  visible.set([10, 20, 30, 255], 0);
  visible.set([90, 100, 110, 255], 8);
  visible.set([250, 240, 230, 0], 16);
  globalThis.document = {
    createElement(name) {
      assert.equal(name, 'canvas');
      creates++;
      return {
        width: 0, height: 0,
        getContext(kind, options) {
          assert.equal(kind, '2d');
          assert.equal(options.willReadFrequently, true);
          return {
            drawImage(...args) { draw = args; },
            getImageData() { return {data: visible}; },
          };
        },
      };
    },
  };
  try { return run({get creates() { return creates; }, get draw() { return draw; }}); }
  finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

test('DTEF underlay repeats one wall-center frame and does not reveal hidden floor geometry', () => {
  const {scene, tileSprites} = mockScene();
  const layer = new DtefTerrainLayer(scene);
  const hiddenA = {width: 5, height: 5, floor: [{x: 0, y: 0}], liquid: [], seen: [], seenWalls: [], onlyRevealed: true};
  const hiddenB = {width: 5, height: 5, floor: [{x: 4, y: 4}], liquid: [], seen: [], seenWalls: [], onlyRevealed: true};
  withFakeCanvas(canvas => {
    layer.show('floor-a', argsFor(hiddenA));
    const underlay = tileSprites[0];
    const before = layer.debug();
    assert.equal(layer.images.length, 0);
    assert.equal(before.buildCount, 1);
    assert.equal(before.underlay.type, 'TileSprite');
    assert.equal(before.underlay.marginTiles, 64);
    assert.deepEqual([before.underlay.columns, before.underlay.rows], [133, 133]);
    assert.deepEqual([before.underlay.width, before.underlay.height], [133 * 24, 133 * 24]);
    assert.equal(before.underlay.frame, String(tileId(WALL, dtefSlot(255))));
    assert.deepEqual(layer.wallColor(), [50, 60, 70]);
    assert.equal(canvas.creates, 1);
    assert.deepEqual(canvas.draw.slice(1, 5), [underlay.frame.cutX, underlay.frame.cutY, 24, 24]);

    layer.show('floor-a', argsFor(hiddenB));
    const after = layer.debug();
    assert.equal(tileSprites.length, 1, 'same floor does not rebuild its backdrop');
    assert.equal(tileSprites[0], underlay);
    assert.equal(after.changedCells, 0);
    assert.equal(after.imageCount, 0);
    assert.equal(canvas.creates, 1, 'wall color is cached per atlas');
    assert.equal(after.underlay.frame, before.underlay.frame);
    assert.deepEqual(layer.images, [], 'different unrevealed maps render identically');
  });
});

test('revealing one wall updates its new cell and adjacent shape while unrelated images survive', () => {
  const {scene} = mockScene();
  const layer = new DtefTerrainLayer(scene);
  const initial = {
    width: 5, height: 5, floor: [{x: 2, y: 2}, {x: 0, y: 0}], liquid: [],
    seen: ['2,2', '0,0'], seenWalls: [], onlyRevealed: true,
  };
  const reveal = {...initial, seenWalls: ['3,2']};
  layer.show('floor-a', argsFor(initial));
  const unaffected = layer.images.find(image => image.x === 22 && image.y === 32);
  const changed = layer.images.find(image => image.x === 70 && image.y === 80);
  assert.ok(unaffected && changed);
  const oldCount = layer.images.length;

  layer.show('floor-a', argsFor(reveal));
  const newUnaffected = layer.images.find(image => image.x === 22 && image.y === 32);
  const newNeighbor = layer.images.find(image => image.x === 70 && image.y === 80);
  const newWall = layer.images.find(image => image.x === 94 && image.y === 80);
  assert.equal(newUnaffected, unaffected, 'unrelated image keeps object identity');
  assert.notEqual(newNeighbor, changed, 'the adjacent cell whose mask changed is replaced');
  assert.equal(changed.active, false);
  assert.ok(newWall, 'newly revealed wall gets a terrain image');
  assert.equal(layer.debug().changedCells, 2, 'one reveal plus one adjacent shape update');
  assert.equal(layer.images.length, oldCount + 1);
  assert.equal(layer.debug().buildCount, 1);
});

test('resize repositions and resizes the same backdrop; floor change and clear destroy the old layer', () => {
  const {scene, tileSprites, images, textures} = mockScene();
  const layer = new DtefTerrainLayer(scene);
  const map = {width: 5, height: 4, floor: [{x: 2, y: 2}], liquid: [], seen: ['2,2'], seenWalls: [], onlyRevealed: true};
  layer.show('floor-a', argsFor(map));
  const underlay = tileSprites[0], image = layer.images[0];
  const textureKey = layer.debug().underlay.texture;
  const sharedTexture = textures.get(textureKey);
  layer.show('floor-a', argsFor(map, {scale: 2}));
  assert.equal(tileSprites.length, 1);
  assert.equal(tileSprites[0], underlay);
  assert.deepEqual([underlay.x, underlay.y], [10 + 5 * 24, 20 + 4 * 24]);
  assert.deepEqual([underlay.width, underlay.height], [(5 + 128) * 48, (4 + 128) * 48]);
  assert.deepEqual([underlay.tileScaleX, underlay.tileScaleY], [2, 2]);
  assert.equal(layer.images[0], image);
  assert.deepEqual([image.x, image.y, image.scale], [10 + 2.5 * 48, 20 + 2.5 * 48, 2]);
  assert.equal(layer.debug().buildCount, 1);

  withFakeCanvas(() => layer.show('floor-b', {...argsFor(map, {theme: 'wet'}), center: p => ({x: p.x * 48 + 9, y: p.y * 48 + 11})}));
  assert.equal(underlay.active, false);
  assert.equal(image.active, false);
  assert.equal(tileSprites.length, 2);
  assert.equal(layer.debug().floorKey, 'floor-b');
  assert.equal(layer.debug().buildCount, 2);
  assert.equal(textures.get(textureKey), sharedTexture, 'clearing a layer does not remove shared atlas textures');

  const newUnderlay = tileSprites[1];
  const activeImages = layer.images.slice();
  layer.clear();
  assert.equal(newUnderlay.active, false);
  assert.ok(activeImages.every(item => !item.active));
  assert.equal(layer.debug().floorKey, null);
  assert.equal(layer.debug().underlay, null);
  assert.equal(layer.debug().tileCount, 0);
  assert.equal(layer.images.length, 0);
  assert.ok(images.length > 0);
});

test('overlay animation follows floor time and frozen floors retain their displayed frame', () => {
  const {scene} = mockScene();
  const layer = new DtefTerrainLayer(scene);
  const map = {width: 5, height: 5, floor: [], liquid: ['2,2'], seen: [], seenWalls: ['2,2'], onlyRevealed: true};
  const planned = planDtefTerrain(map, 'moss', 23, 2);
  assert.ok(planned[0].overlays.length > 0);
  const animation = planned[0].overlays[0];
  layer.show('liquid-floor', argsFor(map));
  const overlay = layer.images[1];
  const firstTexture = overlay.textureKey;
  layer.update(animation.ticks * 1000 / 60);
  assert.notEqual(overlay.textureKey, firstTexture);
  const animatedTexture = overlay.textureKey;
  layer.show('liquid-floor', argsFor(map, {frozen: true}));
  layer.update(animation.ticks * 1000 / 60 * 2);
  assert.equal(overlay.textureKey, animatedTexture);
});
