import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../engine';
import type { GameState, PlayerId, Position } from '../engine';
import { applyAction } from './actionReducer';
import type { ActionRequest, ActionEvent } from './protocol';
import { buildOnlineFrames } from './buildOnlineFrames';

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

describe('buildOnlineFrames', () => {
  it('a rest produces a single settle frame on the after-state', () => {
    const before = createInitialGameState('deathmatch', 2);
    const { after, event } = apply(before, 'p1', { kind: 'rest' });
    const frames = buildOnlineFrames(before, after, event);
    expect(frames).toHaveLength(1);
    expect(frames[0].display).toBe(after);
    expect(frames[0].redTints).toEqual([]);
    expect(frames[0].death).toEqual([]);
  });

  it('a 2-tile move produces stepped frames ending on the after-state', () => {
    let before = createInitialGameState('deathmatch', 2);
    before = withPlayerAt(before, 'p1', { x: 5, y: 5 });
    before = withEmptyTile(before, { x: 6, y: 5 });
    before = withEmptyTile(before, { x: 7, y: 5 });
    const { after, event } = apply(before, 'p1', { kind: 'move', path: [{ x: 6, y: 5 }, { x: 7, y: 5 }] });
    const frames = buildOnlineFrames(before, after, event);
    // one snap-back + one intermediate step + settle
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames[frames.length - 1].display).toBe(after);
  });

  it('an attack with no kill produces a ripple frame carrying red tints', () => {
    let before = createInitialGameState('deathmatch', 2);
    before = withPlayerAt(before, 'p1', { x: 5, y: 5 });
    // p2 far away so the punch hits nothing
    before = withPlayerAt(before, 'p2', { x: 0, y: 0 });
    const { after, event } = apply(before, 'p1', { kind: 'attack', type: 'punch', path: [], target: { x: 5, y: 4 } });
    const frames = buildOnlineFrames(before, after, event);
    expect(frames.some((f) => f.redTints.length > 0)).toBe(true);
    expect(frames[frames.length - 1].display).toBe(after);
  });

  it('an attack that kills carries a death fade-out for the victim and reports the victim in the event', () => {
    let before = createInitialGameState('deathmatch', 2);
    before = withPlayerAt(before, 'p1', { x: 5, y: 5 });
    before = withPlayerAt(before, 'p2', { x: 5, y: 4 }); // adjacent, punchable
    const { after, event } = apply(before, 'p1', { kind: 'attack', type: 'punch', path: [], target: { x: 5, y: 4 } });
    expect(event.killedPlayerIds).toContain('p2');
    const frames = buildOnlineFrames(before, after, event);
    const outFrame = frames.find((f) => f.death.some((d) => d.playerId === 'p2' && d.stage === 'out'));
    expect(outFrame).toBeDefined();
    // death fade-out uses the victim's pre-death position from `before`
    expect(outFrame!.death.find((d) => d.playerId === 'p2')!.deathPos).toEqual({ x: 5, y: 4 });
  });

  it('a fake move produces a single settle frame', () => {
    const before = createInitialGameState('deathmatch', 2);
    const { after, event } = apply(before, 'p1', { kind: 'fakeMove', dir: { x: 1, y: 0 } });
    const frames = buildOnlineFrames(before, after, event);
    expect(frames).toHaveLength(1);
    expect(frames[0].display).toBe(after);
  });
});
