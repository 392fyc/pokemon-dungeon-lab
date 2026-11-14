/** Player-facing descriptions for the current expedition items. */
import { PROG, type Item } from "./engine.ts";

export const ITEM_DESCRIPTIONS: Readonly<Record<Item, string>> = Object.freeze({
  berry: "给自己或相邻队员回复最大 HP 的 30%，至少 " + PROG.berryHeal + " 点",
  tonic: "给自己或相邻队员，每个招式回复 " + PROG.tonicPp + " PP",
  bigBerry: "回满目标的 HP",
  teamTonic: "在场存活队员的每个招式各回复 " + PROG.teamTonicPp + " PP",
  pechaBerry: "解除中毒和剧毒，回复 4 HP",
  rawstBerry: "解除灼伤，回复 4 HP",
  cheriBerry: "解除麻痹，回复 4 HP",
  chestoBerry: "解除睡眠",
  healSeed: "解除全部坏异常状态",
  joySeed: "将队伍的局内经验补足到下一级",
  violentSeed: "攻击和特攻至少升到 +3 级",
  maxElixir: "回满目标所有已学招式的 PP",
  slumberOrb: "使房间内所有敌人进入睡眠",
  totterOrb: "房间里的所有敌人陷入混乱",
  luminousOrb: "显现本层全部地形",
  rollcallOrb: "将存活的同行召至身边",
  reviverSeed: "队员倒下时自动消耗，使其以一半最大 HP 复活",
});

export const itemDescription = (item: Item): string => ITEM_DESCRIPTIONS[item];
