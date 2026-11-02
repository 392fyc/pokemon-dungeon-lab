/**
 * 8.8 (#165): every move except self buffs and guards now has a hit chance. Tests that check damage, counters, blow-away, guards and the like use this to
 * take the accuracy roll out of the picture: accuracy stage +3 multiplies any chance by 2, so the lowest official chance (50%) becomes 100%.
 * Tests of the hit rules themselves do not use it.
 */
export function sureHit(world){
  for(const u of Object.values(world.units))u.stages={...u.stages,acc:3};
  for(const f of Object.values(world.dungeon?.stored??{}))for(const u of Object.values(f.units))u.stages={...u.stages,acc:3};
  return world;
}
