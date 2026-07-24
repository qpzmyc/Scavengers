import { useEffect, useRef, useState } from 'react';
import { GRID_SIZE } from '../engine';
import { boardCellSize, MIN_CELL_PX } from './boardSize';

/**
 * Measures the board's wrapper and derives the board's tile size from it.
 *
 * IMPORTANT: the observed element must get its size from the layout around it,
 * never from the board inside it. If the wrapper sizes to its content then the
 * board grows the wrapper, which grows the board, and the layout oscillates or
 * runs away. The CSS in index.css guarantees this — `.game-layout__board` is a
 * flex child with `min-height: 0` inside a definite-height column (desktop and
 * tablet) or a square driven by `aspect-ratio` (phone). Do not give it
 * height:auto with content-driven sizing.
 */
export function useBoardColumn() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ cellSize: MIN_CELL_PX, columnWidth: 320 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      const cellSize = boardCellSize(box.width, box.height);
      // columnWidth tracks the board's rendered width (not the wrapper's width) so that
      // ResourceBars and ControlPanel align flush with the board's left and right edges.
      const boardWidth = GRID_SIZE * cellSize + 12;
      const next = {
        cellSize,
        columnWidth: Math.max(boardWidth, 320),
      };
      // Bail out when nothing changed: ResizeObserver fires on sub-pixel jitter
      // and an unconditional setState would re-render the whole game every tick.
      setSize((prev) =>
        prev.cellSize === next.cellSize && prev.columnWidth === next.columnWidth ? prev : next
      );
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}
