import type { CSSProperties, ReactNode, Ref } from 'react';
import { theme } from '../theme';

// The panel look shared by the controls column and the kills feed. Both wrappers
// used to be written out identically in App.tsx and OnlineGame.tsx; they live
// here now so the two screens cannot drift apart.
const panel: CSSProperties = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radius,
  boxShadow: theme.shadow,
  boxSizing: 'border-box',
};

interface GameLayoutProps {
  title: ReactNode;
  /** Leaderboard (deathmatch) or Lives (survival). Hidden under the phone breakpoint. */
  standings: ReactNode;
  /**
   * Which card `standings` is, so CSS can reserve the right width for it. The
   * two are very different sizes (the deathmatch leaderboard is ~444px, the
   * survival lives card ~240px) and src/index.css has to know which one is on
   * screen to work out how much width the board can claim. Reserving the larger
   * one unconditionally cost the board ~200px in survival.
   */
  standingsKind: 'leaderboard' | 'lives';
  /** Compact per-player score line. Shown only under the phone breakpoint. */
  scoreStrip: ReactNode;
  /** ResourceBars, or the replay banner that replaces it. */
  bars: ReactNode;
  board: ReactNode;
  /** Attach the ref from useBoardColumn — this wrapper is the measured element. */
  boardRef: Ref<HTMLDivElement>;
  /** ControlPanel, or its "Resolving…" / replay placeholder. Wrapped in the card here. */
  controls: ReactNode;
  /** Attach the ref from useElementWidth — this wrapper is the measured element. */
  controlsRef: Ref<HTMLDivElement>;
  /** Width for the controls card, from useElementWidth measuring `controlsRef`. */
  controlsWidth: number;
  /** The kills list itself. The panel and its heading are supplied here. */
  killsFeed: ReactNode;
}

export function GameLayout({
  title,
  standings,
  standingsKind,
  scoreStrip,
  bars,
  board,
  boardRef,
  controls,
  controlsRef,
  controlsWidth,
  killsFeed,
}: GameLayoutProps) {
  return (
    <div className="game-layout" data-standings={standingsKind}>
      <div className="game-layout__title">{title}</div>
      <div className="game-layout__standings">{standings}</div>
      <div className="game-layout__strip">{scoreStrip}</div>
      {/* The bars sit above the board in a flex column at almost every size. In
          the compact landscape arrangements the centre column becomes
          `display: contents` so both of these promote to grid items, letting the
          bars be placed out of the centre column entirely — under the score strip
          in the left column, or beneath the board on a narrow one. See the
          landscape blocks at the bottom of src/index.css. Grid placement ignores
          DOM order, so nothing here has to move. */}
      <div className="game-layout__center">
        <div className="game-layout__bars">{bars}</div>
        <div className="game-layout__board" ref={boardRef}>
          {board}
        </div>
      </div>
      <div className="game-layout__controls" ref={controlsRef}>
        <div style={{ ...panel, width: controlsWidth }}>{controls}</div>
      </div>
      <div className="game-layout__kills">
        <div style={{ ...panel, padding: 'var(--kills-pad, 16px)', minWidth: 240 }}>
          <h3 style={{ marginBottom: 10, fontSize: 15 }}>Kills</h3>
          {killsFeed}
        </div>
      </div>
    </div>
  );
}
