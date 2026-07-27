import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../engine';
import type { GameState, PlayerId, Position } from '../engine';
import { applyAction } from './actionReducer';
import type { ActionRequest, ActionEvent } from './protocol';
import { buildOnlineFrames } from './buildOnlineFrames';
import { planTransition } from './transition';

function withPlayerAt(s: GameState, id: PlayerId, pos: Position): GameState {
  return { ...s, players: { ...s.players, [id]: { ...s.players[id], position: pos } } };
}
function withEmptyTile(s: GameState, pos: Position): GameState {
  const board = s.board.map((r) => r.slice());
  board[pos.y][pos.x] = { type: 'empty' };
  return { ...s, board };
}
// Run the reducer to get the authoritative `after` + a matching ActionEvent, like the server does.
function apply(before: GameState, actor: PlayerId, req: ActionRequest): { after: GameState; event: ActionEvent } {
  const res = applyAction(before, actor, req);
  if (!res.ok) throw new Error(res.error);
  return { after: res.state, event: res.event };
}

// p1 stands next to p2 with clear ground to retreat onto, so p1 can punch p2 dead and
// then — on the extra turn a kill grants — immediately move. That pair of back-to-back
// events by the same actor is the sequence that produces the mid-animation race.
function killThenMove() {
  let s0 = createInitialGameState('deathmatch', 2);
  s0 = withPlayerAt(s0, 'p1', { x: 5, y: 5 });
  s0 = withPlayerAt(s0, 'p2', { x: 6, y: 5 });
  s0 = withEmptyTile(s0, { x: 5, y: 5 });
  s0 = withEmptyTile(s0, { x: 6, y: 5 });
  s0 = withEmptyTile(s0, { x: 4, y: 5 });
  const kill = apply(s0, 'p1', { kind: 'attack', type: 'punch', path: [], target: { x: 6, y: 5 } });
  const move = apply(kill.after, 'p1', { kind: 'move', path: [{ x: 4, y: 5 }] });
  return { s0, kill, move };
}

describe('planTransition', () => {
  it('a snapshot with no event snaps instead of animating', () => {
    const s = createInitialGameState('deathmatch', 2);
    const plan = planTransition(null, s, null);
    expect(plan.kind).toBe('snap');
    expect(plan.frames).toEqual([]);
    expect(plan.nextBaseline).toBe(s);
  });

  it('falls back to the incoming state when there is no baseline yet', () => {
    const before = createInitialGameState('deathmatch', 2);
    const { after, event } = apply(before, 'p1', { kind: 'rest' });
    const plan = planTransition(null, after, event);
    expect(plan.kind).toBe('animate');
    expect(plan.before).toBe(after);
  });

  it('animates from the baseline it was given', () => {
    const before = createInitialGameState('deathmatch', 2);
    const { after, event } = apply(before, 'p1', { kind: 'rest' });
    const plan = planTransition(before, after, event);
    expect(plan.before).toBe(before);
    expect(plan.frames).toEqual(buildOnlineFrames(before, after, event));
  });

  // The regression this module exists for. The baseline must advance the moment an event
  // is planned, NOT when its animation finishes — otherwise a second event arriving while
  // the first is still playing gets built from a two-events-old board.
  it('advances the baseline at plan time, so a mid-animation event still builds from the previous result', () => {
    const { s0, kill, move } = killThenMove();

    const plan1 = planTransition(s0, kill.after, kill.event);
    expect(plan1.nextBaseline).toBe(kill.after);

    // plan2 is made while plan1's frames are still playing: the only thing carried over
    // is plan1.nextBaseline, which is exactly what the eager advance guarantees.
    const plan2 = planTransition(plan1.nextBaseline, move.after, move.event);
    expect(plan2.before).toBe(kill.after);
  });

  it('a move planned from the correct baseline never shows the dead player alive again', () => {
    const { s0, kill, move } = killThenMove();
    const plan1 = planTransition(s0, kill.after, kill.event);
    const plan2 = planTransition(plan1.nextBaseline, move.after, move.event);

    // A move's first frame is a snap-back to `before` (see buildOnlineFrames), so a stale
    // baseline would resurrect the victim on screen for a frame.
    const firstFrame = plan2.frames[0].display;
    expect(firstFrame.players.p2.deaths).toBe(kill.after.players.p2.deaths);
    expect(firstFrame.players.p2.position).toEqual(kill.after.players.p2.position);
  });

  // Pins down WHY the eager advance matters, by building the same move from the stale
  // baseline the old code would have still been holding.
  it('the stale baseline would have resurrected the victim (documents the bug)', () => {
    const { s0, kill, move } = killThenMove();
    const stale = buildOnlineFrames(s0, move.after, move.event);
    expect(stale[0].display.players.p2.deaths).toBe(s0.players.p2.deaths);
    expect(stale[0].display.players.p2.deaths).not.toBe(kill.after.players.p2.deaths);
  });
});
