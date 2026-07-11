import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { movePlayer } from './movement';
import { endTurn } from './turns';
import { tickPickups, getEnergyCandidateCells, getAmmoCandidateCells, spawnRespawnCornerPickup } from './pickups';
import { PICKUP_RESPAWN_PLIES } from './constants';

describe('pickup respawn system', () => {
  it('enqueues a pending pickup when collected', () => {
    const state = createInitialGameState('lastStanding');
    const positioned = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, position: { x: 3, y: 4 } } },
    };
    const next = movePlayer(positioned, 'p1', [{ x: 3, y: 3 }]);
    expect(next.pendingPickups).toEqual([{ type: 'energyPickup', pliesRemaining: PICKUP_RESPAWN_PLIES }]);
  });

  it('places a replacement energy pickup on the 5x5 outer ring after PICKUP_RESPAWN_PLIES endTurn calls', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, position: { x: 3, y: 4 } } },
    };
    state = movePlayer(state, 'p1', [{ x: 3, y: 3 }]);
    expect(state.board[3][3].type).toBe('empty');

    let acting: 'p1' | 'p2' = 'p1';
    for (let i = 0; i < PICKUP_RESPAWN_PLIES; i++) {
      state = endTurn(state, acting, false);
      acting = acting === 'p1' ? 'p2' : 'p1';
    }

    expect(state.pendingPickups).toEqual([]);

    let found = false;
    for (let x = 3; x <= 7; x++) {
      for (let y = 3; y <= 7; y++) {
        if (x === 3 || x === 7 || y === 3 || y === 7) {
          if (state.board[y][x].type === 'energyPickup') found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('places a replacement ammo pickup within the central 3x3 excluding (5,5)', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      pendingPickups: [{ type: 'ammoPickup', pliesRemaining: 1 }],
    };
    const next = tickPickups(state);
    expect(next.pendingPickups).toEqual([]);

    let found: { x: number; y: number } | null = null;
    for (let x = 4; x <= 6; x++) {
      for (let y = 4; y <= 6; y++) {
        if (x === 5 && y === 5) continue;
        if (next.board[y][x].type === 'ammoPickup') found = { x, y };
      }
    }
    expect(found).not.toBeNull();
    expect(next.board[5][5].type).toBe('wall');
  });

  it('decrements pliesRemaining without placing anything before it reaches 0', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      pendingPickups: [{ type: 'energyPickup', pliesRemaining: 3 }],
    };
    const next = tickPickups(state);
    expect(next.pendingPickups).toEqual([{ type: 'energyPickup', pliesRemaining: 2 }]);
  });

  it('getEnergyCandidateCells excludes cells occupied by alive players', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, position: { x: 3, y: 3 } } },
    };
    const cells = getEnergyCandidateCells(state);
    expect(cells.some((c) => c.x === 3 && c.y === 3)).toBe(false);
  });

  it('getAmmoCandidateCells excludes the center wall', () => {
    const state = createInitialGameState('lastStanding');
    const cells = getAmmoCandidateCells(state);
    expect(cells.some((c) => c.x === 5 && c.y === 5)).toBe(false);
  });

  it('retains a pending pickup at pliesRemaining 0 if no valid cell is available', () => {
    let state = createInitialGameState('lastStanding');
    // Fill the entire central 3x3 (excluding center) with walls so no ammo cell is free.
    const board = state.board.map((row) => row.slice());
    for (let x = 4; x <= 6; x++) {
      for (let y = 4; y <= 6; y++) {
        if (x === 5 && y === 5) continue;
        board[y][x] = { type: 'wall' };
      }
    }
    state = {
      ...state,
      board,
      pendingPickups: [{ type: 'ammoPickup', pliesRemaining: 1 }],
    };
    const next = tickPickups(state);
    expect(next.pendingPickups).toEqual([{ type: 'ammoPickup', pliesRemaining: 0 }]);
  });
});

