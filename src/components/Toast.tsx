import type { ReactNode } from 'react';
import { theme } from '../theme';

// A fixed, top-center notification that floats above all other content and never
// affects layout (so it can appear/disappear without shifting the elements beneath
// it). Mirrors the in-game notice styling. Render it conditionally by the caller.
export function Toast({
  kind = 'info',
  offsetIndex = 0,
  children,
}: {
  kind?: 'info' | 'success' | 'error';
  offsetIndex?: number;
  children: ReactNode;
}) {
  const background =
    kind === 'error'
      ? 'linear-gradient(135deg, #e74c3c, #c0392b)'
      : kind === 'success'
        ? 'linear-gradient(135deg, #27ae60, #1e8449)'
        : `linear-gradient(135deg, ${theme.accent}, #3a5bbf)`;
  return (
    <div
      style={{
        position: 'fixed',
        top: 16 + offsetIndex * 56,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 500,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          padding: '12px 26px',
          borderRadius: 14,
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 0.2,
          color: '#fff',
          background,
          border: '1px solid rgba(255,255,255,0.22)',
          boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
          textShadow: '0 1px 2px rgba(0,0,0,0.35)',
          whiteSpace: 'nowrap',
          animation: 'toastIn 0.34s ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}
