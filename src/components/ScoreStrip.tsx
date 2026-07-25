import type { ReactNode } from 'react';
import type { GameState } from '../engine';
import { theme } from '../theme';

interface ScoreStripProps {
  state: GameState;
  onOpenStandings: () => void;
  onOpenKills: () => void;
  // Ready-made kill text for the most recent kill (already colored/worded by the
  // caller — App.tsx and OnlineGame.tsx build kill text differently, so ScoreStrip
  // stays ignorant of both and just renders whatever it's handed). `null` before
  // the first kill of the game.
  lastKill: ReactNode | null;
}

// Hearts are only rendered one-per-life when they're guaranteed to fit the player
// row's full width — 343px at a 375px phone (the strip's measured inner content
// width now that the kill tracker has been moved to its own row below, see the
// two-row layout in the component). Below this threshold every player's hearts
// render individually (matching Lives.tsx); at or above it each player collapses
// to one heart glyph + a numeric count (e.g. "♥6").
//
// Per-player fixed cost: a 10px color dot + 4px gap to the hearts = 14px.
// Between players: a 10px gap (n-1 of them for n players).
// Per heart: the ♥ glyph at fontSize 12 is taken as a full 12px (1em) advance —
// dingbat/symbol glyphs in the system-ui/Segoe UI/Roboto stack render close to a
// full em box (unlike letters, which run narrower), so 1em is the honest
// conservative estimate rather than an arbitrary guess. Plus a 1px gap between
// hearts within one player's row (deathCap-1 of them per player).
//
// width(n, deathCap) = [14n + 10(n-1)]                          <- dots + gaps
//                     + n * [deathCap*12 + (deathCap-1)*1]       <- hearts + inner gaps
//
// With max players (n=4) and MAX_DEATH_CAP (6): 4*14 + 3*10 + 4*(6*12+5*1)
//   = 56 + 30 + 4*77 = 86 + 308 = 394px -> overflows 343px by 51px, so the true
//   worst case (24 hearts) must stay in the compact ♥N fallback.
// The next-worst combo, n=4/deathCap=5 (20 hearts): 86 + 4*(60+4) = 86+256 = 342px
//   -> fits, but with only 1px to spare against an estimated (not measured) glyph
//   width, too tight to trust.
// n=3/deathCap=6 (18 hearts) — the largest combo below that: structural
//   3*14 + 2*10 = 62, hearts 3*(6*12+5) = 3*77 = 231, total 293px -> fits 343px
//   with 50px of genuine slack. 18 is also the largest player*deathCap product
//   actually reachable below 20 (products jump 16 -> 18 -> 20 for n<=4, d<=6), so
//   it is the largest threshold that is both achievable and safely proven to fit.
const MAX_TOTAL_HEARTS_FOR_ICONS = 18;

/**
 * Phone-only summary line. In deathmatch the score is the number a player
 * glances at constantly, so it stays on screen rather than going behind a tap;
 * the full standings and the kills feed open as modals.
 */
export function ScoreStrip({ state, onOpenStandings, onOpenKills, lastKill }: ScoreStripProps) {
  const showScore = state.mode === 'deathmatch';
  const showHeartIcons = state.turnOrder.length * state.deathCap <= MAX_TOTAL_HEARTS_FOR_ICONS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, padding: '8px 10px' }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Leaderboard
      </span>
      {/* Own row, full strip width — this is the width the hearts-fitting math
          above (MAX_TOTAL_HEARTS_FOR_ICONS) is computed against. Sharing this
          row with the kill tracker (the old layout) is what squeezed 4 players
          out of a real 375px phone; the tracker now gets its own row below. */}
      <button
        onClick={onOpenStandings}
        aria-label="Open standings"
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0, overflowX: 'auto', background: 'none', border: 'none', padding: 0 }}
      >
        {state.turnOrder.map((id) => {
          const p = state.players[id];
          const remaining = Math.max(0, state.deathCap - p.deaths);
          return (
            <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: p.eliminated ? 0.4 : 1 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
              {showScore ? (
                <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: theme.text }}>
                  {p.score}
                </span>
              ) : showHeartIcons ? (
                <span style={{ display: 'flex', gap: 1 }}>
                  {Array.from({ length: state.deathCap }, (_, i) => (
                    <span key={i} style={{ fontSize: 12, lineHeight: 1, color: i < remaining ? p.color : theme.border }}>
                      ♥
                    </span>
                  ))}
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: p.color }}>
                  <span style={{ fontSize: 12, lineHeight: 1 }}>♥</span>
                  {remaining}
                </span>
              )}
            </span>
          );
        })}
      </button>
      {/* Kill tracker's own row: it needed to give up the player row's width, and
          in exchange it now gets the whole 343px before its ellipsis kicks in —
          useful since real kill text ("GREEN shot BLUE") runs much longer than
          "No kills yet". */}
      <button
        onClick={onOpenKills}
        aria-label="Open kills feed"
        style={{
          width: '100%',
          minWidth: 0,
          fontSize: 12,
          padding: '4px 10px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {lastKill ?? 'No kills yet'}
      </button>
    </div>
  );
}
