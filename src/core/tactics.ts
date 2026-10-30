/** The six per-instance tactics in the 7.8 specification. */
export const TACTICS=['together','followme','gofoes','wait','nomoves','avoid'] as const;
export type Tactic=typeof TACTICS[number];
export const TACTIC_LABELS:Record<Tactic,string>={together:'一起行动',followme:'跟着我',gofoes:'主动出击',wait:'原地待命',nomoves:'不用招式',avoid:'远离敌人'};
export const isTactic=(value:unknown):value is Tactic=>typeof value==='string'&&(TACTICS as readonly string[]).includes(value);
