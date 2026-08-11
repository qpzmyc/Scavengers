import { useEffect, useRef, useState } from 'react';
import type { PlayerId } from '../engine';
import { COUNT_MS, countValue, isDone, retarget, settled, type Count } from './scoreCount';

/** What a player's score just did, for the rising +5 / -3 beside the number. */
export interface ScoreDelta {
  readonly amount: number;
  /** Changes on every new delta, so the CSS animation restarts via React's key. */
  readonly id: number;
}

// How long the delta takes to rise and fade. Roughly twice the count, so it is
// still on screen as the number finishes climbing. Keep in step with the
// `scoreDeltaRise` keyframe duration in src/index.css.
export const DELTA_MS = 900;

/**
 * Drives every player's score number toward its real value and reports what
 * changed. One frame loop for the whole table rather than one per row, and it
 * stops itself as soon as every score has settled, so an idle leaderboard costs
 * nothing.
 *
 * The interrupt behaviour (a second kill landing mid-count) lives in
 * `scoreCount.ts` and is unit tested there; this hook only supplies the clock.
 */
export function useScoreCounts(scores: ReadonlyMap<PlayerId, number>) {
  const [, forceFrame] = useState(0);
  const countsRef = useRef(new Map<PlayerId, Count>());
  const deltasRef = useRef(new Map<PlayerId, ScoreDelta>());
  const deltaIdRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const deltaTimersRef = useRef(new Map<PlayerId, number>());

  // Reconcile targets during render so the returned values are never a frame
  // behind. Refs are mutated in an effect rather than here, per this project's
  // rule about StrictMode double-invoking render.
  useEffect(() => {
    const now = performance.now();
    const counts = countsRef.current;
    let changed = false;

    for (const [id, target] of scores) {
      const prev = counts.get(id);
      if (prev === undefined) {
        // First sight of this player: show the score, never count up from zero.
        counts.set(id, settled(target));
        continue;
      }
      const next = retarget(prev, target, now);
      if (next === prev) continue;

      counts.set(id, next);
      changed = true;

      // A delta only makes sense against a score we were already showing, which
      // is why this sits after the first-sight branch above.
      deltaIdRef.current += 1;
      deltasRef.current.set(id, { amount: target - prev.to, id: deltaIdRef.current });
      const existing = deltaTimersRef.current.get(id);
      if (existing !== undefined) window.clearTimeout(existing);
      deltaTimersRef.current.set(
        id,
        window.setTimeout(() => {
          deltasRef.current.delete(id);
          deltaTimersRef.current.delete(id);
          forceFrame((n) => n + 1);
        }, DELTA_MS),
      );
    }

    // Drop players who left, so a four-player game followed by a two-player one
    // cannot resurrect a stale count.
    for (const id of counts.keys()) {
      if (!scores.has(id)) counts.delete(id);
    }

    if (!changed) return;

    const tick = () => {
      const t = performance.now();
      const allDone = [...countsRef.current.values()].every((c) => isDone(c, t));
      forceFrame((n) => n + 1);
      frameRef.current = allDone ? null : requestAnimationFrame(tick);
    };
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(tick);
  }, [scores]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      for (const t of deltaTimersRef.current.values()) window.clearTimeout(t);
    },
    [],
  );

  const now = performance.now();
  const displayed = new Map<PlayerId, number>();
  for (const [id, target] of scores) {
    const c = countsRef.current.get(id);
    displayed.set(id, c ? countValue(c, now) : target);
  }

  return { displayed, deltas: deltasRef.current, DELTA_MS, COUNT_MS };
}
