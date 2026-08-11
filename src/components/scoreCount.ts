/**
 * The counting-up of a leaderboard score, as pure functions over a clock.
 *
 * Kept out of the component because the case worth getting right cannot be
 * driven by hand: a second score change landing while the first is still
 * counting. Here it is three function calls in a test rather than two kills
 * timed against a 450ms window in a browser.
 */

// Matches the row re-rank in Leaderboard.tsx (`transform 0.45s`), so the number
// lands as the row settles and the two read as one event rather than two.
export const COUNT_MS = 450;

export interface Count {
  /** Where this count started from. Not the score before the change: after an
   *  interrupt it is whatever was on screen at that moment. */
  readonly from: number;
  readonly to: number;
  readonly startedAt: number;
}

/**
 * Approximates the `cubic-bezier(0.4, 0, 0.2, 1)` the rows re-rank with. Not the
 * same curve (that one is asymmetric and solving it needs a solver), but the same
 * shape: eased at both ends, no linear crawl. Close enough that the number and
 * the row do not visibly disagree, which is the only thing this has to achieve.
 */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/** A count that is already at its value and will not animate. */
export function settled(value: number): Count {
  return { from: value, to: value, startedAt: -Infinity };
}

export function countValue(c: Count, now: number, duration = COUNT_MS): number {
  if (c.from === c.to) return c.to;
  const elapsed = now - c.startedAt;
  // A clock can hand back a slightly earlier timestamp between frames; treat that
  // as "not started" rather than extrapolating backwards past `from`.
  if (elapsed <= 0) return c.from;
  if (elapsed >= duration) return c.to;
  return Math.round(c.from + (c.to - c.from) * ease(elapsed / duration));
}

export function isDone(c: Count, now: number, duration = COUNT_MS): boolean {
  return c.from === c.to || now - c.startedAt >= duration;
}

/**
 * Point a count at a new target. Returns the SAME object when the target has not
 * moved, because the render loop calls this every frame and a fresh object each
 * time would restart the count and leave the number stuck at `from`.
 *
 * When a change lands mid-count the new count starts from the value currently on
 * screen, not from the old starting value. Carrying the old `from` over is what
 * makes a number visibly snap backwards when a second kill lands.
 */
export function retarget(c: Count, target: number, now: number, duration = COUNT_MS): Count {
  if (c.to === target) return c;
  return { from: countValue(c, now, duration), to: target, startedAt: now };
}
