import { describe, it, expect } from 'vitest';
import { COUNT_MS, countValue, isDone, retarget, settled } from './scoreCount';

describe('scoreCount', () => {
  describe('settled', () => {
    it('shows its value straight away, so a score does not count up from zero on mount', () => {
      const c = settled(17);
      expect(countValue(c, 0)).toBe(17);
      expect(countValue(c, 1_000_000)).toBe(17);
      expect(isDone(c, 0)).toBe(true);
    });
  });

  describe('countValue', () => {
    const c = retarget(settled(0), 10, 1000);

    it('is the starting value at the moment the count begins', () => {
      expect(countValue(c, 1000)).toBe(0);
    });

    it('is the target once the duration has elapsed', () => {
      expect(countValue(c, 1000 + COUNT_MS)).toBe(10);
    });

    it('stays at the target long after, rather than overshooting or wrapping', () => {
      expect(countValue(c, 1000 + COUNT_MS * 50)).toBe(10);
    });

    it('is strictly between the two ends partway through', () => {
      const mid = countValue(c, 1000 + COUNT_MS / 2);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(10);
    });

    it('never goes backwards while counting up', () => {
      let prev = -Infinity;
      for (let t = 0; t <= COUNT_MS; t += 10) {
        const v = countValue(c, 1000 + t);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    });

    it('counts down as well as up, for a death taking a score away', () => {
      const down = retarget(settled(10), 7, 0);
      expect(countValue(down, 0)).toBe(10);
      expect(countValue(down, COUNT_MS / 2)).toBeLessThan(10);
      expect(countValue(down, COUNT_MS / 2)).toBeGreaterThan(7);
      expect(countValue(down, COUNT_MS)).toBe(7);
    });

    it('is always a whole number, since a score is never shown fractionally', () => {
      for (let t = 0; t <= COUNT_MS; t += 7) {
        expect(Number.isInteger(countValue(c, 1000 + t))).toBe(true);
      }
    });

    it('treats a time before the start as the starting value rather than extrapolating', () => {
      // Clocks can hand back a slightly earlier timestamp between frames.
      expect(countValue(c, 900)).toBe(0);
    });
  });

  describe('retarget', () => {
    it('returns the very same object when the target has not moved', () => {
      // Identity, not just equality: the render loop calls this every frame, and a
      // fresh object each time would restart the count and freeze the number.
      const c = retarget(settled(0), 10, 1000);
      expect(retarget(c, 10, 1200)).toBe(c);
    });

    it('resumes from the value on screen when a new score lands mid-count', () => {
      // The interrupt case: GREEN is counting 0 -> 5 from a kill and takes a
      // second kill halfway through. The count to 10 has to pick up from
      // whatever is currently displayed.
      const first = retarget(settled(0), 5, 0);
      const shownAtInterrupt = countValue(first, COUNT_MS / 2);
      const second = retarget(first, 10, COUNT_MS / 2);

      expect(second.from).toBe(shownAtInterrupt);
      expect(second.to).toBe(10);
      expect(second.startedAt).toBe(COUNT_MS / 2);
    });

    it('does not jump the displayed number at the moment of an interrupt', () => {
      // This is the property that matters on screen, and it is the one a naive
      // implementation fails: keeping the original `from` would snap the number
      // back to 0 the instant the second kill landed. Verified by temporarily
      // making retarget reuse `c.from`, under which this case and the two either
      // side of it fail with "expected 0 to be 3".
      const first = retarget(settled(0), 5, 0);
      const before = countValue(first, COUNT_MS / 2);
      const second = retarget(first, 10, COUNT_MS / 2);
      const after = countValue(second, COUNT_MS / 2);

      expect(after).toBe(before);
    });

    it('still reaches the new target on time after an interrupt', () => {
      const first = retarget(settled(0), 5, 0);
      const second = retarget(first, 10, COUNT_MS / 2);
      expect(countValue(second, COUNT_MS / 2 + COUNT_MS)).toBe(10);
    });

    it('handles an interrupt that reverses direction, a kill then a death', () => {
      const up = retarget(settled(0), 5, 0);
      const shown = countValue(up, COUNT_MS / 2);
      const down = retarget(up, 2, COUNT_MS / 2);

      expect(countValue(down, COUNT_MS / 2)).toBe(shown);
      expect(countValue(down, COUNT_MS / 2 + COUNT_MS)).toBe(2);
    });

    it('survives repeated interrupts without drifting off the final target', () => {
      // A kill streak: four score changes, each landing before the last settled.
      let c = settled(0);
      for (let i = 1; i <= 4; i += 1) {
        c = retarget(c, i * 5, i * 100);
      }
      expect(countValue(c, 400 + COUNT_MS)).toBe(20);
    });
  });

  describe('isDone', () => {
    it('is false while counting and true once the target is reached', () => {
      const c = retarget(settled(0), 10, 0);
      expect(isDone(c, 0)).toBe(false);
      expect(isDone(c, COUNT_MS - 1)).toBe(false);
      expect(isDone(c, COUNT_MS)).toBe(true);
    });

    it('is true for a retarget that does not actually move, so no frame loop starts', () => {
      expect(isDone(retarget(settled(4), 4, 0), 0)).toBe(true);
    });
  });
});
