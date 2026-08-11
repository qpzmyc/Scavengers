import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { theme } from '../theme';

// How long the exit animation runs, matching modalScrimOut / modalPanelOut in
// src/index.css. Change both together or the modal is cut off mid-exit (too
// short) or hangs around invisible, still covering the screen (too long).
const EXIT_MS = 180;

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // An exit animation can only be seen if the thing playing it is still on
  // screen, and every caller drops this component the instant onClose fires. So
  // the modal owns its own goodbye: a close request plays the exit here first
  // and only then tells the caller, which keeps all five call sites unchanged.
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  const requestClose = useCallback(() => {
    // A second click while the modal is already leaving would queue a second
    // onClose. Harmless for a popup, but not for ConfirmDialog, whose onClose
    // runs a real action.
    if (exitTimer.current !== null) return;
    setClosing(true);
    exitTimer.current = window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  return (
    <div
      onClick={requestClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.scrim,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: closing
          ? `modalScrimOut ${EXIT_MS}ms var(--ease-exit) forwards`
          : 'modalScrimIn 200ms var(--ease-enter) backwards',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: theme.radius,
          boxShadow: theme.shadow,
          padding: 'var(--modal-pad, 32px)',
          minWidth: 'min(360px, calc(100vw - 32px))',
          maxWidth: 'calc(100vw - 32px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          // Rises further and over longer than the scrim fades, so the panel is
          // still arriving once the background has finished dimming. Reversing
          // that reads as the panel being late.
          animation: closing
            ? `modalPanelOut ${EXIT_MS}ms var(--ease-exit) forwards`
            : 'modalPanelIn 260ms var(--ease-enter) backwards',
        }}
      >
        <button
          onClick={requestClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            fontSize: 20,
            lineHeight: 1,
            borderRadius: 8,
            background: theme.surfaceAlt,
            border: `1px solid ${theme.border}`,
            color: theme.text,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ×
        </button>
        <h2 style={{ fontSize: 22, margin: 0, color: theme.heading }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
