export type PlayerId = 'p1' | 'p2' | 'p3' | 'p4';
export type PlayerColor = 'green' | 'red' | 'blue' | 'yellow';
// bonusEnergyPickup behaves like energyPickup on collection but is spawned by
// spawnRespawnCornerPickup, not the pendingPickups respawn cycle — it doesn't queue a
// replacement when consumed, so it can't leak into the normal 4-pickup ring supply.
export type TileType = 'empty' | 'wall' | 'energyPickup' | 'bonusEnergyPickup' | 'ammoPickup';
export type GameMode = 'lastStanding' | 'deathmatch';

export interface Position {
  x: number;
  y: number;
}

export interface Tile {
  type: TileType;
}

export interface PlayerState {
  id: PlayerId;
  color: PlayerColor;
  position: Position;
  energy: number;
  ammo: number;
  alive: boolean;
  isPhantom: boolean;
  phantomDisplayPosition: Position | null;
  immuneTurns: number;
  deaths: number;
  kills: number;
  currentStreak: number;
  longestStreak: number;
  score: number;
  cornerZone: { x0: number; y0: number };
  eliminated: boolean;
}

export interface PendingPickup {
  type: 'energyPickup' | 'ammoPickup';
  pliesRemaining: number;
}

export interface GameState {
  board: Tile[][];
  players: Record<PlayerId, PlayerState>;
  turnOrder: PlayerId[];
  currentTurn: PlayerId;
  mode: GameMode;
  winner: PlayerId | null;
  // Non-null only on a survival draw: everyone still in the game was eliminated by the
  // same final blast (a bomb catching the thrower and all remaining opponents, each on
  // their last life). Lists every player caught in that explosion, in turn order.
  draw: PlayerId[] | null;
  deathCap: number;
  targetScore: number;
  pendingPickups: PendingPickup[];
  // Victims awaiting their respawn corner-pickup (see spawnRespawnCornerPickup). A kill
  // grants the attacker an extra turn, so this stays queued across any chained kills and
  // is only flushed once the attacker's turn actually passes to the next player.
  pendingCornerPickups: PlayerId[];
}
