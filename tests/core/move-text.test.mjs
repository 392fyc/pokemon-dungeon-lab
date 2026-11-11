import test from 'node:test';
import assert from 'node:assert/strict';
import {moveOf,moveEffects,moveCategory} from '../../src/core/moves.ts';
import {moveEffectText,moveEffectLines,HANDLED_EFFECTS,HANDLED_FX_FIELDS} from '../../src/core/move-text.ts';
import {wikiMoveIds} from '../../src/core/wiki.ts';
import {typeEffectiveness} from '../../src/core/type-chart.ts';
import {STAGE_NAMES,STATUS_NAMES,PROTECT_PHASES,COUNTER_PHASES,SCREEN_PHASES,BLOWAWAY_CELLS,COLLISION_DAMAGE} from '../../src/core/engine.ts';

const ids=wikiMoveIds();
const sign=n=>(n>0?'+':'−')+Math.abs(n);

test('the usable moves are the roster and machine pool, and every one has an effect text',()=>{
  assert.ok(ids.length>150,'moves checked: '+ids.length);
  for(const id of ids){const text=moveEffectText(id);assert.ok(text===''||text.endsWith('。'),id+' has an effect text or none');assert.doesNotMatch(text,/物理攻击|特殊攻击|命中率|必定命中|（/,id+' repeats what the card header says or uses brackets: '+text);}
  assert.equal(moveEffectText('tackle'),'','a move with no added effect has no effect text');
});
test('every effect field the engine reads for a usable move has matching text and no field is left unrecognised',()=>{
  for(const id of ids){
    const spec=moveOf(id),fx=moveEffects(id),text=moveEffectText(id);
    for(const e of spec.effects){
      const stage=/^stage:(\w+):([+-]\d+)$/.exec(e),status=/^status:(\w+)$/.exec(e);
      if(stage){assert.ok(STAGE_NAMES[stage[1]]&&stage[1]!=='spe',id+' stage key '+e);assert.ok(text.includes(STAGE_NAMES[stage[1]]+sign(Number(stage[2]))),id+' '+e+' in: '+text);assert.ok(text.includes('持续到换层'),id+' states how long a stage lasts');}
      else if(status){assert.ok(STATUS_NAMES[status[1]],id+' '+e);assert.ok(text.includes(STATUS_NAMES[status[1]]),id+' '+e+' in: '+text);}
      else{assert.ok(HANDLED_EFFECTS.includes(e),id+' has an effect the text does not know: '+e);if(e.startsWith('heal'))assert.equal(e,'heal:1:2',id+' the engine heals exactly half');}
      if(e==='drain')assert.ok(text.includes('回复实际伤害的一半'),id);
      if(e==='recoil')assert.ok(fx?.recoil&&text.includes('反作用'),id+' recoil effect needs recoil data the engine reads');
      if(e==='blowaway')assert.ok(text.includes('吹飞')&&text.includes(String(BLOWAWAY_CELLS))&&text.includes(String(COLLISION_DAMAGE)),id);
      if(e==='protect')assert.ok(text.includes(PROTECT_PHASES+'回合内免疫对方攻击'),id);
      if(e==='counter')assert.ok(text.includes(COUNTER_PHASES+'回合内，受到相邻对方的伤害'),id);
      if(e==='quickguard')assert.ok(text.includes('免疫距离大于1格的攻击'),id);
      if(e==='reflect')assert.ok(text.includes(SCREEN_PHASES+'回合内受到的物理伤害减半'),id);
      if(e==='lightscreen')assert.ok(text.includes(SCREEN_PHASES+'回合内受到的特殊伤害减半'),id);
      if(e==='rest')assert.ok(text.includes('打盹')&&text.includes('回满HP'),id);
      if(e==='sleeptalk')assert.ok(text.includes('随机对自身或攻击者发动'),id);
      if(e==='snore')assert.ok(text.includes('反击'),id);
          }
    if(!fx)continue;
    for(const k of Object.keys(fx))assert.ok(HANDLED_FX_FIELDS.includes(k),id+' has a move-effects field the text does not know: '+k);
    if(fx.fx&&!spec.effects.includes('damage'))assert.ok(!moveEffectText(id).includes('命中后'),id+': the engine rolls secondary effects only for damaging moves, so the text states none');
    if(spec.effects.includes('damage'))for(const f of fx.fx??[]){
      for(const k of Object.keys(f))assert.ok(['chance','status','foe','self'].includes(k),id+' unknown secondary field '+k);
      if(f.status)assert.ok(text.includes(f.chance>=100?'命中后':f.chance+'%概率')&&text.includes(STATUS_NAMES[f.status]),id+' secondary status in: '+text);
      for(const [k,n] of Object.entries({...f.foe,...f.self}))if(k!=='spe')assert.ok(text.includes(STAGE_NAMES[k]+sign(n)),id+' secondary stage '+k+' in: '+text);
      const shown=!!f.status||Object.keys({...f.foe,...f.self}).some(k=>k!=='spe');   // speed does not exist in this game (engine ignores it), so a speed-only entry states nothing
      if(shown&&f.chance<100)assert.ok(text.includes(f.chance+'%概率'),id+' chance in: '+text);
    }
    for(const [k,n] of Object.entries(fx.cost??{}))if(k!=='spe')assert.ok(text.includes('自身'+STAGE_NAMES[k]+sign(n)),id+' cost in: '+text);
    if(fx.recoil)assert.ok(text.includes('反作用'),id);
    if(fx.thaw)assert.ok(text.includes('解冻'),id);
    if(fx.powder)assert.ok(text.includes('粉末'),id);
  }
});
test('spot checks: Fake Out, Swords Dance, Shadow Claw-like damage, drain, Protect, screens, Rest',()=>{
  const fake=moveEffectText('fakeout');
  assert.equal(fake,'命中后使对方畏缩。');assert.doesNotMatch(fake,/出场|立刻/,'Fake Out is usable at any time (G5.1, G5.13)');
  assert.equal(moveEffectText('swordsdance'),'自身攻击+2。能力阶段持续到换层。');
  assert.equal(moveEffectText('shadowclaw'),'','plain damage says nothing the header does not');
  assert.match(moveEffectText('drainpunch'),/回复实际伤害的一半/);
  assert.match(moveEffectText('protect'),/3回合内免疫对方攻击/);
  assert.equal(moveEffectText('reflect'),'使用时范围内的己方，10回合内受到的物理伤害减半；重复使用刷新计时。');
  assert.match(moveEffectText('rest'),/打盹.*回满HP/);
  assert.match(moveEffectText('closecombat'),/命中后自身防御−1/);
  assert.ok(moveEffectLines('swordsdance').length===2);
  assert.equal(moveEffectText('not-a-move'),'');
});
test('Freeze-Dry still resists Water in the type chart (its card only states data the engine reads)',()=>{
  assert.equal(typeEffectiveness('freezedry',['Water']),0.5);
});
test('stage badges explain themselves from the engine tables (G5.1, G5.3, G5.5)',async()=>{
  const {stageEffectLabel,stageTitle}=await import('../../src/core/move-text.ts');
  const {ATTACK_STAGE_256,DEFENCE_STAGE_256,accuracyMultiplier}=await import('../../src/core/engine.ts');
  assert.equal(stageEffectLabel('atk',1),'物理招式造成的伤害×'+Number((ATTACK_STAGE_256[11]/256).toFixed(2)));
  assert.equal(stageEffectLabel('spa',-2),'特殊招式造成的伤害×'+Number((ATTACK_STAGE_256[8]/256).toFixed(2)));
  assert.equal(stageEffectLabel('def',3),'受到的物理伤害×'+Number((256/DEFENCE_STAGE_256[13]).toFixed(2)));
  assert.equal(stageEffectLabel('spd',2),'受到的特殊伤害×'+Number((256/DEFENCE_STAGE_256[12]).toFixed(2)));
  assert.equal(stageEffectLabel('eva',1),'对方招式的命中率×0.75','evasion +1 multiplies the hit chance of opposing moves by 3/4');
  assert.equal(stageEffectLabel('acc',2),'招式的命中率×'+Number(accuracyMultiplier(2).toFixed(2)));
  assert.equal(stageEffectLabel('acc',-1),'招式和普攻的命中率×0.75','a negative accuracy stage also lowers basic attacks');
  assert.equal(stageEffectLabel('eva',-1),'对方招式的命中率×1.33');
  assert.match(stageTitle('eva',1),/普攻和必中招式不受影响/);assert.match(stageTitle('acc',1),/普攻不受影响/);assert.doesNotMatch(stageTitle('acc',-1),/普攻不受影响/);
  assert.match(stageTitle('def',0,-1),/猎人委托使实际生效为 −1.*×1\.43/,'the label follows the stage the engine uses (hunter commission)');
  assert.match(stageTitle('atk',8),/^攻击 \+8：物理招式造成的伤害×1\.\d+（普通攻击按[^）]*），持续到换层$/);
});

