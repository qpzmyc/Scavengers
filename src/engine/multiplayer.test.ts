import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { endTurn, resolveAttack } from './turns';
import { shoot } from './combat';
import { checkWinCondition } from './winCondition';

function withPositions(
  state: ReturnType<typeof createInitialGameState>,
  positions: Partial<Record<'p1' | 'p2' | 'p3' | 'p4', { x: number; y: number }>>
) {
  const players = { ...state.players };
  for (const [id, pos] of Object.entries(positions)) {
    const key = id as keyof typeof players;
    players[key] = { ...players[key], position: pos! };
  }
  return { ...state, players };
}

describe('4-player game creation', () => {
  it('creates a turnOrder of length 4 with p3 at (9,0) and p4 at (0,9)', () => {
    const state = createInitialGameState('deathmatch', 4);
    expect(state.turnOrder).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(state.players.p3.position).toEqual({ x: 9, y: 0 });
    expect(state.players.p4.position).toEqual({ x: 0, y: 9 });
    expect(state.players.p3.color).toBe('blue');
    expect(state.players.p4.color).toBe('yellow');
    expect(state.players.p3.eliminated).toBe(false);
    expect(state.players.p4.eliminated).toBe(false);
  });

  it('marks p3/p4 as eliminated placeholders in a 2-player game', () => {
    const state = createInitialGameState('deathmatch', 2);
    expect(state.turnOrder).toEqual(['p1', 'p2']);
    expect(state.players.p3.eliminated).toBe(true);
    expect(state.players.p3.alive).toBe(false);
    expect(state.players.p4.eliminated).toBe(true);
    expect(state.players.p4.alive).toBe(false);
  });
});

describe('turn rotation across 4 players', () => {
  it('cycles p1 -> p2 -> p3 -> p4 -> p1', () => {
    let state = createInitialGameState('deathmatch', 4);
    state = endTurn(state, 'p1', false);
    expect(state.currentTurn).toBe('p2');
    state = endTurn(state, 'p2', false);
    expect(state.currentTurn).toBe('p3');
    state = endTurn(state, 'p3', false);
    expect(state.currentTurn).toBe('p4');
    state = endTurn(state, 'p4', false);
    expect(state.currentTurn).toBe('p1');
  });

  it('skips an eliminated player when rotating turns', () => {
    let state = createInitialGameState('deathmatch', 4);
    state = { ...state, players: { ...state.players, p3: { ...state.players.p3, eliminated: true, alive: false } } };
    state = endTurn(state, 'p2', false);
    expect(state.currentTurn).toBe('p4');
  });
});

describe('piercing shot', () => {
  it('kills two players standing on the same line', () => {
    let state = createInitialGameState('deathmatch', 4);
    state = withPositions(state, {
      p1: { x: 0, y: 2 },
      p2: { x: 4, y: 2 },
      p3: { x: 8, y: 2 },
    });
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, ammo: 1 } } };
    const result = shoot(state, 'p1', { x: 1, y: 0 });
    expect(result.killedPlayerIds.sort()).toEqual(['p2', 'p3']);
  });
});

describe('Last Standing elimination', () => {
  it('eliminates a victim instead of respawning once deaths reach the death cap', () => {
    let state = createInitialGameState('lastStanding', 2);
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, deaths: state.deathCap - 1 } } };
    const attackResult = { state, killedPlayerIds: ['p2' as const] };
    const next = resolveAttack(attackResult, 'p1');
    expect(next.players.p2.eliminated).toBe(true);
    expect(next.players.p2.alive).toBe(false);
    expect(next.players.p2.deaths).toBe(state.deathCap);
  });

  it('declares a winner once only one non-eliminated player remains', () => {
    let state = createInitialGameState('lastStanding', 4);
    state = {
      ...state,
      players: {
        ...state.players,
        p1: { ...state.players.p1, eliminated: true, alive: false },
        p2: { ...state.players.p2, eliminated: true, alive: false },
        p3: { ...state.players.p3, eliminated: true, alive: false },
      },
    };
    expect(checkWinCondition(state)).toBe('p4');
  });
});

describe('deathmatch never eliminates', () => {
  it('respawns the victim instead of eliminating them, even past the death cap threshold', () => {
    let state = createInitialGameState('deathmatch', 2);
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, deaths: state.deathCap - 1, alive: false } } };
    const attackResult = { state, killedPlayerIds: ['p2' as const] };
    const next = resolveAttack(attackResult, 'p1');
    expect(next.players.p2.eliminated).toBe(false);
    expect(next.players.p2.alive).toBe(true);
  });
});
