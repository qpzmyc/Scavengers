import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, PlayerId } from '../engine';
import { COUNT_MS, countValue, isDone, retarget, settled, type Count } from './scoreCount';

/**
 * The id-to-score map `useScoreCounts` takes, memoised on the scores themselves
 * so the hook's effect re-runs when a score moves rather than on every unrelated
 * re-render of the game. Depending on `state.players` instead would rebuild the
 * map every render, restarting the effect and so restarting every count.
 *
 * Shared because both the Leaderboard and the phone ScoreStrip need the same map
 * built the same way; two copies of this would drift.
 */
export function useScoreMap(state: GameState): ReadonlyMap<PlayerId, number> {
  const ids = state.turnOrder;
  const scoreKey = ids.map((id) => `${id}:${state.players[id].score}`).join(',');
  return useMemo(
    () => new Map<PlayerId, number>(ids.map((id) => [id, state.players[id].score])),
    // `scoreKey` is built from exactly the ids and scores this map is built from,
    // so it changes whenever the map's contents would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoreKey],
  );
}

/** What a player's score just did, for the rising +5 / -3 beside the number. */
export interface ScoreDelta {
  readonly amount: number;
  /** Changes on every new delta, so the CSS animation restarts via React's key. */
  readonly id: number;
}

// How long the delta and the row wash stay up: 150ms in, 1500ms held, 500ms out.
// The old 900ms held full opacity for only about a third of a second, which was
// not long enough to notice, let alone read. Keep in step with the
// `scoreDeltaRise` and `scoreRowWash` keyframe durations in src/index.css, which
// read it back through the `--score-delta-ms` custom property.
export const DELTA_MS = 2150;

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
