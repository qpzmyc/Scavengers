import type { ReactNode, Ref } from 'react';

interface GameLayoutProps {
  title: ReactNode;
  /** Leaderboard (deathmatch) or Lives (survival). Hidden under the phone breakpoint. */
  standings: ReactNode;
  /** Compact per-player score line. Shown only under the phone breakpoint. */
  scoreStrip: ReactNode;
  /** ResourceBars, or the replay banner that replaces it. */
  bars: ReactNode;
  board: ReactNode;
  /** Attach the ref from useBoardColumn — this wrapper is the measured element. */
  boardRef: Ref<HTMLDivElement>;
  /** ControlPanel, or its "Resolving…" / replay placeholder. */
  controls: ReactNode;
  /** Kills notification panel. Hidden under the phone breakpoint. */
  killsFeed: ReactNode;
}

export function GameLayout({
  title,
  standings,
  scoreStrip,
  bars,
  board,
  boardRef,
  controls,
  killsFeed,
}: GameLayoutProps) {
  return (
    <div className="game-layout">
      <div className="game-layout__title">{title}</div>
      <div className="game-layout__standings">{standings}</div>
      <div className="game-layout__strip">{scoreStrip}</div>
      <div className="game-layout__center">
        {bars}
        <div className="game-layout__board" ref={boardRef}>
          {board}
        </div>
        {controls}
      </div>
      <div className="game-layout__kills">{killsFeed}</div>
    </div>
  );
}
