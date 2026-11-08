/** Player-facing descriptions for the current expedition items. */
import { PROG, type Item } from "./engine.ts";

export const ITEM_DESCRIPTIONS: Readonly<Record<Item, string>> = Object.freeze({
  berry: "给自己或相邻队员回复最大 HP 的 30%（至少 " + PROG.berryHeal + "）",
  tonic: "给自己或相邻队员，每个招式回复 " + PROG.tonicPp + " PP",
  bigBerry: "把目标的 HP 回满",
  teamTonic: "在场存活队员的每个招式各回复 " + PROG.teamTonicPp + " PP",
  pechaBerry: "解除中毒和剧毒，回复 4 HP",
  rawstBerry: "解除灼伤，回复 4 HP",
  cheriBerry: "解除麻痹，回复 4 HP",
  chestoBerry: "解除睡眠",
  healSeed: "解除全部异常状态",
  violentSeed: "攻击和特攻至少升到 +3 级",
  maxElixir: "把目标所有已学招式的 PP 补满",
  slumberOrb: "房间里的所有敌人立刻睡着",
  totterOrb: "房间里的所有敌人陷入混乱",
  luminousOrb: "显现本层全部地形",
  rollcallOrb: "把存活的同行叫到身边",
  reviverSeed: "队员倒下时自动用掉，以最大 HP 的一半站起",
});

export const itemDescription = (item: Item): string => ITEM_DESCRIPTIONS[item];
