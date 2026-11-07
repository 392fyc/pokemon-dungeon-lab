/** Player-facing descriptions for the current expedition items. */
import { PROG, type Item } from "./engine.ts";

export const ITEM_DESCRIPTIONS: Readonly<Record<Item, string>> = Object.freeze({
  berry: "给自己或相邻的队员恢复最大 HP 的 30%（至少 " + PROG.berryHeal + " 点）。祝福和补给天赋能让它回复更多，守护委托期间回复减半。",
  tonic: "给自己或相邻的队员，每个招式恢复 " + PROG.tonicPp + " PP（不超过上限）。",
  bigBerry: "把目标的 HP 一次回满；守护委托期间只回复最大 HP 的一半。",
  teamTonic: "在场存活队员的每个招式各恢复 " + PROG.teamTonicPp + " PP（不超过上限）。",
  pechaBerry: "解除中毒和剧毒，并回复 4 点 HP。",
  rawstBerry: "解除灼伤，并回复 4 点 HP。",
  cheriBerry: "解除麻痹，并回复 4 点 HP。",
  chestoBerry: "解除睡眠；不解除打盹。",
  healSeed: "解除全部异常状态（中毒、剧毒、灼伤、麻痹、冰冻、混乱、畏缩、睡眠）；不解除打盹。",
  violentSeed: "把目标的攻击和特攻一次提到最高（+3 级）。",
  maxElixir: "把目标所有已学招式的 PP 补满（回到上限）。",
  slumberOrb: "房间里（走廊里是周围 2 格）的所有敌人立刻睡着。",
  totterOrb: "房间里（走廊里是周围 2 格）的所有敌人陷入混乱。",
  luminousOrb: "显现本层全部地形（敌人不会显现）。",
  rollcallOrb: "把存活的同行叫到身边的空格；身边没有空位的留在原地。",
  reviverSeed: "不用手动使用：队员倒下的瞬间自动用掉，以最大 HP 的一半站回原地。",
});

export const itemDescription = (item: Item): string => ITEM_DESCRIPTIONS[item];
