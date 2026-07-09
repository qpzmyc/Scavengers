import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../engine';
import type { GameState, PlayerId, Position } from '../engine';
import { applyAction } from './actionReducer';

function withPlayerAt(state: GameState, id: PlayerId, pos: Position): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], position: pos } } };
}
function withEnergy(state: GameState, id: PlayerId, energy: number): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], energy } } };
}
function withEmptyTile(state: GameState, pos: Position): GameState {
  const board = state.board.map((r) => r.slice());
  board[pos.y][pos.x] = { type: 'empty' };
  return { ...state, board };
}

describe('applyAction', () => {
  it('rejects an action from a player whose turn it is not', () => {
    const state = createInitialGameState('deathmatch', 2); // currentTurn = p1
    const res = applyAction(state, 'p2', { kind: 'rest' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/turn/i);
  });

  it('rejects any action once the game is over', () => {
    const state = { ...createInitialGameState('deathmatch', 2), winner: 'p1' as PlayerId };
    const res = applyAction(state, 'p1', { kind: 'rest' });
    expect(res.ok).toBe(false);
  });

  it('applies rest and passes the turn to the next player', () => {
    const state = withEnergy(createInitialGameState('deathmatch', 2), 'p1', 1);
    const res = applyAction(state, 'p1', { kind: 'rest' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.players.p1.energy).toBe(4); // 1 + REST_ENERGY_GAIN(3)
      expect(res.state.currentTurn).toBe('p2');
      expect(res.event.killedPlayerIds).toEqual([]);
    }
  });

  it('applies a one-tile move onto a known-empty tile and passes the turn', () => {
    let state = createInitialGameState('deathmatch', 2);
    state = withPlayerAt(state, 'p1', { x: 5, y: 5 });
    state = withEmptyTile(state, { x: 6, y: 5 });
    const res = applyAction(state, 'p1', { kind: 'move', path: [{ x: 6, y: 5 }] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.players.p1.position).toEqual({ x: 6, y: 5 });
      expect(res.state.currentTurn).toBe('p2');
    }
  });

  it('applies a fake move, marking the actor a phantom, and passes the turn', () => {
    const state = createInitialGameState('deathmatch', 2); // p1 at (0,0), energy 5
    const res = applyAction(state, 'p1', { kind: 'fakeMove', dir: { x: 1, y: 0 } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.players.p1.isPhantom).toBe(true);
      expect(res.state.players.p1.phantomDisplayPosition).toEqual({ x: 1, y: 0 });
      expect(res.state.currentTurn).toBe('p2');
    }
  });

  it('a punch that kills grants an extra turn (currentTurn stays the actor) and reports the victim', () => {
    let state = createInitialGameState('deathmatch', 2);
    state = withPlayerAt(state, 'p1', { x: 5, y: 5 });
    state = withPlayerAt(state, 'p2', { x: 5, y: 4 }); // directly north, adjacent
    const res = applyAction(state, 'p1', { kind: 'attack', type: 'punch', path: [], target: { x: 5, y: 4 } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.event.killedPlayerIds).toContain('p2');
      expect(res.state.currentTurn).toBe('p1'); // extra turn on kill
    }
  });

  it('rejects an illegal attack (non-adjacent punch target) with an error, leaving no state', () => {
    let state = createInitialGameState('deathmatch', 2);
    state = withPlayerAt(state, 'p1', { x: 5, y: 5 });
    const res = applyAction(state, 'p1', { kind: 'attack', type: 'punch', path: [], target: { x: 9, y: 9 } });
    expect(res.ok).toBe(false);
  });

  it('crushing an enemy phantom on the move path grants NO extra turn (turn passes)', () => {
    let state = createInitialGameState('deathmatch', 2); // currentTurn p1
    state = withPlayerAt(state, 'p1', { x: 5, y: 5 });
    state = withEmptyTile(state, { x: 6, y: 5 });
    // p2 is a phantom whose REAL tile sits on p1's move path (6,5).
    state = withPlayerAt(state, 'p2', { x: 6, y: 5 });
    state = {
      ...state,
      players: {
        ...state.players,
        p2: { ...state.players.p2, isPhantom: true, phantomDisplayPosition: { x: 9, y: 9 } },
      },
    };
    const res = applyAction(state, 'p1', { kind: 'move', path: [{ x: 6, y: 5 }] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.event.killedPlayerIds).toContain('p2');
      expect(res.state.currentTurn).toBe('p2'); // crush = no extra turn, turn passes
    }
  });
});
