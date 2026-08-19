import type { CSSProperties, ReactNode } from 'react';
import type { GameState } from '../engine';
import { theme } from '../theme';
import { formatDelta, GAIN, GAIN_WASH, LOSS, LOSS_WASH } from './scoreDelta';
import { standingsLabel } from './standingsLabel';
import { DELTA_MS, useScoreCounts, useScoreMap } from './useScoreCounts';

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

/**
 * Phone-only summary line. In deathmatch the score is the number a player
 * glances at constantly, so it stays on screen rather than going behind a tap;
 * the full standings and the kills feed open as modals.
 */
export function ScoreStrip({ state, onOpenStandings, onOpenKills, lastKill }: ScoreStripProps) {
  const showScore = state.mode === 'deathmatch';
  // The strip is the standings readout a phone player actually watches, and it
  // used to change its number with nothing to say it had. It gets the same
  // treatment as a leaderboard row: the chip fills with the player's gain or
  // loss colour and the amount appears beside it. This is also where the phone
  // reads the value at all, since the standings modal has no width for the
  // delta track (see --lb-delta-col in src/index.css).
  const { displayed, deltas } = useScoreCounts(useScoreMap(state));

  return (
    // Stacked by default. Narrow-landscape puts the strip in a full-width row
    // where there is space to sit the two cards side by side, and halving the
    // strip's height there is what lets the board clear its minimum tile size
    // (see the 768-847px block in src/index.css).
    <div style={{ display: 'flex', flexDirection: 'var(--strip-dir, column)' as CSSProperties['flexDirection'], gap: 8 }}>
      <div style={card}>
        {/* Names what this card actually shows. It used to say "Leaderboard" in
            both modes, which put that word over a row of hearts in survival. */}
        <span style={cardLabel}>{standingsLabel(state.mode)}</span>
        {/* Own row, full strip width. Sharing this row with the kill tracker (the
            old layout) is what squeezed 4 players out of a real 375px phone;
            the tracker now lives in its own card below.

            Styled as a real button (the stylesheet's border, surface and
            padding) to match the kill tracker below it. It used to strip all
            three off, which left the only tappable thing in the card looking
            like plain text. The 20px of horizontal padding this adds still
            leaves room for 4 players: their row needs ~214px of the 323px
            available inside a 375px phone. */}
        <button
          onClick={onOpenStandings}
          aria-label="Open standings"
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0, overflowX: 'auto', padding: '4px 10px' }}
        >
          {state.turnOrder.map((id) => {
            const p = state.players[id];
            const remaining = Math.max(0, state.deathCap - p.deaths);
            const delta = showScore ? deltas.get(id) : undefined;
            return (
              <span key={id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: p.eliminated ? 0.4 : 1 }}>
                {delta && (
                  <span
                    key={`wash-${delta.id}`}
                    aria-hidden="true"
                    className="strip-chip-wash"
                    style={{
                      '--wash': delta.amount >= 0 ? GAIN_WASH : LOSS_WASH,
                      '--score-delta-ms': `${DELTA_MS}ms`,
                    } as CSSProperties}
                  />
                )}
                {/* Classed so the narrow-landscape arrangement can drop it in
                    survival, where the heart beside it already carries this
                    exact colour. See the `[data-standings='lives']` rule in the
                    compact landscape block in src/index.css. */}
                <span className="strip-chip-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                {showScore ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: theme.text }}>
                      {displayed.get(id) ?? p.score}
                    </span>
                    {/* Always rendered, so the strip keeps one width whether or not
                        anyone has just scored. Letting it appear and vanish would
                        re-flow the row, which is the same shift the leaderboard's
                        reserved track exists to avoid. 15px fits "+10" and "-10"
                        at this size; wider values ellipsise rather than push. */}
                    <span style={{ minWidth: 15, display: 'flex', justifyContent: 'flex-start', overflow: 'hidden' }}>
                      {delta && (
                        <span
                          key={delta.id}
                          aria-hidden="true"
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'nowrap',
                            color: delta.amount >= 0 ? GAIN : LOSS,
                            animation: `scoreDeltaRise ${DELTA_MS}ms var(--ease-exit) forwards`,
                          }}
                        >
                          {formatDelta(delta.amount)}
                        </span>
                      )}
                    </span>
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 13 }}>
                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: theme.text }}>
                      {remaining}×
                    </span>
                    <span style={{ fontSize: 12, lineHeight: 1, color: p.color }}>♥</span>
                  </span>
                )}
              </span>
            );
          })}
        </button>
      </div>
      {/* The kill tracker is its own card rather than a second row inside the
          leaderboard's: they're two unrelated readings (who's winning vs. what
          just happened), and sharing one bordered box read as if the kill text
          were part of the standings. It still gets the full strip width before
          its ellipsis kicks in — real kill text ("GREEN shot BLUE") runs much
          longer than "No kills yet". */}
      <div style={card}>
        <span style={cardLabel}>Kills</span>
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
    </div>
  );
}

const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radius,
  padding: '8px 10px',
};

const cardLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: theme.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};