test('move text retains type immunities and describes blowaway generically',async()=>{
  const eng=await import('../../src/core/engine.ts');
  const {typeZh,speciesZh}=await import('../../src/core/names.ts');
  const cap=t=>t[0].toUpperCase()+t.slice(1);
  let checked=0;
  for(const id of ids){
    const spec=moveOf(id),fx=moveEffects(id),text=moveEffectText(id);
    const statuses=[...spec.effects.filter(e=>e.startsWith('status:')).map(e=>e.slice(7)),...(spec.effects.includes('damage')?(fx?.fx??[]).filter(f=>f.status).map(f=>f.status):[])];
    for(const st of statuses)for(const t of eng.statusImmuneTypes(id,st)){assert.ok(text.includes(typeZh(cap(t))+'系')||text.includes('、'+typeZh(cap(t))+'系')||new RegExp(typeZh(cap(t))+'(、[^；）]*)?系免疫').test(text)||text.includes(typeZh(cap(t))),id+' '+st+' immunity '+t+' in: '+text);checked++;}
    if(spec.effects.includes('blowaway')){
      for(const boss of eng.BLOWAWAY_IMMUNE_BOSSES)assert.ok(!text.includes(speciesZh(boss)),id+' has no named exception');
      assert.doesNotMatch(text,/首领|只受伤害|此招对其无效/);checked++;
    }
  }
  assert.ok(checked>20,'special cases checked: '+checked);
  // every rule of the tables has at least one usable move that shows it
  for(const [st,types] of Object.entries(eng.STATUS_IMMUNE_TYPES))for(const t of types){
    const shown=ids.some(id=>{const spec=moveOf(id),fx=moveEffects(id);return (spec.effects.includes('status:'+st)||(spec.effects.includes('damage')&&(fx?.fx??[]).some(f=>f.status===st)))&&moveEffectText(id).includes(typeZh(cap(t)));});
    assert.ok(shown,'the immunity of '+t+' to '+st+' is shown on some move');
  }
  assert.match(moveEffectText('thunderwave'),/地面/);assert.match(moveEffectText('sleeppowder'),/草系免疫/);
  assert.match(moveEffectText('protect'),/免疫.*异常和能力降低/);assert.match(moveEffectText('quickguard'),/免疫.*异常和能力降低/);
  assert.match(moveEffectText('rest'),/自然醒来时回满HP.*换层会提前结束打盹/);assert.doesNotMatch(moveEffectText('rest'),/次自身行动/);
  assert.match(moveEffectText('snore'),/反击.*不能主动使用/);assert.doesNotMatch(moveEffectText('snore'),/不造成畏缩/);
  assert.match(moveEffectText('sleeptalk'),/仅消耗梦话的PP.*优先判定打鼾/);
  assert.match(moveEffectText('toxic'),new RegExp('每'+eng.STATUS_INTERVAL.tox+'回合末损失最大HP的1/'+eng.STATUS_DAMAGE_DIVISOR.tox));
  assert.doesNotMatch(moveEffectText('fakeout'),/次自身行动|（/);
});
