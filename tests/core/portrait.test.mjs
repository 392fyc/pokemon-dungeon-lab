import test from 'node:test';
import assert from 'node:assert/strict';
import characters from '../../src/render/characters.json' with {type:'json'};
import {portraitFrameIndex,portraitMarkup,portraitVisibleRect} from '../../src/render/portrait.ts';

const examples=['0001','0002','0003','0005','0009','0130','0156'];

test('generated Idle visible rectangles are valid and fit the actual source frames',()=>{
  assert.equal(Object.keys(characters).length,175);
  for(const [dex,entry] of Object.entries(characters)){
    const idle=entry.Idle;
    assert.ok(idle?.visible,`${dex} has generated Idle visible pixels`);
    const {x,y,w,h}=idle.visible;
    assert.ok([x,y,w,h].every(Number.isInteger),`${dex} visible bounds use integer source pixels`);
    assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=idle.w&&y+h<=idle.h,
      `${dex} visible rectangle fits inside its source frame`);
  }
  for(const dex of examples){
    const idle=characters[dex]?.Idle;
    assert.ok(idle,`${dex} has Idle metadata`);
    const visible=portraitVisibleRect(idle);
    assert.ok(visible,`${dex} has a readable visible region`);
    assert.deepEqual(visible,idle.visible,`${dex} uses the generated visible region`);
    assert.ok(visible.w>0&&visible.h>0,`${dex} has nonempty visible pixels`);
    assert.ok(visible.x>=0&&visible.y>=0&&visible.x+visible.w<=idle.w&&visible.y+visible.h<=idle.h,
      `${dex} visible region is contained in its source frame`);
  }
});

test('portrait animation uses one stable cumulative-duration window and static mode stays on frame zero',()=>{
  const durations=[40,6,6];
  assert.equal(portraitFrameIndex(0,durations,true),0);
  assert.equal(portraitFrameIndex(660,durations,true),0);
  assert.equal(portraitFrameIndex(680,durations,true),1);
  assert.equal(portraitFrameIndex(760,durations,true),1);
  assert.equal(portraitFrameIndex(770,durations,true),2);
  assert.equal(portraitFrameIndex(870,durations,true),0);
  assert.equal(portraitFrameIndex(770,durations,false),0);
  assert.equal(portraitFrameIndex(-1,durations,true),0);
});

test('portrait asset URLs follow the page base before a built stylesheet consumes the CSS variable',()=>{
  const previous=globalThis.document;
  try{
    globalThis.document={baseURI:'https://example.invalid/private/ea/index.html'};
    const markup=portraitMarkup('0001',{boxClass:'test-box',spriteClass:'test-frame',label:'妙蛙种子'});
    assert.ok(markup.includes('https://example.invalid/private/ea/assets/characters/0001/Idle-Anim.png'),
      'a relative CSS asset must not be resolved a second time under the built assets directory');
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
