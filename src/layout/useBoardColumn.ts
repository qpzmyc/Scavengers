import { useCallback, useRef, useState } from 'react';
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
 *
 * This is a CALLBACK ref, not a plain `useRef` + `useEffect`, on purpose: the
 * wrapper this hook measures does not exist on first mount. `App` renders the
 * menu (and later a no-information handoff screen) before the in-game screen
 * that holds this element ever mounts, and it can unmount again on route
 * changes. A `useRef`/`useEffect([])` pair reads `ref.current` once while it
 * is still null, attaches nothing, and — because the deps array is empty —
 * never gets another chance, leaving the board stuck at `MIN_CELL_PX` for the
 * whole session. The callback ref fires every time the node is attached or
 * detached, so the observer (re)attaches whenever the element actually
 * exists. Do not "simplify" this back to `useRef` + `useEffect`.
 */
export function useBoardColumn() {
  const [size, setSize] = useState({ cellSize: MIN_CELL_PX, columnWidth: 320 });
  const observerRef = useRef<ResizeObserver | null>(null);

  // useCallback keeps this function's identity stable across renders (empty deps: it
  // closes over nothing that changes). A callback ref with an unstable identity gets
  // called with `null` then the node on every render, tearing down and rebuilding the
  // observer each time — the stable identity here means React only calls it when the
  // underlying DOM node actually changes (mount, unmount, or swap).
  const ref = useCallback((el: HTMLDivElement | null) => {
    // Disconnect whatever observer was previously attached (e.g. from the element
    // that just unmounted on a route change) before attaching a new one, so route
    // changes can't leak observers or leave two attached at once.
    observerRef.current?.disconnect();
    observerRef.current = null;

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
    observerRef.current = observer;
  }, []);

  return { ref, ...size };
}
