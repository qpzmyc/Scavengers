import { useCallback, useState } from 'react';
import { GRID_SIZE } from '../engine';
import { boardCellSize, BOARD_CHROME_PX, MIN_CELL_PX } from './boardSize';
import { useObservedBox } from './useObservedBox';

/**
 * Measures the board's wrapper and derives the board's tile size from it.
 *
 * IMPORTANT: the observed element must get its size from the layout around it,
 * never from the board inside it. If the wrapper sizes to its content then the
 * board grows the wrapper, which grows the board, and the layout oscillates or
 * runs away. The CSS in index.css guarantees this three different ways, one per
 * family of arrangements — `.game-layout__board` is a flex child with
 * `min-height: 0` inside a definite-height column (desktop and tablet), a square
 * driven by `aspect-ratio` (portrait phone), or a direct grid item spanning a
 * `minmax(0, 1fr)` row after its wrapper becomes `display: contents` (landscape
 * phone and other compact landscape sizes). All three give it a size that comes
 * from outside. Do not give it height:auto with content-driven sizing.
 *
 * The observer plumbing, and why it has to be a callback ref, lives in
 * `useObservedBox`.
 */
export function useBoardColumn() {
  const [size, setSize] = useState({ cellSize: MIN_CELL_PX, columnWidth: 320 });

  // Empty deps, so this stays identity-stable: `useObservedBox` requires it, and
  // an unstable callback rebuilds the ResizeObserver on every render.
  const onBox = useCallback((box: DOMRectReadOnly) => {
    const cellSize = boardCellSize(box.width, box.height);
    // columnWidth tracks the board's rendered width (not the wrapper's width) so that
    // ResourceBars and ControlPanel align flush with the board's left and right edges.
    const boardWidth = GRID_SIZE * cellSize + BOARD_CHROME_PX;
    const next = {
      cellSize,
      columnWidth: Math.max(boardWidth, 320),
    };
    // Bail out when nothing changed: ResizeObserver fires on sub-pixel jitter
    // and an unconditional setState would re-render the whole game every tick.
    setSize((prev) =>
      prev.cellSize === next.cellSize && prev.columnWidth === next.columnWidth ? prev : next
    );
  }, []);

  return { ref: useObservedBox(onBox), ...size };
}
