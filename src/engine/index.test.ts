import { describe, it, expect } from 'vitest';
import * as engine from './index';

describe('engine public API', () => {
  it('exports the full expected surface', () => {
    expect(typeof engine.createInitialGameState).toBe('function');
    expect(typeof engine.movePlayer).toBe('function');
    expect(typeof engine.restPlayer).toBe('function');
    expect(typeof engine.fakeMove).toBe('function');
    expect(typeof engine.punch).toBe('function');
    expect(typeof engine.shoot).toBe('function');
    expect(typeof engine.bomb).toBe('function');
    expect(typeof engine.resolveAttack).toBe('function');
    expect(typeof engine.endTurn).toBe('function');
    expect(typeof engine.checkWinCondition).toBe('function');
    expect(typeof engine.isInBounds).toBe('function');
    expect(typeof engine.isWall).toBe('function');
  });
});
