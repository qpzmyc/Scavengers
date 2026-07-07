import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { resolveAttack, endTurn } from './turns';
import { punch } from './combat';

function withPositions(state: ReturnType<typeof createInitialGameState>, p1: { x: number; y: number }, p2: { x: number; y: number }) {
  return {
    ...state,
    players: {
      ...state.players,
      p1: { ...state.players.p1, position: p1 },
      p2: { ...state.players.p2, position: p2 },
    },
  };
}

describe('resolveAttack', () => {
  it('scores the kill and respawns the victim', () => {
    let state = createInitialGameState('deathmatch');
    state = withPositions(state, { x: 5, y: 6 }, { x: 5, y: 7 });
    const attackResult = punch(state, 'p1', { x: 5, y: 7 });
    const next = resolveAttack(attackResult, 'p1');
    expect(next.players.p1.kills).toBe(1);
    expect(next.players.p2.deaths).toBe(1);
    expect(next.players.p2.alive).toBe(true); // respawned
    expect(next.players.p2.immuneTurns).toBeGreaterThan(0);
  });

  it('sets winner when the kill reaches the death cap in lastStanding mode', () => {
    let state = createInitialGameState('lastStanding');
    state = withPositions(state, { x: 5, y: 6 }, { x: 5, y: 7 });
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, deaths: state.deathCap - 1 } } };
    const attackResult = punch(state, 'p1', { x: 5, y: 7 });
    const next = resolveAttack(attackResult, 'p1');
    expect(next.winner).toBe('p1');
  });

  it('leaves winner null and state mostly unchanged if no kill occurred', () => {
    let state = createInitialGameState('deathmatch');
    state = withPositions(state, { x: 5, y: 6 }, { x: 5, y: 9 });
    const attackResult = punch(state, 'p1', { x: 5, y: 7 });
    expect(attackResult.killedPlayerIds).toEqual([]);
    const next = resolveAttack(attackResult, 'p1');
    expect(next.winner).toBeNull();
    expect(next.players.p2.deaths).toBe(0);
  });
});

describe('endTurn', () => {
  it('keeps the same player on their turn after a kill', () => {
    const state = createInitialGameState('deathmatch');
    const next = endTurn(state, 'p1', true);
    expect(next.currentTurn).toBe('p1');
  });

  it('increments the streak of the acting player when they get an extra turn', () => {
    const state = createInitialGameState('deathmatch');
    const next = endTurn(state, 'p1', true);
    expect(next.players.p1.currentStreak).toBe(1);
  });

  it('switches to the other player when there is no kill', () => {
    const state = createInitialGameState('deathmatch');
    const next = endTurn(state, 'p1', false);
    expect(next.currentTurn).toBe('p2');
  });

  it('ticks immunity down for the player whose turn is starting', () => {
    let state = createInitialGameState('deathmatch');
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, immuneTurns: 2 } } };
    const next = endTurn(state, 'p1', false);
    expect(next.players.p2.immuneTurns).toBe(1);
  });

  it('increments the streak of the player whose turn just ended', () => {
    const state = createInitialGameState('deathmatch');
    const next = endTurn(state, 'p1', false);
    expect(next.players.p1.currentStreak).toBe(1);
  });
});
