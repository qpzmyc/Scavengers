import type { GameState } from '../engine';
import type { AnimFrame } from '../game/animation';
import type { ActionEvent } from './protocol';
import { buildOnlineFrames } from './buildOnlineFrames';

export interface TransitionPlan {
  // 'snap' is an authoritative snapshot with nothing to animate (initial gameStart, a
  // resume, or a player leaving); 'animate' is a confirmed action to play out.
  kind: 'snap' | 'animate';
  // The board the frames were built from. Only meaningful for 'animate'.
  before: GameState;
  // What the caller must store as its baseline IMMEDIATELY — before the frames below
  // have finished playing. See the note on staleness at planTransition.
  nextBaseline: GameState;
  frames: AnimFrame[];
}

// Decides what an incoming room.state/lastEvent pair should do to the board, and what
// baseline the NEXT incoming pair should be measured against.
//
// Two rules make this correct when events overlap — and they do overlap: a kill grants an
// extra turn, so the same player can confirm a second action while everyone else's client
// is still animating the kill.
//
//  1. The baseline advances at PLAN time, not when the animation finishes. buildOnlineFrames
//     documents that `before` must be exactly the state prior to the event; if the baseline
//     only advanced on completion, an event arriving mid-animation would be built from a
//     two-events-old board and would, for instance, snap a just-killed player back to life
//     for a frame (see transition.test.ts).
//  2. The caller MUST abandon any in-flight frame sequence before applying this plan.
//     Those frames belong to a superseded board, and their completion callback would
//     otherwise land the display on the previous event's state after this one finished.
//     Only the frame timers get abandoned — notification timers are a separate concern
//     and must keep running, or toasts would be stranded on screen.
export function planTransition(
  baseline: GameState | null,
  after: GameState,
  event: ActionEvent | null
): TransitionPlan {
  if (!event) {
    return { kind: 'snap', before: after, nextBaseline: after, frames: [] };
  }
  const before = baseline ?? after;
  return {
    kind: 'animate',
    before,
    nextBaseline: after,
    frames: buildOnlineFrames(before, after, event),
  };
}
