import type { ReactNode, Ref } from 'react';

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
  /** ControlPanel, or its "Resolving…" / replay placeholder. */
  controls: ReactNode;
  /** Attach the ref from useElementWidth — this wrapper is the measured element. */
  controlsRef: Ref<HTMLDivElement>;
  /** Kills notification panel. Hidden under the phone breakpoint. */
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
  killsFeed,
}: GameLayoutProps) {
  return (
    <div className="game-layout" data-standings={standingsKind}>
      <div className="game-layout__title">{title}</div>
      <div className="game-layout__standings">{standings}</div>
      <div className="game-layout__strip">{scoreStrip}</div>
      <div className="game-layout__center">
        {bars}
        <div className="game-layout__board" ref={boardRef}>
          {board}
        </div>
      </div>
      <div className="game-layout__controls" ref={controlsRef}>
        {controls}
      </div>
      <div className="game-layout__kills">{killsFeed}</div>
    </div>
  );
}
