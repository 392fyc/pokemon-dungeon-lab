/**
 * HP bars in the party cards and the bottom bar. Two rules, both taken from Pokémon (main series, Gen 3 onward):
 * the bar is green above half, yellow at half or below, red at a fifth or below (Pokémon Showdown client getHPColor: ratio > .5 green, > .2 yellow); and a loss first drops the bar at once
 * while a pale "damage trail" shrinks to the new value afterwards (the bar in Gen 1-4 slides instead; later games and
 * Pokémon Mystery Dungeon keep a lagging ghost bar, which reads better when several hits come in a row). A heal simply grows.
 */
export type HpLevel = "high" | "mid" | "low" | "empty";

export function hpLevel(hp: number, max: number): HpLevel {
  if (hp <= 0) return "empty";
  const ratio = hp / Math.max(1, max);
  if (ratio > 0.5) return "high";
  if (ratio > 0.2) return "mid";
  return "low";
}

/** CSS class of the fill for a level; the green default needs none. */
export const hpFillClass = (hp: number, max: number): string => {
  const level = hpLevel(hp, max);
  return level === "empty" ? " is-empty" : level === "mid" ? " is-mid" : level === "low" ? " is-low" : "";
};

/** Bright text colours for the HP number drawn above a unit on the map (same thresholds as the bars). */
export const HP_TEXT_COLORS: Record<HpLevel, string> = { high: "#73ff7a", mid: "#ffe04a", low: "#ff6b5b", empty: "#b64949" };
export const hpTextColor = (hp: number, max: number): string => HP_TEXT_COLORS[hpLevel(hp, max)];

export const TRAIL_MS = 400;
type Trail = { pct: number; from: number; at: number };
const trails = new Map<string, Trail>();

const trailPosition = (t: Trail, now: number): number => {
  const p = Math.max(0, Math.min(1, (now - t.at) / TRAIL_MS));
  return t.from + (t.pct - t.from) * p;
};

/** The track's markup: the trail sits under the fill, and the key lets the bar keep its trail across a redraw of the whole panel. */
export function hpTrackMarkup(key: string, hp: number, max: number, extraClass = ""): string {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  return '<span class="hud-hp-track' + (extraClass ? " " + extraClass : "") + '" data-hp-key="' + key + '" data-hp-pct="' + pct.toFixed(2) + '">' +
    '<span class="hud-hp-trail" style="width:' + pct.toFixed(2) + '%"></span>' +
    '<span class="hud-hp-fill' + hpFillClass(hp, max) + '" style="width:' + pct.toFixed(2) + '%"></span></span>';
}

/**
 * Brings one track to its (new) value. With `animated` a drop starts the trail from where it is shown now;
 * otherwise (animations off, skipped or reduced motion) the trail snaps to the fill, so nothing lags.
 */
export function applyHpBar(track: HTMLElement, hp: number, max: number, animated: boolean): void {
  const key = track.dataset.hpKey ?? "";
  const fill = track.querySelector<HTMLElement>(".hud-hp-fill");
  const trail = track.querySelector<HTMLElement>(".hud-hp-trail");
  if (!fill || !trail) return;
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  const now = performance.now();
  const prev = trails.get(key) ?? (track.dataset.hpPct !== undefined ? { pct: Number(track.dataset.hpPct), from: Number(track.dataset.hpPct), at: now - TRAIL_MS } : undefined);
  let next: Trail = { pct, from: pct, at: now };
  if (animated && prev) {
    if (pct < prev.pct - 0.05) next = { pct, from: Math.max(trailPosition(prev, now), pct), at: now };
    else if (Math.abs(pct - prev.pct) <= 0.05) next = prev;
  }
  trails.set(key, next);
  track.dataset.hpPct = pct.toFixed(2);
  fill.style.width = pct.toFixed(2) + "%";
  fill.classList.toggle("is-empty", hp <= 0);
  fill.classList.toggle("is-mid", hp > 0 && hpLevel(hp, max) === "mid");
  fill.classList.toggle("is-low", hp > 0 && hpLevel(hp, max) === "low");
  const shown = trailPosition(next, now);
  trail.style.transition = "none";
  trail.style.width = shown.toFixed(2) + "%";
  if (shown > pct + 0.05) {
    void trail.offsetWidth;   // commit the start width before the transition is set
    trail.style.transition = "width " + Math.max(1, Math.round(next.at + TRAIL_MS - now)) + "ms linear";
    trail.style.width = pct.toFixed(2) + "%";
  }
}

/** After a panel is redrawn: every track in `root` is re-applied against the stored trail of its key. */
export function syncHpBars(root: ParentNode, values: (key: string) => { hp: number; max: number } | undefined, animated: boolean): void {
  root.querySelectorAll<HTMLElement>(".hud-hp-track[data-hp-key]").forEach((track) => {
    const v = values(track.dataset.hpKey ?? "");
    if (v) applyHpBar(track, v.hp, v.max, animated);
  });
}
