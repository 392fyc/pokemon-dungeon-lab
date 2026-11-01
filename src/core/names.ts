/** Simplified-Chinese display names (hand-curated, see the `source` field of src/data/names-zh.json). Game data keeps the English ids; only the UI looks names up here. */
import zh from '../data/names-zh.json' with {type:'json'};
const table=zh as unknown as {species:Record<string,string>;types:Record<string,string>;moves:Record<string,string>;tms:Record<string,string>;items:Record<string,string>};
const pick=(map:Record<string,string>,id:string):string=>Object.prototype.hasOwnProperty.call(map,id)?map[id]:id;
export const speciesZh=(id:string)=>pick(table.species,id);
export const moveZh=(id:string)=>pick(table.moves,id);
export const typeZh=(id:string)=>pick(table.types,id);
export const ADVENTURE_ROOM_NAMES={challenge:'挑战',commission:'委托',blessing:'祝福',item:'道具'} as const;
export type AdventureRoomType=keyof typeof ADVENTURE_ROOM_NAMES;
export const ADVENTURE_ROOM_MARKS:Record<AdventureRoomType,string>={challenge:'挑',commission:'委',blessing:'祝',item:'道'};
export type ChallengeRewardType='currency'|'item'|'invite'|'tm'|'blessing';
export const CHALLENGE_REWARD_NAMES:Record<ChallengeRewardType,string>={currency:'钱袋 +40',item:'道具',invite:'伙伴邀请',tm:'招式机',blessing:'祝福'};
const EXTRA_ITEM_NAMES:Record<string,string>={bigBerry:'大树果',teamTonic:'全员 PP 补剂'};
export const itemZh=(id:string)=>EXTRA_ITEM_NAMES[id]??pick(table.items,id);
export const adventureRoomTypeZh=(type:AdventureRoomType)=>ADVENTURE_ROOM_NAMES[type];
export const adventureRoomMark=(type:AdventureRoomType,item?:string|null)=>type==='item'?(item==='teamTonic'?'剂':item==='bigBerry'?'果':'道'):ADVENTURE_ROOM_MARKS[type];
export const adventureRoomStateZh=(type:AdventureRoomType,state:'idle'|'sealed'|'cleared'|'done')=>state==='sealed'?'进行中':state==='cleared'?'已完成':state==='done'?'已处理':type==='challenge'?'未挑战':'未处理';
export const challengeRewardZh=(reward:ChallengeRewardType)=>CHALLENGE_REWARD_NAMES[reward];
/** The technique machine's move, by the same table as every other move (kept in its own section so a test can check the machine pool). */
export const tmZh=(id:string)=>pick(table.tms,id);
export const NAME_TABLE=table;
