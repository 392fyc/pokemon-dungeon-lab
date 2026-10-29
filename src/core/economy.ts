/**
 * Stage 7.2 numbers (docs/玩法研究/失败回归与服务点.md). Every value is a WORKING CANDIDATE, not final balance.
 * No imports: both the engine (in-run) and the base (between runs) read from here.
 */
export const ECON={
  /** R: base reward, paid once per run when G was completed (even if the run ends in a wipe). */
  reward:100,
  /** C: price of one rescue, taken from the account at the base. */
  rescueCost:60,
  /** L: how many effective expeditions an unpaid lost partner waits before it is lost for good. */
  window:4,
  /** X: how many effective expeditions a paid partner waits before it returns. */
  paidWait:1,
  /** p: chance that an unprotected partner on the team goes missing in a wipe. */
  loseChance:0.5,
  /** The purse (money taken into a run) is set in steps from 0 up to min(purseMax, account). */
  purseMax:200,purseStep:20,
  /** Shop: chance that a run has one (floor 1 or 2), fixed stock, prices in purse money. */
  shopChance:0.35,price:{berry:20,tonic:30,tm:80} as Record<'berry'|'tonic'|'tm',number>,stock:{berry:2,tonic:1,tm:1},
  /** Exchanger: chance that a run has one, and the most technique machines one use may carry home. */
  exchangeChance:0.25,exchangeCargo:2,
} as const;
