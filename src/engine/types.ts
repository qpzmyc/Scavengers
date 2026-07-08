export type PlayerId = 'p1' | 'p2' | 'p3' | 'p4';
export type PlayerColor = 'green' | 'red' | 'blue' | 'yellow';
export type TileType = 'empty' | 'wall' | 'energyPickup' | 'ammoPickup';
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
  deathCap: number;
  targetScore: number;
  pendingPickups: PendingPickup[];
}