describe('spawnRespawnCornerPickup', () => {
  it("places a bonus energy pickup at p1's central-5x5 corner (3,3) when it's empty, without touching pendingPickups", () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'empty' as const } : t))),
      pendingPickups: [{ type: 'energyPickup', pliesRemaining: 2 }],
    };
    const next = spawnRespawnCornerPickup(state, 'p1');
    expect(next.board[3][3].type).toBe('bonusEnergyPickup');
    expect(next.pendingPickups).toEqual([{ type: 'energyPickup', pliesRemaining: 2 }]);
  });

  it("places a bonus energy pickup at p2's central-5x5 corner (7,7)", () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'empty' as const } : t))) };
    const next = spawnRespawnCornerPickup(state, 'p2');
    expect(next.board[7][7].type).toBe('bonusEnergyPickup');
  });

  it('does nothing if a normal energy pickup is already sitting at that corner', () => {
    // The default board already has an energyPickup at each central-5x5 corner.
    const state = createInitialGameState('lastStanding');
    const next = spawnRespawnCornerPickup(state, 'p1');
    expect(next).toBe(state);
  });

  it('does nothing if a still-uncollected bonus pickup from an earlier death is already there', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'bonusEnergyPickup' as const } : t))) };
    const next = spawnRespawnCornerPickup(state, 'p1');
    expect(next).toBe(state);
  });

  it('does not spawn (and leaves the board untouched) if another player occupies that corner', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'empty' as const } : t))),
      players: { ...state.players, p2: { ...state.players.p2, position: { x: 3, y: 3 } } },
    };
    const next = spawnRespawnCornerPickup(state, 'p1');
    expect(next.board[3][3].type).toBe('empty');
  });

  it('does not requeue itself in pendingPickups', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'empty' as const } : t))) };
    const next = spawnRespawnCornerPickup(state, 'p1');
    expect(next.pendingPickups).toEqual([]);
  });

  it('collecting a bonus pickup gives energy but does not queue a normal respawn ticket', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      board: state.board.map((row) => row.map((t) => (t.type === 'energyPickup' ? { type: 'empty' as const } : t))),
      players: { ...state.players, p1: { ...state.players.p1, position: { x: 3, y: 4 }, energy: 1 } },
    };
    state.board[3][3] = { type: 'bonusEnergyPickup' };
    const next = movePlayer(state, 'p1', [{ x: 3, y: 3 }]);
    expect(next.players.p1.energy).toBeGreaterThan(0);
    expect(next.board[3][3].type).toBe('empty');
    expect(next.pendingPickups).toEqual([]);
  });

  it('the normal ring supply plus corner bonuses stays bounded across a long simulated run (repro of the 9-pickups drift bug)', () => {
    let state = createInitialGameState('deathmatch', 4);
    const ids: ('p1' | 'p2' | 'p3' | 'p4')[] = ['p1', 'p2', 'p3', 'p4'];
    const countOnBoard = (type: 'energyPickup' | 'bonusEnergyPickup') => {
      let n = 0;
      for (const row of state.board) for (const t of row) if (t.type === type) n++;
      return n;
    };
    for (let i = 0; i < 500; i++) {
      state = tickPickups(state);
      // Randomly consume a normal energy pickup, same as a player walking onto one.
      const energyCells: { x: number; y: number }[] = [];
      state.board.forEach((row, y) => row.forEach((t, x) => { if (t.type === 'energyPickup') energyCells.push({ x, y }); }));
      if (energyCells.length && Math.random() < 0.4) {
        const cell = energyCells[Math.floor(Math.random() * energyCells.length)];
        const board = state.board.map((row) => row.slice());
        board[cell.y][cell.x] = { type: 'empty' };
        state = { ...state, board, pendingPickups: [...state.pendingPickups, { type: 'energyPickup' as const, pliesRemaining: PICKUP_RESPAWN_PLIES }] };
      }
      const victim = ids[Math.floor(Math.random() * ids.length)];
      if (state.players[victim].alive && Math.random() < 0.3) {
        state = spawnRespawnCornerPickup(state, victim);
      }
      expect(countOnBoard('energyPickup')).toBeLessThanOrEqual(4);
      expect(countOnBoard('bonusEnergyPickup')).toBeLessThanOrEqual(4);
    }
  });
});
