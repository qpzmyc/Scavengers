import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { resolveAttack, endTurn, removePlayer } from './turns';
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

  it('queues the respawn corner pickup instead of spawning it immediately', () => {
    let state = createInitialGameState('deathmatch');
    state = withPositions(state, { x: 5, y: 6 }, { x: 5, y: 7 });
    state = { ...state, board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'empty' as const } : t))) };
    const attackResult = punch(state, 'p1', { x: 5, y: 7 });
    const next = resolveAttack(attackResult, 'p1');
    // p2's cornerZone is the bottom-right corner -> central-5x5 corner (7,7).
    expect(next.board[7][7].type).toBe('empty');
    expect(next.pendingCornerPickups).toEqual(['p2']);
  });

  it('sets winner when the kill reaches the death cap in lastStanding mode', () => {
    let state = createInitialGameState('lastStanding');
    state = withPositions(state, { x: 5, y: 6 }, { x: 5, y: 7 });
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, deaths: state.deathCap - 1 } } };
    const attackResult = punch(state, 'p1', { x: 5, y: 7 });
    const next = resolveAttack(attackResult, 'p1');
    expect(next.winner).toBe('p1');
  });

  it('records a survival draw listing all finalists when one blast eliminates everyone left', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      players: {
        ...state.players,
        p1: { ...state.players.p1, deaths: state.deathCap - 1 },
        p2: { ...state.players.p2, deaths: state.deathCap - 1 },
      },
    };
    // A bomb catching the thrower (p1) and the last opponent (p2), both on their last
    // life: everyone is eliminated at once -> draw between both.
    const next = resolveAttack({ state, killedPlayerIds: ['p1', 'p2'] }, 'p1');
    expect(next.draw).toEqual(['p1', 'p2']);
    expect(next.winner).toBeNull();
  });

  it('is a normal win, not a draw, when the thrower survives the final blast', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      players: { ...state.players, p2: { ...state.players.p2, deaths: state.deathCap - 1 } },
    };
    const next = resolveAttack({ state, killedPlayerIds: ['p2'] }, 'p1');
    expect(next.winner).toBe('p1');
    expect(next.draw).toBeNull();
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

describe('removePlayer', () => {
  it('marks the player eliminated and clears their token/phantom from the board', () => {
    let state = createInitialGameState('lastStanding', 4);
    state = { ...state, players: { ...state.players, p3: { ...state.players.p3, isPhantom: true, phantomDisplayPosition: { x: 2, y: 2 } } } };
    const next = removePlayer(state, 'p3');
    expect(next.players.p3.eliminated).toBe(true);
    expect(next.players.p3.alive).toBe(false);
    expect(next.players.p3.isPhantom).toBe(false);
    expect(next.players.p3.phantomDisplayPosition).toBeNull();
  });

  it('advances the turn when the removed player was the current player', () => {
    const state = createInitialGameState('lastStanding', 4); // order p1,p3,p2,p4; current p1
    const next = removePlayer(state, 'p1');
    expect(next.currentTurn).toBe('p3');
  });

  it('leaves the current turn alone when a non-current player is removed', () => {
    const state = createInitialGameState('lastStanding', 4);
    const next = removePlayer(state, 'p2');
    expect(next.currentTurn).toBe('p1');
  });

  it('ends the game with the sole survivor as winner (deathmatch, before any target score)', () => {
    const state = createInitialGameState('deathmatch'); // 2 players
    const next = removePlayer(state, 'p2');
    expect(next.winner).toBe('p1');
  });

  it('drops a corner bonus queued for the removed player', () => {
    let state = createInitialGameState('lastStanding', 4);
    state = { ...state, pendingCornerPickups: ['p3', 'p2'] };
    const next = removePlayer(state, 'p3');
    expect(next.pendingCornerPickups).toEqual(['p2']);
  });

  it('is a no-op for an already-eliminated player', () => {
    let state = createInitialGameState('lastStanding', 4);
    state = removePlayer(state, 'p3');
    const again = removePlayer(state, 'p3');
    expect(again).toBe(state);
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

  it('does not flush a queued corner pickup while the extra turn continues (gotKill true)', () => {
    let state = createInitialGameState('deathmatch');
    state = {
      ...state,
      board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'empty' as const } : t))),
      pendingCornerPickups: ['p2'],
    };
    const next = endTurn(state, 'p1', true);
    expect(next.board[7][7].type).toBe('empty');
    expect(next.pendingCornerPickups).toEqual(['p2']);
  });

  it('flushes a queued corner pickup once the turn actually passes', () => {
    let state = createInitialGameState('deathmatch');
    state = {
      ...state,
      board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'empty' as const } : t))),
      pendingCornerPickups: ['p2'],
    };
    const next = endTurn(state, 'p1', false);
    expect(next.board[7][7].type).toBe('bonusEnergyPickup');
    expect(next.pendingCornerPickups).toEqual([]);
  });

  it("spawns the self-killer's own corner bonus before their extra turn (gotKill)", () => {
    let state = createInitialGameState('deathmatch');
    state = {
      ...state,
      board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'empty' as const } : t))),
      pendingCornerPickups: ['p1'],
    };
    // p1 bombed themselves, respawned, and got an extra turn. The turn before their next
    // is their own, so their corner (3,3) bonus spawns now.
    const next = endTurn(state, 'p1', true);
    expect(next.board[3][3].type).toBe('bonusEnergyPickup');
    expect(next.pendingCornerPickups).toEqual([]);
  });

  it('spawns each queued corner pickup only as the turn reaches its owner, not all at once', () => {
    let state = createInitialGameState('lastStanding', 4);
    state = {
      ...state,
      board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'empty' as const } : t))),
      pendingCornerPickups: ['p2', 'p3'],
    };
    // 4-player turn order is p1 -> p3 -> p2 -> p4. p1 ends -> next is p3, so only
    // p3's corner (7,3) spawns; p2 stays queued.
    const afterP1 = endTurn(state, 'p1', false);
    expect(afterP1.board[3][7].type).toBe('bonusEnergyPickup');
    expect(afterP1.board[7][7].type).toBe('empty');
    expect(afterP1.pendingCornerPickups).toEqual(['p2']);

    // p3 ends -> next is p2, so p2's corner (7,7) now spawns and the queue empties.
    const afterP3 = endTurn(afterP1, 'p3', false);
    expect(afterP3.board[7][7].type).toBe('bonusEnergyPickup');
    expect(afterP3.pendingCornerPickups).toEqual([]);
  });
});
