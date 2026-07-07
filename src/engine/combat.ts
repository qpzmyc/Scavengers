import { GameState, PlayerId, Position } from './types';
import { isInBounds, isWall } from './board';
import { ATTACK_ENERGY_COST, SHOOT_AMMO_COST, BOMB_AMMO_COST } from './constants';
import { clearPhantom } from './phantom';

function otherPlayerId(playerId: PlayerId): PlayerId {
  return playerId === 'p1' ? 'p2' : 'p1';
}

function spendAttackEnergy(state: GameState, attackerId: PlayerId): GameState {
  const attacker = state.players[attackerId];
  return {
    ...state,
    players: {
      ...state.players,
      [attackerId]: { ...attacker, energy: attacker.energy - ATTACK_ENERGY_COST },
    },
  };
}

function killIfPresent(state: GameState, pos: Position): { state: GameState; killedPlayerIds: PlayerId[] } {
  const killed: PlayerId[] = [];
  let players = state.players;
  (['p1', 'p2'] as PlayerId[]).forEach((id) => {
    const p = players[id];
    if (p.alive && p.immuneTurns === 0 && p.position.x === pos.x && p.position.y === pos.y) {
      players = { ...players, [id]: { ...p, alive: false } };
      killed.push(id);
    }
  });
  return { state: { ...state, players }, killedPlayerIds: killed };
}

export function punch(state: GameState, attackerId: PlayerId, targetPos: Position): { state: GameState; killedPlayerIds: PlayerId[] } {
  const attacker = state.players[attackerId];
  const dx = Math.abs(targetPos.x - attacker.position.x);
  const dy = Math.abs(targetPos.y - attacker.position.y);
  if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
    throw new Error('Punch target must be adjacent (including diagonal)');
  }

  let next = clearPhantom(state, attackerId);
  next = spendAttackEnergy(next, attackerId);
  const { state: finalState, killedPlayerIds } = killIfPresent(next, targetPos);
  return { state: finalState, killedPlayerIds };
}

export function traceLine(board: GameState['board'], from: Position, direction: Position): Position[] {
  const line: Position[] = [];
  let cursor: Position = { x: from.x + direction.x, y: from.y + direction.y };
  while (isInBounds(cursor) && !isWall(board, cursor)) {
    line.push(cursor);
    cursor = { x: cursor.x + direction.x, y: cursor.y + direction.y };
  }
  return line;
}

export function shoot(state: GameState, attackerId: PlayerId, direction: Position): { state: GameState; killedPlayerIds: PlayerId[] } {
  const attacker = state.players[attackerId];
  if (attacker.ammo < SHOOT_AMMO_COST) {
    throw new Error('Not enough ammo to shoot');
  }

  let next = clearPhantom(state, attackerId);
  next = spendAttackEnergy(next, attackerId);
  next = {
    ...next,
    players: {
      ...next.players,
      [attackerId]: { ...next.players[attackerId], ammo: next.players[attackerId].ammo - SHOOT_AMMO_COST },
    },
  };

  const line = traceLine(next.board, attacker.position, direction);
  const targetId = otherPlayerId(attackerId);
  const target = next.players[targetId];
  const hit = line.some((pos) => pos.x === target.position.x && pos.y === target.position.y);

  if (!hit) {
    return { state: next, killedPlayerIds: [] };
  }
  return killIfPresent(next, target.position);
}

function isOnStraightLine(from: Position, to: Position): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return false;
  if (dx === 0 || dy === 0) return true;
  return Math.abs(dx) === Math.abs(dy);
}

export function bomb(state: GameState, attackerId: PlayerId, targetPos: Position): { state: GameState; killedPlayerIds: PlayerId[] } {
  const attacker = state.players[attackerId];
  if (attacker.ammo < BOMB_AMMO_COST) {
    throw new Error('Not enough ammo to bomb');
  }
  if (!isOnStraightLine(attacker.position, targetPos)) {
    throw new Error('Bomb target must be on a straight line (incl. diagonal) from the attacker');
  }

  let next = clearPhantom(state, attackerId);
  next = spendAttackEnergy(next, attackerId);
  next = {
    ...next,
    players: {
      ...next.players,
      [attackerId]: { ...next.players[attackerId], ammo: next.players[attackerId].ammo - BOMB_AMMO_COST },
    },
  };

  const killed: PlayerId[] = [];
  let players = next.players;
  (['p1', 'p2'] as PlayerId[]).forEach((id) => {
    const p = players[id];
    const inBlast = Math.abs(p.position.x - targetPos.x) <= 1 && Math.abs(p.position.y - targetPos.y) <= 1;
    if (inBlast && p.alive && p.immuneTurns === 0) {
      players = { ...players, [id]: { ...p, alive: false } };
      killed.push(id);
    }
  });

  return { state: { ...next, players }, killedPlayerIds: killed };
}
