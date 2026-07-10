import { describe, it, expect } from 'vitest';
import { flowToRequest } from './flowToRequest';
import type { PlayerState } from '../engine';

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1',
    color: 'red',
    position: { x: 3, y: 3 },
    energy: 10,
    ammo: 5,
    alive: true,
    isPhantom: false,
    phantomDisplayPosition: null,
    immuneTurns: 0,
    deaths: 0,
    kills: 0,
    currentStreak: 0,
    longestStreak: 0,
    score: 0,
    cornerZone: { x0: 0, y0: 0 },
    eliminated: false,
    ...overrides,
  };
}

describe('flowToRequest', () => {
  it('translates a move flow to a move request', () => {
    const req = flowToRequest({ kind: 'move', path: [{ x: 3, y: 4 }, { x: 3, y: 5 }] }, player());
    expect(req).toEqual({ kind: 'move', path: [{ x: 3, y: 4 }, { x: 3, y: 5 }] });
  });

  it('returns null for an empty move path', () => {
    expect(flowToRequest({ kind: 'move', path: [] }, player())).toBeNull();
  });

  it('translates rest', () => {
    expect(flowToRequest({ kind: 'rest' }, player())).toEqual({ kind: 'rest' });
  });

  it('translates a fake move to a dir relative to the real position when no phantom', () => {
    const req = flowToRequest({ kind: 'fakeMove', target: { x: 4, y: 3 } }, player({ position: { x: 3, y: 3 } }));
    expect(req).toEqual({ kind: 'fakeMove', dir: { x: 1, y: 0 } });
  });

  it('projects a fake move from the accumulated phantom display position', () => {
    const p = player({ position: { x: 3, y: 3 }, isPhantom: true, phantomDisplayPosition: { x: 5, y: 3 } });
    const req = flowToRequest({ kind: 'fakeMove', target: { x: 6, y: 3 } }, p);
    expect(req).toEqual({ kind: 'fakeMove', dir: { x: 1, y: 0 } });
  });

  it('returns null for a fake move with no target', () => {
    expect(flowToRequest({ kind: 'fakeMove', target: null }, player())).toBeNull();
  });

  it('translates an attack, forwarding raw path + target', () => {
    const req = flowToRequest(
      { kind: 'attackTarget', type: 'shoot', path: [{ x: 3, y: 4 }], target: { x: 3, y: 7 } },
      player()
    );
    expect(req).toEqual({ kind: 'attack', type: 'shoot', path: [{ x: 3, y: 4 }], target: { x: 3, y: 7 } });
  });

  it('returns null for an attack with no target', () => {
    expect(flowToRequest({ kind: 'attackTarget', type: 'punch', path: [], target: null }, player())).toBeNull();
  });

  it('returns null for intermediate flows', () => {
    expect(flowToRequest({ kind: 'menu' }, player())).toBeNull();
    expect(flowToRequest({ kind: 'attackReposition', path: [] }, player())).toBeNull();
    expect(flowToRequest({ kind: 'attackSelect', path: [], type: null }, player())).toBeNull();
  });
});
