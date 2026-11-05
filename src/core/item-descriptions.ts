/** Player-facing descriptions for the current expedition items. */
import { PROG, type Item } from "./engine.ts";

export const ITEM_DESCRIPTIONS: Readonly<Record<Item, string>> = Object.freeze({
  berry: "恢复 HP（基础 " + PROG.berryHeal + "；补给天赋和祝福可增加回复量，守护委托期间减半并向下取整）。",
  tonic: "目标每招恢复 " + PROG.tonicPp + " PP（不超过上限）。",
  bigBerry: "目标恢复最大 HP；守护委托期间只恢复最大 HP 的一半并向下取整。",
  teamTonic: "在场存活队员每招恢复 " + PROG.teamTonicPp + " PP（不超过上限）。",
  pechaBerry: "解除中毒和剧毒。",
  rawstBerry: "解除灼伤。",
  cheriBerry: "解除麻痹。",
  chestoBerry: "解除睡眠；不解除打盹。",
  healSeed: "解除全部异常状态：中毒、剧毒、灼伤、麻痹、冰冻、混乱、畏缩和睡眠；不解除打盹。",
  violentSeed: "将目标的攻击和特攻能力阶段提升到 +3。",
  maxElixir: "将目标所有已学招式的 PP 恢复至上限。",
});

export const itemDescription = (item: Item): string => ITEM_DESCRIPTIONS[item];
