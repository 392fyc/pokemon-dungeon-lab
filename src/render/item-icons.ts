/** One 32 px icon per backpack item (public/assets/props/item2-*.png). Used by the bag, quick slots, bottom bar, map drops, shop and settlement. */
import type {Item} from '../core/engine.ts';
export const ITEM_ICON_FILE:Record<Item,string>={
 berry:'item2-oran',bigBerry:'item2-sitrus',pechaBerry:'item2-pecha',rawstBerry:'item2-rawst',cheriBerry:'item2-cheri',chestoBerry:'item2-chesto',
 healSeed:'item2-heal-seed',violentSeed:'item2-violent-seed',tonic:'item2-ether',teamTonic:'item2-team-ether',maxElixir:'item2-max-elixir',
 slumberOrb:'item2-orb-slumber',totterOrb:'item2-orb-totter',luminousOrb:'item2-orb-luminous',rollcallOrb:'item2-orb-rollcall',reviverSeed:'item2-reviver-seed',
};
export const ITEM_ICON_KEYS:readonly string[]=Object.values(ITEM_ICON_FILE);
export const itemIconSrc=(item:Item):string=>`assets/props/${ITEM_ICON_FILE[item]}.png`;
/** Pixel-art markup; the stylesheet sets image-rendering: pixelated. */
export const itemIconImg=(item:Item,cls='item-icon'):string=>`<img class="${cls}" src="${itemIconSrc(item)}" alt="" draggable="false">`;
/** Room props (64 px): the interaction object of each adventure room type and the two services. */
export const ROOM_PROP_KEYS=['room-challenge','room-commission','room-blessing','room-treasure','room-shop','room-rest'] as const;

/** Type colours (also the camp's type chips) and the technique-machine disc: a coloured square with a hole, drawn in CSS (no image asset exists for it). */
export const TYPE_COLORS:Record<string,string>={Normal:'#5f5e50',Water:'#2b5f8a',Fire:'#a8482a',Grass:'#3f7a3a',Electric:'#9a7a24',Ice:'#4f8196',Fighting:'#963f45',Poison:'#765196',Ground:'#86643b',Flying:'#54799b',Psychic:'#a25891',Bug:'#55753a',Rock:'#776749',Ghost:'#5b4e81',Dragon:'#4f4c9b',Dark:'#49413b',Steel:'#627381',Fairy:'#9d6688'};
export const tmDisc=(type:string,cls='tm-disc-icon'):string=>`<span class="${cls}" aria-hidden="true" style="--tm-color:${TYPE_COLORS[type]??'#5f5e50'}"></span>`;
