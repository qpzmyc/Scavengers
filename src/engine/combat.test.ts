import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { punch, shoot, traceLine, bomb } from './combat';
import { ATTACK_ENERGY_COST, SHOOT_AMMO_COST, START_AMMO, START_ENERGY, BOMB_AMMO_COST } from './constants';

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

describe('punch', () => {
  it('kills an adjacent, non-immune opponent', () => {
    let state = createInitialGameState('lastStanding');
    state = withPositions(state, { x: 5, y: 6 }, { x: 5, y: 7 });
    const result = punch(state, 'p1', { x: 5, y: 7 });
    expect(result.killedPlayerIds).toEqual(['p2']);
    expect(result.state.players.p2.alive).toBe(false);
  });

  it('deducts attack energy cost from the attacker', () => {
    let state = createInitialGameState('lastStanding');
    state = withPositions(state, { x: 5, y: 6 }, { x: 5, y: 7 });
    const result = punch(state, 'p1', { x: 5, y: 7 });
    expect(result.state.players.p1.energy).toBe(START_ENERGY - ATTACK_ENERGY_COST);
  });

  it('does not kill a target with active immunity', () => {
    let state = createInitialGameState('lastStanding');
    state = withPositions(state, { x: 5, y: 6 }, { x: 5, y: 7 });
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, immuneTurns: 2 } } };
    const result = punch(state, 'p1', { x: 5, y: 7 });
    expect(result.killedPlayerIds).toEqual([]);
    expect(result.state.players.p2.alive).toBe(true);
  });

  it('does not affect a non-adjacent tile', () => {
    let state = createInitialGameState('lastStanding');
    state = withPositions(state, { x: 5, y: 6 }, { x: 5, y: 8 });
    const result = punch(state, 'p1', { x: 5, y: 7 });
    expect(result.killedPlayerIds).toEqual([]);
  });
});

describe('traceLine', () => {
  it('traces until it hits a wall, excluding the wall tile', () => {
    const state = createInitialGameState('lastStanding');
    // From (5,3) shooting up (y-1), hits wall at (5,1) after passing (5,2); (5,1) and (5,0) are walls.
    const line = traceLine(state.board, { x: 5, y: 3 }, { x: 0, y: -1 });
    expect(line).toEqual([{ x: 5, y: 2 }]);
  });

  it('stops at the grid edge when no wall is in the way', () => {
    const state = createInitialGameState('lastStanding');
    const line = traceLine(state.board, { x: 0, y: 2 }, { x: 1, y: 0 });
    expect(line[line.length - 1]).toEqual({ x: 10, y: 2 });
  });
});

describe('shoot', () => {
  it('kills the first opponent hit along the line and costs 1 ammo', () => {
    let state = createInitialGameState('lastStanding');
    state = withPositions(state, { x: 0, y: 2 }, { x: 5, y: 2 });
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, ammo: START_AMMO + 1 } } };
    const result = shoot(state, 'p1', { x: 1, y: 0 });
    expect(result.killedPlayerIds).toEqual(['p2']);
    expect(result.state.players.p1.ammo).toBe(START_AMMO + 1 - SHOOT_AMMO_COST);
  });

  it('is blocked by a wall and does not hit past it', () => {
    let state = createInitialGameState('lastStanding');
    // p1 at (5,3), p2 at (5,-- placed past the top wall pair (5,0)/(5,1)); shooting up should not reach p2.
    state = withPositions(state, { x: 5, y: 3 }, { x: 5, y: 0 });
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, ammo: START_AMMO + 1 } } };
    const result = shoot(state, 'p1', { x: 0, y: -1 });
    expect(result.killedPlayerIds).toEqual([]);
  });

  it('throws if attacker has no ammo', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, ammo: 0 } } };
    expect(() => shoot(state, 'p1', { x: 1, y: 0 })).toThrow();
  });
});

describe('bomb', () => {
  it('kills a player within the 3x3 blast centered on the target tile', () => {
    let state = createInitialGameState('lastStanding');
    state = withPositions(state, { x: 0, y: 0 }, { x: 4, y: 0 });
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, ammo: BOMB_AMMO_COST } } };
    // p1 at (0,0), targets (5,0) which is in line along x-axis; blast covers x in [4,6], y in [-1,1] -> includes (4,0).
    const result = bomb(state, 'p1', { x: 5, y: 0 });
    expect(result.killedPlayerIds).toEqual(['p2']);
  });

  it('is not blocked by a wall between attacker and target', () => {
    let state = createInitialGameState('lastStanding');
    // p1 at (5,3) below the top wall pair; target (5,0) is past the wall along the same line.
    state = withPositions(state, { x: 5, y: 3 }, { x: 5, y: 0 });
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, ammo: BOMB_AMMO_COST } } };
    const result = bomb(state, 'p1', { x: 5, y: 0 });
    expect(result.killedPlayerIds).toEqual(['p2']);
  });

  it('throws if the target is not on a straight line from the attacker', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, position: { x: 0, y: 0 }, ammo: BOMB_AMMO_COST } } };
    expect(() => bomb(state, 'p1', { x: 3, y: 7 })).toThrow();
  });

  it('throws if attacker has less than 3 ammo', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, ammo: 1 } } };
    expect(() => bomb(state, 'p1', { x: 5, y: 0 })).toThrow();
  });

  it('deducts exactly BOMB_AMMO_COST ammo', () => {
    let state = createInitialGameState('lastStanding');
    state = withPositions(state, { x: 0, y: 0 }, { x: 4, y: 0 });
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, ammo: BOMB_AMMO_COST } } };
    const result = bomb(state, 'p1', { x: 5, y: 0 });
    expect(result.state.players.p1.ammo).toBe(0);
  });
});
