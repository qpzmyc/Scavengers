import type { GameState, PlayerId } from '../engine';
import type { AnimFrame } from './animation';

// A persisted, resumable in-person (hotseat) game. Everything needed to drop the
// players back onto the "___'s turn" handoff screen of whoever hadn't confirmed yet:
// the logical GameState (positions, phantoms, pickups + respawn counters, kills,
// lives, resources, scores, whose turn, turn order) plus the replay bookkeeping that
// lets the resuming player re-watch the turns they missed, plus the kill feed.
//
// ONLINE games are never saved here — this is hotseat-only.

// Mirrors the persistent kill-feed entry shape in App.tsx.
export interface KillNotification {
  id: number;
  killerColor: string;
  killerName: string;
  victimColor: string;
  victimName: string;
  verb: string;
}

export interface LocalSave {
  version: number;
  savedAt: number;
  mode: GameState['mode'];
  state: GameState;
  notifications: KillNotification[];
  notificationId: number;
  // Replay bookkeeping (see App.tsx refs of the same names).
  turnStart: Record<PlayerId, GameState>;
  pendingLog: Record<PlayerId, AnimFrame[]>;
  replay: AnimFrame[];
  // Frames of the CURRENT actor's turn so far, not yet flushed into the other players'
  // pendingLog (that flush only happens when the turn actually ends). A kill grants an
  // extra turn, so a streak is saved several times mid-turn with frames already banked
  // here — without persisting them, resuming loses every kill in the streak from what
  // the other players get to replay. Optional so v1 saves written before this existed
  // still load; they simply resume with nothing banked, exactly as they did before.
  actorLog?: AnimFrame[];
}

const KEY = 'scavengers.localGame.v1';
const VERSION = 1;

// A cheap summary for the menu (whose turn, mode) without loading the whole blob.
export function loadLocalSave(): LocalSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSave;
    if (!parsed || parsed.version !== VERSION || !parsed.state || parsed.state.winner !== null || parsed.state.draw != null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasLocalSave(): boolean {
  return loadLocalSave() !== null;
}

export function saveLocalGame(save: Omit<LocalSave, 'version' | 'savedAt'>): void {
  try {
    const full: LocalSave = { ...save, version: VERSION, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    // Storage full / unavailable (private mode): silently skip — the live game is unaffected.
  }
}

export function clearLocalSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
